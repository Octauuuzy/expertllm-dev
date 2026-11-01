// ============================================================================
// ExpertLLM Server
// ============================================================================
const DB_HOST = process.env.DB_HOST;
const DB_PASSWORD = process.env.DB_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET;

const VERTEX_PROJECT_ID = process.env.VERTEX_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
const VERTEX_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const VERTEX_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const USE_METADATA_SERVER = process.env.USE_METADATA_SERVER !== 'false';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const CHUTES_API_KEY = process.env.CHUTES_API_KEY;

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const ALLOW_ALL_ORIGINS = process.env.ALLOW_ALL_ORIGINS === 'true';
const ALLOW_ORIGINLESS = process.env.ALLOW_ORIGINLESS === 'true';

const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '120', 10);
const RATE_LIMIT_MAX_AUTH = parseInt(process.env.RATE_LIMIT_MAX_AUTH || '20', 10);

// ============================================================================

const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const dns = require('dns');

// Prefer IPv4 when available to avoid intermittent IPv6 egress issues on some hosts.
if (typeof dns.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
}

puppeteer.use(StealthPlugin());

const app = express();
const PORT = 8080;

// --- Security + Proxy Helpers ---
if (!DB_HOST || !DB_PASSWORD || !JWT_SECRET) {
    console.error('Missing required env: DB_HOST, DB_PASSWORD, JWT_SECRET');
    process.exit(1);
}

const originMatchers = ALLOWED_ORIGINS.map(compileOriginPattern).filter(Boolean);
const authLimiter = rateLimit(RATE_LIMIT_MAX_AUTH, RATE_LIMIT_WINDOW_MS);
const proxyLimiter = rateLimit(RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
let searchKeysCache = null;
let vertexTokenCache = { accessToken: null, expiresAt: 0, pending: null };
const METADATA_TOKEN_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

function compileOriginPattern(pattern) {
    if (!pattern) return null;
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, m => '\\' + m).replace(/\*/g, '.*');
    return new RegExp('^' + escaped + '$');
}

function isOriginAllowed(origin) {
    if (ALLOW_ALL_ORIGINS) return true;
    if (!origin) return ALLOW_ORIGINLESS;
    return originMatchers.some(re => re.test(origin));
}

function getRequestOriginCandidates(req) {
    const candidates = [];
    const origin = req.headers.origin;
    if (origin) candidates.push(origin);

    const referer = req.headers.referer || req.headers.referrer;
    if (referer) {
        try {
            candidates.push(new URL(referer).origin);
        } catch (_) { /* ignore */ }
    }

    const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
    const xfwdHost = (req.headers['x-forwarded-host'] || '').split(',')[0].trim();
    if (xfwdHost) candidates.push(`${proto}://${xfwdHost}`);

    const host = (req.headers.host || '').split(',')[0].trim();
    if (host) candidates.push(`${proto}://${host}`);

    return candidates.filter(Boolean);
}

function isRequestOriginAllowed(req) {
    if (ALLOW_ALL_ORIGINS) return true;
    const candidates = getRequestOriginCandidates(req);
    for (const cand of candidates) {
        if (isOriginAllowed(cand)) return true;
    }
    if (!candidates.length) return ALLOW_ORIGINLESS;
    return false;
}

function getClientIp(req) {
    const xfwd = req.headers['x-forwarded-for'];
    if (xfwd) return xfwd.split(',')[0].trim();
    return (req.socket && req.socket.remoteAddress) || req.ip || 'unknown';
}

function rateLimit(max, windowMs) {
    const buckets = new Map();
    return (req, res, next) => {
        const key = req.path + ':' + ((req.user && req.user.id) ? req.user.id : getClientIp(req));
        const now = Date.now();
        let entry = buckets.get(key);
        if (!entry || now > entry.resetAt) {
            buckets.set(key, { count: 1, resetAt: now + windowMs });
            return next();
        }
        entry.count += 1;
        if (entry.count > max) return res.status(429).json({ error: 'Rate limit exceeded' });
        return next();
    };
}

function getSearchKeys() {
    if (searchKeysCache) return searchKeysCache;
    if (process.env.GOOGLE_SEARCH_KEYS) {
        try {
            const parsed = JSON.parse(process.env.GOOGLE_SEARCH_KEYS);
            if (Array.isArray(parsed)) {
                searchKeysCache = parsed.filter(k => k && k.apiKey && k.cx);
                return searchKeysCache;
            }
        } catch (e) {
            console.error('Invalid GOOGLE_SEARCH_KEYS JSON:', e.message);
        }
    }
    const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const cx = process.env.GOOGLE_SEARCH_CX;
    if (apiKey && cx) {
        searchKeysCache = [{ apiKey, cx }];
        return searchKeysCache;
    }
    searchKeysCache = [];
    return searchKeysCache;
}

