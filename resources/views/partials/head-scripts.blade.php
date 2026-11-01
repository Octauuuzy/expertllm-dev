    <script>
        // IMMEDIATE CONSOLE CAPTURE HOOK
        // captures logs before the DOM is ready
        (function () {
            window.__consoleBuffer = [];
            const methods = ['log', 'warn', 'error', 'info', 'debug'];
            const originalConsole = {};

            function bufferLog(type, args) {
                const time = new Date();
                // If the UI renderer exists, use it directly
                if (window.__renderLogEntry) {
                    window.__renderLogEntry(type, args, time);
                } else {
                    // Otherwise buffer it
                    window.__consoleBuffer.push({ type, args, time });
                }
            }

            methods.forEach(method => {
                originalConsole[method] = console[method];
                console[method] = function (...args) {
                    originalConsole[method].apply(console, args);
                    bufferLog(method, args);
                };
            });

            window.addEventListener('error', e => bufferLog('error', [`Uncaught Exception: ${e.message}`]));
            window.addEventListener('unhandledrejection', e => bufferLog('error', [`Unhandled Promise Rejection: ${e.reason}`]));
        })();
    </script>
    <script>
        // GLOBAL FETCH INTERCEPTOR FOR ROLLING SESSIONS + NGROK FIX
        (function () {
            const originalFetch = window.fetch;
            window.fetch = async function (url, options = {}) {
                // Only add ngrok header for relative URLs (our server) or ngrok URLs
                const urlStr = typeof url === 'string' ? url : url.toString();
                const isOwnServer = urlStr.startsWith('/') || urlStr.includes('ngrok') || urlStr.includes('localhost') || urlStr.includes('127.0.0.1');

                if (isOwnServer) {
                    options.headers = options.headers || {};
                    if (options.headers instanceof Headers) {
                        options.headers.set('ngrok-skip-browser-warning', 'true');
                    } else {
                        options.headers['ngrok-skip-browser-warning'] = 'true';
                    }
                }

                const response = await originalFetch(url, options);
                try {
                    const newToken = response.headers.get('X-Auth-Token');
                    if (newToken) {
                        localStorage.setItem('authToken', newToken);
                    }
                } catch (e) {
                    console.warn('Error processing response headers for token refresh', e);
                }
                return response;
            };
        })();
    </script>
    <meta charset="UTF-8">
    <meta name="viewport"
        content="width=device-width, initial-scale=1.0, interactive-widget=resizes-content, maximum-scale=1.0, user-scalable=no">
    <title>ExpertLLM</title>
    <link rel="icon" href="ico.png">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
    <!-- MathJax configuration -->
    <script>
        window.MathJax = {
            tex: {
                inlineMath: [["\\(", "\\)"]],
                // Support $$...$$ because many models emit it for display math.
                // Keep single-$ disabled to avoid currency false-positives.
                displayMath: [["\\[", "\\]"], ["$$", "$$"]],
                processEscapes: true,
                packages: { '[+]': ['ams'] }
            },
            loader: { load: ['[tex]/ams'] }
        };
    </script>
    <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js" id="MathJax-script" async></script>
    <script>
        // MathJax loads async; messages can render before it's ready.
        // Queue initial typesets and flush once MathJax exposes typesetPromise.
        (function () {
            const pending = new Set();
            let flushedOnce = false;

            function flushQueue() {
                if (!window.MathJax || typeof MathJax.typesetPromise !== 'function') return false;
                const targets = Array.from(pending).filter(Boolean);
                pending.clear();
                flushedOnce = true;
                if (!targets.length) return true;
                try {
                    // Clear previous typesetting for these nodes to avoid duplicate renders.
                    if (typeof MathJax.typesetClear === 'function') {
                        MathJax.typesetClear(targets);
                    }
                } catch (_) { /* no-op */ }
                MathJax.typesetPromise(targets).catch(err => console.warn('MathJax typeset failed', err));
                return true;
            }

            window.__queueMathTypeset = function (el) {
                if (!el) return;
                if (window.MathJax && typeof MathJax.typesetPromise === 'function') {
                    MathJax.typesetPromise([el]).catch(err => console.warn('MathJax typeset failed', err));
                    return;
                }
                pending.add(el);
            };

            window.__flushMathTypesetQueue = flushQueue;

            // Poll briefly on startup; avoids missing early renders on slow connections.
            let attempts = 0;
            const timer = setInterval(() => {
                attempts++;
                if (flushQueue()) { clearInterval(timer); return; }
                if (attempts > 50) {
                    // Give up after ~10s to avoid holding DOM nodes forever.
                    pending.clear();
                    clearInterval(timer);
                    if (!flushedOnce) console.warn('MathJax did not become ready; math will remain unrendered.');
                }
            }, 200);

            window.addEventListener('load', () => { flushQueue(); }, { once: true });
        })();
    </script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.7.0/mammoth.browser.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.min.js"></script>
    <!-- Tesseract.js for OCR -->
    <script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"></script>
    <script>
        // Set the worker source for pdf.js
        if (typeof pdfjsLib !== 'undefined') {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';
        }
    </script>