async function fetchMetadataAccessToken() {
    const response = await fetch(METADATA_TOKEN_URL, {
        headers: { 'Metadata-Flavor': 'Google' }
    });
    if (!response.ok) {
        const txt = await response.text();
        throw new Error('Metadata token fetch failed: ' + response.status + ' ' + txt);
    }
    return response.json();
}

function loadServiceAccountJson() {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        try { return JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON); } catch (e) {
            console.error('Invalid GOOGLE_APPLICATION_CREDENTIALS_JSON:', e.message);
        }
    }
    if (process.env.VERTEX_SERVICE_ACCOUNT_JSON) {
        try { return JSON.parse(process.env.VERTEX_SERVICE_ACCOUNT_JSON); } catch (e) {
            console.error('Invalid VERTEX_SERVICE_ACCOUNT_JSON:', e.message);
        }
    }
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        try {
            const raw = fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8');
            return JSON.parse(raw);
        } catch (e) {
            console.error('Failed to read GOOGLE_APPLICATION_CREDENTIALS:', e.message);
        }
    }
    return null;
}

async function fetchServiceAccountAccessToken() {
    const sa = loadServiceAccountJson();
    if (!sa || !sa.client_email || !sa.private_key) {
        throw new Error('Service account credentials missing for Vertex auth.');
    }
    const now = Math.floor(Date.now() / 1000);
    const tokenUri = sa.token_uri || VERTEX_TOKEN_URI;
    const assertion = jwt.sign({
        iss: sa.client_email,
        sub: sa.client_email,
        aud: tokenUri,
        iat: now,
        exp: now + 3600,
        scope: VERTEX_SCOPE
    }, sa.private_key, { algorithm: 'RS256' });
    const body = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion
    });
    const response = await fetch(tokenUri, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
    });
    if (!response.ok) {
        const txt = await response.text();
        throw new Error('Service account token fetch failed: ' + response.status + ' ' + txt);
    }
    return response.json();
}

async function getVertexAccessToken() {
    const now = Math.floor(Date.now() / 1000);
    if (vertexTokenCache.accessToken && vertexTokenCache.expiresAt - 300 > now) {
        return vertexTokenCache.accessToken;
    }
    if (!vertexTokenCache.pending) {
        vertexTokenCache.pending = (async () => {
            let data = null;
            if (USE_METADATA_SERVER) {
                try { data = await fetchMetadataAccessToken(); } catch (e) { console.warn(e.message); }
            }
            if (!data) {
                data = await fetchServiceAccountAccessToken();
            }
            vertexTokenCache.accessToken = data.access_token;
            vertexTokenCache.expiresAt = now + (data.expires_in || 3600);
            return vertexTokenCache.accessToken;
        })().finally(() => { setTimeout(() => { vertexTokenCache.pending = null; }, 0); });
    }
    return vertexTokenCache.pending;
}

function isVertexUrlAllowed(rawUrl) {
    try {
        const u = new URL(rawUrl);
        if (u.protocol !== 'https:') return false;
        if (!u.hostname.endsWith('aiplatform.googleapis.com')) return false;
        if (!VERTEX_PROJECT_ID) return false;
        if (!u.pathname.includes('/v1/projects/' + VERTEX_PROJECT_ID + '/')) return false;
        return true;
    } catch (e) {
        return false;
    }
}


// --- Database Connection ---
const pool = new Pool({
    host: DB_HOST,
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    max: 10,
});

// --- Browser Instance for Scraping ---
let browserInstance;

// --- Concurrency Control ---
const MAX_CONCURRENCY = 200;
let activeCount = 0;
const waitQueue = [];

async function acquire() {
    if (activeCount < MAX_CONCURRENCY) { activeCount++; return; }
    return new Promise((resolve) => waitQueue.push(resolve));
}

function release() {
    if (waitQueue.length > 0) { waitQueue.shift()(); }
    else { activeCount = Math.max(0, activeCount - 1); }
}

// --- Database Tables Setup ---
async function initializeDatabase() {
    console.log('📦 Creating database tables...');

    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            email TEXT,
            tier TEXT DEFAULT 'Free',
            preferences JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS chat_sessions (
            session_id TEXT PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            username TEXT,
            title TEXT,
            model TEXT,
            mode TEXT,
            enabled_tools JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS chat_messages (
            id SERIAL PRIMARY KEY,
            session_id TEXT REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id),
            username TEXT,
            message_id TEXT,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            thinking TEXT,
            thinking_meta TEXT,
            sources TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Generated images table - stores AI-generated images for editing/reference
    await pool.query(`
        CREATE TABLE IF NOT EXISTS generated_images (
            id SERIAL PRIMARY KEY,
            session_id TEXT REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id),
            message_id TEXT,
            image_data TEXT NOT NULL,
            mime_type TEXT DEFAULT 'image/png',
            prompt TEXT,
            model TEXT DEFAULT 'gemini-3-pro-image-preview',
            aspect_ratio TEXT DEFAULT '4:3',
            image_size TEXT DEFAULT '4K',
            is_edited BOOLEAN DEFAULT FALSE,
            parent_image_id INTEGER REFERENCES generated_images(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Uploaded images table - stores user-uploaded images
    await pool.query(`
        CREATE TABLE IF NOT EXISTS uploaded_images (
            id SERIAL PRIMARY KEY,
            session_id TEXT REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id),
            message_id TEXT,
            image_data TEXT NOT NULL,
            mime_type TEXT DEFAULT 'image/png',
            original_filename TEXT,
            file_size INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Migrations
    try {
        await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'Free'");
        await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'");
        await pool.query("ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS username TEXT");
        await pool.query("ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS mode TEXT");
        await pool.query("ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS user_id INTEGER");
        await pool.query("ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS username TEXT");
        await pool.query("ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS message_id TEXT");
        // Migrations for generated_images
        await pool.query("ALTER TABLE generated_images ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE");
        await pool.query("ALTER TABLE generated_images ADD COLUMN IF NOT EXISTS parent_image_id INTEGER");
    } catch (e) { /* ignore */ }

    console.log('✅ Database tables ready!');
}

// --- Auth Middleware ---
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access token required' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const userCheck = await pool.query('SELECT id, username, tier FROM users WHERE id = $1', [decoded.id]);
        if (userCheck.rows.length === 0) return res.status(403).json({ error: 'User not found' });

        req.user = { ...decoded, ...userCheck.rows[0] };

        // Rolling session - refresh token
        const newToken = jwt.sign({ id: req.user.id, username: req.user.username, tier: req.user.tier }, JWT_SECRET, { expiresIn: '48h' });
        res.setHeader('X-Auth-Token', newToken);
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
};

// --- Web Scraping Function ---
async function fetchTextFromUrl(url) {
    await acquire();
    let page = null;
    try {
        page = await browserInstance.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36');
        await page.setViewport({ width: 800, height: 600 });
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media', 'script'].includes(req.resourceType())) req.abort();
            else req.continue();
        });
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        const textContent = await page.evaluate(() => document.body.innerText);
        return textContent.replace(/\s\s+/g, ' ').trim();
    } finally {
        if (page) await page.close().catch(() => {});
        release();
    }
}

// --- MAIN SERVER ---
async function startServer() {
    console.log('');
    console.log('============================================');
    console.log('   ExpertLLM ALL-IN-ONE SERVER');
    console.log('============================================');

    // Connect to database
    try {
        const result = await pool.query('SELECT NOW()');
        console.log('✅ Connected to Cloud SQL!');
        await initializeDatabase();
    } catch (err) {
        console.error('');
        console.error('❌ DATABASE CONNECTION FAILED!');
        console.error('   Error:', err.message);
        console.error('');
        console.error('   FIX THIS:');
        console.error('   1. Open Google Cloud Console → Cloud SQL');
        console.error('   2. Click your instance → Connections → Networking');
        console.error('   3. Under "Authorized networks", add: 0.0.0.0/0');
        console.error('   4. Update DB_HOST and DB_PASSWORD at top of this file');
        console.error('');
        process.exit(1);
    }

    // Launch browser for scraping
    console.log('🚀 Launching browser...');
    try {
        browserInstance = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote', '--js-flags=--jitless'],
        });
        console.log('✅ Browser launched!');
    } catch (err) {
        console.error('❌ Browser launch failed:', err.message);
        process.exit(1);
    }

    // Middleware
    app.set('trust proxy', 1);

    const corsOptions = {
        origin: true,
        credentials: true,
        exposedHeaders: ['X-Auth-Token']
    };
    app.use(cors(corsOptions));
    app.use(express.json({ limit: '50mb' }));

    app.use((req, res, next) => {
        if (req.method === 'OPTIONS') return next();
        if (req.path === '/' || req.path === '/scraper-status') return next();
        if (!isRequestOriginAllowed(req)) {
            console.warn('Origin not allowed:', {
                origin: req.headers.origin,
                referer: req.headers.referer,
                xfwdHost: req.headers['x-forwarded-host'],
                xfwdProto: req.headers['x-forwarded-proto'],
                host: req.headers.host
            });
            return res.status(403).json({ error: 'Access denied' });
        }
        next();
    });

    // ===========================================
    // HEALTH CHECK
    // ===========================================
    app.get('/', async (_req, res) => {
        res.json({ status: 'ok', message: 'ExpertLLM server running!', uptime: Math.round(process.uptime()) });
    });

    // Backward-compatible health endpoint for frontend/Vercel rewrites.
    // Previously this path was used to check scraper availability.
    app.get('/scraper-status', async (_req, res) => {
        res.json({
            status: 'ok',
            scraper: browserInstance ? 'ready' : 'starting',
            uptime: Math.round(process.uptime())
        });
    });

    // ===========================================
    // AUTH ENDPOINTS
    // ===========================================
    app.post('/auth/register', authLimiter, async (req, res) => {
        let { username, password, email } = req.body;
        if (!username || !password || !email) return res.status(400).json({ error: 'Username, password, and email required' });
        username = username.toLowerCase().trim();
        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            const result = await pool.query(
                'INSERT INTO users (username, password, email) VALUES ($1, $2, $3) RETURNING id, username, tier, preferences',
                [username, hashedPassword, email]
            );
            const user = result.rows[0];
            const token = jwt.sign({ id: user.id, username: user.username, tier: user.tier }, JWT_SECRET, { expiresIn: '48h' });
            res.json({ token, user: { id: user.id, username: user.username, tier: user.tier, preferences: user.preferences || {} } });
        } catch (err) {
            if (err.code === '23505') return res.status(400).json({ error: 'Username already exists' });
            res.status(500).json({ error: 'Registration failed' });
        }
    });

    app.post('/auth/login', authLimiter, async (req, res) => {
        let { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
        username = username.toLowerCase().trim();
        try {
            const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
            const user = result.rows[0];
            if (!user) return res.status(401).json({ error: 'User not found. Please register.' });
            if (!(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'Incorrect password' });
            const token = jwt.sign({ id: user.id, username: user.username, tier: user.tier }, JWT_SECRET, { expiresIn: '48h' });
            res.json({ token, user: { id: user.id, username: user.username, tier: user.tier, preferences: user.preferences || {} } });
        } catch (err) {
            res.status(500).json({ error: 'Login failed' });
        }
    });

    // ===========================================
    // USER ENDPOINTS
    // ===========================================
    app.get('/user/me', authenticateToken, async (req, res) => {
        try {
            const result = await pool.query('SELECT id, username, email, tier, preferences FROM users WHERE id = $1', [req.user.id]);
            if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
            res.json(result.rows[0]);
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch user' });
        }
    });

    app.post('/user/preferences', authenticateToken, async (req, res) => {
        const { preferences } = req.body;
        if (!preferences) return res.status(400).json({ error: 'Preferences required' });
        try {
            await pool.query('UPDATE users SET preferences = $1 WHERE id = $2', [preferences, req.user.id]);
            res.json({ status: 'updated' });
        } catch (err) {
            res.status(500).json({ error: 'Failed to update preferences' });
        }
    });

    // ===========================================
    // CHAT ENDPOINTS
    // ===========================================
    app.get('/chat/sessions', authenticateToken, async (req, res) => {
        try {
            const result = await pool.query(
                'SELECT session_id as id, title, model, mode, enabled_tools, created_at, updated_at FROM chat_sessions WHERE user_id = $1 ORDER BY updated_at DESC',
                [req.user.id]
            );
            const sessions = result.rows.map(row => ({ ...row, section: row.mode }));
            res.json(sessions);
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch sessions' });
        }
    });

    app.delete('/chat/sessions/:id', authenticateToken, async (req, res) => {
        try {
            await pool.query('DELETE FROM chat_sessions WHERE session_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
            res.json({ status: 'deleted' });
        } catch (err) {
            res.status(500).json({ error: 'Failed to delete session' });
        }
    });

    app.post('/chat/message', authenticateToken, async (req, res) => {
        const { role, content, session_id, thinking, thinking_meta, sources, model, enabled_tools, section, message_id } = req.body;
        if (!content) return res.status(400).json({ error: 'Content required' });

        try {
            // Storage limit check (50MB)
            const sizeRes = await pool.query(
                'SELECT SUM(OCTET_LENGTH(content)) as total_size FROM chat_messages WHERE session_id IN (SELECT session_id FROM chat_sessions WHERE user_id = $1)',
                [req.user.id]
            );
            if (parseInt(sizeRes.rows[0].total_size || 0) + Buffer.byteLength(content, 'utf8') > 50 * 1024 * 1024) {
                return res.status(403).json({ error: 'STORAGE_LIMIT_EXCEEDED' });
            }

            const targetSessionId = session_id || 'default';
            const title = (role === 'user' && content) ? content.substring(0, 30) + '...' : 'New Chat';

            // Create or update session
            const checkSession = await pool.query('SELECT * FROM chat_sessions WHERE session_id = $1', [targetSessionId]);
            if (checkSession.rows.length === 0) {
                await pool.query(
                    'INSERT INTO chat_sessions (session_id, user_id, username, title, model, mode, enabled_tools) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                    [targetSessionId, req.user.id, req.user.username, title, model, section, enabled_tools]
                );
            } else {
                await pool.query('UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE session_id = $1', [targetSessionId]);
            }

            // Insert message
            const insertRes = await pool.query(
                'INSERT INTO chat_messages (session_id, user_id, username, message_id, role, content, thinking, thinking_meta, sources) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, message_id, created_at',
                [targetSessionId, req.user.id, req.user.username, message_id || null, role, content,
                 thinking ? JSON.stringify(thinking) : null,
                 thinking_meta ? JSON.stringify(thinking_meta) : null,
                 sources ? JSON.stringify(sources) : null]
            );

            res.json({
                status: 'saved',
                session_id: targetSessionId,
                id: insertRes.rows[0].id,
                message_id: insertRes.rows[0].message_id,
                created_at: insertRes.rows[0].created_at
            });
        } catch (err) {
            console.error('Chat save error:', err);
            res.status(500).json({ error: 'Failed to save message' });
        }
    });

    app.get('/chat/history', authenticateToken, async (req, res) => {
        const { session_id } = req.query;
        try {
            const sessionCheck = await pool.query('SELECT * FROM chat_sessions WHERE session_id = $1 AND user_id = $2', [session_id, req.user.id]);
            if (sessionCheck.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
            const result = await pool.query(
                'SELECT id, message_id, role, content, created_at, thinking, thinking_meta, sources FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC, id ASC',
                [session_id]
            );
            res.json(result.rows);
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch history' });
        }
    });

    app.delete('/chat/history', authenticateToken, async (req, res) => {
        try {
            await pool.query('DELETE FROM chat_sessions WHERE user_id = $1', [req.user.id]);
            res.json({ status: 'cleared' });
        } catch (err) {
            res.status(500).json({ error: 'Failed to clear history' });
        }
    });

    // ===========================================
    // GENERATED IMAGES ENDPOINTS
    // ===========================================

    // Save a generated image
    app.post('/images/save', authenticateToken, async (req, res) => {
        const { session_id, message_id, image_data, mime_type, prompt, model, aspect_ratio, image_size, is_edited, parent_image_id } = req.body;

        if (!session_id || !image_data) {
            return res.status(400).json({ error: 'session_id and image_data are required' });
        }

        try {
            // Ensure session exists (create if not, to satisfy foreign key)
            const checkSession = await pool.query('SELECT session_id FROM chat_sessions WHERE session_id = $1', [session_id]);
            if (checkSession.rows.length === 0) {
                await pool.query(
                    'INSERT INTO chat_sessions (session_id, user_id, username, title) VALUES ($1, $2, $3, $4)',
                    [session_id, req.user.id, req.user.username, 'Image Generation']
                );
                console.log(`📁 Created session ${session_id} for image storage`);
            }

            const result = await pool.query(
                `INSERT INTO generated_images
                (session_id, user_id, message_id, image_data, mime_type, prompt, model, aspect_ratio, image_size, is_edited, parent_image_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING id, created_at`,
                [
                    session_id,
                    req.user.id,
                    message_id || null,
                    image_data,
                    mime_type || 'image/png',
                    prompt || null,
                    model || 'gemini-3-pro-image-preview',
                    aspect_ratio || '4:3',
                    image_size || '4K',
                    is_edited || false,
                    parent_image_id || null
                ]
            );

            res.json({
                status: 'saved',
                image_id: result.rows[0].id,
                created_at: result.rows[0].created_at
            });
        } catch (err) {
            console.error('Image save error:', err);
            res.status(500).json({ error: 'Failed to save image' });
        }
    });

    // Get the last generated image for a session (for editing reference)
    app.get('/images/last', authenticateToken, async (req, res) => {
        const { session_id } = req.query;

        if (!session_id) {
            return res.status(400).json({ error: 'session_id is required' });
        }

        try {
            const result = await pool.query(
                `SELECT id, image_data, mime_type, prompt, model, aspect_ratio, image_size, is_edited, parent_image_id, created_at
                FROM generated_images
                WHERE session_id = $1 AND user_id = $2
                ORDER BY created_at DESC
                LIMIT 1`,
                [session_id, req.user.id]
            );

            if (result.rows.length === 0) {
                return res.json({ image: null });
            }

            res.json({ image: result.rows[0] });
        } catch (err) {
            console.error('Get last image error:', err);
            res.status(500).json({ error: 'Failed to fetch last image' });
        }
    });

    // Get all generated images for a session (metadata only by default for performance)
    // Use ?include_data=true to get full image data (for small sessions)
    app.get('/images/session', authenticateToken, async (req, res) => {
        const { session_id, include_data } = req.query;

        if (!session_id) {
            return res.status(400).json({ error: 'session_id is required' });
        }

        try {
            // By default, return only metadata (no image_data) for performance
            // This reduces payload from MBs to KBs
            const selectFields = include_data === 'true'
                ? 'id, message_id, image_data, mime_type, prompt, model, aspect_ratio, image_size, is_edited, parent_image_id, created_at'
                : 'id, message_id, mime_type, prompt, model, aspect_ratio, image_size, is_edited, parent_image_id, created_at';

            const result = await pool.query(
                `SELECT ${selectFields}
                FROM generated_images
                WHERE session_id = $1 AND user_id = $2
                ORDER BY created_at ASC`,
                [session_id, req.user.id]
            );

            res.json({ images: result.rows, lazyLoad: include_data !== 'true' });
        } catch (err) {
            console.error('Get session images error:', err);
            res.status(500).json({ error: 'Failed to fetch session images' });
        }
    });

    // ===========================================
    // UPLOADED IMAGES ENDPOINTS
    // (Must be defined BEFORE /images/:id wildcard routes!)
    // ===========================================

    // Get uploaded images for a session (metadata only by default for performance)
    // Use ?include_data=true to get full image data
    app.get('/images/uploaded', authenticateToken, async (req, res) => {
        const { session_id, message_id, include_data } = req.query;

        if (!session_id) {
            return res.status(400).json({ error: 'session_id is required' });
        }

        try {
            // By default, return only metadata (no image_data) for performance
            const selectFields = include_data === 'true'
                ? 'id, message_id, image_data, mime_type, original_filename, file_size, created_at'
                : 'id, message_id, mime_type, original_filename, file_size, created_at';

            let query = `SELECT ${selectFields}
                FROM uploaded_images
                WHERE session_id = $1 AND user_id = $2`;
            const params = [session_id, req.user.id];

            if (message_id) {
                query += ` AND message_id = $3`;
                params.push(message_id);
            }

            query += ` ORDER BY created_at ASC`;

            const result = await pool.query(query, params);
            console.log(`📤 Found ${result.rows.length} uploaded images for session ${session_id}`);
            res.json({ images: result.rows, lazyLoad: include_data !== 'true' });
        } catch (err) {
            console.error('Get uploaded images error:', err);
            res.status(500).json({ error: 'Failed to fetch uploaded images' });
        }
    });

    // Save user-uploaded images (batch upload)
    app.post('/images/upload', authenticateToken, async (req, res) => {
        const { session_id, message_id, images } = req.body;

        if (!session_id || !images || !Array.isArray(images) || images.length === 0) {
            return res.status(400).json({ error: 'session_id and images array are required' });
        }

        try {
            // Ensure session exists (create if not, to satisfy foreign key)
            const checkSession = await pool.query('SELECT session_id FROM chat_sessions WHERE session_id = $1', [session_id]);
            if (checkSession.rows.length === 0) {
                await pool.query(
                    'INSERT INTO chat_sessions (session_id, user_id, username, title) VALUES ($1, $2, $3, $4)',
                    [session_id, req.user.id, req.user.username, 'Image Upload']
                );
                console.log(`📁 Created session ${session_id} for uploaded images`);
            }

            const savedImages = [];

            for (const img of images) {
                if (!img.image_data) continue;

                const result = await pool.query(
                    `INSERT INTO uploaded_images
                    (session_id, user_id, message_id, image_data, mime_type, original_filename, file_size)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    RETURNING id, created_at`,
                    [
                        session_id,
                        req.user.id,
                        message_id || null,
                        img.image_data,
                        img.mime_type || 'image/png',
                        img.original_filename || null,
                        img.file_size || null
                    ]
                );

                savedImages.push({
                    id: result.rows[0].id,
                    created_at: result.rows[0].created_at,
                    original_filename: img.original_filename
                });
            }

            console.log(`📤 Saved ${savedImages.length} uploaded image(s) for session ${session_id}`);
            res.json({
                status: 'saved',
                images: savedImages
            });
        } catch (err) {
            console.error('Upload image save error:', err);
            res.status(500).json({ error: 'Failed to save uploaded images' });
        }
    });

    // Get a specific uploaded image by ID (with data)
    app.get('/images/uploaded/:id', authenticateToken, async (req, res) => {
        const imageId = req.params.id;
        const { raw } = req.query;

        try {
            const result = await pool.query(
                `SELECT id, image_data, mime_type, original_filename, file_size, created_at
                FROM uploaded_images
                WHERE id = $1 AND user_id = $2`,
                [imageId, req.user.id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Image not found' });
            }

            const img = result.rows[0];

            if (raw === 'true') {
                const imgBuffer = Buffer.from(img.image_data, 'base64');
                res.writeHead(200, {
                    'Content-Type': img.mime_type || 'image/png',
                    'Content-Length': imgBuffer.length,
                    'Cache-Control': 'public, max-age=31536000' // Cache for 1 year
                });
                return res.end(imgBuffer);
            }

            res.json({ image: img });
        } catch (err) {
            console.error('Get uploaded image error:', err);
            res.status(500).json({ error: 'Failed to fetch image' });
        }
    });

    // Delete an uploaded image
    app.delete('/images/uploaded/:id', authenticateToken, async (req, res) => {
        const imageId = req.params.id;

        try {
            await pool.query(
                'DELETE FROM uploaded_images WHERE id = $1 AND user_id = $2',
                [imageId, req.user.id]
            );
            res.json({ status: 'deleted' });
        } catch (err) {
            console.error('Delete uploaded image error:', err);
            res.status(500).json({ error: 'Failed to delete image' });
        }
    });

    // ===========================================
    // GENERATED IMAGES - WILDCARD ROUTES
    // (Must be AFTER specific /images/* routes!)
    // ===========================================

    // Get a specific image by ID
    app.get('/images/:id', authenticateToken, async (req, res) => {
        const imageId = req.params.id;
        const { raw } = req.query;

        try {
            const result = await pool.query(
                `SELECT id, image_data, mime_type, prompt, model, aspect_ratio, image_size, is_edited, parent_image_id, created_at
                FROM generated_images
                WHERE id = $1 AND user_id = $2`,
                [imageId, req.user.id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Image not found' });
            }

            const img = result.rows[0];

            if (raw === 'true') {
                const imgBuffer = Buffer.from(img.image_data, 'base64');
                res.writeHead(200, {
                    'Content-Type': img.mime_type || 'image/png',
                    'Content-Length': imgBuffer.length,
                    'Cache-Control': 'public, max-age=31536000' // Cache for 1 year
                });
                return res.end(imgBuffer);
            }

            res.json({ image: img });
        } catch (err) {
            console.error('Get image error:', err);
            res.status(500).json({ error: 'Failed to fetch image' });
        }
    });

    // Delete a generated image
    app.delete('/images/:id', authenticateToken, async (req, res) => {
        const imageId = req.params.id;

        try {
            await pool.query(
                'DELETE FROM generated_images WHERE id = $1 AND user_id = $2',
                [imageId, req.user.id]
            );
            res.json({ status: 'deleted' });
        } catch (err) {
            console.error('Delete image error:', err);
            res.status(500).json({ error: 'Failed to delete image' });
        }
    });

    // ===========================================
    // PROXY ENDPOINTS
    // ===========================================

    // Vertex AI Proxy - bypasses CORS restrictions
    app.post('/vertex-proxy', authenticateToken, proxyLimiter, async (req, res) => {
        const { url, payload } = req.body;
        if (!url || !payload) {
            return res.status(400).json({ error: 'Missing url or payload' });
        }
        if (!VERTEX_PROJECT_ID) {
            return res.status(500).json({ error: 'Vertex project is not configured' });
        }
        if (!isVertexUrlAllowed(url)) {
            return res.status(400).json({ error: 'Invalid Vertex URL' });
        }
        try {
            const accessToken = await getVertexAccessToken();
            console.log('dY- Proxying Vertex AI request to: ' + url);
            const maxAttempts = 3;
            let response;
            let lastErr;

            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    response = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${accessToken}`
                        },
                        body: JSON.stringify(payload)
                    });
                    lastErr = null;
                    break;
                } catch (err) {
                    lastErr = err;
                    console.warn(`Vertex proxy fetch attempt ${attempt}/${maxAttempts} failed:`, err && err.message ? err.message : err);
                    if (attempt < maxAttempts) {
                        await new Promise(r => setTimeout(r, 750 * attempt));
                    }
                }
            }

            if (!response) {
                throw lastErr || new Error('fetch failed');
            }

            // Stream the response back
            res.status(response.status);
            const contentType = response.headers.get('content-type');
            if (contentType) res.setHeader('Content-Type', contentType);

            const { Readable } = require('stream');
            if (response.body && Readable.fromWeb) {
                Readable.fromWeb(response.body).pipe(res);
            } else {
                res.send(await response.text());
            }
        } catch (err) {
            console.error('Vertex proxy error:', err && err.stack ? err.stack : (err && err.message ? err.message : err));
            res.status(500).json({ error: 'Vertex AI proxy failed: ' + (err && err.message ? err.message : String(err)) });
        }
    });

    app.post('/search', authenticateToken, proxyLimiter, async (req, res) => {
        const { query, start, num, siteSearch } = req.body;
        if (!query) return res.status(400).json({ error: 'Query required' });
        try {
            const keys = getSearchKeys();
            if (!keys.length) {
                return res.status(500).json({ error: 'Search keys not configured' });
            }
            let lastError = null;
            for (const key of keys) {
                try {
                    let url = `https://www.googleapis.com/customsearch/v1?key=${key.apiKey}&cx=${key.cx}&q=${encodeURIComponent(query)}&num=${num || 10}&start=${start || 1}`;
                    if (siteSearch) url += `&siteSearch=${encodeURIComponent(siteSearch)}`;
                    const response = await fetch(url);
                    if (response.ok) {
                        return res.status(response.status).json(await response.json());
                    }
                    const errorText = await response.text();
                    lastError = `${response.status}: ${errorText}`;
                    if (![403, 429].includes(response.status)) {
                        return res.status(response.status).send(errorText);
                    }
                } catch (err) {
                    lastError = err && err.message ? err.message : String(err);
                }
            }
            return res.status(502).json({ error: 'Search failed', details: lastError });
        } catch (err) {
            res.status(500).json({ error: 'Search failed' });
        }
    });

    app.post('/chat/completions', authenticateToken, proxyLimiter, async (req, res) => {
        const { provider, payload } = req.body;
        if (!provider || !payload) return res.status(400).json({ error: 'Provider and payload required' });
        try {
            const providers = {
                openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions', apiKey: OPENROUTER_API_KEY },
                chutes: { url: 'https://llm.chutes.ai/v1/chat/completions', apiKey: CHUTES_API_KEY }
            };
            const config = providers[provider];
            if (!config) return res.status(400).json({ error: 'Unknown provider' });
            if (!config.apiKey) return res.status(500).json({ error: provider + ' API key not configured' });

            const response = await fetch(config.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
                body: JSON.stringify(payload)
            });
            res.status(response.status);
            const contentType = response.headers.get('content-type');
            if (contentType) res.setHeader('Content-Type', contentType);
            const { Readable } = require('stream');
            if (response.body && Readable.fromWeb) {
                Readable.fromWeb(response.body).pipe(res);
            } else {
                res.send(await response.text());
            }
        } catch (err) {
            res.status(500).json({ error: 'Proxy failed' });
        }
    });

    // ===========================================
    // WEB SCRAPING ENDPOINT
    // ===========================================
    app.post('/fetch-content', authenticateToken, proxyLimiter, async (req, res) => {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL required' });
        console.log(`dYO? Fetching: ${url}`);
        try {
            const content = await fetchTextFromUrl(url);
            res.json({ url, content });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ===========================================
    // LEGACY ENDPOINT
    // ===========================================
    app.get('/history', authenticateToken, async (req, res) => {
        res.json([]);
    });

    // Keep alive
    setInterval(() => console.log('🛡️ Server alive...'), 600000);

    // Start listening
    app.listen(PORT, () => {
        console.log('');
        console.log('============================================');
        console.log(`✅ SERVER RUNNING ON PORT ${PORT}`);
        console.log('============================================');
        console.log('');
    });
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    if (browserInstance) await browserInstance.close();
    await pool.end();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\nShutting down...');
    if (browserInstance) await browserInstance.close();
    await pool.end();
    process.exit(0);
});

// RUN IT
startServer();
