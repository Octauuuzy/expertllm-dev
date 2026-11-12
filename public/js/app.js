        // *** ASTERISK FIX VERSION 4.0 - HEADING FIX - Last Updated: 2025-10-01 ***
        // If you still see asterisks, do a HARD REFRESH: Ctrl+Shift+R or Ctrl+F5
        console.log('ExpertLLM Markdown Processor v4.0 - HEADING ASTERISK FIX APPLIED');

        // -------------------------------------------------------------------
        // START: UNIFIED API CONFIGURATION
        // -------------------------------------------------------------------

        // Global feature toggles (code-level switches, not user-configurable)
        const FEATURE_FLAGS = {
            enableTwitterSearch: false
        };

        // USER CONFIGURATION: Set to false to disable local storage (IndexedDB) for app state.
        // This ensures privacy on shared devices or strict sync with database.
        const ENABLE_LOCAL_PERSISTENCE = false;

        const WEB_CONTEXT_CHAR_LIMIT = 500000;
        const FACT_CHECKER_CONTEXT_CHAR_LIMIT = 2000000;
        const CONTEXT_TRUNCATION_NOTICE = '\n[Source truncated to fit context budget]\n';
        // Split source fetches into smaller requests to avoid proxy timeout on large batches.
        const SOURCE_FETCH_BATCH_CHUNK_SIZE = 8;
        const SOURCE_FETCH_BATCH_INTER_CHUNK_DELAY_MS = 75;

        // This is the ONLY section you need to edit to add or change models.
        // Server-injected values (see resources/views/layouts/app.blade.php)
        // keep the project id in sync with what the API's proxy accepts.
        const APP_CONFIG = window.__APP_CONFIG__ || {};

        const API_CONFIG = {
            vertex: {
                // Injected by the server from VERTEX_PROJECT_ID; never hardcoded.
                projectId: APP_CONFIG.vertexProjectId || "",

                locations: ["global", "us-central1"], // Default primary and fallback regions for OpenAI-compatible endpoint
                modelLocations: {
                    "gemini-3.1-pro-preview": ["global"] // Gemini 3 Pro (Preview) is only served from the global endpoint
                }
            },
            // Gemini API (AI Studio key, held server-side). When enabled, Google models
            // go through /gemini-proxy instead of Vertex.
            gemini: { enabled: Boolean(APP_CONFIG.geminiApiEnabled) },
            openrouter: { enabled: true },

            chutes: { enabled: true },

            // Vertex AI Open Model: Kimi K2 (OpenAI-compatible endpoint)
            megallm: {
                // Per Vertex AI docs (Dec 10, 2025), the GA model IDs are:
                //  - kimi-k2-thinking-maas (thinking / reasoning)
                //  - kimi-k2-32k-maas     (chat / 32k context)
                modelId: "moonshot-ai/kimi-k2-thinking-maas",
                location: "global", // Kimi K2 MaaS is currently served from us-central1
                // Auth is handled server-side via Vertex OAuth; no key ships here.
            }
        };
        // Server-side page-fetching endpoints (Fact Checker source extraction).
        const VPS_FETCHER_URL = "/fetch-content";
        const VPS_FETCHER_BATCH_URL = "/fetch-content-batch";

        // Model configurations - Link models to their providers here
        const models = {
            // Google Models
            flash: {
                id: "flash",
                provider: "google",
                name: "Fast",
                maxOutputTokens: 65536,
                googleModelName: "gemini-3-flash-preview",
                supportsThinking: true,
                thinking: {
                    defaultLevel: "MEDIUM",
                    extendedLevel: "HIGH",
                    defaultLabel: "Balanced Thinking",
                    extendedLabel: "High reasoning"
                },
            },
            pro: {
                id: "pro",
                provider: "google",
                name: "Thinking",
                maxOutputTokens: 65535,
                googleModelName: "gemini-2.5-pro",
                supportsThinking: true,
                thinking: {
                    defaultBudget: 1024,
                    extendedBudget: 32000,
                    outputBudget: 4096,
                    extendedOutputBudget: 65000,
                    defaultLabel: "Standard thinking",
                    extendedLabel: "Deep thinking"
                },
            },
            g3pro: {
                id: "g3pro",
                provider: "google",
                name: "Expert Thinking",
                maxOutputTokens: 65536,
                googleModelName: "gemini-3.1-pro-preview",
                supportsThinking: true,
                thinking: {
                    defaultLevel: "LOW",
                    extendedLevel: "HIGH",
                    defaultLabel: "Low reasoning",
                    extendedLabel: "High reasoning"
                },
            },
            // Gemini Argon (gemini-4-argon). The model supports thinking_level low | medium | high;
            // this app pins it to high. maxOutputTokens covers thinking + answer; 65,536 is the
            // streaming cap without long decode. Sampling params (temperature/top_p/top_k) are
            // ignored by the model.
            argon: {
                id: "argon",
                provider: "google",
                name: "Gemini Argon",
                description: "Google's flagship model",
                maxOutputTokens: 65536,
                googleModelName: "gemini-4-argon",
                supportsThinking: true,
                thinking: {
                    defaultLevel: "HIGH",
                    extendedLevel: "HIGH",
                    defaultLabel: "High reasoning",
                    extendedLabel: "High reasoning"
                },
            },
            gptoss: {
                id: "gptoss",
                provider: "chutes",
                name: "Deep Thinking",
                maxOutputTokens: 81920,
                chutesModelId: "Qwen/Qwen3-235B-A22B-Thinking-2507",
            },
            // OpenRouter Model (DeepSeek)
            deepseek: {
                id: "deepseek",
                provider: "openrouter",
                name: "DeepSeek V3.1",
                maxOutputTokens: 8192,
                openRouterModelId: "deepseek/deepseek-chat-v3.1:free", // The model ID from OpenRouter
            }
            ,
            // Vertex AI Open Model: Kimi K2
            gpt5: {
                id: "gpt5",
                provider: "megallm",
                name: "Kimi K2",
                description: "This mode is unavailable",
                maxOutputTokens: 32000,
                megallmModelId: "moonshotai/kimi-k2-32k-maas"
            },
            gpt5thinking: {
                id: "gpt5thinking",
                provider: "megallm",
                name: "Kimi K2 Thinking",
                description: "Moonshot's flagship model",
                maxOutputTokens: 32768,
                megallmModelId: "moonshotai/kimi-k2-thinking-maas",
                supportsThinking: true,
                defaultTemperature: 1.0  // Moonshot recommends 1.0 for Thinking models
            }
        };

        // Gemini safety: explicitly disable blocking so we don't hit surprise safety stops
        const GEMINI_SAFETY_RELAXED = [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "OFF" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "OFF" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "OFF" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "OFF" },
            { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "OFF" }
        ];

        function getGeminiSafetySettings() {
            return GEMINI_SAFETY_RELAXED.map(entry => ({ ...entry }));
        }

        // ===== GEMINI 3 PRO IMAGE GENERATION CONFIGURATION =====
        // This model is used when "Create image" is enabled
        const IMAGE_GENERATION_CONFIG = {
            modelName: "gemini-3-pro-image-preview",
            modelLocation: "global", // Gemini 3 Pro Image Preview is served from global
            // Image generation parameters (as per Vertex AI SDK docs)
            imageSize: "1K",         // Supported: "1K", "2K", "4K" (uppercase K required)
            // Response configuration
            responseModalities: ["TEXT", "IMAGE"],
            // Safety settings for image generation (allow people generation)
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "OFF" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "OFF" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "OFF" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "OFF" },
                { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "OFF" }
            ],
            // Direct backend URL to bypass Vercel's 120s rewrite timeout
            // Image generation can take >2 minutes for 4K images
            // Empty here: Laravel serves the UI and the proxy from the same
            // origin, so the relative /vertex-proxy path is used.
            directBackendUrl: APP_CONFIG.directBackendUrl || ""
        };

        // Track the last generated image for editing in each session
        let lastGeneratedImageData = null;
        let lastGeneratedImagePrompt = null;
        let lastGeneratedImageId = null;
        let lastGeneratedImageMimeType = 'image/png';
        let lastGeneratedImageTimestamp = 0;

        // Strip base64 data-URLs and AI-generated image HTML from text before sending to text models.
        // This prevents runaway token counts if UI-rendered HTML leaks into prompts.
        function stripInlineBase64MediaFromText(text) {
            if (typeof text !== 'string' || !text) return text;
            let out = text;
            // Strip AI-generated image containers entirely
            out = out.replace(/<div class="ai-generated-image-container"[\s\S]*?<\/div>\s*<\/div>/g, '[AI Generated Image]');
            // Strip Markdown base64 images: ![alt](data:image/...)
            out = out.replace(/!\[(.*?)\]\(data:[^)]+;base64,[^)]+\)/g, '![$1]([Media Data Removed])');
            // Strip HTML src base64: src="data:..."
            out = out.replace(/src="data:[^"]+;base64,[^"]+"/g, 'src="[Media Data Removed]"');
            // Strip data-image-src attributes with base64 data
            out = out.replace(/data-image-src="data:[^"]+"/g, 'data-image-src="[Media Data Removed]"');
            return out;
        }

        // Accept either raw base64 or a data:...;base64,... URL and return raw base64.
        function normalizeBase64Payload(data) {
            if (typeof data !== 'string') return data;
            const idx = data.indexOf('base64,');
            if (data.startsWith('data:') && idx !== -1) return data.slice(idx + 'base64,'.length);
            return data;
        }

        function getMessageIdFromMessageElement(messageEl) {
            if (!messageEl) return null;
            const rawId = typeof messageEl.id === 'string' ? messageEl.id : null;
            if (!rawId) return null;
            // Our DOM wrapper is `message-${message.id}`.
            if (rawId.startsWith('message-')) return rawId.slice('message-'.length);
            return rawId;
        }

        // Session-scoped image storage to prevent memory leaks
        // Images are stored per-message and cleared when chat switches
        const sessionImageCache = new WeakMap;
        // Save generated image to server
        async function saveGeneratedImage(sessionId, messageId, imageData, mimeType, prompt, isEdited = false, parentImageId = null) {
            const token = localStorage.getItem('authToken');
            if (!token) {
                console.warn('?? Cannot save image: No auth token');
                return null;
            }
            if (!sessionId) {
                console.warn('?? Cannot save image: No session ID');
                return null;
            }

            try {
                const response = await fetch(`${API_BASE_URL}/images/save`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        session_id: sessionId,
                        message_id: messageId,
                        image_data: imageData,
                        mime_type: mimeType,
                        prompt: prompt,
                        model: IMAGE_GENERATION_CONFIG.modelName,
                        image_size: IMAGE_GENERATION_CONFIG.imageSize,
                        is_edited: isEdited,
                        parent_image_id: parentImageId
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    console.log('?? Generated image saved to server:', data.image_id);
                    return data.image_id;
                } else {
                    const errorData = await response.json().catch(() => ({}));
                    console.error('?? Failed to save generated image:', response.status, errorData);
                }
            } catch (err) {
                console.error('?? Error saving generated image to server:', err);
            }
            return null;
        }

        // Get last generated image from server for the current session
        async function getLastGeneratedImage(sessionId) {
            const token = localStorage.getItem('authToken');
            if (!token || !sessionId) return null;

            try {
                const response = await fetch(`${API_BASE_URL}/images/last?session_id=${encodeURIComponent(sessionId)}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.image) {
                        return data.image;
                    }
                }
            } catch (err) {
                console.warn('Failed to fetch last image from server:', err);
            }
            return null;
        }

        // Save user-uploaded images to server (batch)
        async function saveUploadedImages(sessionId, messageId, files) {
            const token = localStorage.getItem('authToken');
            if (!token) {
                console.warn('?? Cannot save uploaded images: No auth token');
                return [];
            }
            if (!sessionId) {
                console.warn('?? Cannot save uploaded images: No session ID');
                return [];
            }
            if (!files || files.length === 0) return [];

            // Filter only image files
            const imageFiles = files.filter(f => f.type && f.type.startsWith('image/') && f.content);
            if (imageFiles.length === 0) {
                console.log('?? No image files to save');
                return [];
            }

            try {
                const images = imageFiles.map(f => ({
                    image_data: f.content,
                    mime_type: f.type,
                    original_filename: f.name,
                    file_size: f.content ? Math.ceil(f.content.length * 0.75) : null // Approximate size from base64
                }));

                console.log(`?? Saving ${images.length} uploaded image(s) to server...`);

                const response = await fetch(`${API_BASE_URL}/images/upload`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        session_id: sessionId,
                        message_id: messageId,
                        images: images
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    console.log('?? Uploaded images saved to server:', data.images?.length || 0, 'images');
                    return data.images || [];
                } else {
                    const errorData = await response.json().catch(() => ({}));
                    console.error('?? Failed to save uploaded images:', response.status, errorData);
                }
            } catch (err) {
                console.error('?? Error saving uploaded images to server:', err);
            }
            return [];
        }

        // Get uploaded images for a session/message from server
        async function getUploadedImages(sessionId, messageId = null, includeData = false) {
            const token = localStorage.getItem('authToken');
            if (!token || !sessionId) return [];

            try {
                let url = `${API_BASE_URL}/images/uploaded?session_id=${encodeURIComponent(sessionId)}`;
                if (messageId) {
                    url += `&message_id=${encodeURIComponent(messageId)}`;
                }
                if (includeData) {
                    url += '&include_data=true';
                }

                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    return data.images || [];
                }
            } catch (err) {
                console.warn('Failed to fetch uploaded images from server:', err);
            }
            return [];
        }

        // Parse image generation/editing response (handles both single response and streamed chunks)
        function parseImageGenerationResponse(data) {
            const result = {
                images: [],
                text: ''
            };

            // Handle array of streamed chunks
            const candidates = Array.isArray(data)
                ? data.flatMap(chunk => chunk?.candidates || [])
                : (data?.candidates || []);

            console.log('?? Total candidates found:', candidates.length);

            for (const candidate of candidates) {
                if (candidate?.content?.parts) {
                    console.log('?? Parts in candidate:', candidate.content.parts.length);
                    for (const part of candidate.content.parts) {
                        console.log('?? Part keys:', Object.keys(part));
                        console.log('?? FULL PART:', JSON.stringify(part).substring(0, 500));

                        // Skip thought-only parts (Gemini 3 Pro Image "thinking" process)
                        // But still check if thought parts contain inline_data (they can!)

                        // Check for inlineData (camelCase - JS SDK style)
                        if (part.inlineData && part.inlineData.mimeType?.startsWith('image/')) {
                            console.log('? Found image (inlineData):', part.inlineData.mimeType, 'thought:', !!part.thought);
                            result.images.push({
                                data: part.inlineData.data,
                                mimeType: part.inlineData.mimeType
                            });
                        }
                        // Check for inline_data (snake_case - REST API style)
                        else if (part.inline_data && part.inline_data.mime_type?.startsWith('image/')) {
                            console.log('? Found image (inline_data):', part.inline_data.mime_type, 'thought:', !!part.thought);
                            result.images.push({
                                data: part.inline_data.data,
                                mimeType: part.inline_data.mime_type
                            });
                        }
                        else if (part.text && !part.thought) {
                            // Only append text if it's not a thought
                            result.text += part.text;
                        }
                    }
                }
            }

            console.log(`?? Image operation complete: ${result.images.length} image(s) generated/edited`);
            return result;
        }

        // Consume streaming response for image generation
        // Vertex AI streamGenerateContent returns a JSON array: [{...}, {...}, ...]
        async function consumeImageGenerationStream(response, placeholderEl) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let fullResponse = '';
            let lastProgressUpdate = Date.now();

            // Update placeholder to show streaming progress
            if (placeholderEl) {
                const statusEl = placeholderEl.querySelector('.ai-image-generating span, .ai-image-generating');
                if (statusEl) {
                    statusEl.innerHTML = '<i class="fas fa-magic"></i> Generating image (streaming)...';
                }
            }

            try {
                // Collect the entire response (Vertex AI streams a JSON array)
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    fullResponse += decoder.decode(value, { stream: true });

                    // Update progress indicator periodically to show activity
                    const now = Date.now();
                    if (now - lastProgressUpdate > 2000 && placeholderEl) {
                        const statusEl = placeholderEl.querySelector('.ai-image-generating span, .ai-image-generating');
                        if (statusEl) {
                            const elapsed = Math.floor((now - lastProgressUpdate) / 1000);
                            const dots = '.'.repeat((elapsed % 3) + 1);
                            statusEl.innerHTML = `<i class="fas fa-magic"></i> Generating image${dots}`;
                        }
                        lastProgressUpdate = now;
                    }
                }

                // Finalize decoder
                fullResponse += decoder.decode();

                // Trim whitespace
                fullResponse = fullResponse.trim();

                if (!fullResponse) {
                    console.warn('Empty response from image generation');
                    return { images: [], text: '' };
                }

                console.log('?? Raw response length:', fullResponse.length);

                // DEBUG: Log first chunk of raw response to understand format
                console.log('?? RAW RESPONSE PREVIEW:', fullResponse.substring(0, 2000));

                // Parse the response - Vertex AI returns either:
                // 1. A JSON array: [{...}, {...}] (streamGenerateContent)
                // 2. A single JSON object: {...} (generateContent)
                let parsedData;
                try {
                    parsedData = JSON.parse(fullResponse);
                } catch (e) {
                    console.error('Failed to parse image response as JSON:', e);
                    console.log('Response preview:', fullResponse.substring(0, 500));
                    logApiEvent({
                        provider: 'google',
                        model: IMAGE_GENERATION_CONFIG.modelName,
                        stage: 'error',
                        url: 'vertex-image-stream',
                        error: { message: 'Failed to parse image response as JSON', detail: String(e?.message || e), preview: fullResponse.substring(0, 2000) }
                    });
                    return { images: [], text: '' };
                }

                // DEBUG: Log parsed structure
                console.log('?? PARSED DATA STRUCTURE:', JSON.stringify(parsedData, null, 2).substring(0, 3000));

                // Check for API error response
                if (parsedData.error) {
                    console.error('? API ERROR:', parsedData.error);
                    logApiEvent({
                        provider: 'google',
                        model: IMAGE_GENERATION_CONFIG.modelName,
                        stage: 'error',
                        url: 'vertex-image-stream',
                        error: parsedData.error
                    });
                    return { images: [], text: '', error: parsedData.error };
                }

                // Check if the first chunk has an error
                if (Array.isArray(parsedData) && parsedData[0]?.error) {
                    console.error('? API ERROR in first chunk:', parsedData[0].error);
                    logApiEvent({
                        provider: 'google',
                        model: IMAGE_GENERATION_CONFIG.modelName,
                        stage: 'error',
                        url: 'vertex-image-stream',
                        error: parsedData[0].error
                    });
                    return { images: [], text: '', error: parsedData[0].error };
                }

                // If it's an array, pass all chunks; if single object, wrap in array
                const chunks = Array.isArray(parsedData) ? parsedData : [parsedData];
                console.log(`?? Parsed ${chunks.length} chunk(s) from response`);

                const result = parseImageGenerationResponse(chunks);
                logApiEvent({
                    provider: 'google',
                    model: IMAGE_GENERATION_CONFIG.modelName,
                    stage: 'response',
                    url: 'vertex-image-stream',
                    responseMeta: extractGeminiMetadata(Array.isArray(parsedData) ? (parsedData[parsedData.length - 1] || {}) : parsedData),
                    response: { raw: parsedData, parsed: result }
                });
                return result;
            } catch (error) {
                console.error('Error consuming image stream:', error);
                logApiEvent({
                    provider: 'google',
                    model: IMAGE_GENERATION_CONFIG.modelName,
                    stage: 'error',
                    url: 'vertex-image-stream',
                    error: { message: String(error?.message || error), stack: String(error?.stack || '') }
                });
                throw error;
            }
        }

        function buildImageTextHistoryContents(currentUserMessage) {
            const currentChat = appState.chats.find(chat => chat.id === appState.currentChatId);
            const history = currentChat ? currentChat.messages.filter(m => m.id !== currentUserMessage.id) : [];
            const contents = [];

            for (const msg of history) {
                let text = '';
                if (msg.role === 'assistant') {
                    text = stripInlineBase64MediaFromText(msg.content || '');
                } else {
                    text = msg.content || '';
                }
                if (typeof text !== 'string') continue;
                const trimmed = text.trim();
                if (!trimmed) continue;
                contents.push({
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: trimmed }]
                });
            }
            return contents;
        }

        function collectCurrentUploadedImages(userMessage) {
            const images = [];
            if (userMessage?.files && Array.isArray(userMessage.files)) {
                for (const file of userMessage.files) {
                    if (file.type && file.type.startsWith('image/') && file.content) {
                        images.push({
                            data: normalizeBase64Payload(file.content),
                            mimeType: file.type,
                            name: file.name
                        });
                    }
                }
            }
            return images;
        }

        async function ensureLastGeneratedImage(chatId) {
            if (lastGeneratedImageData) {
                return {
                    data: lastGeneratedImageData,
                    mimeType: lastGeneratedImageMimeType || 'image/png',
                    prompt: lastGeneratedImagePrompt,
                    id: lastGeneratedImageId
                };
            }
            if (!chatId) return null;
            const lastImage = await getLastGeneratedImage(chatId);
            if (!lastImage) return null;

            lastGeneratedImageData = lastImage.image_data;
            lastGeneratedImagePrompt = lastImage.prompt;
            lastGeneratedImageMimeType = lastImage.mime_type || lastImage.mimeType || 'image/png';
            lastGeneratedImageId = lastImage.id;
            lastGeneratedImageTimestamp = Date.parse(lastImage.created_at || lastImage.updated_at || '') || Date.now();
            return {
                data: lastGeneratedImageData,
                mimeType: lastGeneratedImageMimeType,
                prompt: lastGeneratedImagePrompt,
                id: lastGeneratedImageId
            };
        }

        async function requestImageModel(contents, placeholderEl, signal) {
            const { projectId } = API_CONFIG.vertex || {};
            if (!projectId) {
                throw new Error("Vertex AI configuration is missing for image generation.");
            }

            const host = 'aiplatform.googleapis.com';
            const baseUrl = `https://${host}/v1/projects/${projectId}/locations/${IMAGE_GENERATION_CONFIG.modelLocation}/publishers/google/models/${IMAGE_GENERATION_CONFIG.modelName}:streamGenerateContent`;
            const authToken = localStorage.getItem('authToken');

            const payload = {
                contents,
                generationConfig: {
                    responseModalities: ["TEXT", "IMAGE"],
                    imageConfig: {
                        imageSize: IMAGE_GENERATION_CONFIG.imageSize
                    },
                    temperature: 1,
                    maxOutputTokens: 2048
                },
                safetySettings: IMAGE_GENERATION_CONFIG.safetySettings.map(s => ({
                    category: s.category,
                    threshold: s.threshold
                }))
            };

            captureOutgoingPayloadSnapshot({
                provider: 'google-image',
                model: IMAGE_GENERATION_CONFIG.modelName,
                url: baseUrl,
                location: IMAGE_GENERATION_CONFIG.modelLocation,
                payload
            });

            console.log('?? Image model request (streaming, direct backend):', { messages: contents?.length || 0 });
            console.log('?? TARGET URL:', baseUrl);

            const proxyUrl = IMAGE_GENERATION_CONFIG.directBackendUrl
                ? `${IMAGE_GENERATION_CONFIG.directBackendUrl}/vertex-proxy`
                : '/vertex-proxy';

            logApiEvent({
                provider: 'google',
                model: IMAGE_GENERATION_CONFIG.modelName,
                stage: 'request',
                location: IMAGE_GENERATION_CONFIG.modelLocation,
                url: baseUrl,
                request: { payload, proxyUrl }
            });

            const response = await fetch(proxyUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                    'ngrok-skip-browser-warning': 'true'
                },
                body: JSON.stringify({
                    url: baseUrl,
                    payload: payload,}),
                signal
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Image model request failed:', errorText);
                logApiEvent({
                    provider: 'google',
                    model: IMAGE_GENERATION_CONFIG.modelName,
                    stage: 'error',
                    location: IMAGE_GENERATION_CONFIG.modelLocation,
                    url: baseUrl,
                    request: { payload, proxyUrl },
                    error: { status: response.status, body: errorText }
                });
                throw new Error(`Image model request failed: ${response.status}. ${errorText}`);
            }

            return await consumeImageGenerationStream(response, placeholderEl);
        }

        async function generateImageModelResponse(userMessage, placeholderEl, signal) {
            const currentChat = appState.chats.find(c => c.id === appState.currentChatId);
            const historyContents = buildImageTextHistoryContents(userMessage);

            const currentParts = [];
            const lastImage = await ensureLastGeneratedImage(currentChat?.id || null);
            if (lastImage && lastImage.data) {
                currentParts.push({
                    inlineData: {
                        mimeType: lastImage.mimeType || 'image/png',
                        data: normalizeBase64Payload(lastImage.data)
                    }
                });
            }

            const currentImages = collectCurrentUploadedImages(userMessage);
            for (const img of currentImages) {
                currentParts.push({
                    inlineData: {
                        mimeType: img.mimeType,
                        data: img.data
                    }
                });
            }

            const userText = typeof userMessage === 'string' ? userMessage : (userMessage?.content || '');
            const hasText = typeof userText === 'string' && userText.trim().length > 0;
            if (hasText) {
                currentParts.push({ text: userText });
            }

            if (currentParts.length === 0) {
                return {
                    isError: true,
                    data: 'No image or text was provided for the image model.'
                };
            }

            const contents = historyContents.slice();
            contents.push({ role: 'user', parts: currentParts });

            const contentEl = placeholderEl?.querySelector('.message-content');
            if (contentEl) {
                contentEl.innerHTML = createImageLoadingHTML();
            }

            const result = await requestImageModel(contents, placeholderEl, signal);

            let imagesHTML = '';
            const messageId = placeholderEl?.id?.replace('message-', '') || Date.now().toString();
            if (Array.isArray(result.images) && result.images.length > 0) {
                for (const img of result.images) {
                    imagesHTML += createImageContainerHTML(img.data, img.mimeType, messageId);
                }

                lastGeneratedImageData = result.images[0].data;
                lastGeneratedImageMimeType = result.images[0].mimeType || 'image/png';
                lastGeneratedImagePrompt = hasText ? userText : '';
                lastGeneratedImageTimestamp = Date.now();

                if (currentChat) {
                    const imageId = await saveGeneratedImage(
                        currentChat.id,
                        getMessageIdFromMessageElement(placeholderEl),
                        result.images[0].data,
                        result.images[0].mimeType,
                        lastGeneratedImagePrompt || '',
                        false,
                        null
                    );
                    if (imageId) {
                        lastGeneratedImageId = imageId;
                    }
                }
            }

            const responseText = (result.text || '').trim();
            const finalContent = responseText
                ? (imagesHTML ? `${responseText}\r\n\r\n${imagesHTML}` : responseText)
                : imagesHTML;

            return {
                data: finalContent || '',
                sources: [],
                thinking: [],
                thinkingMeta: null,
                geminiParts: null,
                hasGeneratedImages: !!imagesHTML
            };
        }
        // Create image container HTML for display in message
        // Exposed globally via window for use in other script blocks
        window.createImageContainerHTML = function (imageData, mimeType, messageId) {
            const dataUrl = `data:${mimeType};base64,${imageData}`;
            const uniqueId = `ai-img-${messageId}-${Date.now()}`;

            return `
                <div class="ai-generated-image-container"
                     id="${uniqueId}"
                     onclick="openImageModal('${uniqueId}')"
                     data-image-src="${dataUrl}"
                     role="button"
                     tabindex="0"
                     aria-label="AI generated image - click to expand">
                    <img src="${dataUrl}" alt="AI Generated Image" loading="lazy">
                    <div class="image-overlay">
                        <span class="image-label"><i class="fas fa-magic"></i> AI Generated</span>
                        <span class="expand-hint">Click to expand</span>
                    </div>
                </div>
            `;
        };
        // Alias for local use
        const createImageContainerHTML = window.createImageContainerHTML;

        // Create loading placeholder for image generation
        function createImageLoadingHTML() {
            return `
                <div class="ai-image-generating">
                    <div class="spinner"></div>
                    <div class="generating-text">Generating image...</div>
                </div>
            `;
        }

        // Image modal functions (attached to window for onclick handlers)
        let currentModalImageSrc = null;

        function openImageModalWithSrc(imageSrc) {
            if (!imageSrc) return;

            currentModalImageSrc = imageSrc;
            const modal = document.getElementById('imageModal');
            const modalImg = document.getElementById('modalImage');

            modalImg.src = imageSrc;
            modal.classList.add('visible');
            document.body.style.overflow = 'hidden';
        }

        window.openImageModal = function (containerId) {
            const container = document.getElementById(containerId);
            if (!container) return;

            const imageSrc = container.dataset.imageSrc;
            openImageModalWithSrc(imageSrc);
        };

        window.closeImageModal = function (event) {
            if (event && event.target !== event.currentTarget) return;

            const modal = document.getElementById('imageModal');
            modal.classList.remove('visible');
            document.body.style.overflow = '';

            // Clear the image source after animation to free memory
            setTimeout(() => {
                const modalImg = document.getElementById('modalImage');
                if (!modal.classList.contains('visible')) {
                    modalImg.src = '';
                    currentModalImageSrc = null;
                }
            }, 300);
        };

        window.downloadModalImage = function () {
            if (!currentModalImageSrc) return;

            const link = document.createElement('a');
            link.href = currentModalImageSrc;
            link.download = `ai-generated-image-${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };

        // Close modal on Escape key
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                const modal = document.getElementById('imageModal');
                if (modal && modal.classList.contains('visible')) {
                    closeImageModal();
                }
            }
        });

        function openMessagePreviewFromTarget(target) {
            const previewContainer = target?.closest?.('.message-file-preview.image-preview');
            if (!previewContainer) return false;

            const previewImg = previewContainer.querySelector('img');
            const imageSrc = previewImg?.getAttribute('src');
            if (!imageSrc) return false;

            openImageModalWithSrc(imageSrc);
            return true;
        }

        document.addEventListener('click', function (e) {
            if (openMessagePreviewFromTarget(e.target)) {
                e.preventDefault();
            }
        });

        // Clean up image data when switching chats to prevent memory leaks
        function cleanupChatImageData(chatId) {
            // Find all image containers in the messages area and revoke their blob URLs if any
            const containers = document.querySelectorAll('.ai-generated-image-container');
            containers.forEach(container => {
                const img = container.querySelector('img');
                if (img && img.src.startsWith('blob:')) {
                    URL.revokeObjectURL(img.src);
                }
                // Clear the data attribute to free memory
                container.dataset.imageSrc = '';
            });

            // Clear the last generated image cache when switching chats
            lastGeneratedImageData = null;
            lastGeneratedImagePrompt = null;
            lastGeneratedImageId = null;
            lastGeneratedImageMimeType = 'image/png';
            lastGeneratedImageTimestamp = 0;

            console.log(`?? Cleaned up image data for chat: ${chatId}`);
        }

        // MIME types natively supported by Vertex AI Gemini
        // These files are sent directly to the API as inlineData without client-side processing
        const GEMINI_NATIVE_MIME_TYPES = {
            // Images
            'image/png': true,
            'image/jpeg': true,
            'image/webp': true,
            'image/heic': true,
            'image/heif': true,
            'image/gif': true,
            // Audio
            'audio/aac': true,
            'audio/x-aac': true,
            'audio/flac': true,
            'audio/mp3': true,
            'audio/mpeg': true,
            'audio/mpga': true,
            'audio/mp4': true,
            'audio/m4a': true,
            'audio/ogg': true,
            'audio/pcm': true,
            'audio/wav': true,
            'audio/webm': true,
            'audio/aiff': true,
            'audio/x-wav': true,
            // Documents - PDF is natively supported with vision capabilities
            'application/pdf': true
        };

        // Check if a file type is natively supported by Gemini API
        function isGeminiNativeFile(mimeType) {
            if (!mimeType) return false;
            const normalizedType = mimeType.toLowerCase();
            return GEMINI_NATIVE_MIME_TYPES[normalizedType] === true;
        }

        // Check if the current model is a Gemini model
        function isCurrentModelGemini() {
            const currentModel = models[appState.currentModel];
            return currentModel && currentModel.provider === 'google';
        }

        // Helper to check if model supports native vision
        function modelSupportsVision(modelId) {
            // Only Google Gemini models support native vision in this app
            return models[modelId]?.provider === 'google';
        }

        function isPlaceholderKey(key) {
            if (!key) return true;
            const normalized = key.trim();
            return /^YOUR_/i.test(normalized) || /^REPLACE/i.test(normalized) || /^PASTE/i.test(normalized);
        }

        function wrapTextInCandidate(text) {
            return {
                candidates: [
                    {
                        content: {
                            parts: [
                                { text: (text ?? '').toString() }
                            ]
                        }
                    }
                ]
            };
        }

        function extractTextFromOpenAIResponse(data) {
            if (!data?.choices?.length) return '';
            const message = data.choices[0]?.message;
            if (!message) return '';
            if (typeof message.content === 'string') {
                return message.content;
            }
            if (Array.isArray(message.content)) {
                return message.content
                    .map(part => {
                        if (!part) return '';
                        if (typeof part === 'string') return part;
                        if (typeof part.text === 'string') return part.text;
                        if (part.type === 'text' && typeof part.content === 'string') return part.content;
                        // Handle OpenAI-compatible JSON output parts (e.g., response_format=json_schema)
                        if (part.type === 'output_json' && (part.output_json || part.json)) {
                            try {
                                const obj = part.output_json ?? part.json;
                                return typeof obj === 'string' ? obj : JSON.stringify(obj);
                            } catch (_) { return ''; }
                        }
                        if (part.type === 'json' && part.json) {
                            try { return typeof part.json === 'string' ? part.json : JSON.stringify(part.json); } catch (_) { return ''; }
                        }
                        if (typeof part === 'object' && 'json' in part && part.json) {
                            try { return typeof part.json === 'string' ? part.json : JSON.stringify(part.json); } catch (_) { return ''; }
                        }
                        return '';
                    })
                    .join('');
            }
            return '';
        }

        // Extracts the reasoning stream returned by thinking models on the OpenAI-compatible endpoint
        function extractReasoningFromOpenAIResponse(data) {
            if (!data?.choices?.length) return '';
            const reasoning = data.choices[0]?.message?.reasoning_content;
            if (!reasoning) return '';
            if (typeof reasoning === 'string') return reasoning;
            if (Array.isArray(reasoning)) {
                return reasoning.map(part => {
                    if (!part) return '';
                    if (typeof part === 'string') return part;
                    if (typeof part.text === 'string') return part.text;
                    if (part.type === 'text' && typeof part.content === 'string') return part.content;
                    return '';
                }).join('');
            }
            return '';
        }

        async function callChutesChat(selectedModel, messages, signal, options = {}) {
    if (!API_CONFIG.chutes) {
        throw new Error('Chutes.ai configuration is missing.');
    }

    const payload = {
        model: selectedModel.chutesModelId,
        messages,
        temperature: options.temperature ?? 0.7,
        effort: options.effort ?? 'medium'
    };

    if (options.maxTokens) payload.max_tokens = options.maxTokens;
    else if (typeof selectedModel?.maxOutputTokens === 'number') payload.max_tokens = selectedModel.maxOutputTokens;
    if (options.topP) payload.top_p = options.topP;
    if (options.presencePenalty) payload.presence_penalty = options.presencePenalty;
    if (options.frequencyPenalty) payload.frequency_penalty = options.frequencyPenalty;
    if (options.responseFormat) payload.response_format = options.responseFormat;

    return callServerChatCompletions('chutes', payload, signal);
}

        async function callServerChatCompletions(provider, payload, signal) {
            const authToken = localStorage.getItem('authToken');
            if (!authToken) {
                throw new Error('Authentication token missing. Please log in again.');
            }
            const completionsUrl = `${API_BASE_URL}/chat/completions`;
            captureOutgoingPayloadSnapshot({
                provider,
                model: payload?.model || null,
                url: completionsUrl,
                location: null,
                payload
            });
            logApiEvent({
                provider,
                model: payload?.model || null,
                stage: 'request',
                url: completionsUrl,
                request: { provider, payload }
            });
            const response = await fetch(completionsUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ provider, payload }),
                signal
            });
            if (!response.ok) {
                const errorBody = await response.text();
                logApiEvent({
                    provider,
                    model: payload?.model || null,
                    stage: 'error',
                    url: completionsUrl,
                    request: { provider, payload },
                    error: { status: response.status, body: errorBody }
                });
                throw new Error(`Provider "${provider}" call failed with status ${response.status}. Response: ${errorBody}`);
            }
            let json;
            const responseClone = response.clone();
            try {
                json = await response.json();
            } catch (e) {
                const txt = await responseClone.text().catch(() => '');
                logApiEvent({
                    provider,
                    model: payload?.model || null,
                    stage: 'error',
                    url: completionsUrl,
                    request: { provider, payload },
                    error: { message: 'Failed to parse JSON response', detail: String(e?.message || e), body: txt }
                });
                throw e;
            }

            logApiEvent({
                provider,
                model: json?.model || payload?.model || null,
                stage: 'response',
                url: completionsUrl,
                responseMeta: extractOpenAIMetadata(json),
                response: json
            });
            return json;
        }

        // -------------------------------------------------------------------
        // API DEBUG LOGGING (payloads + returned metadata)
        // -------------------------------------------------------------------
        const API_DEBUG = {
            enabled: true,
            maxDepth: 6,
            maxString: 1200,
            previewString: 300,
            maxArrayItems: 60,
            maxObjectKeys: 160
        };

        window.__API_LOGS = window.__API_LOGS || [];
        window.dumpApiLogs = function () { return window.__API_LOGS || []; };
        window.clearApiLogs = function () { window.__API_LOGS = []; };
        window.__LLM_PAYLOAD_HISTORY = window.__LLM_PAYLOAD_HISTORY || [];
        window.__LAST_LLM_PAYLOAD = window.__LAST_LLM_PAYLOAD || null;

        function sanitizePayloadForViewer(input, keyHint = '') {
            if (input === null || input === undefined) return input;
            const t = typeof input;
            if (t === 'number' || t === 'boolean') return input;
            if (t === 'string') {
                if (/^data:image\/[^;]+;base64,/i.test(input)) return '[Image]';
                if (/^data:audio\/[^;]+;base64,/i.test(input)) return '[Audio]';
                return input;
            }
            if (Array.isArray(input)) {
                return input.map(item => sanitizePayloadForViewer(item, keyHint));
            }
            if (t === 'object') {
                // Gemini inline media
                if (input.inlineData && typeof input.inlineData === 'object') {
                    const mime = String(input.inlineData.mimeType || input.inlineData.mime_type || '').toLowerCase();
                    const clone = { ...input, inlineData: { ...input.inlineData } };
                    if (mime.startsWith('image/')) clone.inlineData.data = '[Image]';
                    else if (mime.startsWith('audio/')) clone.inlineData.data = '[Audio]';
                    else if (typeof clone.inlineData.data === 'string') clone.inlineData.data = `[Binary:${mime || 'unknown'}]`;
                    return clone;
                }
                if (input.inline_data && typeof input.inline_data === 'object') {
                    const mime = String(input.inline_data.mime_type || input.inline_data.mimeType || '').toLowerCase();
                    const clone = { ...input, inline_data: { ...input.inline_data } };
                    if (mime.startsWith('image/')) clone.inline_data.data = '[Image]';
                    else if (mime.startsWith('audio/')) clone.inline_data.data = '[Audio]';
                    else if (typeof clone.inline_data.data === 'string') clone.inline_data.data = `[Binary:${mime || 'unknown'}]`;
                    return clone;
                }

                // OpenAI image_url content
                if (input.type === 'image_url' && input.image_url && typeof input.image_url.url === 'string') {
                    const clone = { ...input, image_url: { ...input.image_url } };
                    clone.image_url.url = '[Image]';
                    return clone;
                }

                const out = {};
                for (const [k, v] of Object.entries(input)) {
                    const key = String(k || '').toLowerCase();

                    if ((key === 'image' || key === 'image_base64' || key === 'b64_json') && typeof v === 'string') {
                        out[k] = '[Image]';
                        continue;
                    }

                    if (key === 'image_url') {
                        if (typeof v === 'string') {
                            out[k] = '[Image]';
                            continue;
                        }
                        if (v && typeof v === 'object') {
                            const cloneImageUrl = { ...v };
                            if (typeof cloneImageUrl.url === 'string') cloneImageUrl.url = '[Image]';
                            out[k] = sanitizePayloadForViewer(cloneImageUrl, key);
                            continue;
                        }
                    }

                    if ((key === 'data' || key.endsWith('_data')) && typeof v === 'string') {
                        const mime = String(input.mimeType || input.mime_type || input.mediaType || input.media_type || '').toLowerCase();
                        if (mime.startsWith('image/')) {
                            out[k] = '[Image]';
                            continue;
                        }
                        if (mime.startsWith('audio/')) {
                            out[k] = '[Audio]';
                            continue;
                        }
                    }

                    out[k] = sanitizePayloadForViewer(v, key);
                }
                return out;
            }
            return String(input);
        }

        function inferPayloadMessageCount(payload) {
            if (!payload || typeof payload !== 'object') return 0;
            if (Array.isArray(payload.messages)) return payload.messages.length;
            if (Array.isArray(payload.contents)) return payload.contents.length;
            return 0;
        }

        function captureOutgoingPayloadSnapshot({ provider = null, model = null, url = null, location = null, payload = null }) {
            try {
                const snapshot = {
                    capturedAt: new Date().toISOString(),
                    provider,
                    model,
                    url,
                    location,
                    messageCount: inferPayloadMessageCount(payload),
                    payload: sanitizePayloadForViewer(payload)
                };
                window.__LAST_LLM_PAYLOAD = snapshot;
                window.__LLM_PAYLOAD_HISTORY.push(snapshot);
                if (window.__LLM_PAYLOAD_HISTORY.length > 40) {
                    window.__LLM_PAYLOAD_HISTORY.splice(0, window.__LLM_PAYLOAD_HISTORY.length - 40);
                }
            } catch (e) {
                console.warn('Failed to capture outgoing payload snapshot:', e);
            }
        }

        function redactSecretsInKeyValue(key, value) {
            const k = String(key || '').toLowerCase();
            if (k === 'authorization') return '[REDACTED]';
            if (k.includes('api_key') || k.includes('apikey')) return '[REDACTED]';
            if (k.endsWith('token') || k.includes('access_token') || k.includes('id_token')) return '[REDACTED]';
            if ((k === 'data' || k.endsWith('data')) && typeof value === 'string' && value.length > 200) {
                return `[OMITTED_DATA len=${value.length}]`;
            }
            return value;
        }

        function summarizeLongString(str) {
            if (typeof str !== 'string') return str;
            if (str.length <= API_DEBUG.maxString) return str;
            return `${str.slice(0, API_DEBUG.previewString)}… [len=${str.length}]`;
        }

        function sanitizeForLog(input, depth = 0, seen = new WeakSet()) {
            if (input == null) return input;
            if (typeof input === 'string') return summarizeLongString(input);
            if (typeof input === 'number' || typeof input === 'boolean') return input;
            if (typeof input === 'function') return '[Function]';
            if (input instanceof Error) return { name: input.name, message: input.message, stack: summarizeLongString(String(input.stack || '')) };

            if (depth >= API_DEBUG.maxDepth) return '[MaxDepth]';
            if (typeof input === 'object') {
                if (seen.has(input)) return '[Circular]';
                seen.add(input);
            }

            if (Array.isArray(input)) {
                const out = [];
                const take = Math.min(input.length, API_DEBUG.maxArrayItems);
                for (let i = 0; i < take; i++) out.push(sanitizeForLog(input[i], depth + 1, seen));
                if (input.length > take) out.push(`[+${input.length - take} more]`);
                return out;
            }

            if (typeof input === 'object') {
                const keys = Object.keys(input);
                const take = Math.min(keys.length, API_DEBUG.maxObjectKeys);
                const out = {};
                for (let i = 0; i < take; i++) {
                    const key = keys[i];
                    let value = input[key];
                    value = redactSecretsInKeyValue(key, value);
                    out[key] = sanitizeForLog(value, depth + 1, seen);
                }
                if (keys.length > take) out.__omittedKeys = `[+${keys.length - take} more keys]`;
                return out;
            }

            return String(input);
        }

        function extractOpenAIMetadata(resp) {
            const usage = resp?.usage || null;
            const finish = resp?.choices?.[0]?.finish_reason || resp?.choices?.[0]?.finishReason || null;
            const model = resp?.model || null;
            const id = resp?.id || null;
            return { id, model, finish, usage };
        }

        function extractGeminiMetadata(resp) {
            const finish = resp?.candidates?.[0]?.finishReason || null;
            const usage = resp?.usageMetadata || null;
            const blockReason = resp?.promptFeedback?.blockReason || null;
            return { finish, usage, blockReason };
        }

        function logApiEvent(entry) {
            if (!API_DEBUG.enabled) return;
            try {
                const safe = sanitizeForLog(entry);
                window.__API_LOGS.push({ t: new Date().toISOString(), ...safe });

                const labelParts = [
                    safe?.provider ? String(safe.provider) : 'api',
                    safe?.model ? String(safe.model) : '',
                    safe?.stage ? String(safe.stage) : ''
                ].filter(Boolean);
                const label = `[API] ${labelParts.join(' | ')}`;

                console.groupCollapsed(label);
                if (safe?.url) console.log('url:', safe.url);
                if (safe?.location) console.log('location:', safe.location);
                if (safe?.request) console.log('request:', safe.request);
                if (safe?.responseMeta) console.log('responseMeta:', safe.responseMeta);
                if (safe?.response) console.log('response:', safe.response);
                if (safe?.error) console.warn('error:', safe.error);
                console.groupEnd();
            } catch (e) {
                // Never break core app flows due to logging issues
                console.warn('API debug logging failed:', e);
            }
        }

        // OpenAI-compatible (Vertex Kimi) streaming helpers
        function createOpenAIStreamRenderer(placeholderEl, options = {}) {
            const contentEl = placeholderEl?.querySelector('.message-content');
            let accumulated = '';
            let accumulatedReasoning = '';
            let lastFlush = 0;
            const suppressContent = Boolean(options?.suppressContent);
            const signaturePrefix = typeof options?.signaturePrefix === 'string' ? options.signaturePrefix : '';
            const thoughtSignature = 'kimi-thinking-stream';

            function append(text, isReasoning = false) {
                if (!text) return;

                if (isReasoning) {
                    accumulatedReasoning += text;
                    const signatureKey = signaturePrefix ? `${signaturePrefix}${thoughtSignature}` : thoughtSignature;
                    updateThinkingThought(placeholderEl, {
                        signature: signatureKey,
                        text: accumulatedReasoning,
                        index: 0
                    });
                } else {
                    accumulated += text;
                    const now = Date.now();
                    if (!suppressContent && contentEl && (now - lastFlush > 50)) {
                        contentEl.innerHTML = markdownToHtml(String(accumulated || ''));
                        scrollToBottom();
                        lastFlush = now;
                    }
                }
            }

            function finalize() {
                if (!suppressContent && contentEl) {
                    contentEl.innerHTML = markdownToHtml(String(accumulated || ''));
                    scrollToBottom();
                }

                const message = { role: 'assistant', content: accumulated };
                if (accumulatedReasoning) {
                    message.reasoning_content = accumulatedReasoning;
                }

                return {
                    choices: [
                        {
                            index: 0,
                            finish_reason: 'stop',
                            message: message
                        }
                    ]
                };
            }
            return { append, finalize };
        }

        async function consumeOpenAIStream(response, placeholderEl, context = {}, options = {}) {
            if (!response.body || typeof response.body.getReader !== 'function') {
                // Fallback: not a stream, just parse as JSON
                return response.json();
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            const renderer = createOpenAIStreamRenderer(placeholderEl, options);
            let buffer = '';
            while (true) {
                const { value, done } = await reader.read();
                if (value) {
                    buffer += decoder.decode(value, { stream: !done });
                    let idx;
                    while ((idx = buffer.indexOf('\n\n')) !== -1) {
                        const chunk = buffer.slice(0, idx);
                        buffer = buffer.slice(idx + 2);
                        const lines = chunk.split('\n');
                        for (const raw of lines) {
                            const line = raw.trim();
                            if (!line.startsWith('data:')) continue;
                            const data = line.slice(5).trim();
                            if (!data || data === '[DONE]') continue;
                            try {
                                const json = JSON.parse(data);
                                const delta = json?.choices?.[0]?.delta;
                                if (delta) {
                                    if (delta.reasoning_content) renderer.append(delta.reasoning_content, true);
                                    if (delta.content) renderer.append(delta.content, false);
                                }
                            } catch (_) { /* ignore parse errors */ }
                        }
                    }
                }
                if (done) break;
            }
            // Flush any trailing event without double-newline
            const trimmed = buffer.trim();
            if (trimmed && trimmed.startsWith('data:')) {
                const rest = trimmed.slice(5).trim();
                if (rest && rest !== '[DONE]') {
                    try {
                        const json = JSON.parse(rest);
                        const delta = json?.choices?.[0]?.delta;
                        if (delta) {
                            if (delta.reasoning_content) renderer.append(delta.reasoning_content, true);
                            if (delta.content) renderer.append(delta.content, false);
                        }
                    } catch (_) { /* ignore */ }
                }
            }
            const finalized = renderer.finalize();
            // The OpenAI-compatible streaming responses often omit usage; still log what we received.
            logApiEvent({
                provider: context?.provider || 'openai-compatible',
                model: context?.model || finalized?.model || null,
                stage: 'response',
                location: context?.location || null,
                url: context?.url || null,
                responseMeta: extractOpenAIMetadata(finalized),
                response: finalized
            });
            return finalized;
        }

        async function callMegaLLMChat(selectedModel, messages, signal, options = {}) {
            // Repointed to Vertex AI Open Model (Kimi K2) using the OpenAI-compatible chat/completions endpoint
            const { projectId, locations } = API_CONFIG.vertex || {};
            if (!projectId) {
                throw new Error('Vertex AI configuration is missing (projectId).');
            }
            const modelId = selectedModel.megallmModelId || API_CONFIG.megallm?.modelId || 'moonshot-ai/kimi-k2-thinking-maas';
            const primaryLocation = API_CONFIG.megallm?.location || locations?.[0] || 'us-central1';
            const fallbackLocation = primaryLocation === 'global' ? 'us-central1' : 'global';
            const locationCandidates = [primaryLocation, fallbackLocation];

            const payload = {
                model: modelId,
                messages,
                temperature: options.temperature ?? (selectedModel.defaultTemperature ?? 0.7)
            };
            if (options.maxTokens != null) payload.max_tokens = options.maxTokens;
            else if (typeof selectedModel?.maxOutputTokens === 'number') payload.max_tokens = selectedModel.maxOutputTokens;
            if (options.topP != null) payload.top_p = options.topP;
            if (options.presencePenalty != null) payload.presence_penalty = options.presencePenalty;
            if (options.frequencyPenalty != null) payload.frequency_penalty = options.frequencyPenalty;
            if (options.stream === true) payload.stream = true;
            // Add reasoning effort for Kimi K2 Thinking model (xhigh/high/medium/low/minimal/none)
            if (options.effort) payload.reasoning_effort = options.effort;

            // ?? DEBUG: Log the actual payload being sent to Kimi K2 API
            console.log('?? [Kimi K2] Sending payload to API:', JSON.stringify(payload, null, 2));
            const authToken = localStorage.getItem('authToken');

            let lastError;
            for (const location of locationCandidates) {
                try {
                    const host = location === 'global'
                        ? 'aiplatform.googleapis.com'
                        : `${location}-aiplatform.googleapis.com`;
                    const vertexUrl = `https://${host}/v1/projects/${projectId}/locations/${location}/endpoints/openapi/chat/completions`;

                    captureOutgoingPayloadSnapshot({
                        provider: 'megallm',
                        model: modelId,
                        url: vertexUrl,
                        location,
                        payload
                    });

                    logApiEvent({
                        provider: 'megallm',
                        model: modelId,
                        stage: 'request',
                        location,
                        url: vertexUrl,
                        request: { payload }
                    });

                    const response = await fetch('/vertex-proxy', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${authToken}`
                        },
                        body: JSON.stringify({
                            url: vertexUrl,
                            payload,

                        }),
                        signal
                    });

                    if (!response.ok) {
                        const errorBody = await response.text();
                        logApiEvent({
                            provider: 'megallm',
                            model: modelId,
                            stage: 'error',
                            location,
                            url: vertexUrl,
                            request: { payload },
                            error: { status: response.status, body: errorBody }
                        });
                        throw new Error(`[${location}] ${response.status}: ${errorBody}`);
                    }

                    if (options.stream === true && typeof ReadableStream !== 'undefined' && options.placeholderEl) {
                        // consumeOpenAIStream logs the final reconstructed payload
                        return consumeOpenAIStream(response, options.placeholderEl, {
                            provider: 'megallm',
                            model: modelId,
                            location,
                            url: vertexUrl
                        }, { suppressContent: options.suppressContent, signaturePrefix: options.signaturePrefix });
                    }
                    const json = await response.json();
                    logApiEvent({
                        provider: 'megallm',
                        model: modelId,
                        stage: 'response',
                        location,
                        url: vertexUrl,
                        responseMeta: extractOpenAIMetadata(json),
                        response: json
                    });
                    return json;
                } catch (err) {
                    lastError = err;
                    if (signal?.aborted) throw err;
                    console.warn(`Kimi call failed at ${location}, attempting fallback.`, err.message);
                    await new Promise(r => setTimeout(r, 300));
                }
            }
            throw lastError || new Error('Vertex Kimi endpoint failed.');
        }

        // -------------------------------------------------------------------
        // END: UNIFIED API CONFIGURATION
        // -------------------------------------------------------------------

        // --- START: Smart API Key Failover System ---
let currentSearchKeyIndex = 0; // legacy; server handles key rotation

async function callApiWithFailover(apiType, apiCallFn, signal) {
    return apiCallFn(null, signal);
}
// --- END: Smart API Key Failover System ---

        // --- START: Abort Controller for stopping generation ---
        let currentRequestController = null;

        window.stopGeneration = function () {
            if (currentRequestController) {
                currentRequestController.abort();
                console.log("Request aborted by user.");
            }
        };
        // --- END: Abort Controller ---

        // --- START: IndexedDB Storage ---
        let db;

        function initDB() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open('expertllmDB', 1);

                request.onupgradeneeded = event => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains('appStateStore')) {
                        db.createObjectStore('appStateStore', { keyPath: 'id' });
                    }
                };

                request.onsuccess = event => {
                    db = event.target.result;
                    console.log("IndexedDB initialized successfully.");
                    resolve(db);
                };

                request.onerror = event => {
                    console.error("IndexedDB error:", event.target.errorCode);
                    reject(event.target.errorCode);
                };
            });
        }

        async function saveStateToDB(state) {
            if (!ENABLE_LOCAL_PERSISTENCE) return; // Skip local save if disabled

            if (!db) {
                console.error("DB not initialized. Cannot save state.");
                return;
            }
            try {
                const stateToSave = { ...state };
                delete stateToSave.uploadedFiles; // Don't save transient uploaded files

                // Filter out empty local chats so they don't persist on refresh
                if (stateToSave.chats) {
                    stateToSave.chats = stateToSave.chats.filter(c => !c.isLocal || c.messages.length > 0);
                }

                const transaction = db.transaction(['appStateStore'], 'readwrite');
                const store = transaction.objectStore('appStateStore');
                store.put({ id: 'currentState', value: stateToSave });

                return new Promise((resolve, reject) => {
                    transaction.oncomplete = () => {
                        // console.log("State saved to IndexedDB.");
                        resolve();
                    };
                    transaction.onerror = event => {
                        console.error("Error saving state to IndexedDB:", event.target.error);
                        reject(event.target.error);
                    };
                });
            } catch (error) {
                console.error('Error saving state to IndexedDB:', error);
            }
        }

        async function loadStateFromDB() {
            if (!ENABLE_LOCAL_PERSISTENCE) return null; // Skip local load if disabled

            if (!db) {
                await initDB();
            }
            return new Promise((resolve, reject) => {
                try {
                    const transaction = db.transaction(['appStateStore'], 'readonly');
                    const store = transaction.objectStore('appStateStore');
                    const request = store.get('currentState');

                    request.onsuccess = event => {
                        if (event.target.result) {
                            resolve(event.target.result.value);
                        } else {
                            resolve(null); // No state found
                        }
                    };

                    request.onerror = event => {
                        console.error("Error loading state from IndexedDB:", event.target.error);
                        reject(event.target.error);
                    };
                } catch (error) {
                    console.error('Error loading state from IndexedDB:', error);
                    reject(error);
                }
            });
        }
        // --- END: IndexedDB Storage ---

        // Application State
        const appState = {
            currentModel: 'flash', // Default model
            currentSection: 'general',
            extendThinking: false,
            webSearchEnabled: false,
            createImageEnabled: false,
            debugEnabled: false, // New state
            currentChatId: null,
            chats: [],
            usage: {
                // Usage will be dynamically populated based on models object
            },
            uploadedFiles: [] // This will now store { file, name, size, type, content }
        };

        // Lazy chat loading + context/runtime state (in-memory only)
        const LAZY_CHAT_BATCH_SIZE = 5;
        const LAZY_CHAT_TOP_THRESHOLD_PX = 80;
        const IMAGE_ATTACHMENT_INDICATOR_REGEX = /\[(Image Attached|Media Attachment|Media Data Removed)\]/;
        const GENERATED_IMAGE_PLACEHOLDER = '[AI Generated Image]';
        const chatRuntimeState = new Map();

        function normalizeStoredMessageId(value) {
            if (value === null || value === undefined) return null;
            const s = String(value);
            return s.startsWith('message-') ? s.slice('message-'.length) : s;
        }

        function safeParseJson(value) {
            if (!value || typeof value !== 'string') return null;
            try { return JSON.parse(value); } catch { return null; }
        }

        function getChatRuntime(chatId) {
            const key = normalizeStoredMessageId(chatId);
            if (!key) return null;
            let runtime = chatRuntimeState.get(key);
            if (!runtime) {
                runtime = {
                    visibleStartIndex: 0,
                    hasMoreOlder: false,
                    isLoadingOlder: false,
                    contextReady: false,
                    contextPromise: null,
                    loadedImageMessageIds: new Set(),
                    pendingImageMessageIds: new Set(),
                    generatedImageCacheByMessageId: new Map(),
                    generatedImageCacheFull: false
                };
                chatRuntimeState.set(key, runtime);
            }
            return runtime;
        }

        function initializeChatLazyWindow(chat, resetToLatest = true) {
            if (!chat || !Array.isArray(chat.messages)) return;
            const runtime = getChatRuntime(chat.id);
            if (!runtime) return;
            const total = chat.messages.length;
            if (resetToLatest || runtime.visibleStartIndex >= total) {
                runtime.visibleStartIndex = Math.max(0, total - LAZY_CHAT_BATCH_SIZE);
            }
            runtime.hasMoreOlder = runtime.visibleStartIndex > 0;
            runtime.isLoadingOlder = false;
        }

        function getVisibleMessagesForChat(chat) {
            if (!chat || !Array.isArray(chat.messages)) return [];
            const runtime = getChatRuntime(chat.id);
            if (!runtime) return chat.messages.slice();
            const start = Math.max(0, Math.min(runtime.visibleStartIndex, chat.messages.length));
            return chat.messages.slice(start);
        }

        async function ensureChatContextReady(chatId) {
            const normalizedChatId = normalizeStoredMessageId(chatId);
            if (!normalizedChatId) return;
            const chat = appState.chats.find(c => String(c.id) === String(normalizedChatId));
            if (!chat || chat.isLocal) return;
            const runtime = getChatRuntime(normalizedChatId);
            if (!runtime) return;
            if (runtime.contextReady) return;
            if (runtime.contextPromise) {
                await runtime.contextPromise;
                return;
            }
            await loadSessionMessages(normalizedChatId);
        }

        // Section configurations
        const sections = {
            general: {
                id: "general",
                name: "General",
                description: "an all-purpose AI that leverages the best models from Google and Deepseek for any task",
                fileUpload: true,
                icon: "fas fa-comments",
                capabilities: [
                    "Access to top-tier AI models",
                    "Largest context window",
                    "Creative content generation",
                    "Advanced coding & technical help"
                ]
            },
            'fact-checker': {
                id: "fact-checker",
                name: "Fact Checker",
                description: "Performs a robust, multi-step web search to gather, verify, and synthesize information for accurate, evidence-based answers.",
                fileUpload: false,
                icon: "fas fa-search-plus",
                capabilities: [
                    "Three-step verification search",
                    "Multi-source synthesis",
                    "Evidence-based answers",
                    "Complex question investigation"
                ]
            }
        };


        function cloneGenerationConfig(config) {
            if (!config) return {};
            try {
                return JSON.parse(JSON.stringify(config));
            } catch (error) {
                console.warn('Failed to clone generation config:', error);
                return { ...config };
            }
        }

        // Normalize request fields to the expected camelCase keys used by the Vertex Gemini API.
        // Older code paths used snake_case (e.g., response_mime_type); Gemini 3 Pro is stricter
        // and will reject unknown fields with INVALID_ARGUMENT.
        function normalizeGenerationConfigKeys(config) {
            if (!config || typeof config !== 'object') return config;
            const normalized = { ...config };
            if (normalized.response_mime_type && !normalized.responseMimeType) {
                normalized.responseMimeType = normalized.response_mime_type;
                delete normalized.response_mime_type;
            }
            if (normalized.response_schema && !normalized.responseSchema) {
                normalized.responseSchema = normalized.response_schema;
                delete normalized.response_schema;
            }
            if (normalized.thinking_config && !normalized.thinkingConfig) {
                normalized.thinkingConfig = normalized.thinking_config;
                delete normalized.thinking_config;
            }
            if (normalized.thinking_budget && !normalized.thinkingBudget) {
                normalized.thinkingBudget = normalized.thinking_budget;
                delete normalized.thinking_budget;
            }
            if (normalized.include_thoughts && !normalized.includeThoughts) {
                normalized.includeThoughts = normalized.include_thoughts;
                delete normalized.include_thoughts;
            }
            if (normalized.max_output_tokens && !normalized.maxOutputTokens) {
                normalized.maxOutputTokens = normalized.max_output_tokens;
                delete normalized.max_output_tokens;
            }
            if (normalized.candidate_count && !normalized.candidateCount) {
                normalized.candidateCount = normalized.candidate_count;
                delete normalized.candidate_count;
            }
            if (normalized.stop_sequences && !normalized.stopSequences) {
                normalized.stopSequences = normalized.stop_sequences;
                delete normalized.stop_sequences;
            }
            if (normalized.top_p && !normalized.topP) {
                normalized.topP = normalized.top_p;
                delete normalized.top_p;
            }
            if (normalized.top_k && !normalized.topK) {
                normalized.topK = normalized.top_k;
                delete normalized.top_k;
            }
            return normalized;
        }

        function getGeminiThinkingSettingsForRequest(selectedModel) {
            if (!selectedModel || selectedModel.provider !== 'google' || selectedModel.supportsThinking === false) {
                return null;
            }

            const modelName = selectedModel.googleModelName || '';
            const config = selectedModel.thinking || {};
            const isExtended = Boolean(appState.extendThinking);

            // Gemini 3+ and 4 use thinkingLevel (low | medium | high) instead of budgets
            if (modelName.startsWith('gemini-3') || modelName.startsWith('gemini-4')) {
                const level = (isExtended ? (config.extendedLevel || 'HIGH') : (config.defaultLevel || 'LOW')).toUpperCase();
                const label = isExtended ? (config.extendedLabel || 'High reasoning') : (config.defaultLabel || 'Low reasoning');
                return { mode: isExtended ? 'extended' : 'default', label, thinkingLevel: level };
            }

            // Gemini 2.5 family uses thinkingBudget (tokens). Flash can disable thinking with 0.
            const hasExtendedBudget = Boolean(isExtended && (config.extendedBudget || config.extendedOutputBudget));
            let thinkingBudget = hasExtendedBudget ? (config.extendedBudget ?? config.defaultBudget) : config.defaultBudget;
            let outputBudget = hasExtendedBudget ? (config.extendedOutputBudget ?? config.outputBudget) : config.outputBudget;

            // Enforce documented bounds to avoid INVALID_ARGUMENT
            if (selectedModel.id === 'flash') {
                // Flash supports 0 (disable) or 1–24576
                if (typeof thinkingBudget === 'number') {
                    if (thinkingBudget < 0) thinkingBudget = 0;
                    if (thinkingBudget > 24576) thinkingBudget = 24576;
                }
            } else {
                // Pro models: 128-32768, can't be 0
                if (typeof thinkingBudget === 'number') {
                    if (thinkingBudget < 128) thinkingBudget = 128;
                    if (thinkingBudget > 32768) thinkingBudget = 32768;
                }
            }
            const label = isExtended ? (config.extendedLabel || 'Extended thinking') : (config.defaultLabel || 'Standard thinking');
            return {
                mode: isExtended ? 'extended' : 'default',
                label,
                thinkingBudget: typeof thinkingBudget === 'number' ? thinkingBudget : undefined,
                outputBudget: typeof outputBudget === 'number' ? outputBudget : undefined
            };
        }

        function buildGeminiGenerationConfig(baseConfig = {}, selectedModel = models[appState.currentModel], options = {}) {
            const includeThoughts = options.includeThoughts !== false;
            const cloned = normalizeGenerationConfigKeys(cloneGenerationConfig(baseConfig));
            if (!selectedModel || selectedModel.provider !== 'google') {
                return { generationConfig: cloned, thinkingSettings: null };
            }

            if (typeof selectedModel.maxOutputTokens === 'number') {
                cloned.maxOutputTokens = selectedModel.maxOutputTokens;
            }

            let appliedThinking = null;
            if (includeThoughts) {
                const thinkingSettings = getGeminiThinkingSettingsForRequest(selectedModel);
                if (thinkingSettings) {
                    const nextThinking = {};
                    if (typeof thinkingSettings.thinkingLevel === 'string') {
                        // The Gemini API documents lowercase levels; Vertex takes uppercase.
                        nextThinking.thinkingLevel = API_CONFIG.gemini.enabled
                            ? thinkingSettings.thinkingLevel.toLowerCase()
                            : thinkingSettings.thinkingLevel;
                    } else if (typeof thinkingSettings.thinkingBudget === 'number') {
                        nextThinking.thinkingBudget = thinkingSettings.thinkingBudget;
                    }

                    // Only request visible thoughts when the model is actually thinking.
                    const thinkingEnabled = typeof nextThinking.thinkingLevel === 'string'
                        || (typeof nextThinking.thinkingBudget === 'number' && nextThinking.thinkingBudget > 0);
                    if (thinkingEnabled) {
                        nextThinking.includeThoughts = true;
                    }

                    // Avoid sending an empty object, which triggers INVALID_ARGUMENT.
                    cloned.thinkingConfig = Object.keys(nextThinking).length ? nextThinking : undefined;
                    appliedThinking = thinkingSettings;
                }
            } else if (cloned.thinkingConfig) {
                delete cloned.thinkingConfig;
            }

            return { generationConfig: cloned, thinkingSettings: appliedThinking };
        }

        function formatGeminiResponse(data, appliedThinking) {
            const candidate = data?.candidates?.[0] || {};
            const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
            const finalParts = [];
            const thinkingParts = [];
            const thoughtSignatures = [];

            for (const part of parts) {
                if (!part) continue;
                const text = typeof part.text === 'string' ? part.text : '';
                if (part.thought) {
                    if (text) thinkingParts.push(text);
                    if (part.thoughtSignature) thoughtSignatures.push(part.thoughtSignature);
                } else if (text) {
                    finalParts.push(text);
                }
            }

            return {
                text: finalParts.join(''),
                thoughts: thinkingParts,
                meta: {
                    config: appliedThinking || null,
                    usage: data?.usageMetadata || null,
                    thoughtSignatures
                }
            };
        }

        function extractGeminiPlainText(data) {
            const candidate = data?.candidates?.[0];
            if (!candidate) return '';
            const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
            return parts
                .map(part => (part && typeof part.text === 'string') ? part.text : '')
                .filter(Boolean)
                .join('');
        }

        function mergeStreamingText(previous, incoming) {
            const prev = typeof previous === 'string' ? previous : '';
            const next = typeof incoming === 'string' ? incoming : '';
            if (!next) return prev;
            if (!prev) return next;
            if (next === prev) return prev;
            if (next.startsWith(prev)) return next;
            if (prev.startsWith(next)) return prev;
            const overlapIndex = next.indexOf(prev);
            if (overlapIndex !== -1) return next;
            let overlap = Math.min(prev.length, next.length);
            while (overlap > 0) {
                if (prev.endsWith(next.slice(0, overlap))) {
                    return prev + next.slice(overlap);
                }
                overlap--;
            }
            return prev + next;
        }

        function extractGeminiThoughtParts(data) {
            const parts = data?.candidates?.[0]?.content?.parts;
            if (!Array.isArray(parts)) return [];
            return parts
                .filter(part => part && part.thought && typeof part.text === 'string')
                .map(part => ({ text: part.text, thoughtSignature: part.thoughtSignature || null }));
        }

        function appendThinkingText(messageEl, text, options = {}) {
            if (!messageEl) return;
            const clean = typeof text === 'string' ? text.trim() : '';
            if (!clean) return;
            const runtime = getThinkingRuntime(messageEl);
            if (!runtime) return;
            ensureThinkingTimeline(runtime);
            if (typeof runtime.syntheticThoughtCounter !== 'number') runtime.syntheticThoughtCounter = 0;
            const signature = options.signature || `synthetic-${runtime.syntheticThoughtCounter++}`;
            return updateThinkingThought(messageEl, { signature, text: clean, index: runtime.thoughtKeys.length });
        }

        function appendThinkingParts(messageEl, parts, options = {}) {
            if (!Array.isArray(parts) || parts.length === 0) return;
            const signaturePrefix = typeof options.signaturePrefix === 'string' ? options.signaturePrefix : '';
            parts.forEach(part => {
                const text = typeof part === 'string' ? part : part?.text;
                const rawSignature = part && typeof part === 'object' ? part.thoughtSignature : null;
                const signature = rawSignature && signaturePrefix ? `${signaturePrefix}${rawSignature}` : rawSignature;
                appendThinkingText(messageEl, text, { signature });
            });
        }

        function updateThinkingThought(messageEl, { signature, text, index }) {
            if (!messageEl || messageEl.dataset?.supportsThinking === 'false') return;
            const thinking = activateThinkingUI(messageEl);
            if (!thinking || !thinking.log) return;
            const runtime = getThinkingRuntime(messageEl);
            if (!runtime) return;
            ensureThinkingTimeline(runtime);

            let key = signature;
            if (!key && typeof index === 'number' && runtime.thoughtKeys[index]) {
                key = runtime.thoughtKeys[index];
            }
            if (!key) {
                key = `thought-${runtime.thoughtKeys.length}`;
            }
            if (!runtime.thoughtKeys.includes(key)) {
                runtime.thoughtKeys.push(key);
            }

            const entry = ensureThinkingTimelineEntry(messageEl, {
                key,
                type: 'thought',
                title: 'Thought',
                className: 'thinking-step-thought'
            });
            if (!entry) return;

            const emptyNotice = thinking.log.querySelector('.thinking-empty');
            if (emptyNotice) emptyNotice.remove();

            const indexEl = entry.querySelector('.thinking-step-index');
            if (indexEl) indexEl.textContent = 'Thought';

            if (typeof text === 'string') {
                const textEl = entry.querySelector('.thinking-step-text');
                if (textEl) {
                    textEl.innerHTML = text ? escapeHTML(text).replace(/\n/g, '<br>') : '';
                }
                if (text && runtime.generalStatusEntry && runtime.generalStatusEntry.parentElement) {
                    runtime.generalStatusEntry.parentElement.removeChild(runtime.generalStatusEntry);
                    delete runtime.generalStatusEntry;
                }
            }

            runtime.hasLiveThoughts = true;
            return entry;
        }

        function createGeminiStreamAggregator(placeholderEl, appliedThinking, options = {}) {
            const thoughtOrder = [];
            const thoughtMap = new Map();
            let finalText = '';
            let usageMetadata = null;
            let finishReason = null;
            let safetyRatings = null;
            let promptFeedback = null;
            const suppressContent = Boolean(options?.suppressContent);
            const signaturePrefix = typeof options?.signaturePrefix === 'string' ? options.signaturePrefix : '';

            function refreshMeta() {
                if (!placeholderEl) return;
                const meta = {};
                if (appliedThinking) meta.config = appliedThinking;
                if (usageMetadata) meta.usage = usageMetadata;
                if (meta.config || meta.usage) {
                    setThinkingMeta(placeholderEl, meta);
                }
            }

            refreshMeta();

            function ingestChunk(chunk) {
                if (!chunk) return;
                if (chunk.usageMetadata) {
                    usageMetadata = chunk.usageMetadata;
                    refreshMeta();
                }
                if (chunk.promptFeedback) {
                    promptFeedback = chunk.promptFeedback;
                }
                const candidate = chunk.candidates?.[0];
                if (!candidate) return;
                if (candidate.finishReason) finishReason = candidate.finishReason;
                if (candidate.safetyRatings) safetyRatings = candidate.safetyRatings;
                const parts = Array.isArray(candidate.content?.parts) ? candidate.content.parts : [];
                parts.forEach((part, idx) => {
                    if (!part) return;
                    if (part.thought) {
                        const hasRealSignature = Boolean(part.thoughtSignature);
                        const rawSignature = part.thoughtSignature || null;
                        // In streamGenerateContent, each thought summary arrives as parts[0]
                        // without a signature; a new **Heading** marks a new reasoning step.
                        const startsNewHeading = /^\s*\*\*[^*\n]+\*\*/.test(part.text || '');
                        const syntheticIdx = startsNewHeading && thoughtOrder.length > 0
                            ? thoughtOrder.length
                            : Math.max(0, thoughtOrder.length - 1);
                        const baseKey = rawSignature || `__synthetic_thought_${syntheticIdx}`;
                        const signatureKey = signaturePrefix ? `${signaturePrefix}${baseKey}` : baseKey;
                        if (!thoughtMap.has(signatureKey)) {
                            thoughtOrder.push(signatureKey);
                            thoughtMap.set(signatureKey, { text: '', rawSignature, isReal: hasRealSignature });
                        }
                        const record = thoughtMap.get(signatureKey);
                        record.text = mergeStreamingText(record.text, part.text || '');
                        if (hasRealSignature && rawSignature) {
                            record.rawSignature = rawSignature;
                            record.isReal = true;
                        }
                        updateThinkingThought(placeholderEl, {
                            signature: signatureKey,
                            text: record.text,
                            index: thoughtOrder.indexOf(signatureKey)
                        });
                    } else {
                        // In generateContent streams, the signature often arrives on the
                        // final empty-text part rather than on the thought parts themselves.
                        if (part.thoughtSignature && thoughtOrder.length > 0) {
                            const lastRecord = thoughtMap.get(thoughtOrder[thoughtOrder.length - 1]);
                            if (lastRecord && !lastRecord.rawSignature) {
                                lastRecord.rawSignature = part.thoughtSignature;
                                lastRecord.isReal = true;
                            }
                        }
                        if (typeof part.text === 'string' && part.text.length > 0) {
                            finalText = mergeStreamingText(finalText, part.text);
                            if (placeholderEl && !suppressContent) {
                                const contentEl = placeholderEl.querySelector('.message-content');
                                if (contentEl) {
                                    contentEl.innerHTML = markdownToHtml(finalText);
                                    scrollToBottom();
                                }
                            }
                        }
                    }
                });
            }

            return {
                ingestChunk,
                finalize() {
                    // Prefer returning partial text + metadata instead of throwing, so UI can show something useful.
                    if (!finalText && promptFeedback?.blockReason) {
                        finalText = `Content blocked by safety filters (${promptFeedback.blockReason}).`;
                    }

                    if (!finalText && (finishReason === 'SAFETY' || finishReason === 'BLOCKED_SAFETY')) {
                        finalText = 'Response stopped by safety filters.';
                    }

                    const parts = [];
                    thoughtOrder.forEach((signatureKey, idx) => {
                        const record = thoughtMap.get(signatureKey);
                        if (record && record.text) {
                            // Only include thoughtSignature if it's a real signature from the API
                            // Synthetic signatures (starting with __synthetic_) should not be sent back
                            const partObj = { thought: true, text: record.text };
                            if (record.isReal && record.rawSignature) {
                                partObj.thoughtSignature = record.rawSignature;
                            }
                            parts.push(partObj);
                        }
                    });
                    if (finalText) {
                        parts.push({ text: finalText });
                    }

                    // If still nothing, return a diagnostic stub instead of throwing hard.
                    if (parts.length === 0) {
                        const reason = finishReason || promptFeedback?.blockReason || 'unknown';
                        parts.push({ text: `Generation ended with no content (reason: ${reason}).` });
                    }

                    const candidate = parts.length ? [{ content: { parts }, finishReason, safetyRatings, promptFeedback }] : [];
                    const result = {
                        candidates: candidate,
                        usageMetadata: usageMetadata || null,
                        promptFeedback,
                        __safetyStop: finishReason === 'SAFETY' || finishReason === 'BLOCKED_SAFETY' || Boolean(promptFeedback?.blockReason)
                    };
                    if (appliedThinking) result.__thinkingSettings = appliedThinking;
                    return result;
                }
            };
        }

        async function consumeGeminiStream(response, placeholderEl, appliedThinking, options = {}) {
            if (!response.body || typeof response.body.getReader !== 'function') {
                const text = await response.text();
                let parsed = {};
                if (text) {
                    try {
                        parsed = JSON.parse(text);
                    } catch (err) {
                        console.warn('Failed to parse non-stream Gemini response text', err, text);
                    }
                }
                if (appliedThinking) parsed.__thinkingSettings = appliedThinking;
                return parsed;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            const aggregator = createGeminiStreamAggregator(placeholderEl, appliedThinking, options);
            let buffer = '';
            let streamFormat = null; // 'sse' or 'json'

            function ingestJsonString(payload) {
                if (!payload) return;
                try {
                    const parsed = JSON.parse(payload);
                    if (Array.isArray(parsed)) {
                        parsed.forEach(item => aggregator.ingestChunk(item));
                    } else {
                        aggregator.ingestChunk(parsed);
                    }
                } catch (err) {
                    console.warn('Failed to parse Gemini stream chunk', err, payload);
                }
            }

            function processSseBuffer(flush = false) {
                // Google's ?alt=sse stream uses CRLF (\r\n\r\n) between events.
                buffer = buffer.replace(/\r\n/g, '\n');
                let boundary;
                while ((boundary = buffer.indexOf('\n\n')) !== -1) {
                    const eventChunk = buffer.slice(0, boundary);
                    buffer = buffer.slice(boundary + 2);
                    const lines = eventChunk.split('\n');
                    lines.forEach(line => {
                        const trimmed = line.trim();
                        if (!trimmed || !trimmed.startsWith('data:')) return;
                        const payload = trimmed.slice(5).trim();
                        if (!payload || payload === '[DONE]') return;
                        ingestJsonString(payload);
                    });
                }
                if (flush) {
                    const trimmed = buffer.trim();
                    if (trimmed) {
                        const chunks = trimmed.split('\n').map(part => part.trim()).filter(Boolean);
                        chunks.forEach(chunk => {
                            if (!chunk.startsWith('data:')) return;
                            const payload = chunk.slice(5).trim();
                            if (!payload || payload === '[DONE]') return;
                            ingestJsonString(payload);
                        });
                    }
                    buffer = '';
                }
            }

            function processJsonBuffer(flush = false) {
                let index = 0;
                while (index < buffer.length) {
                    const char = buffer[index];
                    if (char === '[' || char === ',' || char === '\n' || char === '\r' || char === ' ') {
                        index++;
                        continue;
                    }
                    if (char === '{') {
                        const startIndex = index;
                        let depth = 1;
                        let inString = false;
                        let escape = false;
                        let end = index + 1;
                        while (end < buffer.length) {
                            const current = buffer[end];
                            if (escape) {
                                escape = false;
                            } else if (current === '\\') {
                                escape = true;
                            } else if (current === '"') {
                                inString = !inString;
                            } else if (!inString) {
                                if (current === '{') {
                                    depth++;
                                } else if (current === '}') {
                                    depth--;
                                    if (depth === 0) {
                                        end++;
                                        const jsonString = buffer.slice(startIndex, end);
                                        ingestJsonString(jsonString);
                                        index = end;
                                        break;
                                    }
                                }
                            }
                            end++;
                        }
                        if (depth !== 0) {
                            buffer = buffer.slice(startIndex);
                            return;
                        }
                        continue;
                    }
                    if (char === ']') {
                        index++;
                        continue;
                    }
                    index++;
                }
                buffer = buffer.slice(index);
                if (flush) {
                    const trimmed = buffer.trim();
                    if (trimmed && /^[\[{]/.test(trimmed)) {
                        ingestJsonString(trimmed);
                    }
                    buffer = '';
                }
            }

            while (true) {
                const { value, done } = await reader.read();
                if (value) {
                    const chunkText = decoder.decode(value, { stream: !done });
                    buffer += chunkText;
                    if (!streamFormat) {
                        streamFormat = buffer.includes('data:') ? 'sse' : 'json';
                    }
                    if (streamFormat === 'sse') {
                        processSseBuffer(false);
                    } else {
                        processJsonBuffer(false);
                    }
                }
                if (done) break;
            }

            if (buffer.trim()) {
                if (streamFormat === 'sse') {
                    processSseBuffer(true);
                } else {
                    processJsonBuffer(true);
                }
            }

            return aggregator.finalize();
        }

        async function fetchGeminiContent(modelName, unusedApiKey, payload, signal, options = {}) {
            const { placeholderEl, appliedThinking, errorContext } = options;
            const useStreaming = Boolean(placeholderEl && typeof ReadableStream !== 'undefined');
            const { projectId, locations, modelLocations } = API_CONFIG.vertex || {};
            const useGeminiApi = API_CONFIG.gemini.enabled;
            const targetLocations = useGeminiApi
                ? ['gemini-api']
                : ((modelLocations && modelLocations[modelName]) || locations);

            if (!useGeminiApi && !projectId) {
                throw new Error("Vertex AI configuration (Project ID or Service Account Key) is missing.");
            }
            if (!targetLocations || !targetLocations.length) {
                throw new Error("Vertex AI locations are not configured for this model.");
            }

            const tryRequest = async (location) => {
                const host = location === 'global'
                    ? 'aiplatform.googleapis.com'
                    : `${location}-aiplatform.googleapis.com`;
                const baseUrl = useGeminiApi
                    ? `https://generativelanguage.googleapis.com/v1beta/models/${modelName}`
                    : `https://${host}/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelName}`;
                const method = useStreaming ? ':streamGenerateContent' : ':generateContent';
                const vertexUrl = baseUrl + method;
                const authToken = localStorage.getItem('authToken');

                captureOutgoingPayloadSnapshot({
                    provider: 'google',
                    model: modelName,
                    url: vertexUrl,
                    location,
                    payload
                });

                logApiEvent({
                    provider: 'google',
                    model: modelName,
                    stage: 'request',
                    location,
                    url: vertexUrl,
                    request: { payload, useStreaming, errorContext: errorContext || null }
                });

                // Use server proxy to bypass CORS and keep credentials server-side.
                // The Gemini API route takes a model name, not a URL.
                const response = await fetch(useGeminiApi ? '/gemini-proxy' : '/vertex-proxy', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${authToken}`
                    },
                    body: JSON.stringify(useGeminiApi
                        ? { model: modelName, stream: useStreaming, payload }
                        : { url: vertexUrl, payload }),
                    signal
                });

                if (!response.ok) {
                    const txt = await response.text();
                    logApiEvent({
                        provider: 'google',
                        model: modelName,
                        stage: 'error',
                        location,
                        url: vertexUrl,
                        request: { payload, useStreaming, errorContext: errorContext || null },
                        error: { status: response.status, body: txt }
                    });
                    throw new Error(`[${location}] ${response.status}: ${txt}`);
                }
                return { response, vertexUrl, location };
            };

            // Retry Logic: Primary Location (3 retries = 4 attempts total)
            const primary = targetLocations[0];
            const fallback = targetLocations[1] || targetLocations[0];
            let lastError;

            // Primary loop: 0 to 3 (4 attempts total)
            for (let i = 0; i < 4; i++) {
                try {
                    const { response, vertexUrl, location } = await tryRequest(primary);
                    const data = useStreaming
                        ? await consumeGeminiStream(response, placeholderEl, appliedThinking, options)
                        : await response.json();
                    logApiEvent({
                        provider: 'google',
                        model: modelName,
                        stage: 'response',
                        location,
                        url: vertexUrl,
                        responseMeta: extractGeminiMetadata(data),
                        response: data
                    });
                    return data;
                } catch (e) {
                    if (signal?.aborted) throw e;
                    lastError = e;
                    console.warn(`Attempt ${i + 1}/4 at ${primary} failed:`, e.message);
                    if (i < 3) await new Promise(r => setTimeout(r, 3000));
                }
            }

            // Fallback: One attempt
            console.warn(`All attempts at ${primary} failed. Trying fallback ${fallback}.`);
            try {
                const { response, vertexUrl, location } = await tryRequest(fallback);
                const data = useStreaming
                    ? await consumeGeminiStream(response, placeholderEl, appliedThinking, options)
                    : await response.json();
                logApiEvent({
                    provider: 'google',
                    model: modelName,
                    stage: 'response',
                    location,
                    url: vertexUrl,
                    responseMeta: extractGeminiMetadata(data),
                    response: data
                });
                return data;
            } catch (e) {
                if (signal?.aborted) throw e;
                throw new Error(`Vertex AI Failed. Primary (${primary}) and Fallback (${fallback}) both failed. Last Error: ${e.message}`);
            }
        }

        function getThinkingRuntime(messageEl) {
            if (!messageEl) return null;
            if (!messageEl.__thinkingRuntime) {
                messageEl.__thinkingRuntime = {};
            }
            return messageEl.__thinkingRuntime;
        }

        function ensureThinkingLog(detailsEl) {
            if (!detailsEl) return null;
            let log = detailsEl.querySelector('.thinking-live-log');
            if (!log) {
                log = document.createElement('div');
                log.className = 'thinking-live-log';
                detailsEl.appendChild(log);
            }
            return log;
        }

        function ensureThinkingUI(messageEl) {
            if (!messageEl || messageEl.dataset?.supportsThinking === 'false') return null;
            const wrapper = messageEl.querySelector('.thinking-wrapper');
            if (!wrapper) return null;
            const metaEl = wrapper.querySelector('.thinking-meta');
            const detailsEl = wrapper.querySelector('.thinking-details');
            const toggleBtn = wrapper.querySelector('.thinking-toggle');
            const caretIcon = wrapper.querySelector('.thinking-caret');
            const log = ensureThinkingLog(detailsEl);
            return { wrapper, metaEl, detailsEl, toggleBtn, caretIcon, log };
        }

        function setThinkingToggleLabel(wrapper, text) {
            if (!wrapper) return;
            const labelEl = wrapper.querySelector('.thinking-typing');
            if (labelEl && typeof text === 'string') {
                labelEl.textContent = text;
            }
        }

        function shouldSuppressThinkingStatus(messageEl) {
            if (!messageEl) return false;
            const variant = messageEl.dataset?.thinkingVariant;
            if (variant === 'gemini' || variant === 'kimi' || variant === 'kimi-search') return true;
            const runtime = getThinkingRuntime(messageEl);
            return Boolean(runtime?.hasLiveThoughts);
        }

        function ensureThinkingTimeline(runtime) {
            if (!runtime) return null;
            if (!runtime.timeline) runtime.timeline = [];
            if (!runtime.timelineMap) runtime.timelineMap = new Map();
            if (!runtime.thoughtKeys) runtime.thoughtKeys = [];
            if (!runtime.seenSearchGroups) runtime.seenSearchGroups = new Set();
            if (typeof runtime.searchCount !== 'number') runtime.searchCount = 0;
            return runtime;
        }

        function ensureThinkingTimelineEntry(messageEl, { key, type, title, className }) {
            if (!messageEl) return null;
            const thinking = ensureThinkingUI(messageEl);
            if (!thinking || !thinking.log) return null;
            const runtime = getThinkingRuntime(messageEl);
            if (!runtime) return null;
            ensureThinkingTimeline(runtime);
            if (runtime.timelineMap.has(key)) {
                return runtime.timelineMap.get(key);
            }
            const entry = createThinkingStepElement({ title, className, type, key });
            runtime.timelineMap.set(key, entry);
            runtime.timeline.push(key);
            thinking.log.appendChild(entry);
            return entry;
        }

        function activateThinkingUI(messageEl) {
            const thinking = ensureThinkingUI(messageEl);
            if (!thinking) return null;
            const { wrapper, toggleBtn, caretIcon, detailsEl, log } = thinking;
            const runtime = getThinkingRuntime(messageEl);
            const isExpanded = runtime?.isExpanded === true;
            wrapper.classList.remove('hidden');
            wrapper.classList.remove('thinking-complete');
            setThinkingToggleLabel(wrapper, 'Thinking');
            if (toggleBtn) {
                toggleBtn.classList.remove('thinking-toggle-disabled');
                toggleBtn.setAttribute('aria-expanded', String(isExpanded));
            }
            if (caretIcon) {
                caretIcon.classList.toggle('open', isExpanded);
            }
            if (detailsEl) {
                detailsEl.classList.toggle('hidden', !isExpanded);
            }
            if (runtime) runtime.log = log || null;
            return thinking;
        }

        function buildThinkingMetaItems(meta) {
            const metaItems = [];
            const config = meta?.config || {};
            if (config.label) metaItems.push(`Mode: ${escapeHTML(config.label)}`);
            if (typeof config.thinkingBudget === 'number') metaItems.push(`Thinking budget: ${config.thinkingBudget.toLocaleString()} tokens`);
            if (typeof config.outputBudget === 'number') metaItems.push(`Output budget: ${config.outputBudget.toLocaleString()} tokens`);
            const usage = meta?.usage || {};
            if (typeof usage.thoughtsTokenCount === 'number') metaItems.push(`Thoughts used: ${usage.thoughtsTokenCount.toLocaleString()} tokens`);
            if (typeof usage.candidatesTokenCount === 'number') metaItems.push(`Output used: ${usage.candidatesTokenCount.toLocaleString()} tokens`);
            return metaItems;
        }

        function renderThinkingMeta(metaEl, meta) {
            if (!metaEl) return false;
            const items = buildThinkingMetaItems(meta);
            metaEl.innerHTML = items.length
                ? items.map(item => `<span class="thinking-meta-item">${item}</span>`).join('<span class="thinking-meta-sep">•</span>')
                : '';
            return items.length > 0;
        }

        function setThinkingMeta(messageEl, meta) {
            const thinking = ensureThinkingUI(messageEl);
            if (!thinking) return false;
            const runtime = getThinkingRuntime(messageEl);
            if (runtime) runtime.meta = meta || {};
            return renderThinkingMeta(thinking.metaEl, meta || {});
        }

        function createThinkingStepElement({ title, bodyHTML, className, type, key }) {
            const step = document.createElement('div');
            step.className = `thinking-step${className ? ` ${className}` : ''}`;
            if (type) step.dataset.thinkingType = type;
            if (key) step.dataset.thinkingKey = key;
            const index = document.createElement('div');
            index.className = 'thinking-step-index';
            index.textContent = title || 'Status';
            const text = document.createElement('div');
            text.className = 'thinking-step-text';
            if (bodyHTML) {
                text.innerHTML = bodyHTML;
            }
            step.appendChild(index);
            step.appendChild(text);
            return step;
        }

        function ensureThinkingEntry(messageEl, storageKey, createFn) {
            const runtime = getThinkingRuntime(messageEl);
            if (!runtime) return null;
            const thinking = ensureThinkingUI(messageEl);
            if (!thinking || !thinking.log) return null;
            let entry = runtime[storageKey];
            if (entry && !thinking.log.contains(entry)) {
                entry = null;
            }
            if (!entry) {
                entry = createFn();
                thinking.log.appendChild(entry);
                runtime[storageKey] = entry;
            }
            return entry;
        }

        function setThinkingStatus(messageEl, statusText, options = {}) {
            const { key = 'statusEntry', defaultTitle = 'Status', iconClass = 'fas fa-circle-notch fa-spin', parseColon = true } = options;
            if (!messageEl || messageEl.dataset?.supportsThinking === 'false') return;
            if (shouldSuppressThinkingStatus(messageEl)) return;
            const rawText = typeof statusText === 'string' ? statusText : '';
            const thinking = activateThinkingUI(messageEl);
            if (!thinking) return;
            const entry = ensureThinkingEntry(messageEl, key, () => {
                const step = createThinkingStepElement({ title: defaultTitle, className: 'thinking-step-status', type: 'status', key: `status-${key}` });
                step.dataset.liveKey = key;
                return step;
            });
            if (!entry) return;
            const indexEl = entry.querySelector('.thinking-step-index');
            const textEl = entry.querySelector('.thinking-step-text');
            let title = defaultTitle;
            let body = rawText || defaultTitle;
            if (parseColon) {
                const colonIdx = rawText.indexOf(':');
                if (colonIdx > -1 && colonIdx < rawText.length - 1) {
                    title = rawText.slice(0, colonIdx).trim() || title;
                    body = rawText.slice(colonIdx + 1).trim() || body;
                }
            }
            if (indexEl) indexEl.textContent = title;
            if (textEl) {
                let row = textEl.querySelector('.thinking-status-row');
                if (!row) {
                    row = document.createElement('div');
                    row.className = 'thinking-status-row';
                    textEl.prepend(row);
                }
                row.innerHTML = `<i class="${iconClass}" aria-hidden="true"></i><span>${escapeHTML(body)}</span>`;
            }
        }

        function updateThinkingQueries(messageEl, queries) {
            if (!messageEl || messageEl.dataset?.supportsThinking === 'false') return;
            const normalizeGroups = input => {
                if (!Array.isArray(input) || input.length === 0) return [];
                const isStringArray = input.every(item => typeof item === 'string');
                if (isStringArray) {
                    const sanitized = input.map(q => (typeof q === 'string' ? q.trim() : '')).filter(q => q.length);
                    return sanitized.length ? [{ title: '', queries: sanitized }] : [];
                }
                const groups = input.map(entry => {
                    if (!entry || typeof entry !== 'object') return null;
                    const rawList = Array.isArray(entry.queries)
                        ? entry.queries
                        : Array.isArray(entry.items)
                            ? entry.items
                            : [];
                    const sanitized = rawList.map(q => (typeof q === 'string' ? q.trim() : '')).filter(q => q.length);
                    if (sanitized.length === 0) return null;
                    const title = typeof entry.title === 'string'
                        ? entry.title
                        : typeof entry.label === 'string'
                            ? entry.label
                            : '';
                    return { title, queries: sanitized };
                }).filter(Boolean);
                return groups;
            };

            const groups = normalizeGroups(queries);
            if (groups.length === 0) return;
            const thinking = activateThinkingUI(messageEl);
            if (!thinking || !thinking.log) return;
            const runtime = getThinkingRuntime(messageEl);
            if (!runtime) return;
            ensureThinkingTimeline(runtime);

            const renderQueryPill = query => `<span class="thinking-query-pill"><i class="fas fa-search" aria-hidden="true"></i>${escapeHTML(query)}</span>`;
            const buildGroupKey = group => `${group.title || ''}::${group.queries.join('|')}`;

            groups.forEach(group => {
                const groupKey = buildGroupKey(group);
                if (runtime.seenSearchGroups.has(groupKey)) return;
                runtime.seenSearchGroups.add(groupKey);
                runtime.searchCount += 1;
                const entryKey = `search-${runtime.searchCount}`;
                const entryTitle = group.title ? group.title : 'Search queries';
                const entry = ensureThinkingTimelineEntry(messageEl, {
                    key: entryKey,
                    type: 'search',
                    title: entryTitle,
                    className: 'thinking-step-search'
                });
                if (!entry) return;
                entry.dataset.groupKey = groupKey;

                const textEl = entry.querySelector('.thinking-step-text');
                if (!textEl) return;
                let container = textEl.querySelector('.thinking-search-queries');
                if (!container) {
                    container = document.createElement('div');
                    container.className = 'thinking-search-queries';
                    textEl.appendChild(container);
                }
                container.classList.remove('grouped');
                container.innerHTML = group.queries.map(renderQueryPill).join('');
            });

            const emptyNotice = thinking.log.querySelector('.thinking-empty');
            if (emptyNotice) emptyNotice.remove();
        }

        function initializeAssistantThinking(messageEl, meta) {
            if (!messageEl || messageEl.dataset?.supportsThinking === 'false') return;
            activateThinkingUI(messageEl);
            if (meta) setThinkingMeta(messageEl, meta);
        }

        function applyThinkingToMessage(messageEl, messageData) {
            if (!messageEl || messageData.role !== 'assistant' || messageEl.dataset?.supportsThinking === 'false') return;
            const thinking = ensureThinkingUI(messageEl);
            if (!thinking) return;
            const { wrapper, detailsEl, toggleBtn, caretIcon, log } = thinking;
            const runtime = getThinkingRuntime(messageEl);
            const userExpanded = runtime?.isExpanded === true;
            const thoughts = Array.isArray(messageData.thinking) ? messageData.thinking : [];
            const hasThoughts = thoughts.length > 0;
            const hasLogEntries = log ? log.children.length > 0 : false;

            if (!hasThoughts && !hasLogEntries) {
                wrapper.classList.add('hidden');
                if (log) log.innerHTML = '';
                if (detailsEl && !detailsEl.classList.contains('hidden')) {
                    detailsEl.classList.add('hidden');
                }
                if (toggleBtn) {
                    toggleBtn.classList.add('thinking-toggle-disabled');
                    toggleBtn.setAttribute('aria-expanded', 'false');
                }
                if (caretIcon) caretIcon.classList.remove('open');
                if (runtime) runtime.isExpanded = false;
                return;
            }

            wrapper.classList.remove('hidden');
            if (toggleBtn) {
                toggleBtn.classList.remove('thinking-toggle-disabled');
                toggleBtn.setAttribute('aria-expanded', String(userExpanded));
            }
            if (caretIcon) {
                caretIcon.classList.toggle('open', userExpanded);
            }
            if (detailsEl) {
                detailsEl.classList.toggle('hidden', !userExpanded);
            }

            if (log) {
                const emptyNotice = log.querySelector('.thinking-empty');
                if (emptyNotice) emptyNotice.remove();
                const geminiThoughtParts = Array.isArray(messageData.geminiParts)
                    ? messageData.geminiParts.filter(part => part && part.thought && typeof part.text === 'string')
                    : [];

                if (geminiThoughtParts.length > 0) {
                    geminiThoughtParts.forEach((part, idx) => {
                        const entry = updateThinkingThought(messageEl, {
                            signature: part.thoughtSignature || null,
                            text: part.text,
                            index: idx
                        });
                        if (entry) {
                            entry.dataset.generated = 'final';
                            delete entry.dataset.liveKey;
                        }
                    });
                } else if (hasThoughts) {
                    thoughts.forEach(chunk => {
                        const thoughtText = typeof chunk === 'string' ? chunk : chunk.text || '';
                        const entry = appendThinkingText(messageEl, thoughtText);
                        if (entry) {
                            entry.dataset.generated = 'final';
                            delete entry.dataset.liveKey;
                        }
                    });
                } else if (!hasLogEntries) {
                    const empty = document.createElement('div');
                    empty.className = 'thinking-empty';
                    empty.textContent = 'No thinking details were returned for this response.';
                    log.appendChild(empty);
                }
            }

            if (runtime) {
                ['statusEntry', 'searchStatusEntry', 'generalStatusEntry', 'searchQueriesEntry'].forEach(key => {
                    const entry = runtime[key];
                    if (entry) {
                        const iconEl = entry.querySelector('.thinking-status-row i');
                        if (iconEl) {
                            iconEl.classList.remove('fa-circle-notch', 'fa-spin');
                            iconEl.classList.add('fa-circle-check');
                        }
                    }
                });
            }

            wrapper.classList.add('thinking-complete');
            setThinkingToggleLabel(wrapper, 'Thoughts');
        }


        // Global functions exposed for HTML onclick handlers
        window.showLandingPage = function () {
            try {
                document.getElementById('landingPage').classList.remove('hidden');
                document.getElementById('chatInterface').classList.add('hidden');
                const uiHeader = document.getElementById('uiHeader');
                const uiInputDock = document.getElementById('uiInputDock');
                const uiWelcomeCenter = document.getElementById('uiWelcomeCenter');
                const uiBase = document.getElementById('uiBase');
                if (uiHeader) uiHeader.classList.add('hidden');
                if (uiInputDock) uiInputDock.classList.add('hidden');
                if (uiWelcomeCenter) uiWelcomeCenter.classList.add('hidden');
                if (uiBase) uiBase.classList.add('hidden');
            } catch (error) {
                console.error('Error showing landing page:', error);
            }
        };

        window.showChatInterface = function () {
            try {
                document.getElementById('landingPage').classList.add('hidden');
                document.getElementById('chatInterface').classList.remove('hidden');
                const uiHeader = document.getElementById('uiHeader');
                const uiInputDock = document.getElementById('uiInputDock');
                const uiBase = document.getElementById('uiBase');
                if (uiHeader) uiHeader.classList.remove('hidden');
                if (uiInputDock) uiInputDock.classList.remove('hidden');
                if (uiBase) uiBase.classList.remove('hidden');
                // Recompute insets after becoming visible
                setTimeout(() => { setupKeyboardDocking(); lockHeaderToVisualViewport(); syncFixedToMain(); }, 0);
                if (!appState.currentChatId) newChat();
                updateUsageDisplay();
            } catch (error) {
                console.error('Error showing chat interface:', error);
            }
        };

        window.toggleSidebar = function () {
            try {
                const sidebar = document.getElementById('sidebar');
                const backdrop = document.getElementById('sidebarBackdrop');
                if (!sidebar) return;

                const isMobile = window.innerWidth <= 768;
                if (isMobile) {
                    // Mobile: smooth slide-in/out using 'open' class
                    // Ensure legacy 'hidden' isn't used for animation
                    sidebar.classList.remove('hidden');
                    const isOpening = !sidebar.classList.contains('open');
                    sidebar.classList.toggle('open', isOpening);
                    if (backdrop) backdrop.classList.toggle('hidden', !isOpening);

                    const inputDock = document.getElementById('uiInputDock');
                    const welcome = document.getElementById('uiWelcomeCenter');
                    document.body.classList.toggle('sidebar-open', isOpening);
                    if (isOpening) {
                        if (inputDock) inputDock.classList.add('hidden');
                        if (welcome) welcome.classList.add('hidden');
                    } else {
                        const currentChat = appState.chats.find(c => c.id === appState.currentChatId);
                        const shouldShowWelcome = !currentChat || (currentChat.messages && currentChat.messages.length === 0);
                        if (inputDock) inputDock.classList.remove('hidden');
                        if (welcome) welcome.classList.toggle('hidden', !shouldShowWelcome);
                    }
                    sidebar.setAttribute('aria-hidden', String(!isOpening));
                } else {
                    // Desktop: collapse to icon rail (never completely hidden)
                    sidebar.classList.toggle('collapsed');
                }

                if (typeof syncFixedToMain === 'function') {
                    // realign input/welcome with main area
                    syncFixedToMain();
                }
                setTimeout(() => { if (typeof setupKeyboardDocking === 'function') setupKeyboardDocking(); }, 0);
            } catch (error) {
                console.error('Error toggling sidebar:', error);
            }
        };

        window.sendMessage = async function () {
            if (currentRequestController) return; // Don't send if a request is in progress

            const input = document.getElementById('messageInput');
            const messageText = input.value.trim();
            if (!messageText && appState.uploadedFiles.length === 0) return;

            const selectedModel = models[appState.currentModel];
            const provider = selectedModel?.provider;
            const isCreateImage = appState.createImageEnabled === true;

            // If no current chat, create one now (lazy creation)
            if (!appState.currentChatId) {
                const chatId = generateId();
                const chat = {
                    id: chatId,
                    title: 'New Chat',
                    section: appState.currentSection,
                    messages: [],
                    created: new Date().toISOString(),
                    lastMessage: new Date().toISOString()
                };
                appState.chats.unshift(chat);
                appState.currentChatId = chatId;
                updateChatHistory(); // Update list to show the new chat
            }

            // Guarantee full conversation context is ready before sending to the model.
            const activeChat = appState.chats.find(c => c.id == appState.currentChatId);
            if (activeChat && !activeChat.isLocal) {
                try {
                    await ensureChatContextReady(activeChat.id);
                } catch (ctxErr) {
                    console.error('Failed to prepare full conversation context before send:', ctxErr);
                    return;
                }
            }

            // Hide welcome message and move input to bottom when sending first message
            updateWelcomeMessage(false);

            // Setup AbortController
            currentRequestController = new AbortController();
            const signal = currentRequestController.signal;

            // UI updates for processing state
            document.getElementById('sendButton').classList.add('hidden');
            document.getElementById('stopButton').classList.remove('hidden');
            document.getElementById('messageInput').disabled = true;

            const filesForMessage = JSON.parse(JSON.stringify(appState.uploadedFiles));

            const userMessage = {
                id: generateId(),
                role: 'user',
                content: messageText,
                files: filesForMessage,
                timestamp: new Date().toISOString()
            };

            // NOTE: No frontend token/quota preflight checks are enforced here.

            const currentChat = appState.chats.find(chat => chat.id == appState.currentChatId);
            if (currentChat) {
                currentChat.messages.push(userMessage);
                currentChat.lastMessage = new Date().toISOString();
            }

            // --- SYNC USER MESSAGE ---
            // If content is empty but we have files, use a placeholder so the message is saved
            // Also add indicator if files are present alongside text
            let syncContent = userMessage.content;
            if (userMessage.files && userMessage.files.length > 0) {
                const hasImages = userMessage.files.some(f => f.type && f.type.startsWith('image/'));
                if (!syncContent) {
                    syncContent = '[Media Attachment]';
                } else if (hasImages) {
                    // Prepend indicator that this message has images
                    syncContent = '[Image Attached] ' + syncContent;
                }
            }
            syncMessageToServer('user', syncContent, userMessage.id);
            // -------------------------

            // --- SAVE UPLOADED IMAGES TO DATABASE ---
            // Save user-uploaded images to the database for persistence
            if (userMessage.files && userMessage.files.length > 0 && currentChat) {
                console.log('?? Attempting to save uploaded images...', {
                    sessionId: currentChat.id,
                    messageId: userMessage.id,
                    fileCount: userMessage.files.length,
                    files: userMessage.files.map(f => ({ name: f.name, type: f.type, hasContent: !!f.content }))
                });

                saveUploadedImages(currentChat.id, userMessage.id, userMessage.files)
                    .then(savedImages => {
                        if (savedImages.length > 0) {
                            console.log('?? User uploaded images saved to database:', savedImages);
                            // Store the image IDs in the message for reference
                            userMessage.uploadedImageIds = savedImages.map(img => img.id);
                        } else {
                            console.warn('?? No images were saved (returned empty array)');
                        }
                    })
                    .catch(err => console.error('?? Failed to save uploaded images:', err));
            } else {
                console.log('?? No files to save or no current chat', {
                    hasFiles: !!(userMessage.files && userMessage.files.length > 0),
                    hasChat: !!currentChat
                });
            }
            // ----------------------------------------

            appState.usage[appState.currentModel].count++;
            displayMessage(userMessage);
            input.value = '';
            appState.uploadedFiles = [];
            updateUploadedFilesDisplay();
            autoResize(input);
            updateUI();
            saveState();
            scrollToBottom();

            const assistantMessageId = generateId();
            const flashSearchUI = !isCreateImage && provider === 'google' && selectedModel.id === 'flash' && appState.webSearchEnabled === true;
            const showMegaLLMSearchUI = !isCreateImage && ((provider === 'megallm' && appState.webSearchEnabled === true) || flashSearchUI);
            const supportsThinking = !isCreateImage && (showMegaLLMSearchUI
                || (provider === 'google' && selectedModel.supportsThinking !== false)
                || (provider === 'megallm' && selectedModel.supportsThinking === true));
            const thinkingVariant = supportsThinking
                ? (showMegaLLMSearchUI ? 'kimi-search' : (provider === 'google' ? 'gemini' : (provider === 'megallm' && selectedModel.supportsThinking ? 'kimi' : null)))
                : null;
            const placeholderEl = displayMessage({
                id: assistantMessageId,
                role: 'assistant',
                timestamp: new Date().toISOString(),
                supportsThinking,
                thinkingVariant
            });

            const startTime = performance.now();

            try {
                const aiResponse = await generateAIResponse(userMessage, placeholderEl, signal);
                const endTime = performance.now();
                const thinkingTime = ((endTime - startTime) / 1000).toFixed(2);

                const finalAssistantMessage = {
                    id: assistantMessageId,
                    role: 'assistant',
                    timestamp: new Date().toISOString(),
                    thinkingTime: thinkingTime,
                    provider: isCreateImage ? 'google' : provider // store provider so rendering logic can differentiate
                };

                if (aiResponse.isError) {
                    finalAssistantMessage.content = aiResponse.data;
                } else {
                    finalAssistantMessage.content = aiResponse.data;
                    finalAssistantMessage.sources = aiResponse.sources;
                    if (aiResponse.thinking) {
                        finalAssistantMessage.thinking = aiResponse.thinking;
                    }
                    if (aiResponse.thinkingMeta) {
                        finalAssistantMessage.thinkingMeta = aiResponse.thinkingMeta;
                    }
                    if (aiResponse.geminiParts) {
                        finalAssistantMessage.geminiParts = aiResponse.geminiParts;
                    }
                    // Pass through the flag for AI-generated images
                    if (aiResponse.hasGeneratedImages) {
                        finalAssistantMessage.hasGeneratedImages = true;
                    }
                }

                updateMessageContent(placeholderEl, finalAssistantMessage);

                if (currentChat) {
                    currentChat.messages.push(finalAssistantMessage);
                }

                // --- SYNC ASSISTANT MESSAGE ---
                syncMessageToServer('assistant', finalAssistantMessage.content, finalAssistantMessage.id);
                // ------------------------------

            } catch (error) {
                console.error("Error during AI Response generation:", error);
                const errorMessage = {
                    id: assistantMessageId,
                    role: 'assistant',
                    content: error.name === 'AbortError'
                        ? '?? Generation stopped by user.'
                        : `? Sorry, there was an error processing your request: ${error.message}`,
                    timestamp: new Date().toISOString()
                };
                updateMessageContent(placeholderEl, errorMessage);
                if (currentChat) currentChat.messages.push(errorMessage);
            } finally {
                // Reset UI and abort controller regardless of outcome
                currentRequestController = null;
                document.getElementById('sendButton').classList.remove('hidden');
                document.getElementById('stopButton').classList.add('hidden');
                document.getElementById('messageInput').disabled = false;
                updateUI();
                saveState();
                scrollToBottom();
            }
        };

        window.newChat = function () {
            try {
                // Clean up image data from current chat to prevent memory leaks
                if (appState.currentChatId) {
                    cleanupChatImageData(appState.currentChatId);
                }
                createNewLocalChat();
                updateWelcomeMessage(true);
                saveState();
            } catch (error) {
                console.error('Error creating new chat:', error);
            }
        };

        window.clearHistory = function () {
            try {
                if (confirm('Are you sure you want to clear all chat history? This cannot be undone.')) {
                    appState.chats = [];
                    appState.currentChatId = null;
                    chatRuntimeState.clear();

                    // --- SYNC CLEAR ---
                    const token = localStorage.getItem('authToken');
                    if (token) {
                        fetch(`${API_BASE_URL}/chat/history`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${token}` }
                        }).catch(e => console.error('Failed to clear remote history', e));
                    }
                    // ------------------

                    newChat();
                    saveState();
                }
            } catch (error) {
                console.error('Error clearing history:', error);
            }
        };

        window.removeFile = function (index) {
            try {
                appState.uploadedFiles.splice(index, 1);
                updateUploadedFilesDisplay();
                updateSendButton();
            } catch (error) {
                console.error('Error removing file:', error);
            }
        };

        window.closeFileModal = function () {
            document.getElementById('fileModal').classList.add('hidden');
        };

        async function syncUserPreferences() {
            const token = localStorage.getItem('authToken');
            if (!token) return;

            try {
                const response = await fetch(`${API_BASE_URL}/user/me`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const user = await response.json();
                    const prefs = user.preferences || {};

                    // Update app state from DB preferences
                    if (typeof prefs.webSearch !== 'undefined') appState.webSearchEnabled = prefs.webSearch;
                    if (typeof prefs.extendThinking !== 'undefined') appState.extendThinking = prefs.extendThinking;
                    if (typeof prefs.createImage !== 'undefined') appState.createImageEnabled = prefs.createImage;
                    if (typeof prefs.debug !== 'undefined') appState.debugEnabled = prefs.debug;

                    if (appState.createImageEnabled) {
                        appState.webSearchEnabled = false;
                    }

                    // Note: We do NOT restore currentSection/mode, it defaults to 'general' per requirements.

                    // Update UI
                    updateSelectedFeatures();
                    updateToolAvailability();

                    // Update authUser in localStorage with fresh data from server
                    const authUserStr = localStorage.getItem('authUser');
                    if (authUserStr) {
                        const authUser = JSON.parse(authUserStr);
                        // Merge fresh user data from server with existing authUser
                        const updatedUser = {
                            ...authUser,
                            username: user.username || authUser.username,
                            tier: user.tier || user.plan || authUser.tier || authUser.plan,
                            plan: user.plan || user.tier || authUser.plan || authUser.tier,
                            avatar: user.avatar || authUser.avatar,
                            email: user.email || authUser.email
                        };
                        localStorage.setItem('authUser', JSON.stringify(updatedUser));

                        // Refresh the UI profile display
                        if (typeof loadUserProfile === 'function') {
                            loadUserProfile();
                        }
                    }
                }
            } catch (e) {
                console.warn('Failed to sync user preferences:', e);
            }
        }

        document.addEventListener('DOMContentLoaded', async function () {
            try {
                await initDB();
                initializeUsageState();
                await loadState();

                // --- SYNC FIX: Check auth and fetch sessions immediately ---
                const token = localStorage.getItem('authToken');
                if (token) {
                    // Fetch user prefs FIRST, then sessions
                    await syncUserPreferences();
                    fetchSessions().catch(console.error);
                }
                // -----------------------------------------------------------

                populateModelSelector();
                setupEventListeners();
                setupKeyboardDocking();
                lockHeaderToVisualViewport();
                syncFixedToMain();
                updateUI();
                switchSection(appState.currentSection);

                // Show chat interface if user has existing chats, otherwise show landing page
                if (token && appState.chats && appState.chats.length > 0) {
                    showChatInterface();
                    // Load the most recent chat or current chat
                    if (appState.currentChatId) {
                        loadChat(appState.currentChatId);
                    } else {
                        newChat();
                    }
                } else {
                    showLandingPage();
                }

                // Initialize sidebar state for mobile (closed, animated via .open)
                const __sb = document.getElementById('sidebar');
                const __bd = document.getElementById('sidebarBackdrop');
                if (window.innerWidth <= 768 && __sb) {
                    __sb.classList.remove('hidden');
                    __sb.classList.remove('open');
                    __sb.setAttribute('aria-hidden', 'true');
                    if (__bd) __bd.classList.add('hidden');
                    document.body.classList.remove('sidebar-open');
                }
            } catch (error) {
                console.error('Error initializing app:', error);
            }
        });

        function initializeUsageState() {
            const today = new Date().toDateString();
            for (const modelId in models) {
                // Initialize per-day counter
                appState.usage[modelId] = appState.usage[modelId] || {};
                appState.usage[modelId].count = 0;
                appState.usage[modelId].date = today;
            }
        }

        async function loadState() {
            try {
                const saved = await loadStateFromDB();
                if (saved) {
                    const parsedState = saved; // Data from IndexedDB is already an object
                    delete parsedState.uploadedFiles;

                    if (parsedState.currentSection && !sections.hasOwnProperty(parsedState.currentSection)) {
                        console.warn(`Saved section "${parsedState.currentSection}" is invalid. Resetting to default 'general'.`);
                        parsedState.currentSection = 'general';
                    }

                    const today = new Date().toDateString();

                    if (parsedState.usage) {
                        for (const modelId in appState.usage) {
                            const savedUsage = parsedState.usage[modelId];
                            if (savedUsage && savedUsage.date === today) {
                                appState.usage[modelId].count = savedUsage.count || 0;
                            }
                        }
                    }

                    delete parsedState.usage;

                    Object.assign(appState, parsedState);
                    if (appState.createImageEnabled) {
                        appState.webSearchEnabled = false;
                    }
                }
            } catch (error) {
                console.error('Error loading state from DB:', error);
            }
        }

        function populateModelSelector() {
            const modelDropdownList = document.getElementById('modelDropdownList');
            if (!modelDropdownList) return;
            modelDropdownList.innerHTML = '';

            for (const modelId in models) {
                const model = models[modelId];
                const item = document.createElement('button');
                item.className = 'model-dropdown-item';
                item.onclick = () => selectModel(modelId);

                const modelInfo = document.createElement('div');
                modelInfo.className = 'model-info';

                const modelName = document.createElement('div');
                modelName.className = 'model-name';
                modelName.textContent = model.name;

                const modelDesc = document.createElement('div');
                modelDesc.className = 'model-description';
                modelDesc.textContent = model.description || getModelDescription(modelId);

                modelInfo.appendChild(modelName);
                modelInfo.appendChild(modelDesc);

                const checkIcon = document.createElement('i');
                checkIcon.className = 'fas fa-check model-check';
                checkIcon.style.visibility = modelId === appState.currentModel ? 'visible' : 'hidden';
                checkIcon.id = `check-${modelId}`;

                item.appendChild(modelInfo);
                item.appendChild(checkIcon);

                if (modelId === appState.currentModel) {
                    item.classList.add('selected');
                }

                modelDropdownList.appendChild(item);
            }
        }

        function getModelDescription(modelId) {
            const descriptions = {
                'flash': 'Fast & efficient',
                'pro': 'Complex math and reasoning',
                'g3pro': 'PhD Level of reasoning',
                'argon': "Google's flagship model",
                'gptoss': 'This model is unavailable',
                'deepseek': 'This model is unavailable',
                'gpt5': 'Kimi K2 via Vertex AI',
                'gpt5thinking': 'Kimi K2 Thinking via Vertex AI'
            };
            return descriptions[modelId] || 'AI Model';
        }

        function selectModel(modelId) {
            appState.currentModel = modelId;
            document.getElementById('selectedModelName').textContent = models[modelId].name;

            // Update checkmarks
            document.querySelectorAll('.model-dropdown-item').forEach(item => {
                item.classList.remove('selected');
            });
            document.querySelectorAll('.model-check').forEach(check => {
                check.style.visibility = 'hidden';
            });

            const selectedCheck = document.getElementById(`check-${modelId}`);
            if (selectedCheck) {
                selectedCheck.style.visibility = 'visible';
                selectedCheck.closest('.model-dropdown-item').classList.add('selected');
            }

            toggleModelDropdown();
            updateUI();
            saveState();
        }

        window.toggleModelDropdown = function () {
            const dropdown = document.getElementById('modelDropdown');
            const btn = document.getElementById('modelDropdownBtn');
            dropdown.classList.toggle('hidden');
            btn.classList.toggle('active');
        }

        window.togglePlusMenu = function () {
            const menu = document.getElementById('plusMenu');
            menu.classList.toggle('hidden');
        }

        window.toggleSettingsMenu = function () {
            const menu = document.getElementById('settingsMenu');
            menu.classList.toggle('hidden');
        }

        window.toggleFeature = function (feature) {
            if (feature === 'webSearch') {
                if (appState.createImageEnabled) {
                    updateToolAvailability();
                    return;
                }
                // Force enable web search in Fact Checker mode
                if (appState.currentSection === 'fact-checker') {
                    appState.webSearchEnabled = true;
                    // Optional: Visual feedback or just ignore the toggle attempt
                } else {
                    appState.webSearchEnabled = !appState.webSearchEnabled;
                }
            } else if (feature === 'createImage') {
                appState.createImageEnabled = !appState.createImageEnabled;
                if (appState.createImageEnabled) {
                    appState.webSearchEnabled = false;
                }
            } else if (feature === 'extendThinking') {
                appState.extendThinking = !appState.extendThinking;
            } else if (feature === 'debug') { // New condition
                appState.debugEnabled = !appState.debugEnabled;
            }

            updateSelectedFeatures();
            updateToolAvailability();
            togglePlusMenu();
            saveState();

            // Sync new state to server if logged in
            const token = localStorage.getItem('authToken');
            if (token) {
                fetch(`${API_BASE_URL}/user/preferences`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        preferences: {
                            webSearch: appState.webSearchEnabled,
                            extendThinking: appState.extendThinking,
                            createImage: appState.createImageEnabled,
                            debug: appState.debugEnabled
                        }
                    })
                }).catch(e => console.warn('Failed to save preferences', e));
            }
        }

        window.switchMode = function (mode) {
            switchSection(mode);

            // Update checkmarks
            document.getElementById('checkGeneral').classList.toggle('hidden', mode !== 'general');
            document.getElementById('checkFactChecker').classList.toggle('hidden', mode !== 'fact-checker');

            toggleSettingsMenu();
        }

        function updateSelectedFeatures() {
            const container = document.getElementById('selectedFeatures');
            container.innerHTML = '';

            if (appState.webSearchEnabled) {
                const isLocked = appState.currentSection === 'fact-checker';
                const pill = createFeaturePill('Web Search', 'fas fa-search', 'webSearch', isLocked);
                container.appendChild(pill);
            }

            if (appState.createImageEnabled) {
                const pill = createFeaturePill('Create image', 'fas fa-paintbrush', 'createImage');
                container.appendChild(pill);
            }

            if (appState.extendThinking) {
                const pill = createFeaturePill('Think', 'fas fa-lightbulb', 'extendThinking');
                container.appendChild(pill);
            }

            if (appState.debugEnabled) { // New condition
                const pill = createFeaturePill('Debug', 'fas fa-bug', 'debug');
                container.appendChild(pill);
            }
        }

        function updateToolAvailability() {
            const webSearchToggle = document.getElementById('webSearchToggle');
            if (webSearchToggle) {
                webSearchToggle.disabled = appState.createImageEnabled === true;
            }
        }

        function createFeaturePill(text, iconClass, feature, isLocked = false) {
            const pill = document.createElement('div');
            pill.className = 'feature-pill' + (isLocked ? ' locked' : '');
            // If locked, don't allow toggling
            pill.onclick = isLocked ? null : () => window.toggleFeature(feature);
            if (isLocked) pill.style.cursor = 'default';

            const icon = document.createElement('i');
            icon.className = iconClass;

            const span = document.createElement('span');
            span.textContent = text;

            pill.appendChild(icon);
            pill.appendChild(span);

            return pill;
        }

        function setupEventListeners() {
            // Close dropdowns when clicking outside
            window.addEventListener('click', function (e) {
                const modelDropdown = document.getElementById('modelDropdown');
                const modelBtn = document.getElementById('modelDropdownBtn');
                if (modelDropdown && modelBtn && !modelBtn.contains(e.target) && !modelDropdown.contains(e.target)) {
                    modelDropdown.classList.add('hidden');
                    modelBtn.classList.remove('active');
                }

                const plusMenu = document.getElementById('plusMenu');
                const plusBtn = document.getElementById('plusBtn');
                if (plusMenu && plusBtn && !plusBtn.contains(e.target) && !plusMenu.contains(e.target)) {
                    plusMenu.classList.add('hidden');
                }

                const settingsMenu = document.getElementById('settingsMenu');
                const settingsBtn = document.getElementById('settingsBtn');
                if (settingsMenu && settingsBtn && !settingsBtn.contains(e.target) && !settingsMenu.contains(e.target)) {
                    settingsMenu.classList.add('hidden');
                }
            });

            const messageInput = document.getElementById('messageInput');
            let inputTimeout;
            messageInput.addEventListener('input', () => {
                // Always resize immediately for responsive feel
                autoResize(messageInput);

                // Debounce the send button update to reduce DOM operations
                clearTimeout(inputTimeout);
                inputTimeout = setTimeout(() => {
                    updateSendButton();
                }, 50);
            });
            messageInput.addEventListener('keydown', e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    document.getElementById('sendButton').click();
                }
            });

            // Handle focus events: avoid forced scroll on mobile, rely on keyboard docking
            messageInput.addEventListener('focus', () => {
                if (window.innerWidth > 768) {
                    setTimeout(() => {
                        messageInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }, 100);
                }
            });

            document.getElementById('fileInput').addEventListener('change', handleFileSelect);
            const messagesArea = document.getElementById('messagesArea');
            if (messagesArea) {
                messagesArea.addEventListener('scroll', handleMessagesAreaScroll, { passive: true });
            }
            window.addEventListener('resize', () => {
                const sidebar = document.getElementById('sidebar');
                const backdrop = document.getElementById('sidebarBackdrop');
                if (!sidebar) return;
                if (window.innerWidth > 768) {
                    // Ensure overlay state is cleared on desktop; keep collapsed as-is
                    sidebar.classList.remove('open');
                    sidebar.classList.remove('hidden');
                    sidebar.removeAttribute('aria-hidden');
                    if (backdrop) backdrop.classList.add('hidden');
                    document.body.classList.remove('sidebar-open');
                } else {
                    // On mobile, default to closed overlay and no collapsed state
                    sidebar.classList.remove('collapsed');
                    sidebar.classList.remove('hidden');
                    sidebar.classList.remove('open');
                    sidebar.setAttribute('aria-hidden', 'true');
                    if (backdrop) backdrop.classList.add('hidden');
                    document.body.classList.remove('sidebar-open');
                }
                if (typeof syncFixedToMain === 'function') {
                    syncFixedToMain();
                }
            });
        }

        function autoResize(textarea) {
            // Use requestAnimationFrame for smoother performance
            requestAnimationFrame(() => {
                textarea.style.height = 'auto';
                textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
            });
        }

        function updateUI() {
            // Update model selector display
            const selectedModelName = document.getElementById('selectedModelName');
            if (selectedModelName) {
                selectedModelName.textContent = models[appState.currentModel].name;
            }

            // Sync dropdown checkmarks
            document.querySelectorAll('.model-dropdown-item').forEach(item => {
                item.classList.remove('selected');
            });
            document.querySelectorAll('.model-check').forEach(check => {
                check.style.visibility = 'hidden';
            });
            const selectedCheck = document.getElementById(`check-${appState.currentModel}`);
            if (selectedCheck) {
                selectedCheck.style.visibility = 'visible';
                selectedCheck.closest('.model-dropdown-item').classList.add('selected');
            }

            const isFactChecker = appState.currentSection === 'fact-checker';

            // Update selected features display
            updateSelectedFeatures();
            updateToolAvailability();

            // Update mode checkmarks in settings menu
            const checkGeneral = document.getElementById('checkGeneral');
            const checkFactChecker = document.getElementById('checkFactChecker');
            if (checkGeneral && checkFactChecker) {
                checkGeneral.classList.toggle('hidden', isFactChecker);
                checkFactChecker.classList.toggle('hidden', !isFactChecker);
            }
            // Update persistent mode ribbon text
            const ribbonText = document.getElementById('modeRibbonText');
            if (ribbonText) ribbonText.textContent = isFactChecker ? 'Fact Checker' : 'General';

            const currentChat = appState.chats.find(c => c.id === appState.currentChatId);
            updateWelcomeMessage(!currentChat || currentChat.messages.length === 0);
            updateChatHistory();
            updateSendButton();
            updateUsageDisplay();
        }

        function updateUsageDisplay() {
            const el = document.getElementById('usageDisplay');
            if (!el) return; // counter removed from header; no-op
            const usage = appState.usage[appState.currentModel];
            el.textContent = (usage && typeof usage.count === 'number')
                ? String(usage.count)
                : '-';
        }

        function updateWordCount() {
            // Word count is no longer displayed in UI, but we still validate internally
            // This function can be called but does nothing visible
        }

        function updateSendButton() {
            const input = document.getElementById('messageInput');
            const hasContent = input.value.trim().length > 0 || appState.uploadedFiles.length > 0;
            document.getElementById('sendButton').disabled = !hasContent;
        }

        function switchSection(sectionId) {
            appState.currentSection = sectionId;
            if (sectionId === 'fact-checker') {
                appState.webSearchEnabled = !appState.createImageEnabled;
                // Extend thinking is optional, but user requested forced web search.
                // We will also enforce it in the toggle handler.
                appState.extendThinking = true;
            }

            // Update mode checkmarks
            const checkGeneral = document.getElementById('checkGeneral');
            const checkFactChecker = document.getElementById('checkFactChecker');
            if (checkGeneral && checkFactChecker) {
                checkGeneral.classList.toggle('hidden', sectionId !== 'general');
                checkFactChecker.classList.toggle('hidden', sectionId !== 'fact-checker');
            }

            const sectionData = sections[sectionId];
            if (sectionData) {
                const header = document.getElementById('currentModeHeader');
                if (header) header.innerHTML = `<i class="${sectionData.icon}"></i> <span>${sectionData.name}</span>`;
            }

            const currentChat = appState.chats.find(c => c.id === appState.currentChatId);
            if (!currentChat || currentChat.messages.length === 0) {
                if (currentChat) currentChat.section = sectionId;
                updateWelcomeMessage(true);
            }
            updateUI();
            saveState();
        }

        function updateWelcomeMessage(show) {
            // If the landing page is visible, never show welcome/inputs
            const landing = document.getElementById('landingPage');
            if (landing && !landing.classList.contains('hidden')) {
                const baseEl = document.getElementById('uiBase');
                const centerEl = document.getElementById('uiWelcomeCenter');
                if (baseEl) baseEl.classList.add('hidden');
                if (centerEl) centerEl.classList.add('hidden');
                return;
            }
            const base = document.getElementById('uiBase');
            const center = document.getElementById('uiWelcomeCenter');
            const dock = document.getElementById('uiInputDock');
            if (base) base.classList.toggle('hidden', !show);
            if (center) center.classList.toggle('hidden', !show);
            if (dock) {
                const isDesktop = window.innerWidth > 768;
                dock.classList.toggle('is-centered', show && isDesktop);
            }
            // Recompute insets right away so content stays readable
            const messagesArea = document.getElementById('messagesArea');
            const headerEl = document.getElementById('uiHeader');
            if (messagesArea && dock) {
                const headerH = headerEl ? headerEl.offsetHeight : 0;
                // With interactive-widget=resizes-content, we don't need to calculate occlusion manually
                // The viewport resizes, so bottom:0 is always above the keyboard.

                messagesArea.style.removeProperty('padding-top');
                messagesArea.style.paddingBottom = `${(dock.offsetHeight || 100) + 24}px`;
                try { document.documentElement.style.setProperty('--header-h', `${headerH}px`); } catch (e) { }
            }
            if (typeof syncFixedToMain === 'function') {
                syncFixedToMain();
            }
        }

        async function handleFileSelect(event) {
            const files = Array.from(event.target.files);
            const filePromises = files.map(async file => {
                if (!appState.uploadedFiles.some(f => f.name === file.name && f.size === file.size)) {
                    let content;
                    let ocrData = null;
                    let isNativeGeminiFile = false;
                    let extractedTextContent = null;

                    try {
                        // Check if this file type is natively supported by Gemini API
                        const isGeminiNative = isGeminiNativeFile(file.type);
                        // Check if current model is Gemini - if so, skip OCR
                        const usingGemini = isCurrentModelGemini();

                        if (isGeminiNative) {
                            // For Gemini-native files (images, audio, PDFs), store raw base64
                            // These will be sent directly to the API as inlineData
                            content = await readFileAsBase64(file);
                            isNativeGeminiFile = true;

                            // For images, only run OCR if NOT using a Gemini model
                            if (file.type.startsWith('image/') && !usingGemini) {
                                console.log('Processing image with OCR for non-Gemini model...');
                                ocrData = await processImageWithOCR(file);
                                console.log('OCR completed:', ocrData);
                            } else if (file.type.startsWith('image/')) {
                                console.log(`Image file ${file.name} stored for native Gemini handling (no OCR needed)`);
                            }

                            // For PDFs, also extract text for non-Gemini models
                            if (file.type === 'application/pdf' && !usingGemini) {
                                try {
                                    extractedTextContent = await readPdfFile(file);
                                    console.log('PDF text extracted for non-Gemini fallback');
                                } catch (pdfErr) {
                                    console.warn('PDF text extraction failed:', pdfErr);
                                }
                            } else if (file.type === 'application/pdf') {
                                console.log(`PDF file ${file.name} stored for native Gemini handling`);
                            }
                        } else if (file.type.startsWith('image/')) {
                            // Non-Gemini native images (shouldn't happen with current MIME list, but safety check)
                            content = await readFileAsBase64(file);
                            if (!usingGemini) {
                                console.log('Processing image with OCR...');
                                ocrData = await processImageWithOCR(file);
                                console.log('OCR completed:', ocrData);
                            }
                        } else if (file.type === 'application/pdf') {
                            // Non-Gemini PDF handling (shouldn't happen, but safety check)
                            content = await readPdfFile(file);
                        } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                            // DOCX files - extract text (not natively supported by Gemini)
                            content = await readDocxFile(file);
                        } else {
                            // Plain text files
                            content = await readFileAsText(file);
                        }

                        appState.uploadedFiles.push({
                            file: null,
                            name: file.name,
                            size: file.size,
                            type: file.type,
                            content: content,
                            ocrData: ocrData, // Store OCR data for non-Gemini models
                            isNativeGeminiFile: isNativeGeminiFile, // Flag for native Gemini handling
                            extractedTextContent: extractedTextContent // Extracted text for non-Gemini fallback
                        });
                    } catch (error) {
                        console.error(`Error processing file ${file.name}:`, error);
                        alert(`Could not process file: ${file.name}. It might be corrupted or in an unsupported format.`);
                    }
                }
            });

            await Promise.all(filePromises);

            updateUploadedFilesDisplay();
            updateSendButton();
            event.target.value = '';
        }

        function readFileAsBase64(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.onerror = error => reject(error);
                reader.readAsDataURL(file);
            });
        }

        // OCR processing for images
        async function processImageWithOCR(file) {
            try {
                console.log(`Starting OCR for image: ${file.name}`);

                // Create a data URL for Tesseract
                const base64Data = await readFileAsBase64(file);
                const dataUrl = `data:${file.type};base64,${base64Data}`;

                // Perform OCR
                const result = await Tesseract.recognize(dataUrl, 'eng', {
                    logger: info => {
                        if (info.status === 'recognizing text') {
                            console.log(`OCR Progress: ${Math.round(info.progress * 100)}%`);
                        }
                    }
                });

                const extractedText = result.data.text.trim();

                // Also get basic image analysis
                const img = new Image();
                img.src = dataUrl;
                await new Promise(resolve => img.onload = resolve);

                const imageAnalysis = analyzeImageVisually(img);

                return {
                    extractedText: extractedText || '[No text detected in image]',
                    imageAnalysis: imageAnalysis,
                    confidence: result.data.confidence
                };
            } catch (error) {
                console.error('OCR Error:', error);
                return {
                    extractedText: '[OCR processing failed]',
                    imageAnalysis: 'Unable to analyze image',
                    confidence: 0
                };
            }
        }

        // Basic visual analysis of image
        function analyzeImageVisually(img) {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            // Get image data for analysis
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;

            // Calculate average brightness and dominant colors
            let totalBrightness = 0;
            let redSum = 0, greenSum = 0, blueSum = 0;
            const pixelCount = data.length / 4;

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                totalBrightness += (r + g + b) / 3;
                redSum += r;
                greenSum += g;
                blueSum += b;
            }

            const avgBrightness = totalBrightness / pixelCount;
            const avgRed = Math.round(redSum / pixelCount);
            const avgGreen = Math.round(greenSum / pixelCount);
            const avgBlue = Math.round(blueSum / pixelCount);

            let brightnessDesc = avgBrightness > 180 ? 'very bright' :
                avgBrightness > 130 ? 'bright' :
                    avgBrightness > 80 ? 'medium brightness' : 'dark';

            let colorDesc = '';
            if (Math.abs(avgRed - avgGreen) < 30 && Math.abs(avgGreen - avgBlue) < 30) {
                colorDesc = 'grayscale or neutral colors';
            } else if (avgRed > avgGreen + 30 && avgRed > avgBlue + 30) {
                colorDesc = 'predominantly red tones';
            } else if (avgGreen > avgRed + 30 && avgGreen > avgBlue + 30) {
                colorDesc = 'predominantly green tones';
            } else if (avgBlue > avgRed + 30 && avgBlue > avgGreen + 30) {
                colorDesc = 'predominantly blue tones';
            } else {
                colorDesc = 'mixed colors';
            }

            return `Image dimensions: ${img.width}x${img.height}px, ${brightnessDesc}, ${colorDesc}`;
        }

        function readFileAsText(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = event => resolve(event.target.result);
                reader.onerror = error => reject(error);
                reader.readAsText(file);
            });
        }

        function readFileAsArrayBuffer(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = event => resolve(event.target.result);
                reader.onerror = error => reject(error);
                reader.readAsArrayBuffer(file);
            });
        }

        async function readPdfFile(file) {
            const arrayBuffer = await readFileAsArrayBuffer(file);
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let textContent = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const text = await page.getTextContent();
                textContent += text.items.map(s => s.str).join(' ');
            }
            return textContent;
        }

        async function readDocxFile(file) {
            const arrayBuffer = await readFileAsArrayBuffer(file);
            const result = await mammoth.extractRawText({ arrayBuffer });
            return result.value;
        }

        function updateUploadedFilesDisplay() {
            const container = document.getElementById('uploadedFiles');
            container.innerHTML = appState.uploadedFiles.map((fileInfo, index) => {
                const isImage = fileInfo.type.startsWith('image/');
                if (isImage && fileInfo.content) {
                    // Show image preview - construct full data URL from base64 content
                    const imgSrc = `data:${fileInfo.type};base64,${fileInfo.content}`;
                    return `
                <div class="uploaded-file">
                    <img src="${imgSrc}" class="uploaded-file-preview" alt="${escapeHTML(fileInfo.name)}">
                    <button class="remove-file" onclick="removeFile(${index})">&times;</button>
                </div>`;
                } else {
                    // Show file icon for non-images
                    const extension = fileInfo.name.split('.').pop().toUpperCase();
                    return `
                <div class="uploaded-file">
                    <div class="uploaded-file-icon">
                        <i class="${getFileIcon(fileInfo.type)}"></i>
                        <span>${extension}</span>
                    </div>
                    <button class="remove-file" onclick="removeFile(${index})">&times;</button>
                </div>`;
                }
            }).join('');
        }

        function getFileIcon(type) {
            if (type.startsWith('image/')) return 'fas fa-image';
            if (type.startsWith('audio/')) return 'fas fa-file-audio';
            if (type.includes('pdf')) return 'fas fa-file-pdf';
            if (type.includes('word')) return 'fas fa-file-word';
            return 'fas fa-file-alt';
        }

        function escapeHTML(str) {
            return str.replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]);
        }

        function markdownToHtml(md) {
            if (!md) return "";

            const normalizeNewlines = (value) => value.replace(/\r\n?/g, '\n');

            const buildMathTex = (expr) => {
                let tex = expr.trim();

                // If the expression already contains TeX control sequences, don't try to "normalize" it.
                // (The heuristics below are for plain-text math like "2x3" and can corrupt real TeX.)
                if (/\\[a-zA-Z]+/.test(tex)) {
                    return tex.replace(/\s+/g, ' ').trim();
                }

                tex = tex
                    .replace(/[-——]/g, '-')
                    .replace(/×/g, ' \\times ')
                    .replace(/÷/g, ' \\div ')
                    .replace(/·/g, ' \\cdot ')
                    .replace(/%/g, '\\%');
                tex = tex.replace(/(\d{1,3}(?:,\d{3})*)\/(\d{1,3}(?:,\d{3})*)/g, (mm, a, b) => {
                    const num = parseInt(a.replace(/,/g, ''));
                    const den = parseInt(b.replace(/,/g, ''));
                    if (!Number.isFinite(num) || !Number.isFinite(den)) return mm;
                    if ((den === 10 || den === 100 || den === 5) && num <= den) return mm;
                    return `\\frac{${a.replace(/,/g, '')}}{${b.replace(/,/g, '')}}`;
                });

                // FIXED: Handle orphaned superscript/subscript operators to prevent MathJax errors
                // Replace standalone ^ or _ at end of string or followed by space/operator
                tex = tex.replace(/\^(?=\s|$|[+\-*/=<>)])/g, '');
                tex = tex.replace(/_(?=\s|$|[+\-*/=<>)])/g, '');
                // Replace ^ or _ not followed by a valid argument (digit, letter, or {})
                tex = tex.replace(/\^(?![0-9a-zA-Z{])/g, '');
                tex = tex.replace(/_(?![0-9a-zA-Z{])/g, '');

                return tex.replace(/\s+/g, ' ').trim();
            };

            const processInline = (text) => {
                const raw = typeof text === 'string' ? text : '';
                const trimmed = raw.trim();

                // Standalone formula line (avoid wrapping prose like "Where \\lambda = ...").
                // If this is mostly TeX (no normal lowercase words), render as display math for readability.
                const isStandaloneMathLine = (() => {
                    if (!trimmed) return false;
                    if (!/\\[a-zA-Z]+/.test(trimmed)) return false;
                    // If the model already provided explicit delimiters, don't wrap again.
                    if (trimmed.includes('$$') || trimmed.includes('\\[') || trimmed.includes('\\]') || trimmed.includes('\\(') || trimmed.includes('\\)') || /\$/.test(trimmed)) {
                        return false;
                    }
                    const noTeXCommands = trimmed.replace(/\\[a-zA-Z]+/g, '');
                    if (/[a-z]{3,}/.test(noTeXCommands)) return false;
                    if (trimmed.includes(':')) return false;
                    if (/[.?!]$/.test(trimmed)) return false;
                    return /[=^_{}]/.test(trimmed) || /\\(sum|prod|int|lim|hat|langle|rangle|rightarrow|left|right)\b/.test(trimmed);
                })();

                if (isStandaloneMathLine) {
                    const tex = buildMathTex(trimmed);
                    return `<span class="math-formula">\\[${escapeHTML(tex)}\\]</span>`;
                }

                // Auto-wrap common TeX fragments so MathJax can render them when the model omits delimiters.
                // Keep this conservative to avoid turning Windows paths like "C:\\Users\\..." into math.
                const inlineMathPlaceholders = [];
                const stashInlineMath = (expr) => {
                    const id = inlineMathPlaceholders.length;
                    inlineMathPlaceholders.push(expr);
                    return `__INLINE_MATH_${id}__`;
                };

                let textWithMath = raw;

                // Avoid double-wrapping when the model already used explicit delimiters ($...$, \(...\), \[...\]).
                const hasExplicitMathDelims = /\\\(|\\\[|\$\$|\$/.test(textWithMath);
                if (!hasExplicitMathDelims) {
                    // Bra/ket style fragments: |phi\\rangle and \\langle psi|
                    textWithMath = textWithMath.replace(/\|[^)\]}.,;:\n]{0,80}?\\rangle/g, m => stashInlineMath(m.trim()));
                    textWithMath = textWithMath.replace(/\\langle[^)\]}.,;:\n]{0,80}?\|/g, m => stashInlineMath(m.trim()));

                    // Common TeX commands (conservative allowlist).
                    const knownTeXCommand = /\\(?:boxed|frac|sqrt|mathbb|mathcal|mathrm|mathbf|mathsf|mathit|text|sum|prod|int|lim|infty|cdot|times|div|pm|le|ge|ne|approx|equiv|subset|supset|cap|cup|vee|wedge|neg|forall|exists|partial|nabla|hat|bar|tilde|vec|dot|ddot|langle|rangle|left|right|rightarrow|alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega)(?=[^A-Za-z]|$)(?:\s*\{[^}]*\})*(?:\s*_(?:\{[^}]*\}|[A-Za-z0-9()+\\-]+))?(?:\s*\^(?:\{[^}]*\}|\(?[A-Za-z0-9()+\\-]+\)?))?/g;
                    textWithMath = textWithMath.replace(knownTeXCommand, m => stashInlineMath(m.trim()));
                }

                // First, protect LaTeX commands from escaping
                const latexPlaceholders = [];
                let protectedText = textWithMath.replace(/\\(boxed|frac|sqrt|mathbb|text|sum|prod|int|lim|infty|cdot|times|div|pm|le|ge|ne|approx|equiv|subset|supset|cap|cup|vee|wedge|neg|forall|exists|partial|nabla|alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|sigma|tau|omega|Delta|Omega)\{[^}]*\}/g, (match) => {
                    const id = latexPlaceholders.length;
                    latexPlaceholders.push(match);
                    return `__LATEX_${id}__`;
                });

                // Escape HTML after protecting LaTeX
                let safe = escapeHTML(protectedText);

                // Restore LaTeX commands
                safe = safe.replace(/__LATEX_(\d+)__/g, (match, id) => latexPlaceholders[parseInt(id)]);

                // Restore auto-wrapped TeX fragments as inline math delimiters for MathJax.
                safe = safe.replace(/__INLINE_MATH_(\d+)__/g, (match, id) => {
                    const expr = inlineMathPlaceholders[parseInt(id, 10)] || '';
                    return `\\( ${escapeHTML(expr)} \\)`;
                });

                // Inline code
                // Models frequently wrap TeX in backticks; if it looks like math, unwrap it so MathJax can render.
                safe = safe.replace(/`([^`]+?)`/g, (m, code) => {
                    const trimmed = (code || '').trim();
                    const looksLikeMath =
                        trimmed.startsWith('\\[') ||
                        trimmed.startsWith('\\(') ||
                        trimmed.startsWith('$$') ||
                        /\\[a-zA-Z]+/.test(trimmed);
                    const looksLikeWindowsPath = /^[a-zA-Z]:\\\\/.test(trimmed) || trimmed.includes('\\\\Users\\\\');

                    if (looksLikeMath && !looksLikeWindowsPath) {
                        return trimmed;
                    }
                    return `<code>${code}</code>`;
                });

                // CRITICAL FIX: Process markdown formatting in the correct order
                // Use placeholders to prevent conflicts between bold and italic

                // Step 1: Replace bold+italic (***text***) with placeholder
                const boldItalicPlaceholders = [];
                safe = safe.replace(/\*\*\*(.+?)\*\*\*/g, (match, content) => {
                    const id = boldItalicPlaceholders.length;
                    boldItalicPlaceholders.push(`<strong><em>${content}</em></strong>`);
                    return `__BOLDITALIC_${id}__`;
                });

                // Step 2: Replace bold (**text**) with placeholder, handling nested italics
                const boldPlaceholders = [];
                safe = safe.replace(/\*\*(.+?)\*\*/g, (match, content) => {
                    const id = boldPlaceholders.length;
                    // Process italic markers inside bold content
                    const processed = content.replace(/\*(.+?)\*/g, '<em>$1</em>');
                    boldPlaceholders.push(`<strong>${processed}</strong>`);
                    return `__BOLD_${id}__`;
                });

                // Step 3: Replace remaining standalone italics (*text*)
                safe = safe.replace(/\*(.+?)\*/g, (match, content) => {
                    // Skip if it looks like math expression
                    if (/[\\(\\)\\[\\]{}^_]/.test(content) || /\d+[*/]\d+/.test(content)) {
                        return match;
                    }
                    // Skip if content is too long without spaces (likely false positive)
                    const words = content.split(/\s+/);
                    const hasLongWord = words.some(word => word.length > 50);
                    if (hasLongWord) {
                        return match; // Don't italicize long continuous text
                    }
                    return '<em>' + content + '</em>';
                });

                // Step 4: Restore all placeholders in reverse order
                safe = safe.replace(/__BOLD_(\d+)__/g, (match, id) => boldPlaceholders[parseInt(id)]);
                safe = safe.replace(/__BOLDITALIC_(\d+)__/g, (match, id) => boldItalicPlaceholders[parseInt(id)]);

                // Step 5: Clean up any remaining orphaned asterisks (browser-compatible approach)
                // Remove sequences of asterisks that are isolated or at boundaries
                safe = safe.replace(/(\s)\*+(\s)/g, '$1$2'); // Between spaces
                safe = safe.replace(/^\*+(\s)/g, '$1'); // At start
                safe = safe.replace(/(\s)\*+$/g, '$1'); // At end
                safe = safe.replace(/^\*+$/g, ''); // Entire string is just asterisks

                // Convert inline display math enclosed in $$...$$ on a single line
                safe = safe.replace(/\$\$([^$]+?)\$\$/g, (m, expr) => `\\[${buildMathTex(expr)}\\]`);

                // Inline math blocks using single $...$
                safe = safe.replace(/\$([^$\n]+?)\$/g, (m, expr, offset, str) => {
                    const before = str[offset - 1];
                    const after = str[offset + m.length];
                    if (before === '\\' || after === '\\') return m;
                    // Avoid catching the opening or closing of $$ blocks (already handled)
                    if (before === '$' || after === '$') return m;
                    return `\\( ${buildMathTex(expr)} \\)`;
                });

                // Clean up malformed MathJax delimiters.
                // NOTE: Do not aggressively strip \) / \] here; a later pass validates delimiter pairing and
                // removes true orphans. Over-stripping breaks valid TeX like "\( \\lambda \\)".

                // Simple fraction detection (e.g., 90/30) not inside code: convert number/number to MathJax inline if it looks like a pure fraction
                // We wrap with \( \frac{a}{b} \) so MathJax renders properly. Avoid dates (e.g., 2023/09) by limiting denominator length and excluding leading zeros combos typical of dates.
                safe = safe.replace(/\b(\d{1,4}(?:\.\d{1,3})?)\/(\d{1,4})\b/g, (m, a, b, offset, str) => {
                    const prefix = str.slice(Math.max(0, offset - 2), offset);
                    if (prefix.includes('\\(') || prefix.includes('\\[')) return m;
                    const num = parseFloat(a);
                    const den = parseInt(b);
                    // Skip if looks like a date (basic month/day style)
                    if ((num <= 12 && den <= 31) || (num <= 31 && den <= 12)) return m;
                    // Skip if looks like years (e.g., 2025/2026, 2024/25, 23/24)
                    if ((num >= 1900 && den >= 1900) || (num >= 1900 && den <= 99) || (num <= 99 && den <= 99 && num > 12)) return m;
                    // Skip common rating patterns like 7.9/10, 98/100, 9/10 etc.
                    if ((den === 10 || den === 100) && num <= den) return m;
                    // Also skip if denominator is 5 or 10 and numerator has decimal (likely rating like 4.5/5)
                    if ((den === 5 || den === 10) && a.includes('.')) return m;
                    return `\\( \\frac{${a}}{${b}} \\)`;
                });

                // Convert encoded <br> tags that came from model output back into real line breaks after escaping (safe because we only allow the exact tag)
                safe = safe.replace(/&lt;br\s*\/?>/gi, '<br>');

                // Lightweight auto-detection of finance/math style equations to render consistently via MathJax.
                // More restrictive to avoid catching plain text with numbers
                safe = safe.replace(/\b([A-Z][A-Za-z ]{1,40})\s*=\s*([0-9,().\s+\-×/%]+(?:=\s*[0-9,().\s+\-×/%]+)?)/g, (m, label, expr) => {
                    // Don't wrap if expression contains words like "to", "from", "and", "or"
                    if (/\b(to|from|and|or|the|is|are)\b/i.test(expr)) {
                        return m;
                    }
                    return `${label} = \\( ${buildMathTex(expr)} \\)`;
                });

                // FIXED: Handle "to" between numbers that might get italicized (e.g., "1,000to100,000")
                // Add spaces around "to" when it appears between numbers
                // Do this AFTER math detection to avoid creating false math expressions
                safe = safe.replace(/(\d+)(to)(\d+)/gi, '$1 $2 $3');

                // FINAL CLEANUP: Handle orphaned or malformed MathJax delimiters (lightweight, per-line).
                // Avoid regex heuristics that can strip valid closing delimiters.
                const openDisplay = (safe.match(/\\\[/g) || []).length;
                const closeDisplay = (safe.match(/\\\]/g) || []).length;
                if (openDisplay === 1 && closeDisplay === 0) {
                    safe += '\\]';
                } else if (openDisplay === 0 && closeDisplay === 1) {
                    safe = safe.replace(/\\\]/g, '');
                }

                // Handle inline math delimiters \( and \)
                safe = safe.replace(/\\\(/g, (match, offset, string) => {
                    // Look ahead from this position to find the next \)
                    const remainingText = string.substring(offset + 2); // +2 to skip past the \(
                    const closingIndex = remainingText.indexOf('\\)');

                    // If no \) found, this is orphaned - remove it
                    if (closingIndex === -1) {
                        return '';
                    }

                    // If \) is too far away (>300 chars), likely not a valid pair
                    if (closingIndex > 300) {
                        return '';
                    }

                    // Extract the content between \( and \)
                    const mathContent = remainingText.substring(0, closingIndex).trim();

                    // Check if this looks like actual math (not just plain text)
                    const hasLatexCommands = /\\[a-zA-Z]+/.test(mathContent) || /\\[^a-zA-Z\\s]/.test(mathContent);
                    const hasValidMathPattern = /[\d\w]\s*[+\-×÷=\*\/]\s*[\d\w]/.test(mathContent);
                    const isPureNumbersOnly = /^[\d,.\s]+$/.test(mathContent);
                    const containsPlainWords = /\b(to|from|and|or|the|is|are|in|on|at|substitute)\b/i.test(mathContent);
                    const hasMathSyntax = hasLatexCommands || hasValidMathPattern || isPureNumbersOnly || /[_^{}=<>]/.test(mathContent);

                    // Keep the \( if:
                    // 1. Has LaTeX commands, OR
                    // 2. Has valid math operators between numbers/variables, OR
                    // 3. Is pure numbers
                    // BUT NOT if it contains plain English words
                    if (hasMathSyntax && (hasLatexCommands || !containsPlainWords)) {
                        return match;
                    }

                    // Otherwise, this is a false positive - remove the \(
                    return '';
                });

                // Also clean up any orphaned \) that don't have matching \(
                // This handles cases where we removed the opening but closing remains
                safe = safe.replace(/\\\)/g, (match, offset, string) => {
                    // Look backward to find the most recent \(
                    const precedingText = string.substring(0, offset);
                    const openingIndex = precedingText.lastIndexOf('\\(');

                    // If no \( found before this \), it's orphaned - remove it
                    if (openingIndex === -1) {
                        return '';
                    }

                    // Check if there's already another \) between the \( and current \)
                    const betweenText = precedingText.substring(openingIndex);
                    const otherClosingIndex = betweenText.indexOf('\\)', 2); // Start from position 2 to skip the opening

                    // If there's another \) in between, this current one is extra - remove it
                    if (otherClosingIndex !== -1 && otherClosingIndex < (offset - openingIndex)) {
                        return '';
                    }

                    // Otherwise keep it
                    return match;
                });

                return safe;
            };

            let html = '';
            const normalizedMd = normalizeNewlines(md.trim());
            const lines = normalizedMd.split('\n');
            let inTable = false;
            let inOrderedList = false;
            let inMathBlock = false;
            let mathBuffer = [];

            const isListLine = (line) => /^\s*(?:[-*]|[•???¦]|\d+\.)\s+/.test(line || '');
            const isNumberedListLine = (line) => /^\s*\d+\.\s+/.test(line || '');
            const isStandaloneMathLine = (line) => {
                if (!line) return false;
                if (line.includes(':') || line.includes(';')) return false;
                const normalized = line.replace(/\s+/g, ' ').trim();
                if (normalized.length === 0) return false;
                if (!/[=±v]/.test(normalized) && !/[+\-×÷]/.test(normalized)) return false;
                if (!/[0-9]/.test(normalized) && !/(?:^|\s)[a-zA-Z]{1,2}\s*=/.test(normalized)) return false;
                if (/[^0-9a-zA-Z\s.,()+\-×÷=%<>v]/.test(normalized)) return false;
                const words = normalized.split(/\s+/).filter(Boolean);
                if (words.length > 12) return false;
                return true;
            };

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const prevLine = lines[i - 1];
                const nextLine = lines[i + 1];
                const trimmed = line.trim();

                if (inMathBlock) {
                    if (trimmed === '$$') {
                        const tex = buildMathTex(mathBuffer.join('\n'));
                        if (tex) {
                            html += `<div class="math-block">\\[${tex}\\]</div>`;
                        }
                        mathBuffer = [];
                        inMathBlock = false;
                    } else {
                        mathBuffer.push(line);
                    }
                    continue;
                }

                if (trimmed === '$$') {
                    inMathBlock = true;
                    mathBuffer = [];
                    continue;
                }

                // Check for table header
                if (nextLine && nextLine.match(/^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/) && !inTable) {
                    inTable = true;
                    html += '<div class="table-wrapper"><table class="data-table"><thead><tr>';
                    line.split('|').slice(1, -1).forEach(header => {
                        html += `<th>${processInline(header.trim())}</th>`;
                    });
                    html += '</tr></thead><tbody>';
                    i++; // Skip separator line
                }
                // Check for table rows
                else if (inTable && trimmed.startsWith('|')) {
                    html += '<tr>';
                    line.split('|').slice(1, -1).forEach(cell => {
                        html += `<td>${processInline(cell.trim())}</td>`;
                    });
                    html += '</tr>';
                }
                // End of table
                else if (inTable && !line.startsWith('|')) {
                    inTable = false;
                    html += '</tbody></table></div>';
                    // Process current line normally
                    i--;
                }
                // Regular markdown processing
                else {
                    // Check for numbered list items (e.g., "1. Item text")
                    const numberedListMatch = line.match(/^\s*(\d+)\.\s+(.*)/);
                    if (numberedListMatch) {
                        const nextIsNumbered = isNumberedListLine(nextLine);
                        const prevTrimmed = (prevLine || '').trim();
                        const continuingList = inOrderedList && isNumberedListLine(prevLine);
                        const canStartList = continuingList || ((prevTrimmed === '' || /[:ï¼š]$/.test(prevTrimmed)) && nextIsNumbered);

                        if (!continuingList && !canStartList) {
                            html += `<p>${processInline(line)}</p>`;
                            inOrderedList = false;
                            continue;
                        }

                        if (!continuingList) {
                            html += '<ol>';
                            inOrderedList = true;
                        }

                        html += `<li>${processInline(numberedListMatch[2])}</li>`;

                        if (!nextIsNumbered) {
                            html += '</ol>';
                            inOrderedList = false;
                        }
                        continue;
                    }
                    // Check for bullet list items
                    else {
                        const listItemMatch = line.match(/^\s*(?:[-*]|[•???¦])\s+(.*)/);
                        if (listItemMatch) {
                            const isFirst = !isListLine(prevLine) || isNumberedListLine(prevLine);
                            const isLast = !isListLine(nextLine) || isNumberedListLine(nextLine);
                            if (isFirst) html += '<ul>';
                            html += `<li>${processInline(listItemMatch[1])}</li>`;
                            if (isLast) html += '</ul>';
                        } else if (/^\s*(?:-{3,}|_{3,}|\*{3,})\s*$/.test(line)) {
                            continue;
                        } else if (isStandaloneMathLine(trimmed)) {
                            html += `<div class="math-block">\\[${buildMathTex(trimmed)}\\]</div>`;
                        } else if (line.match(/^#+\s/)) {
                            const headingMatch = line.match(/^(#+)\s+(.*)/);
                            const level = headingMatch[1].length;
                            // FIXED: Use processInline() for headings to handle bold/italic formatting
                            html += `<h${level}>${processInline(headingMatch[2])}</h${level}>`;
                        } else if (line.trim() !== '') {
                            html += `<p>${processInline(line)}</p>`;
                        }
                    }
                }
            }
            if (inMathBlock && mathBuffer.length) {
                const tex = buildMathTex(mathBuffer.join('\n'));
                if (tex) {
                    html += `<div class="math-block">\\[${tex}\\]</div>`;
                }
            }
            if (inTable) html += '</tbody></table></div>';
            // Replace any lingering escaped <br> tags that appear visibly in output (e.g., "<br>")
            // This specifically targets sequences that ended up double-escaped and are now shown as text inside tables.
            html = html.replace(/&lt;br\s*\/?&gt;/gi, '<br>');
            return html;
        }

        function processMessageContent(rawContent) {
            if (!rawContent) return '';
            // Normalize Windows CRLF and old Mac CR to LF to ensure code-fence regex works reliably
            const normalized = rawContent.replace(/\r\n?/g, '\n');
            // Robust code-fence matcher:
            // - Accepts optional language (any non-newline chars, trimmed)
            // - Allows optional spaces before the first newline
            // - Works with LF (after normalization)
            // Example matches: ```python\n...```, ``` py \n...```, ```\n...```
            const codeBlockRegex = /```([^\n]*)\n([\s\S]*?)```/g;
            let result = '';
            let lastIndex = 0;
            let match;

            // Isolate code blocks first
            const parts = [];
            while ((match = codeBlockRegex.exec(normalized)) !== null) {
                // Add text before the code block
                if (match.index > lastIndex) {
                    parts.push({ type: 'md', content: normalized.substring(lastIndex, match.index) });
                }
                // Add the code block
                const lang = (match[1] || '').trim() || 'code';
                parts.push({ type: 'code', lang, content: match[2].trim() });
                lastIndex = codeBlockRegex.lastIndex;
            }
            // Add any remaining text after the last code block
            if (lastIndex < normalized.length) {
                parts.push({ type: 'md', content: normalized.substring(lastIndex) });
            }

            // Process each part
            parts.forEach(part => {
                if (part.type === 'md') {
                    result += markdownToHtml(part.content);
                } else {
                    result += `
                <div class="code-block-container">
                    <div class="code-block-header">
                        <span>${part.lang}</span>
                        <button onclick="copyCode(this)"><i class="far fa-copy"></i> Copy</button>
                    </div>
                    <pre><code>${escapeHTML(part.content)}</code></pre>
                </div>`;
                }
            });

            return result;
        }

        function getResultsPerQuery() {
            const results = appState.currentSection === 'fact-checker' ? 10 : 10;
            console.log(`Current section: ${appState.currentSection}, results per query: ${results}`);
            return results;
        }

        async function performFullSearchForQuery(query, signal, site = null) {
            const results = [];
            const resultsPerQuery = getResultsPerQuery();
            const MAX_PAGES = Math.ceil(resultsPerQuery / 10);

            for (let i = 0; i < MAX_PAGES; i++) {
                const startIndex = i * 10 + 1;
                const searchFn = async (searchKeySet, localSignal) => {
                    const authToken = localStorage.getItem('authToken');
                    const payload = {
                        query,
                        num: 10,
                        start: startIndex,
                        siteSearch: site || undefined
                    };

                    const res = await fetch('/search', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${authToken}`
                        },
                        body: JSON.stringify(payload),
                        signal: localSignal
                    });

                    if (!res.ok) {
                        const errorBody = await res.text();
                        const status = res.status;
                        const err = new Error(`Search failed for "${query}" on page ${i + 1} with status ${status}. Response: ${errorBody}`);
                        err.status = status;
                        throw err;
                    }
                    return res.json();
                };

                const pageResults = await callApiWithFailover('search', searchFn, signal);
                if (pageResults.items) {
                    results.push(...pageResults.items);
                }
                if (i < MAX_PAGES - 1) await new Promise(resolve => setTimeout(resolve, 200));
            }
            return results;
        }

        async function fetchContentBatch(urls, signal) {
            if (!Array.isArray(urls) || urls.length === 0) return [];
            const authToken = localStorage.getItem('authToken');
            const response = await fetch(VPS_FETCHER_BATCH_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ urls }),
                signal
            });
            if (!response.ok) {
                const errorBody = await response.text().catch(() => '');
                const err = new Error(`Batch fetch failed with status ${response.status}. ${errorBody}`);
                err.status = response.status;
                throw err;
            }
            const data = await response.json();
            if (Array.isArray(data)) return data;
            if (Array.isArray(data.results)) return data.results;
            return [];
        }

        async function fetchContentBatchChunked(urls, signal, options = {}) {
            if (!Array.isArray(urls) || urls.length === 0) return [];
            const requestedChunkSize = Number(options.chunkSize);
            const chunkSize = Number.isFinite(requestedChunkSize) && requestedChunkSize > 0
                ? Math.floor(requestedChunkSize)
                : SOURCE_FETCH_BATCH_CHUNK_SIZE;
            const requestedDelayMs = Number(options.interChunkDelayMs);
            const interChunkDelayMs = Number.isFinite(requestedDelayMs) && requestedDelayMs >= 0
                ? Math.floor(requestedDelayMs)
                : SOURCE_FETCH_BATCH_INTER_CHUNK_DELAY_MS;
            const onChunkStart = typeof options.onChunkStart === 'function' ? options.onChunkStart : null;
            const onChunkSuccess = typeof options.onChunkSuccess === 'function' ? options.onChunkSuccess : null;
            const onChunkError = typeof options.onChunkError === 'function' ? options.onChunkError : null;

            const chunks = [];
            for (let i = 0; i < urls.length; i += chunkSize) {
                chunks.push(urls.slice(i, i + chunkSize));
            }

            const merged = [];
            let firstError = null;
            for (let i = 0; i < chunks.length; i++) {
                if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
                const chunk = chunks[i];
                const chunkInfo = {
                    chunkIndex: i + 1,
                    chunkCount: chunks.length,
                    chunkSize: chunk.length,
                    totalUrls: urls.length
                };
                try {
                    if (onChunkStart) onChunkStart(chunkInfo);
                    const chunkResults = await fetchContentBatch(chunk, signal);
                    if (Array.isArray(chunkResults) && chunkResults.length) {
                        merged.push(...chunkResults);
                    }
                    if (onChunkSuccess) onChunkSuccess({ ...chunkInfo, resultCount: Array.isArray(chunkResults) ? chunkResults.length : 0 });
                } catch (err) {
                    if (err?.name === 'AbortError') throw err;
                    if (!firstError) firstError = err;
                    if (onChunkError) onChunkError({ ...chunkInfo, error: err });
                }
                if (i < chunks.length - 1 && interChunkDelayMs > 0) {
                    await new Promise(resolve => setTimeout(resolve, interChunkDelayMs));
                }
            }

            if (merged.length === 0 && firstError) {
                throw firstError;
            }
            return merged;
        }

        // --- START: Unified History & Search Helpers ---

        function sanitizeQuery(q) {
            if (!q) return null;
            const trimmed = String(q).trim();
            if (!trimmed) return null;
            if (trimmed.length > 140) return null;
            return trimmed;
        }

        function parseSearchQueriesStrict(rawText, desiredCount) {
            const text = (rawText || '').trim();
            if (!text) throw new Error('Query generation returned empty output.');
            if (!text.startsWith('[') || !text.endsWith(']')) {
                throw new Error('Query generation did not return a pure JSON array.');
            }
            let parsed;
            try {
                parsed = JSON.parse(text);
            } catch (e) {
                throw new Error('Query generation returned invalid JSON.');
            }
            if (!Array.isArray(parsed)) {
                throw new Error('Query generation JSON root is not an array.');
            }
            if (parsed.length !== desiredCount) {
                throw new Error(`Query generation returned ${parsed.length} queries; expected ${desiredCount}.`);
            }
            const cleaned = [];
            for (const item of parsed) {
                if (typeof item !== 'string') {
                    throw new Error('Query generation contained a non-string item.');
                }
                const sanitized = sanitizeQuery(item);
                if (!sanitized) {
                    throw new Error(`Query generation produced an invalid query: "${item}"`);
                }
                cleaned.push(sanitized);
            }
            return cleaned;
        }

        function extractGeminiNonThoughtText(data) {
            const parts = data?.candidates?.[0]?.content?.parts;
            if (!Array.isArray(parts)) return '';
            return parts
                .filter(part => part && !part.thought && typeof part.text === 'string')
                .map(part => part.text)
                .join('')
                .trim();
        }

        function parseSearchQueries(rawText, desiredCount) {
            let text = (rawText || '').trim();
            text = text.replace(/^```json\s*/i, '').replace(/^```javascript\s*/i, '').replace(/```$/g, '');
            const firstBracket = text.indexOf('[');
            const lastBracket = text.lastIndexOf(']');
            if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
                text = text.slice(firstBracket, lastBracket + 1);
            }
            let arr = [];
            try {
                const parsed = JSON.parse(text);
                if (Array.isArray(parsed)) arr = parsed; else throw new Error('Root is not array');
            } catch (e) {
                const quoted = text.match(/"([^"\\]*(?:\\.[^"\\]*)*)"/g);
                if (quoted && quoted.length) {
                    arr = quoted.map(s => s.replace(/^"|"$/g, ''));
                } else {
                    arr = text.split(/\n|,/).filter(l => /[a-zA-Z]/.test(l));
                }
            }
            const cleaned = [];
            for (let q of arr) {
                if (typeof q !== 'string') continue;
                const s = sanitizeQuery(q);
                if (!s) continue;
                cleaned.push(s);
                if (cleaned.length >= desiredCount) break;
            }
            return cleaned;
        }

        function throwIfAborted(signal) {
            if (signal?.aborted) {
                throw new DOMException('Aborted', 'AbortError');
            }
        }

        function buildFallbackQueries(text, n) {
            const words = (text || '').toLowerCase()
                .replace(/[^a-z0-9\s]/g, ' ')
                .split(/\s+/).filter(w => w.length > 3);
            const uniq = [...new Set(words)];
            const chunks = [];
            for (let i = 0; i < uniq.length && chunks.length < n; i += 3) {
                chunks.push(uniq.slice(i, i + 3).join(' '));
            }
            if (chunks.length === 0) chunks.push(text.slice(0, 60));
            return chunks.slice(0, n).map(q => q.trim()).filter(Boolean);
        }

        function buildUnifiedHistory(currentUserMessage, additionalTextForCurrent = '', includeHistory = true, systemPrompt = '') {
            const currentChat = appState.chats.find(chat => chat.id === appState.currentChatId);
            const history = currentChat ? currentChat.messages.filter(m => m.id !== currentUserMessage.id) : [];
            const unifiedMessages = [];

            if (systemPrompt) {
                unifiedMessages.push({ role: 'system', content: [{ type: 'text', text: systemPrompt }] });
            }

            // Helper to process files into content items
            const processFilesForContent = (files, textBuilder) => {
                const mediaItems = [];
                if (files && files.length > 0) {
                    textBuilder.push("\n\n--- User Uploaded Files ---\n");
                    files.forEach(file => {
                        // Check if this is a Gemini-native file type
                        const isGeminiNative = file.isNativeGeminiFile || isGeminiNativeFile(file.type);

                        if (file.type.startsWith('image/')) {
                            // Images: add as media item for Gemini, add description for text
                            textBuilder.push(`\n[Image Content from file: ${file.name}]\n`);
                            mediaItems.push({
                                type: 'image',
                                mimeType: file.type,
                                data: file.content,
                                name: file.name,
                                ocrData: file.ocrData,
                                isNativeGeminiFile: isGeminiNative
                            });
                        } else if (file.type.startsWith('audio/')) {
                            // Audio: add as media item for Gemini
                            textBuilder.push(`\n[Audio Content from file: ${file.name}]\n`);
                            mediaItems.push({
                                type: 'audio',
                                mimeType: file.type,
                                data: file.content,
                                name: file.name,
                                isNativeGeminiFile: isGeminiNative
                            });
                        } else if (file.type === 'application/pdf') {
                            // PDFs: add as media item for Gemini native handling
                            // Also include extracted text for non-Gemini fallback
                            textBuilder.push(`\n[PDF Document: ${file.name}]\n`);
                            if (file.extractedTextContent) {
                                // Add extracted text for non-Gemini models
                                textBuilder.push(`\n--- Text from ${file.name} ---\n${file.extractedTextContent}\n--- End of ${file.name} ---\n`);
                            } else if (!isGeminiNative && file.content && typeof file.content === 'string' && !file.content.match(/^[A-Za-z0-9+/=]+$/)) {
                                // If not base64, it's extracted text from old processing
                                textBuilder.push(`\n--- Start of file: ${file.name} ---\n${file.content}\n--- End of file: ${file.name} ---\n`);
                            }
                            // Add as native file for Gemini
                            mediaItems.push({
                                type: 'document',
                                mimeType: file.type,
                                data: file.content,
                                name: file.name,
                                isNativeGeminiFile: isGeminiNative,
                                extractedTextContent: file.extractedTextContent
                            });
                        } else {
                            // Text-based files (txt, docx, etc.)
                            textBuilder.push(`\n--- Start of file: ${file.name} ---\n${file.content}\n--- End of file: ${file.name} ---\n`);
                        }
                    });
                }
                return mediaItems;
            };

            if (includeHistory) {
                for (let msg of history) {
                    if (msg.role === 'user') {
                        const content = [];
                        const textParts = [msg.content || ''];
                        const mediaItems = processFilesForContent(msg.files, textParts);

                        content.push({ type: 'text', text: textParts.join('') });
                        mediaItems.forEach(item => content.push(item));

                        unifiedMessages.push({ role: 'user', content });
                    } else if (msg.role === 'assistant') {
                        const hasGeneratedImages = msg.hasGeneratedImages ||
                            (msg.content && msg.content.includes('class="ai-generated-image-container"'));

                        if (hasGeneratedImages) {
                            // Never include base64 HTML in model history; it can explode token counts.
                            let textContent = stripInlineBase64MediaFromText(msg.content || '').trim();
                            if (!textContent) {
                                textContent = '[AI generated an image in this response]';
                            } else {
                                textContent = textContent + '\n\n[AI generated image attached to this response]';
                            }
                            unifiedMessages.push({ role: 'assistant', content: [{ type: 'text', text: textContent }] });
                        } else if (Array.isArray(msg.geminiParts) && msg.geminiParts.length) {
                            // Filter out thought parts to prevent context pollution
                            // Thoughts from previous responses can confuse the model about current queries
                            const filteredGeminiParts = msg.geminiParts.filter(p => {
                                if (!p) return false;
                                if (p.thought === true) return false;
                                // Filter out inlineData images (they are huge and should never be replayed)
                                if (p.inlineData) {
                                    const mt = p.inlineData.mimeType || p.inlineData.mime_type || '';
                                    if (mt.startsWith('image/')) return false;
                                }
                                if (p.inline_data) {
                                    const mt = p.inline_data.mime_type || p.inline_data.mimeType || '';
                                    if (mt.startsWith('image/')) return false;
                                }
                                return true;
                            });
                            const geminiContent = filteredGeminiParts
                                .map(part => ({ type: 'gemini-part', part }));
                            if (geminiContent.length) {
                                unifiedMessages.push({ role: 'assistant', content: geminiContent });
                            } else {
                                // If all parts were thoughts, fall back to text content
                                unifiedMessages.push({ role: 'assistant', content: [{ type: 'text', text: stripInlineBase64MediaFromText(msg.content || '') || '' }] });
                            }
                        } else {
                            unifiedMessages.push({ role: 'assistant', content: [{ type: 'text', text: stripInlineBase64MediaFromText(msg.content || '') || '' }] });
                        }
                    }
                }
            }

            const currentContent = [];
            const currentTextParts = [currentUserMessage.content || ''];
            if (additionalTextForCurrent) {
                currentTextParts.push(`\n\n${additionalTextForCurrent}`);
            }

            const currentMediaItems = processFilesForContent(currentUserMessage.files, currentTextParts);
            currentContent.push({ type: 'text', text: currentTextParts.join('') });
            currentMediaItems.forEach(item => currentContent.push(item));

            unifiedMessages.push({ role: 'user', content: currentContent });
            return unifiedMessages;
        }

        // Helper to check if a thoughtSignature looks like a valid Base64 encoded value from the API
        // Invalid/synthetic signatures start with simple prefixes like "thought-" or "__synthetic_"
        function isValidThoughtSignature(sig) {
            if (typeof sig !== 'string' || !sig) return false;
            // Synthetic signatures we generate locally
            if (sig.startsWith('__synthetic_') || sig.startsWith('thought-')) return false;
            // Valid Base64 signatures from API are typically longer and contain valid Base64 characters
            // They should not be simple text patterns
            // A real signature is typically a longer Base64 string
            if (sig.length < 10) return false;
            // Check for valid Base64 characters (rough check)
            const base64Regex = /^[A-Za-z0-9+/=_-]+$/;
            return base64Regex.test(sig);
        }

        // Sanitize a Gemini part to remove invalid thoughtSignature values
        function sanitizeGeminiPart(part) {
            if (!part) return part;

            // If this is a thought part, strip the verbose text to prevent context pollution
            // but preserve the signature required for reasoning state.
            if (part.thought === true) {
                if (part.thoughtSignature && isValidThoughtSignature(part.thoughtSignature)) {
                    return {
                        thought: true,
                        thoughtSignature: part.thoughtSignature
                    };
                }
                return null;
            }

            if (part.thoughtSignature && !isValidThoughtSignature(part.thoughtSignature)) {
                // Clone the part without the invalid signature
                const { thoughtSignature, ...cleanPart } = part;
                return cleanPart;
            }
            return part;
        }

        // Filter out thought parts from geminiParts - thoughts should not be included in history
        // as they can confuse the model about what it should focus on in new queries.
        // HOWEVER, Gemini 3 models require thought signatures to be passed back to maintain state.
        function filterOutThoughtParts(geminiParts) {
            if (!Array.isArray(geminiParts)) return [];
            return geminiParts.filter(part => {
                if (!part) return false;
                // Filter out parts that are thoughts (thought: true), UNLESS they have a valid signature
                if (part.thought === true) {
                    // If it has a valid thought signature, we must keep it for Gemini 3 context
                    if (part.thoughtSignature && isValidThoughtSignature(part.thoughtSignature)) {
                        return true;
                    }
                    return false;
                }
                // Filter out inlineData images (huge; never replay into history)
                if (part.inlineData) {
                    const mt = part.inlineData.mimeType || part.inlineData.mime_type || '';
                    if (mt.startsWith('image/')) return false;
                }
                if (part.inline_data) {
                    const mt = part.inline_data.mime_type || part.inline_data.mimeType || '';
                    if (mt.startsWith('image/')) return false;
                }
                return true;
            });
        }

        function convertUnifiedToGemini(unifiedMessages) {
            const contents = [];
            for (const msg of unifiedMessages) {
                if (msg.role === 'system') continue;
                const parts = [];
                const hasGeminiParts = Array.isArray(msg.geminiParts) && msg.geminiParts.length;
                if (hasGeminiParts) {
                    // Filter out thought parts to prevent context pollution from previous reasoning
                    const filteredParts = filterOutThoughtParts(msg.geminiParts);
                    filteredParts.forEach(part => {
                        if (part) {
                            // Sanitize to remove any invalid thoughtSignature values
                            const sanitized = sanitizeGeminiPart(part);
                            if (sanitized) {
                                parts.push(sanitized);
                            }
                        }
                    });
                } else {
                    for (const item of msg.content) {
                        if (item.type === 'text') {
                            parts.push({ text: item.text });
                        } else if (item.type === 'image') {
                            // Vertex AI expects camelCase keys for inline binary data
                            // Images are sent directly to Gemini API without client processing
                            parts.push({ inlineData: { mimeType: item.mimeType, data: item.data } });
                        } else if (item.type === 'audio') {
                            // Audio files are natively supported by Gemini - send as inlineData
                            parts.push({ inlineData: { mimeType: item.mimeType, data: item.data } });
                        } else if (item.type === 'document') {
                            // PDF documents are natively supported by Gemini with vision capabilities
                            // Send as inlineData for native processing
                            if (item.isNativeGeminiFile && item.data) {
                                parts.push({ inlineData: { mimeType: item.mimeType, data: item.data } });
                            }
                        } else if (item.type === 'gemini-part' && item.part) {
                            // Filter out thought parts and sanitize
                            if (item.part.thought !== true) {
                                parts.push(sanitizeGeminiPart(item.part));
                            }
                        }
                    }
                }
                // Only add the message if it has actual content parts
                if (parts.length > 0) {
                    contents.push({ role: msg.role === 'assistant' ? 'model' : 'user', parts: parts });
                }
            }
            return contents;
        }

        function convertUnifiedToOpenAI(unifiedMessages, useOCR = false) {
            const messages = [];
            for (const msg of unifiedMessages) {
                if (msg.role === 'system') {
                    messages.push({ role: 'system', content: msg.content[0].text });
                    continue;
                }
                const content = [];
                for (const item of msg.content) {
                    if (item.type === 'text') {
                        let text = item.text;
                        if (useOCR && msg.role === 'user') {
                            // Add OCR data for images when using non-vision models
                            const images = msg.content.filter(i => i.type === 'image');
                            for (const img of images) {
                                if (img.ocrData) {
                                    text += `\n--- Image: ${img.name} ---\n`;
                                    text += `Visual Analysis: ${img.ocrData.imageAnalysis}\n`;
                                    text += `Text Extracted from Image (OCR):\n${img.ocrData.extractedText}\n`;
                                    text += `OCR Confidence: ${Math.round(img.ocrData.confidence)}%\n`;
                                }
                            }
                            // For audio files in non-vision models, just note their presence
                            const audioFiles = msg.content.filter(i => i.type === 'audio');
                            for (const audio of audioFiles) {
                                text += `\n--- Audio File: ${audio.name} ---\n`;
                                text += `[Audio content cannot be processed by this model]\n`;
                            }
                            // For PDFs, use extracted text
                            const docFiles = msg.content.filter(i => i.type === 'document');
                            for (const doc of docFiles) {
                                if (doc.extractedTextContent) {
                                    text += `\n--- Document: ${doc.name} ---\n`;
                                    text += doc.extractedTextContent;
                                    text += `\n--- End of ${doc.name} ---\n`;
                                }
                            }
                        }
                        content.push({ type: 'text', text: text });
                    } else if (item.type === 'image') {
                        if (!useOCR) {
                            content.push({ type: 'image_url', image_url: { url: `data:${item.mimeType};base64,${item.data}` } });
                        }
                    } else if (item.type === 'audio') {
                        // Audio is not supported by OpenAI-compatible APIs in the same way
                        // The text description was already added in the text processing above
                    } else if (item.type === 'document') {
                        // Document content is handled via extracted text in the text processing above
                    } else if (item.type === 'gemini-part' && item.part) {
                        // Handle gemini-part content from previous Gemini model responses
                        // Extract text content from gemini parts for OpenAI-compatible APIs
                        // Skip thought parts as they shouldn't be included in conversation history
                        if (item.part.thought !== true && item.part.text) {
                            content.push({ type: 'text', text: item.part.text });
                        }
                    }
                }
                // Only add messages that have content
                if (content.length > 0) {
                    messages.push({ role: msg.role, content: content });
                } else if (msg.role === 'assistant') {
                    // Fallback: if assistant message has no extractable content,
                    // try to use text directly from the msg if available elsewhere
                    // This prevents empty assistant messages in the conversation
                    messages.push({ role: msg.role, content: [{ type: 'text', text: '[Previous response]' }] });
                }
            }
            return messages;
        }
        // --- END: Unified History & Search Helpers ---

        function buildUserParts(userMessage, additionalText = '') {
            let textContent = userMessage.content || '';
            if (additionalText) {
                textContent += `\n\n${additionalText}`;
            }
            if (userMessage.files && userMessage.files.length > 0) {
                textContent += "\n\n--- User Uploaded Files ---\n";
                userMessage.files.forEach(file => {
                    if (file.type.startsWith('image/')) {
                        textContent += `\n[Image Content from file: ${file.name}]\n`;
                    } else if (file.type.startsWith('audio/')) {
                        textContent += `\n[Audio Content from file: ${file.name}]\n`;
                    } else if (file.type === 'application/pdf') {
                        textContent += `\n[PDF Document: ${file.name}]\n`;
                    } else {
                        textContent += `\n--- Start of file: ${file.name} ---\n${file.content}\n--- End of file: ${file.name} ---\n`;
                    }
                });
            }
            const parts = [{ text: textContent }];
            if (userMessage.files) {
                userMessage.files.forEach(file => {
                    // Handle all Gemini-native file types
                    if (file.type.startsWith('image/')) {
                        parts.push({ inlineData: { data: file.content, mimeType: file.type } });
                    } else if (file.type.startsWith('audio/')) {
                        // Audio files are natively supported by Gemini
                        parts.push({ inlineData: { data: file.content, mimeType: file.type } });
                    } else if (file.type === 'application/pdf' && file.isNativeGeminiFile) {
                        // PDFs are natively supported by Gemini with vision
                        parts.push({ inlineData: { data: file.content, mimeType: file.type } });
                    }
                });
            }
            return parts;
        }

        function buildGeminiContents(currentUserMessage, additionalTextForCurrent = '', includeHistory = true) {
            const unified = buildUnifiedHistory(currentUserMessage, additionalTextForCurrent, includeHistory);
            return convertUnifiedToGemini(unified);
        }

        function buildGeminiContentsUserOnly(currentUserMessage, additionalTextForCurrent = '', includeUserHistory = true) {
            const unified = buildUnifiedHistory(currentUserMessage, additionalTextForCurrent, includeUserHistory);
            const filtered = unified.filter(m => m.role !== 'assistant');
            return convertUnifiedToGemini(filtered);
        }

        function buildOpenAIMessages(currentUserMessage, additionalTextForCurrent = '', includeHistory = true, systemPrompt = '', useOCR = false) {
            const unified = buildUnifiedHistory(currentUserMessage, additionalTextForCurrent, includeHistory, systemPrompt);
            return convertUnifiedToOpenAI(unified, useOCR);
        }

        function buildOpenAIMessagesUserOnly(currentUserMessage, additionalTextForCurrent = '', includeUserHistory = true, systemPrompt = '', useOCR = false) {
            const unified = buildUnifiedHistory(currentUserMessage, additionalTextForCurrent, includeUserHistory, systemPrompt);
            const filtered = unified.filter(m => m.role !== 'assistant');
            return convertUnifiedToOpenAI(filtered, useOCR);
        }

        function buildContextWindow(parts, maxLength) {
            if (!Array.isArray(parts) || parts.length === 0 || maxLength <= 0) {
                return { text: '', wasTruncated: false };
            }

            const sanitized = parts
                .map(part => typeof part === 'string' ? part.trim() : '')
                .filter(part => part.length > 0);

            if (sanitized.length === 0) {
                return { text: '', wasTruncated: false };
            }

            let remaining = maxLength;
            const outputParts = [];
            let truncated = false;

            for (let index = 0; index < sanitized.length; index++) {
                if (remaining <= 0) {
                    truncated = true;
                    break;
                }

                const part = sanitized[index];
                const remainingParts = sanitized.length - index;
                const averageShare = Math.floor(remaining / remainingParts);
                const minReasonable = Math.max(256, Math.floor(maxLength / sanitized.length));
                let allocation = averageShare;

                if (allocation < minReasonable && remaining >= minReasonable * remainingParts) {
                    allocation = minReasonable;
                }

                if (remainingParts > 1) {
                    const maxAllowed = remaining - Math.max(0, (remainingParts - 1) * Math.max(1, Math.floor(averageShare / 2)));
                    if (maxAllowed > 0) {
                        allocation = Math.min(allocation, maxAllowed);
                    }
                }

                allocation = Math.max(1, Math.min(allocation, part.length, remaining));

                let snippet = part.slice(0, allocation);

                if (snippet.length < part.length) {
                    truncated = true;
                    if (snippet.length + CONTEXT_TRUNCATION_NOTICE.length <= remaining) {
                        snippet += CONTEXT_TRUNCATION_NOTICE;
                        allocation = snippet.length;
                    } else {
                        snippet = snippet.slice(0, remaining);
                        allocation = snippet.length;
                    }
                }

                outputParts.push(snippet);
                remaining -= allocation;

                if (index < sanitized.length - 1) {
                    if (remaining > 0) {
                        outputParts.push('\n');
                        remaining -= 1;
                    } else {
                        truncated = true;
                    }
                }
            }

            let text = outputParts.join('');
            if (text.length > maxLength) {
                text = text.slice(0, maxLength);
                truncated = true;
            }

            return { text, wasTruncated: truncated };
        }

        async function executeWebSearch(userMessage, placeholderEl, numQueries, signal) {
            try {
                displaySearchProcess(placeholderEl);
                updateSearchStatus(placeholderEl, 'Connecting...');
                const selectedModel = models[appState.currentModel];
                const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
                const provider = selectedModel.provider;

                if (!['google', 'chutes', 'megallm'].includes(provider)) {
                    return {
                        isError: true,
                        data: '?  Web search mode is only available for the selected model. Please switch to a supported model or disable web search.'
                    };
                }

                const sanitizeAndFilterQueries = (list, maxCount) => {
                    const cleaned = [];
                    for (const item of list) {
                        const sanitized = sanitizeQuery(item);
                        if (!sanitized) continue;
                        cleaned.push(sanitized);
                        if (maxCount && cleaned.length >= maxCount) break;
                    }
                    return cleaned;
                };

                const summarizeResultsForContext = (results, maxItems = 100) => {
                    if (!Array.isArray(results) || results.length === 0) return '';
                    return results.slice(0, maxItems).map(item => {
                        const title = item?.title ? `Title: ${item.title}` : '';
                        const snippet = item?.snippet ? `Snippet: ${item.snippet}` : '';
                        return [title, snippet].filter(Boolean).join(' \u2014 ');
                    }).filter(Boolean).join('\n');
                };

                const labelTextMap = {
                    primary: 'primary sources',
                    followUp: 'follow-up sources',
                    social: 'social sources'
                };

                const aggregatedSources = new Map();
                const aggregatedContentParts = [];
                const seenLinks = new Set();

                const generateQueries = async ({ desiredCount, contextText = '', avoid = [], purpose = 'general' }) => {
                    const trimmedContext = (contextText || '').trim().slice(0, 6000);
                    const avoidList = [];
                    const maxItems = desiredCount;
                    const includeJsonRules = provider !== 'google';

                    // Different prompts for initial vs follow-up queries
                    let queryPrompt;
                    if (purpose === 'initial') {
                        // Initial query prompt - focus on the user's exact question
                        const requirementLines = [
                            'Focus on authoritative, up-to-date sources that will help answer or verify the user\'s request.',
                            'Do NOT explain your reasoning. Do NOT respond conversationally.',
                            'Generate queries that directly search for information about the topic in the user\'s request.',
                            'Be PRECISE about what the user is asking for. If they ask for a "theme song", search specifically for "theme song" or "main theme" or "opening/ending song", NOT "insert song" or "soundtrack".',
                            'When the user references something from a previous response (e.g., "this music", "that movie"), extract the exact name/title from the assistant\'s previous response and use it in your queries.'
                        ];
                        if (includeJsonRules) {
                            requirementLines.unshift(
                                'Output ONLY valid JSON (no prose, comments, or code fences).',
                                `The JSON MUST be an array of ${desiredCount} unique, non-empty strings.`,
                                'Each string is a standalone Google search query (no numbering or markdown).'
                            );
                        }
                        queryPrompt = [
                            `You are a search query generation expert. Your task is to create ${desiredCount} distinct, concise, and highly relevant Google search queries based on the user's request.`,
                            'CRITICAL: You have access to the FULL conversation history including both user messages AND assistant responses. When the user uses pronouns like "it", "this", "that", "the song", "the music", "this movie", etc., you MUST look at your previous assistant responses to understand exactly what they are referring to.',
                            'For example, if you previously answered about a song called "Blush" and the user asks "rate this song", your queries must be about "Blush", NOT a random song.',
                            'REQUIREMENTS:',
                            ...requirementLines.map(line => `- ${line}`),
                            `The current date is ${currentDate}.`
                        ].filter(Boolean).join('\n\n');
                    } else {
                        // Follow-up/clarification query prompt - critically analyze gathered info
                        const contextInstruction = trimmedContext
                            ? `You have already gathered the following findings from earlier searches:\n${trimmedContext}\n\nCRITICALLY ANALYZE this gathered information against the user's ORIGINAL question. Check if the information actually answers what the user asked for, or if there's a mismatch (e.g., user asked for "theme song" but you found "insert song" info instead).`
                            : '';
                        const avoidInstruction = '';
                        const requirementLines = [
                            'If you detect a mismatch between what user asked and what was found, prioritize CORRECTIVE queries.',
                            'Do NOT just generate more queries about what you already found - critically check if it\'s the RIGHT information first.'
                        ];
                        if (includeJsonRules) {
                            requirementLines.unshift(
                                'Output ONLY valid JSON (no prose, comments, or code fences).',
                                `The JSON MUST be an array of ${desiredCount} unique, non-empty strings.`,
                                'Each string is a standalone Google search query.'
                            );
                        }
                        queryPrompt = [
                            `You are a verification and correction expert. Your task is to generate ${desiredCount} NEW search queries to either verify facts or CORRECT mistakes from earlier searches.`,
                            'CRITICAL SELF-CHECK: Before generating queries, analyze:',
                            '1. What did the user ACTUALLY ask for? (e.g., "theme song", "main character", "ending")',
                            '2. What did the gathered sources ACTUALLY contain? (e.g., maybe they contain info about a different song, wrong character, etc.)',
                            '3. Is there a MISMATCH? If yes, generate queries to find the CORRECT information.',
                            '',
                            'COMMON MISTAKES TO WATCH FOR:',
                            '- User asked for "theme song" but sources discuss "insert song" or "background music" - GENERATE NEW queries for the actual theme/opening/ending song',
                            '- User asked about a specific character but sources discuss a different character',
                            '- User asked for lyrics of one song but sources contain lyrics of a different song',
                            '',
                            contextInstruction,
                            avoidInstruction,
                            'REQUIREMENTS:',
                            ...requirementLines.map(line => `- ${line}`),
                            `The current date is ${currentDate}.`
                        ].filter(Boolean).join('\n\n');
                    }

                    let queries = [];

                    if (provider === 'google') {
                        try {
                            // Use buildGeminiContents (with full history including assistant responses)
                            // This is critical for follow-up queries where the user references
                            // information from the assistant's previous response (e.g., "this music", "that song")
                            const contents = buildGeminiContents(userMessage, '', true);
                            const basePayload = {
                                contents,
                                systemInstruction: { role: 'system', parts: [{ text: queryPrompt }] },
                                safetySettings: getGeminiSafetySettings()
                            };
                            const { generationConfig } = buildGeminiGenerationConfig({
                                responseMimeType: 'application/json',
                                responseSchema: { type: 'array', items: { type: 'string' }, minItems: desiredCount, maxItems: desiredCount }
                            }, selectedModel);
                            if (generationConfig && Object.keys(generationConfig).length > 0) {
                                basePayload.generationConfig = generationConfig;
                            }
                            // Call fetchGeminiContent directly
                            const runtime = getThinkingRuntime(placeholderEl);
                            const beforeThoughtCount = runtime?.thoughtKeys?.length || 0;
                            const querySignaturePrefix = `qgen-${generateId()}-`;
                            const data = await fetchGeminiContent(selectedModel.googleModelName, null, basePayload, signal, {
                                placeholderEl,
                                suppressContent: true,
                                signaturePrefix: querySignaturePrefix,
                                errorContext: 'Query generation'
                            });

                            const rawText = extractGeminiNonThoughtText(data);
                            const afterThoughtCount = runtime?.thoughtKeys?.length || 0;
                            if (afterThoughtCount === beforeThoughtCount) {
                                appendThinkingParts(placeholderEl, extractGeminiThoughtParts(data), { signaturePrefix: querySignaturePrefix });
                            }
                            if (!rawText) {
                                throw new Error('Invalid response structure from query generation API.');
                            }
                            console.debug(`[QueryGen][${purpose}][Raw]`, rawText);
                            queries = parseSearchQueriesStrict(rawText, desiredCount);
                        } catch (err) {
                            if (err?.name === 'AbortError') throw err;
                            console.warn('Gemini query generation failed.', err);
                            throw err;
                        }
                    } else if (provider === 'megallm') {
                        // Use MegaLLM (OpenAI-compatible) to generate STRICT JSON array of queries
                        // Use buildOpenAIMessages (with full history including assistant responses)
                        // This is critical for follow-up queries where the user references
                        // information from the assistant's previous response (e.g., "this music", "that song")
                        const megaPrompt = `${queryPrompt}\n\nReturn ONLY a minified JSON array containing exactly ${desiredCount} distinct search queries.`;
                        const useOCR = false; // no need for OCR when drafting queries
                        const messages = buildOpenAIMessages(userMessage, '', true, megaPrompt, useOCR);
                        try {
                            const runtime = getThinkingRuntime(placeholderEl);
                            const beforeThoughtCount = runtime?.thoughtKeys?.length || 0;
                            const querySignaturePrefix = `qgen-${generateId()}-`;
                            const resp = await callMegaLLMChat(
                                selectedModel,
                                messages,
                                signal,
                                {
                                    temperature: 0.2,
                                    stream: true,
                                    placeholderEl,
                                    suppressContent: true,
                                    signaturePrefix: querySignaturePrefix,
                                    effort: appState.extendThinking ? 'high' : 'medium',
                                    responseFormat: {
                                        type: 'json_schema',
                                        json_schema: {
                                            name: 'search_queries',
                                            schema: { type: 'array', items: { type: 'string' }, minItems: desiredCount, maxItems: desiredCount },
                                            strict: true
                                        }
                                    }
                                }
                            );
                            let rawText = extractTextFromOpenAIResponse(resp) || '';
                            const afterThoughtCount = runtime?.thoughtKeys?.length || 0;
                            if (afterThoughtCount === beforeThoughtCount) {
                                const reasoningText = extractReasoningFromOpenAIResponse(resp);
                                appendThinkingText(placeholderEl, reasoningText);
                            }
                            // Fallback: if schema output arrived as structured content only
                            if (!rawText && resp?.choices?.[0]?.message?.content) {
                                const part = resp.choices[0].message.content.find(p => p?.type === 'output_json' && (p.output_json || p.json));
                                if (part) {
                                    rawText = typeof part.output_json === 'string' ? part.output_json : JSON.stringify(part.output_json || part.json || []);
                                }
                            }
                            console.debug(`[QueryGen][${purpose}][MegaLLM Raw]`, rawText);
                            queries = parseSearchQueries(rawText, maxItems);
                        } catch (err) {
                            console.warn('MegaLLM query generation failed, falling back.', err);
                            queries = [];
                        }
                    } else {
                        // Use buildOpenAIMessages (with full history including assistant responses)
                        // This is critical for follow-up queries where the user references
                        // information from the assistant's previous response (e.g., "this music", "that song")
                        const chutesPrompt = `${queryPrompt}\n\nReturn ONLY a JSON array containing ${desiredCount} distinct search queries.`;
                        const useOCR = !modelSupportsVision(appState.currentModel);
                        const messages = buildOpenAIMessages(userMessage, '', true, chutesPrompt, useOCR);
                        try {
                            const chutesResponse = await callChutesChat(selectedModel, messages, signal, { temperature: 0.2, effort: 'high' });
                            const rawText = extractTextFromOpenAIResponse(chutesResponse) || '';
                            const reasoningText = extractReasoningFromOpenAIResponse(chutesResponse);
                            appendThinkingText(placeholderEl, reasoningText);
                            console.debug(`[QueryGen][${purpose}][Raw]`, rawText);
                            queries = parseSearchQueries(rawText, maxItems);
                        } catch (err) {
                            console.warn('Chutes query generation failed, falling back.', err);
                            queries = [];
                        }
                    }

                    let filtered = sanitizeAndFilterQueries(queries, desiredCount);
                    if (filtered.length !== desiredCount) {
                        throw new Error(`Query generation failed: expected ${desiredCount} valid queries, got ${filtered.length}.`);
                    }

                    console.debug(`[QueryGen][${purpose}][Final]`, filtered);
                    return filtered;
                };

                const runSearchQueries = async (queries, signal, site = null) => {
                    const results = [];
                    for (const query of queries) {
                        if (signal.aborted) throw new Error('AbortError');
                        const queryResults = await performFullSearchForQuery(query, signal, site);
                        if (queryResults) results.push(...queryResults);
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                    return results;
                };

                const fetchSources = async (results, labelKey) => {
                    const label = labelTextMap[labelKey] || 'sources';
                    const toFetch = [];
                    for (const item of results) {
                        if (!item || !item.link) continue;
                        if (seenLinks.has(item.link)) continue;
                        seenLinks.add(item.link);
                        toFetch.push(item);
                    }
                    if (toFetch.length === 0) return;
                    updateSearchStatus(placeholderEl, `Reviewing ${toFetch.length} ${label}...`);
                    try {
                        const urlList = toFetch.map(item => item.link);
                        const batchResults = await fetchContentBatchChunked(urlList, signal, {
                            onChunkStart: ({ chunkIndex, chunkCount, totalUrls }) => {
                                updateSearchStatus(placeholderEl, `Reviewing ${label}: batch ${chunkIndex}/${chunkCount} (${totalUrls} total)...`);
                            },
                            onChunkError: ({ chunkIndex, chunkCount, error }) => {
                                console.warn(`Source fetch chunk ${chunkIndex}/${chunkCount} failed`, error);
                            }
                        });
                        const resultMap = new Map(batchResults.map(result => [result.url, result]));
                        for (const item of toFetch) {
                            const result = resultMap.get(item.link);
                            if (!result || !result.content) continue;
                            displayDebugInfo(placeholderEl, item.link, result.content);
                            let cleanedContent = result.content.replace(/\s\d+\.$/gm, '');
                            aggregatedContentParts.push(`--- Source URL: ${item.link} ---\n${cleanedContent}\n--- End of Source ---\n`);
                            let domain = '';
                            try {
                                domain = new URL(item.link).hostname.replace('www.', '');
                            } catch (err) {
                                domain = '';
                            }
                            aggregatedSources.set(item.link, { uri: item.link, title: item.title, domain });
                        }
                    } catch (err) {
                        console.warn('Batch fetch failed for sources', err);
                    }
                };

                // Removed: determineGeminiSearchScore() was causing 2-5s+ delay and searchScore was never used
                const initialQueryTarget = numQueries;

                updateSearchStatus(placeholderEl, 'Drafting initial search queries...');
                let initialQueries = await generateQueries({ desiredCount: initialQueryTarget, purpose: 'initial' });
                if (initialQueries.length !== initialQueryTarget) {
                    throw new Error(`Query generation failed: expected ${initialQueryTarget} initial queries, got ${initialQueries.length}.`);
                }

                const queryGroups = [{ title: 'Initial search focus', queries: initialQueries }];
                throwIfAborted(signal);
                updateSearchQueriesUI(placeholderEl, queryGroups);

                updateSearchStatus(placeholderEl, 'Searching primary sources based on your question...');
                const initialSearchResults = await runSearchQueries(initialQueries, signal);
                const initialMap = new Map();
                const uniqueInitialResults = [];
                for (const item of initialSearchResults) {
                    if (item && item.link && !initialMap.has(item.link)) {
                        initialMap.set(item.link, item);
                        uniqueInitialResults.push(item);
                    }
                }
                await fetchSources(uniqueInitialResults, 'primary');

                const combinedQueries = [...initialQueries];
                let followUpQueries = [];
                const initialSummary = summarizeResultsForContext(uniqueInitialResults);
                // Include the user's original question in the context so the model can compare
                const userOriginalQuestion = `USER'S ORIGINAL QUESTION: "${userMessage.content || ''}"`;
                const contextSnippet = [userOriginalQuestion, 'GATHERED INFORMATION FROM INITIAL SEARCH:', initialSummary, aggregatedContentParts.join('\n')].filter(Boolean).join('\n\n');

                updateSearchStatus(placeholderEl, 'Clarfying sources...');
                followUpQueries = await generateQueries({ desiredCount: numQueries, contextText: contextSnippet, purpose: 'follow-up' });

                if (followUpQueries.length > 0) {
                    const existing = new Set(combinedQueries.map(q => q.toLowerCase()));
                    followUpQueries.forEach(query => {
                        const norm = query.toLowerCase();
                        if (!existing.has(norm)) {
                            existing.add(norm);
                            combinedQueries.push(query);
                        }
                    });
                    queryGroups.push({ title: 'Clarifying follow-up searches', queries: followUpQueries });
                    throwIfAborted(signal);
                    updateSearchQueriesUI(placeholderEl, queryGroups);

                    updateSearchStatus(placeholderEl, 'Searching for clarifying details...');
                    const followUpResults = await runSearchQueries(followUpQueries, signal);
                    const followUpMap = new Map();
                    const uniqueFollowUpResults = [];
                    for (const item of followUpResults) {
                        if (item && item.link && !followUpMap.has(item.link)) {
                            followUpMap.set(item.link, item);
                            uniqueFollowUpResults.push(item);
                        }
                    }
                    await fetchSources(uniqueFollowUpResults, 'followUp');
                }

                if (FEATURE_FLAGS.enableTwitterSearch) {
                    updateSearchStatus(placeholderEl, 'Checking X (Twitter) for real-time discussions...');
                    const twitterResults = await runSearchQueries(combinedQueries, signal, 'x.com');
                    const twitterMap = new Map();
                    const uniqueTwitterResults = [];
                    for (const item of twitterResults) {
                        if (item && item.link && !twitterMap.has(item.link)) {
                            twitterMap.set(item.link, item);
                            uniqueTwitterResults.push(item);
                        }
                    }
                    await fetchSources(uniqueTwitterResults, 'social');
                }

                const sourcesForDisplay = Array.from(aggregatedSources.values());
                const { text: fetchedWebContext, wasTruncated } = buildContextWindow(aggregatedContentParts, WEB_CONTEXT_CHAR_LIMIT);
                const totalLength = aggregatedContentParts.reduce((sum, part) => sum + (typeof part === 'string' ? part.length : 0), 0);
                const contextMeta = {
                    totalLength,
                    returnedLength: fetchedWebContext.length,
                    wasTruncated: wasTruncated || fetchedWebContext.length < totalLength
                };
                updateSearchStatus(placeholderEl, `Collected ${sourcesForDisplay.length} sources for synthesis.`);
                return { fetchedWebContext, sourcesForDisplay, webContextMeta: contextMeta };

            } catch (error) {
                if (error.name === 'AbortError') throw error;
                console.error('Web Search process failed:', error);
                return { isError: true, data: `? Web search process failed: ${error.message}` };
            }
        }

        async function generateFactCheckerResponse(userMessage, placeholderEl, signal) {
            const selectedModel = models[appState.currentModel];
            const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            const provider = selectedModel.provider;

            if (!['google', 'chutes'].includes(provider)) {
                return {
                    isError: true,
                    data: '?  Fact Checker mode is only available for Gemini and GPT OSS models. Please switch to a supported model.'
                };
            }
            displaySearchProcess(placeholderEl);

            const allFetchedContent = [];
            const allSources = new Map();

            try {
                // Helper to perform one full step of the search process
                const performSearchStep = async (step, context, numQueries) => {
                    updateSearchStatus(placeholderEl, `Step ${step}/4: Generating search queries...`);

                    let queryGenSystemPrompt;
                    const includeJsonInstruction = provider !== 'google';
                    if (step < 3) {
                        queryGenSystemPrompt = `You are a search query generation expert. Your task is to create ${numQueries} distinct, concise, and relevant Google search queries based on the user's latest message and the full conversation history provided.

**Crucially, you must use the conversation history to understand the context, especially to resolve pronouns like "it", "they", "that", etc.**

The user's latest message is the last one in the history. Formulate queries that will find the information the user is asking for in their latest message.${includeJsonInstruction ? ' Output MUST be a JSON array of strings.' : ''} The current date is ${currentDate}.`;
                    } else {
                        let langPart = (step === 4) ? " Generate all queries in English." : "";
                        queryGenSystemPrompt = `You are a verification expert. Based on the user's prompt, the full conversation history, any uploaded files, and the gathered info, generate ${numQueries} new queries to verify facts and fill gaps.

**Crucially, you must use the conversation history to understand the context, especially to resolve pronouns like "it", "they", "that", etc.**
${langPart}

${includeJsonInstruction ? 'Output MUST be a JSON array of strings.' : ''} The current date is ${currentDate}.`;
                    }
                    const queryGenContext = `PREVIOUSLY GATHERED INFO:\n${context}`;

                    let searchQueries;
                    if (provider === 'google') {
                        const contents = buildGeminiContents(userMessage, queryGenContext, true); // Pass true to include history
                        const basePayload = {
                            contents,
                            systemInstruction: { role: 'system', parts: [{ text: queryGenSystemPrompt }] },
                            safetySettings: getGeminiSafetySettings()
                        };
                        const { generationConfig } = buildGeminiGenerationConfig({
                            responseMimeType: 'application/json',
                            responseSchema: { type: 'array', items: { type: 'string' }, minItems: numQueries, maxItems: numQueries }
                        }, selectedModel);
                        if (generationConfig && Object.keys(generationConfig).length > 0) {
                            basePayload.generationConfig = generationConfig;
                        }

                        const runtime = getThinkingRuntime(placeholderEl);
                        const beforeThoughtCount = runtime?.thoughtKeys?.length || 0;
                        const querySignaturePrefix = `factq-${generateId()}-`;
                        const data = await fetchGeminiContent(selectedModel.googleModelName, null, basePayload, signal, {
                            placeholderEl,
                            suppressContent: true,
                            signaturePrefix: querySignaturePrefix,
                            errorContext: 'Fact-check query generation'
                        });
                        const rawText = extractGeminiNonThoughtText(data);
                        const afterThoughtCount = runtime?.thoughtKeys?.length || 0;
                        if (afterThoughtCount === beforeThoughtCount) {
                            appendThinkingParts(placeholderEl, extractGeminiThoughtParts(data), { signaturePrefix: querySignaturePrefix });
                        }
                        if (!rawText) {
                            throw new Error('Invalid response structure from query generation API.');
                        }
                        searchQueries = parseSearchQueriesStrict(rawText, numQueries);
                    } else {
                        const chutesPrompt = `${queryGenSystemPrompt}\n\nReturn ONLY a JSON array containing ${numQueries} distinct search queries.`;
                        const useOCR = !modelSupportsVision(appState.currentModel);
                        const messages = buildOpenAIMessages(userMessage, queryGenContext, true, chutesPrompt, useOCR);
                        const chutesResponse = await callChutesChat(selectedModel, messages, signal, { temperature: 0.2, effort: 'high' });
                        const reasoningText = extractReasoningFromOpenAIResponse(chutesResponse);
                        appendThinkingText(placeholderEl, reasoningText);
                        const rawText = extractTextFromOpenAIResponse(chutesResponse) || '[]';
                        searchQueries = parseSearchQueries(rawText, numQueries);
                    }
                    throwIfAborted(signal);
                    updateSearchQueriesUI(placeholderEl, searchQueries);

                    let searchResultsData = [];
                    for (const query of searchQueries) {
                        searchResultsData.push(...await performFullSearchForQuery(query, signal));
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }

                    const stepUniqueResults = new Map();
                    searchResultsData.forEach(item => item && item.link && stepUniqueResults.set(item.link, item));

                    const resultsToFetch = Array.from(stepUniqueResults.values());
                    updateSearchStatus(placeholderEl, `Step ${step}/4: Reviewing ${resultsToFetch.length} new sources...`);
                    let fetchedForStep = [];
                    try {
                        const urlList = resultsToFetch.map(item => item.link);
                        const batchResults = await fetchContentBatchChunked(urlList, signal, {
                            onChunkStart: ({ chunkIndex, chunkCount, totalUrls }) => {
                                updateSearchStatus(placeholderEl, `Step ${step}/4: Reviewing sources batch ${chunkIndex}/${chunkCount} (${totalUrls} total)...`);
                            },
                            onChunkError: ({ chunkIndex, chunkCount, error }) => {
                                console.warn(`Fact-checker source fetch chunk ${chunkIndex}/${chunkCount} failed`, error);
                            }
                        });
                        const resultMap = new Map(batchResults.map(result => [result.url, result]));
                        fetchedForStep = resultsToFetch.map(item => {
                            const result = resultMap.get(item.link);
                            if (result && result.content) {
                                displayDebugInfo(placeholderEl, item.link, result.content);
                                let cleanedContent = result.content.replace(/\s\d+\.$/gm, '');
                                let domain = '';
                                try {
                                    domain = new URL(item.link).hostname.replace('www.', '');
                                } catch (err) {
                                    domain = '';
                                }
                                allSources.set(item.link, { uri: item.link, title: item.title, domain });
                                return `--- Source URL: ${item.link} ---\n${cleanedContent}\n--- End of Source ---\n`;
                            }
                            return '';
                        }).filter(Boolean);
                    } catch (err) {
                        console.warn('Batch fetch failed for fact-checker sources', err);
                    }
                    allFetchedContent.push(...fetchedForStep);
                };

                // Execute the 4 steps
                await performSearchStep(1, "None.", 6);
                await performSearchStep(2, allFetchedContent.join('\n'), 6);
                await performSearchStep(3, allFetchedContent.join('\n'), 12);
                await performSearchStep(4, allFetchedContent.join('\n'), 12); // Use all gathered content

                updateSearchStatus(placeholderEl, 'Synthesizing all information...');

                const { text: truncatedContent, wasTruncated: factContextTruncated } = buildContextWindow(allFetchedContent, FACT_CHECKER_CONTEXT_CHAR_LIMIT);
                const factCheckerContextNote = factContextTruncated ? '\n\n[Context truncated to fit API limits]' : '';

                const synthesisSystemPrompt = `You are an expert research analyst. Your goal is to synthesize information from multiple provided sources to answer the user's question comprehensively and accurately. Structure your response into 6 to 8 distinct, well-explained sections using markdown headings. Each section must be very detailed and be approximately 300 words long. Do not use any prior knowledge. If the sources do not contain the answer, state that clearly. The current date is ${currentDate}.`;

                const synthesisFn = async (localSignal) => {
                    const contents = buildGeminiContents(userMessage, `--- Full Text from All Web Sources ---\n\n${truncatedContent}${factCheckerContextNote}`, true);
                    const basePayload = {
                        contents,
                        systemInstruction: { role: 'system', parts: [{ text: synthesisSystemPrompt }] },
                        safetySettings: getGeminiSafetySettings()
                    };
                    const { generationConfig, thinkingSettings } = buildGeminiGenerationConfig(basePayload.generationConfig, selectedModel);
                    if (generationConfig && Object.keys(generationConfig).length > 0) {
                        basePayload.generationConfig = generationConfig;
                    }
                    return fetchGeminiContent(selectedModel.googleModelName, null, basePayload, localSignal, {
                        placeholderEl,
                        appliedThinking: thinkingSettings,
                        errorContext: 'Final synthesis'
                    });
                };

                let finalData;
                if (provider === 'google') {
                    finalData = await synthesisFn(signal);
                } else {
                    // Use OCR for non-vision models
                    const useOCR = !modelSupportsVision(appState.currentModel);
                    const chutesMessages = buildOpenAIMessages(
                        userMessage,
                        `--- Full Text from All Web Sources ---\n\n${truncatedContent}`,
                        true,
                        synthesisSystemPrompt,
                        useOCR
                    );
                    const chutesResponse = await callChutesChat(selectedModel, chutesMessages, signal, { temperature: 0.3, effort: 'high' });
                    const synthesizedText = extractTextFromOpenAIResponse(chutesResponse) || "Could not synthesize a final answer.";
                    finalData = wrapTextInCandidate(synthesizedText);
                }
                let finalContent = "Could not synthesize a final answer.";
                let thinkingParts = [];
                let thinkingMeta = null;
                if (provider === 'google') {
                    const appliedThinking = finalData.__thinkingSettings;
                    if (appliedThinking) delete finalData.__thinkingSettings;
                    const parsed = formatGeminiResponse(finalData, appliedThinking);
                    finalContent = parsed.text || extractGeminiPlainText(finalData) || finalContent;
                    thinkingParts = parsed.thoughts || [];
                    thinkingMeta = parsed.meta || null;
                    if (!finalContent && finalData.__safetyStop) {
                        finalContent = 'Response stopped by safety filters.';
                    }
                } else {
                    finalContent = finalData.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || finalContent;
                }

                const geminiParts = provider === 'google'
                    ? (finalData?.candidates?.[0]?.content?.parts || null)
                    : null;
                return { data: finalContent, sources: Array.from(allSources.values()), thinking: thinkingParts, thinkingMeta, geminiParts };

            } catch (error) {
                if (error.name === 'AbortError') throw error;
                console.error("Fact Checker Error:", error);
                return { isError: true, data: `? Fact Checker process failed: ${error.message}` };
            }
        }
        function displayDebugInfo(placeholderEl, sourceUrl, content) {
            if (!appState.debugEnabled) return;

            const thinking = activateThinkingUI(placeholderEl);
            if (!thinking) return;

            const entry = createThinkingStepElement({
                title: `Debug: Fetched Source`,
                bodyHTML: `<strong>URL:</strong> ${escapeHTML(sourceUrl)}<br><pre>${escapeHTML(content)}</pre>`,
                className: 'thinking-step-debug'
            });

            thinking.log.appendChild(entry);
        }

        async function generateAIResponse(userMessage, placeholderEl, signal) {
            const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            const selectedModel = models[appState.currentModel];
            const isCreateImage = appState.createImageEnabled === true;

            if (isCreateImage) {
                return await generateImageModelResponse(userMessage, placeholderEl, signal);
            }
            const provider = selectedModel?.provider;
            const supportsThinking = provider === 'google' && selectedModel.supportsThinking !== false;
            const preThinkingSettings = supportsThinking ? getGeminiThinkingSettingsForRequest(selectedModel) : null;

            if (supportsThinking) {
                initializeAssistantThinking(placeholderEl, preThinkingSettings ? { config: preThinkingSettings } : null);
            }

            // Route to the correct function based on the mode
            if (appState.currentSection === 'fact-checker') {
                return await generateFactCheckerResponse(userMessage, placeholderEl, signal);
            }



            // Handle General mode (with or without search)
            if (appState.webSearchEnabled) {
                const numQueries = 4;
                const searchResult = await executeWebSearch(userMessage, placeholderEl, numQueries, signal);
                if (searchResult.isError) return searchResult;

                updateSearchStatus(placeholderEl, 'Synthesizing final answer...');

                const synthesisSystemPrompt = (provider === 'megallm')
                    ? `You are an evidence-grounded research assistant. Web search is enabled.\n\nRules:\n- Base every claim strictly and exclusively on the '--- Text from Web Sources ---' provided below.\n- If sources are insufficient, say "Insufficient web evidence" and request additional searches instead of guessing.\n- Include concise inline citations like [1], [2] after claims; the UI will show the Sources list.\n- Do not rely on prior knowledge or fabricate URLs or quotes.\n- IMPORTANT: Pay attention to the full conversation history. If the user references something from a previous response (e.g., "this music", "that movie", "rate it"), use the context from your previous responses to understand what they are referring to.\n- CRITICAL VERIFICATION: Before answering, verify that the web sources actually contain information about what the user asked. For example, if the user asked for the "theme song" but the sources only discuss an "insert song", clearly state this distinction and that the specific information requested was not found.\n\nThe current date is ${currentDate}.`
                    : `You are an expert research assistant. Answer the user's query by synthesizing the information from the provided web sources into a comprehensive, well-written answer. Pay attention to the full conversation history - if the user references something from a previous response, use that context.\n\nCRITICAL: Verify that the sources actually answer what the user asked. If there's a mismatch (e.g., user asked for "theme song" but sources only discuss "insert song"), clearly state this and explain what information you did find vs. what was requested.\n\nThe current date is ${currentDate}.`;

                const maxContextLength = WEB_CONTEXT_CHAR_LIMIT;
                let truncatedWebContext = searchResult.fetchedWebContext || '';
                if (truncatedWebContext.length > maxContextLength) {
                    truncatedWebContext = truncatedWebContext.substring(0, maxContextLength);
                }
                if (searchResult.webContextMeta?.wasTruncated) {
                    const meta = searchResult.webContextMeta;
                    const note = `\n\n[Context truncated to ${meta.returnedLength}/${meta.totalLength} characters to fit API limits]`;
                    if (truncatedWebContext.length + note.length > maxContextLength) {
                        truncatedWebContext = truncatedWebContext.slice(0, Math.max(0, maxContextLength - note.length));
                    }
                    truncatedWebContext += note;
                }

                let finalData;
                if (provider === 'google') {
                    try {
                        const contents = buildGeminiContents(userMessage, `--- Text from Web Sources ---\n\n${truncatedWebContext}`, true);
                        const basePayload = {
                            contents,
                            systemInstruction: { role: 'system', parts: [{ text: synthesisSystemPrompt }] },
                            safetySettings: getGeminiSafetySettings()
                        };
                        const { generationConfig, thinkingSettings } = buildGeminiGenerationConfig(basePayload.generationConfig, selectedModel);
                        if (generationConfig && Object.keys(generationConfig).length > 0) {
                            basePayload.generationConfig = generationConfig;
                        }
                        finalData = await fetchGeminiContent(selectedModel.googleModelName, null, basePayload, signal, {
                            placeholderEl,
                            appliedThinking: thinkingSettings,
                            errorContext: 'Web search synthesis'
                        });
                    } catch (error) {
                        if (error.name === 'AbortError') throw error;

                                                console.warn('All Google keys failed; falling back to OpenRouter.');
                        const openRouterFn = async (unused, localSignal) => {
                            // Use OCR for OpenRouter models (they don't support vision)
                            const additionalContext = `\n\n--- Text from Web Sources ---\n\n${truncatedWebContext}`;
                            const messages = buildOpenAIMessages(userMessage, additionalContext, true, synthesisSystemPrompt, true);
                            const data = await callServerChatCompletions('openrouter', {
                                model: selectedModel.openRouterModelId,
                                messages
                            }, localSignal);
                            return { candidates: [{ content: { parts: [{ text: data.choices[0].message.content }] } }] };
                        };
                        finalData = await openRouterFn(null, signal); // OpenRouter doesn't use failover keys, pass null
                    }
                } else if (provider === 'chutes') {
                    // Use OCR for non-vision models
                    const useOCR = !modelSupportsVision(appState.currentModel);
                    const chutesMessages = buildOpenAIMessages(
                        userMessage,
                        `--- Text from Web Sources ---\n\n${truncatedWebContext}`,
                        true,
                        synthesisSystemPrompt,
                        useOCR
                    );
                    const chutesResponse = await callChutesChat(selectedModel, chutesMessages, signal, { temperature: 0.3, effort: 'high' });
                    const synthesizedText = extractTextFromOpenAIResponse(chutesResponse) || "Could not synthesize a final answer.";
                    finalData = wrapTextInCandidate(synthesizedText);
                } else if (provider === 'megallm') {
                    const useOCR = !modelSupportsVision(appState.currentModel);
                    const additionalContext = `\n\n--- Text from Web Sources ---\n\n${truncatedWebContext}`;
                    const messages = buildOpenAIMessages(userMessage, additionalContext, true, synthesisSystemPrompt, useOCR);
                    const resp = await callMegaLLMChat(selectedModel, messages, signal, { temperature: 0.3, stream: true, placeholderEl, effort: 'high' });
                    const text = extractTextFromOpenAIResponse(resp) || "Could not synthesize a final answer.";
                    finalData = wrapTextInCandidate(text);
                } else {
                    throw new Error(`Provider "${provider}" does not support web search synthesis.`);
                }
                let finalContent = "Could not synthesize a final answer.";
                let thinkingParts = [];
                let thinkingMeta = null;
                if (provider === 'google') {
                    const appliedThinking = finalData.__thinkingSettings;
                    if (appliedThinking) delete finalData.__thinkingSettings;
                    const parsed = formatGeminiResponse(finalData, appliedThinking);
                    finalContent = parsed.text || extractGeminiPlainText(finalData) || finalContent;
                    thinkingParts = parsed.thoughts || [];
                    thinkingMeta = parsed.meta || null;
                    if (!finalContent && finalData.__safetyStop) {
                        finalContent = 'Response stopped by safety filters.';
                    }
                } else {
                    finalContent = finalData.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || finalContent;
                }
                const geminiParts = provider === 'google'
                    ? (finalData?.candidates?.[0]?.content?.parts || null)
                    : null;
                return { data: finalContent, sources: searchResult.sourcesForDisplay, thinking: thinkingParts, thinkingMeta, geminiParts };
            } else {
                // General mode without web search
                if (supportsThinking) {
                    setThinkingStatus(placeholderEl, 'Preparing response...', { key: 'generalStatusEntry', defaultTitle: 'Thinking', parseColon: false });
                }
                if (provider === 'google') { if (!API_CONFIG.gemini.enabled && (!API_CONFIG.vertex || !API_CONFIG.vertex.projectId)) { return { isError: true, data: 'Configuration Error: set GEMINI_API_KEY (or Vertex project) in .env.' }; } } else if (!API_CONFIG[provider]) {
                    return { isError: true, data: `?  **Configuration Error:** API keys for provider "${provider}" are missing.` };
                }


                const currentChat = appState.chats.find(chat => chat.id === appState.currentChatId);
                const systemPrompt = `You are a helpful, general-purpose AI assistant. The current date is ${currentDate}.`;
                let data;
                if (provider === 'google') {
                    const contents = buildGeminiContents(userMessage, '', true);
                    const basePayload = {
                        contents,
                        systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
                        safetySettings: getGeminiSafetySettings()
                    };
                    const { generationConfig, thinkingSettings } = buildGeminiGenerationConfig(basePayload.generationConfig, selectedModel);
                    if (generationConfig && Object.keys(generationConfig).length > 0) {
                        basePayload.generationConfig = generationConfig;
                    }
                    data = await fetchGeminiContent(selectedModel.googleModelName, null, basePayload, signal, {
                        placeholderEl,
                        appliedThinking: thinkingSettings,
                        errorContext: 'Gemini response'
                    });
                } else if (provider === 'chutes') {
                    const effortLevel = appState.extendThinking ? 'high' : 'medium';
                    // Use OCR for non-vision models
                    const useOCR = !modelSupportsVision(appState.currentModel);
                    const messages = buildOpenAIMessages(userMessage, '', true, systemPrompt, useOCR);
                    const chutesResponse = await callChutesChat(selectedModel, messages, signal, { effort: effortLevel });
                    const chutesText = extractTextFromOpenAIResponse(chutesResponse) || 'No content received.';
                    data = wrapTextInCandidate(chutesText);
                } else if (provider === 'megallm') {
                    const useOCR = !modelSupportsVision(appState.currentModel);
                    const messages = buildOpenAIMessages(userMessage, '', true, systemPrompt, useOCR);
                    const resp = await callMegaLLMChat(selectedModel, messages, signal, { stream: true, placeholderEl, effort: 'high' });
                    const text = extractTextFromOpenAIResponse(resp) || 'No content received.';
                    const reasoningText = extractReasoningFromOpenAIResponse(resp);
                    data = wrapTextInCandidate(text);
                    if (reasoningText) {
                        data.__reasoning = reasoningText;
                    }
                } else if (provider === 'openrouter') {
    const apiCallFn = async (unused, localSignal) => {
        // Use OCR for non-vision models
        const useOCR = !modelSupportsVision(appState.currentModel);
        const messages = buildOpenAIMessages(userMessage, '', true, systemPrompt, useOCR);
        const response = await callServerChatCompletions('openrouter', {
            model: selectedModel.openRouterModelId,
            messages,
            max_tokens: typeof selectedModel.maxOutputTokens === 'number' ? selectedModel.maxOutputTokens : undefined
        }, localSignal);
        return response;
    };
    const openRouterResponse = await apiCallFn(null, signal);
    const openRouterText = openRouterResponse?.choices?.[0]?.message?.content || 'No content received.';
    data = wrapTextInCandidate(openRouterText);
}
                let content = "No content received.";
                let thinkingParts = [];
                let thinkingMeta = null;
                if (provider === 'google') {
                    const appliedThinking = data.__thinkingSettings;
                    if (appliedThinking) delete data.__thinkingSettings;
                    const parsed = formatGeminiResponse(data, appliedThinking);
                    content = parsed.text || extractGeminiPlainText(data) || content;
                    thinkingParts = parsed.thoughts || [];
                    thinkingMeta = parsed.meta || null;
                    if (!content && data.__safetyStop) {
                        content = 'Response stopped by safety filters.';
                    }
                } else {
                    content = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || content;
                    if (provider === 'megallm' && data.__reasoning) {
                        thinkingParts = [{ text: data.__reasoning }];
                    }
                }
                const geminiParts = provider === 'google'
                    ? (data?.candidates?.[0]?.content?.parts || null)
                    : null;
                return { data: content, sources: [], thinking: thinkingParts, thinkingMeta, geminiParts };
            }
        }


        function escapeHTML(str) {
            return str.replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]);
        }

        window.copyCode = function (button) {
            const pre = button.closest('.code-block-container').querySelector('pre');
            navigator.clipboard.writeText(pre.innerText).then(() => {
                button.innerHTML = '<i class="fas fa-check"></i> Copied';
                setTimeout(() => { button.innerHTML = '<i class="far fa-copy"></i> Copy'; }, 2000);
            });
        };

        window.copyMessage = function (button) {
            const messageEl = button.closest('.message');
            const contentEl = messageEl.querySelector('.message-content');
            const textToCopy = contentEl.innerText;

            navigator.clipboard.writeText(textToCopy).then(() => {
                button.innerHTML = '<i class="fas fa-check"></i> Copied';
                setTimeout(() => {
                    button.innerHTML = '<i class="far fa-copy"></i> Copy';
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy text: ', err);
            });
        };

        window.toggleThinking = function (messageId) {
            const wrapper = document.getElementById(`thinkingWrapper-${messageId}`);
            if (!wrapper) return;
            const detailsEl = document.getElementById(`thinkingDetails-${messageId}`);
            const toggleBtn = wrapper.querySelector('.thinking-toggle');
            const caretIcon = wrapper.querySelector('.thinking-caret');
            if (!detailsEl || !toggleBtn || toggleBtn.classList.contains('thinking-toggle-disabled')) return;

            const isHidden = detailsEl.classList.contains('hidden');
            detailsEl.classList.toggle('hidden');
            toggleBtn.setAttribute('aria-expanded', String(isHidden));
            if (caretIcon) {
                caretIcon.classList.toggle('open', isHidden);
            }
            const messageEl = document.getElementById(`message-${messageId}`);
            const runtime = getThinkingRuntime(messageEl);
            if (runtime) {
                runtime.isExpanded = isHidden;
            }
        };

        function displayMessage(message) {
            const messagesArea = document.getElementById('messagesArea');
            updateWelcomeMessage(false);
            const messageEl = document.createElement('div');
            messageEl.className = `message ${message.role}`;
            messageEl.id = `message-${message.id}`;
            if (message.role === 'assistant') {
                messageEl.dataset.supportsThinking = message.supportsThinking === false ? 'false' : 'true';
                if (message.thinkingVariant) {
                    messageEl.dataset.thinkingVariant = message.thinkingVariant;
                }
            }
            const showThinkingUI = message.role === 'assistant' && message.supportsThinking !== false;
            const _thinkingLabel = 'Thinking';
            const _srToggle = 'Toggle thoughts';
            const thinkingSection = showThinkingUI
                ? `<div class="thinking-wrapper hidden" id="thinkingWrapper-${message.id}">
                <button class="thinking-toggle" type="button" onclick="toggleThinking('${message.id}')" aria-expanded="false">
                    <span class="thinking-typing" aria-hidden="true">${_thinkingLabel}</span>
                    <span class="sr-only">${_srToggle}</span>
                    <i class="fas fa-chevron-right thinking-caret" aria-hidden="true"></i>
                </button>
                <div class="thinking-details hidden" id="thinkingDetails-${message.id}"></div>
            </div>`
                : '';

            messageEl.innerHTML = `
        <button class="copy-button" onclick="copyMessage(this)"><i class="far fa-copy"></i> Copy</button>
        ${thinkingSection}
        <div class="message-files-standalone"></div>
        <div class="message-content"></div>`;
            messagesArea.appendChild(messageEl);
            if (message.content || message.files?.length > 0 || message.imageUrl || message.sources?.length > 0) {
                updateMessageContent(messageEl, message);
            }
            return messageEl;
        }

        function updateMessageContent(messageEl, messageData) {
            const header = messageEl.querySelector('.message-header');
            const filesHost = messageEl.querySelector('.message-files-standalone');
            const contentEl = messageEl.querySelector('.message-content');
            // If streaming already wrote into this container, clear it before final render
            if (contentEl && messageData && messageData.role === 'assistant') {
                contentEl.innerHTML = '';
            }
            // If we previously streamed into this container, clear it before final render
            if (contentEl && messageData?.role === 'assistant') { contentEl.innerHTML = ''; }
            if (messageData.thinkingTime && header) {
                let timeEl = header.querySelector('.thinking-time');
                if (!timeEl) {
                    timeEl = document.createElement('span');
                    timeEl.className = 'thinking-time';
                    header.appendChild(timeEl);
                }
                timeEl.textContent = `(Thought for ${messageData.thinkingTime}s)`;
            }
            if (messageData.role === 'assistant') {
                applyThinkingToMessage(messageEl, messageData);
            }
            let filesHTML = '';
            if (messageData.files?.length) {
                filesHTML = `<div class="message-files-container">${messageData.files.map(f => {
                    if (f.type.startsWith('image/')) {
                        return `<div class="message-file-preview image-preview">
                            <img src="data:${f.type};base64,${f.content}" alt="${escapeHTML(f.name)}" title="${escapeHTML(f.name)}">
                        </div>`;
                    } else {
                        const fileExtension = (f.name.split('.').pop() || f.type.split('/')[1] || '').toUpperCase();
                        return `<div class="message-file-preview file-info-block" title="${escapeHTML(f.name)}">
                            <i class="${getFileIcon(f.type)}"></i>
                            <div class="file-details">
                                <span class="file-name">${escapeHTML(f.name)}</span>
                                <span class="file-type">${fileExtension}</span>
                            </div>
                        </div>`;
                    }
                }).join('')}</div>`;
            }
            if (filesHost) filesHost.innerHTML = filesHTML;

            let sourcesHTML = '';
            if (messageData.sources?.length > 0) {
                sourcesHTML = `
            <div class="sources-container">
                <h4>Sources</h4>
                <div class="sources-list">
                   ${messageData.sources.map(s => `
                    <a href="${s.uri}" class="source-item" target="_blank" rel="noopener noreferrer">
                       <div class="source-favicon"><img src="https://www.google.com/s2/favicons?domain=${s.domain}&sz=32" alt=""></div>
                       <span class="source-info" title="${escapeHTML(s.title)}">${escapeHTML(s.title)}</span>
                       <span class="source-domain">${escapeHTML(s.domain)}</span>
                    </a>`).join('')}
                </div>
            </div>`;
            }

            // ROLE-SPECIFIC RENDERING
            if (messageData.role === 'user') {
                // For user messages: show raw escaped text only (no markdown / math rendering)
                const raw = (messageData.content || '').replace(/\r\n?/g, '\n');
                const escaped = escapeHTML(raw).replace(/\n/g, '<br>');
                contentEl.innerHTML = `
            <div class="final-answer-container user-plain">${escaped}</div>
            ${sourcesHTML}`;
                // Do NOT typeset MathJax for user messages
                return;
            }

            // Assistant messages (apply markdown + math). Additional cleanup for non-Google providers only.
            let provider = messageData.provider || (models[appState.currentModel] && models[appState.currentModel].provider) || 'unknown';
            let workingContent = messageData.content || '';

            if (provider !== 'google') {
                // Normalize unicode dashes to ASCII minus BEFORE parsing so standalone-math detection works
                workingContent = workingContent.replace(/[\u2014\u2013\u2212]/g, '-');
                // Collapse triple+ asterisks to double (models sometimes output ***Heading**)
                workingContent = workingContent.replace(/\*{3,}/g, '**');
                // Remove isolated single asterisks on their own line (artefacts)
                workingContent = workingContent.replace(/(^|\n)\*(?=\s|\n)/g, '$1');
            }

            let renderedHtml = processMessageContent(workingContent);

            if (provider !== 'google') {
                // Remove stray unmatched single or double asterisks that survived markdown parsing (not within <strong>/<em>)
                const protectBlocks = (html, transformer) => {
                    const parts = [];
                    let idx = 0;
                    const regex = /<(code|pre)[^>]*>[\s\S]*?<\/\1>/gi;
                    let match;
                    while ((match = regex.exec(html)) !== null) {
                        if (match.index > idx) parts.push({ type: 'text', value: html.slice(idx, match.index) });
                        parts.push({ type: 'code', value: match[0] });
                        idx = regex.lastIndex;
                    }
                    if (idx < html.length) parts.push({ type: 'text', value: html.slice(idx) });
                    return parts.map(p => p.type === 'code' ? p.value : transformer(p.value)).join('');
                };
                renderedHtml = protectBlocks(renderedHtml, seg => {
                    // Convert any remaining **bold** markers not parsed (e.g., due to newlines introduced by model)
                    seg = seg.replace(/\*\*([^*<>\n]{1,200}?)\*\*/g, '<strong>$1</strong>');
                    // Inline math fallback: convert leftover $ expr $ not already inside \( \)
                    seg = seg.replace(/\$(?!\$)([^$<\n]{1,200}?)\$/g, (m, expr) => `\\( ${expr.trim()} \\)`);
                    // Remove lone asterisks (surrounded by whitespace, start/end, or before punctuation)
                    seg = seg.replace(/(^|[\s>])\*(?=(?:[\s<]|$))/g, '$1');
                    // Remove leftover double asterisks with no closing content
                    seg = seg.replace(/(^|[\s>])\*\*(?=(?:[\s<]|$))/g, '$1');
                    return seg;
                });
            }

            // Check if content contains AI-generated image containers (preserve them)
            const hasGeneratedImages = messageData.hasGeneratedImages ||
                (workingContent && workingContent.includes('class="ai-generated-image-container"'));

            if (hasGeneratedImages) {
                // For messages with generated images, we need special handling
                // Extract the image containers and text parts separately
                const imageContainerRegex = /<div class="ai-generated-image-container"[\s\S]*?<\/div>\s*<\/div>/g;
                const imageContainers = workingContent.match(imageContainerRegex) || [];
                const textPart = workingContent.replace(imageContainerRegex, '').trim();

                // Process the text part through markdown
                let processedText = textPart ? processMessageContent(textPart) : '';

                // Combine processed text with preserved image containers
                const imagesHtml = imageContainers.join('\n');

                contentEl.innerHTML = `
            <div class="final-answer-container">${processedText}</div>
            ${imagesHtml}
            ${sourcesHTML}`;
            } else {
                contentEl.innerHTML = `
            <div class="final-answer-container">${renderedHtml}</div>
            ${sourcesHTML}`;
            }

            if (messageData.role === 'assistant') {
                if (typeof window.__queueMathTypeset === 'function') {
                    window.__queueMathTypeset(contentEl);
                } else if (typeof MathJax !== 'undefined' && MathJax.typesetPromise) {
                    MathJax.typesetPromise([contentEl]);
                }
            }
        }

        function displaySearchProcess(placeholderEl) {
            setThinkingStatus(placeholderEl, 'Initializing search...', { key: 'searchStatusEntry', defaultTitle: 'Searching', parseColon: false });
        }

        function updateSearchStatus(placeholderEl, statusText) {
            setThinkingStatus(placeholderEl, statusText, { key: 'searchStatusEntry', defaultTitle: 'Searching', parseColon: true });
        }

        function updateSearchQueriesUI(placeholderEl, queries) {
            updateThinkingQueries(placeholderEl, queries);
        }

        function scrollToBottom() {
            const messagesArea = document.getElementById('messagesArea');
            // Use requestAnimationFrame for smoother scrolling
            requestAnimationFrame(() => {
                messagesArea.scrollTop = messagesArea.scrollHeight;
            });
        }

        function generateId() {
            return Date.now().toString(36) + Math.random().toString(36).substring(2);
        }

        function renderVisibleMessagesForChat(chat) {
            const messagesArea = document.getElementById('messagesArea');
            if (!messagesArea) return [];
            messagesArea.innerHTML = '';
            const visibleMessages = getVisibleMessagesForChat(chat);
            if (visibleMessages.length === 0) {
                updateWelcomeMessage(true);
                return [];
            }
            updateWelcomeMessage(false);
            visibleMessages.forEach(displayMessage);
            return visibleMessages;
        }

        function getMessageMapById(chat) {
            const map = new Map();
            if (!chat || !Array.isArray(chat.messages)) return map;
            chat.messages.forEach(msg => {
                const key = normalizeStoredMessageId(msg.id);
                if (key) map.set(key, msg);
            });
            return map;
        }

        function cacheGeneratedImagesForRuntime(runtime, images, requestedIds = []) {
            if (!runtime || !Array.isArray(images)) return false;
            const requestedSet = new Set((requestedIds || []).map(normalizeStoredMessageId).filter(Boolean));
            let sawForeignMessageId = false;
            images.forEach(img => {
                const key = normalizeStoredMessageId(img?.message_id);
                if (!key) return;
                if (requestedSet.size > 0 && !requestedSet.has(key)) {
                    sawForeignMessageId = true;
                }
                const existing = runtime.generatedImageCacheByMessageId.get(key) || [];
                const imageId = img?.id ? String(img.id) : null;
                const duplicate = imageId
                    ? existing.some(it => it?.id && String(it.id) === imageId)
                    : existing.some(it => (it?.image_data || '') === (img?.image_data || '') && (it?.created_at || '') === (img?.created_at || ''));
                if (!duplicate) {
                    existing.push(img);
                    runtime.generatedImageCacheByMessageId.set(key, existing);
                }
            });
            return sawForeignMessageId;
        }

        async function fetchUploadedImagesForMessageIds(sessionId, messageIds) {
            const result = new Map();
            (messageIds || []).forEach(id => result.set(id, []));
            await Promise.all((messageIds || []).map(async messageId => {
                try {
                    const images = await getUploadedImages(sessionId, messageId, true);
                    result.set(messageId, Array.isArray(images) ? images : []);
                } catch (err) {
                    console.warn(`Failed uploaded-image fetch for message ${messageId}:`, err);
                    result.set(messageId, []);
                }
            }));
            return result;
        }

        async function fetchGeneratedImagesForMessageIds(sessionId, messageIds) {
            const result = new Map();
            (messageIds || []).forEach(id => result.set(id, []));
            if (!sessionId || !Array.isArray(messageIds) || messageIds.length === 0) return result;

            const runtime = getChatRuntime(sessionId);
            const ids = messageIds.map(normalizeStoredMessageId).filter(Boolean);
            if (!runtime || ids.length === 0) return result;

            if (!runtime.generatedImageCacheFull) {
                const uncachedIds = ids.filter(id => !runtime.generatedImageCacheByMessageId.has(id));
                if (uncachedIds.length > 0) {
                    const token = localStorage.getItem('authToken');
                    if (token) {
                        let fetched = false;
                        try {
                            const batchUrl = `${API_BASE_URL}/images/session?session_id=${encodeURIComponent(sessionId)}&include_data=true&message_ids=${encodeURIComponent(uncachedIds.join(','))}`;
                            const response = await fetch(batchUrl, {
                                method: 'GET',
                                headers: { 'Authorization': `Bearer ${token}` }
                            });
                            if (response.ok) {
                                const data = await response.json().catch(() => ({}));
                                const images = Array.isArray(data?.images) ? data.images : [];
                                const sawForeign = cacheGeneratedImagesForRuntime(runtime, images, uncachedIds);
                                if (sawForeign) runtime.generatedImageCacheFull = true;
                                fetched = true;
                            }
                        } catch (err) {
                            console.warn('Batch generated-image fetch failed, falling back to per-message requests.', err);
                        }

                        if (!fetched && !runtime.generatedImageCacheFull) {
                            for (const messageId of uncachedIds) {
                                try {
                                    const url = `${API_BASE_URL}/images/session?session_id=${encodeURIComponent(sessionId)}&include_data=true&message_id=${encodeURIComponent(messageId)}`;
                                    const response = await fetch(url, {
                                        method: 'GET',
                                        headers: { 'Authorization': `Bearer ${token}` }
                                    });
                                    if (!response.ok) continue;
                                    const data = await response.json().catch(() => ({}));
                                    const images = Array.isArray(data?.images) ? data.images : [];
                                    const sawForeign = cacheGeneratedImagesForRuntime(runtime, images, [messageId]);
                                    if (sawForeign) {
                                        runtime.generatedImageCacheFull = true;
                                        break;
                                    }
                                } catch (err) {
                                    console.warn(`Generated-image fetch failed for message ${messageId}:`, err);
                                }
                            }
                        }
                    }
                    uncachedIds.forEach(id => {
                        if (!runtime.generatedImageCacheByMessageId.has(id)) {
                            runtime.generatedImageCacheByMessageId.set(id, []);
                        }
                    });
                }
            }

            ids.forEach(id => {
                const list = runtime.generatedImageCacheByMessageId.get(id) || [];
                result.set(id, Array.isArray(list) ? list.slice() : []);
            });
            return result;
        }

        function applyUploadedImagesToMessage(message, uploadedImages) {
            if (!message || !Array.isArray(uploadedImages)) return false;
            let changed = false;
            if (!Array.isArray(message.files)) message.files = [];

            const existingIds = new Set(
                message.files
                    .map(f => f && f.serverImageId ? String(f.serverImageId) : null)
                    .filter(Boolean)
            );

            uploadedImages.forEach(img => {
                if (!img || !img.image_data) return;
                const stableId = img.id
                    ? String(img.id)
                    : `${img.original_filename || 'uploaded_image'}:${img.created_at || ''}:${img.file_size || ''}`;
                if (existingIds.has(stableId)) return;
                message.files.push({
                    name: img.original_filename || 'uploaded_image.png',
                    type: img.mime_type || 'image/png',
                    content: img.image_data,
                    serverImageId: stableId
                });
                existingIds.add(stableId);
                changed = true;
            });

            if (message.role === 'user' && typeof message.content === 'string') {
                const cleaned = message.content.replace('[Image Attached] ', '');
                if (cleaned !== message.content) {
                    message.content = cleaned;
                    changed = true;
                }
            }

            if (changed) {
                message.hasUploadedImagesHint = true;
            }
            return changed;
        }

        function applyGeneratedImagesToMessage(message, generatedImages) {
            if (!message || message.role !== 'assistant' || !Array.isArray(generatedImages)) return false;
            if (generatedImages.length === 0) return false;

            const sortedImages = generatedImages
                .filter(img => img && img.image_data)
                .sort((a, b) => (Date.parse(a.created_at) || 0) - (Date.parse(b.created_at) || 0));
            if (sortedImages.length === 0) return false;

            if (!Array.isArray(message.generatedImageIds)) {
                message.generatedImageIds = [];
            }
            const knownIds = new Set(message.generatedImageIds.map(id => String(id)));
            const newChunks = [];

            sortedImages.forEach(img => {
                const stableId = img.id
                    ? String(img.id)
                    : `${img.created_at || ''}:${(img.image_data || '').slice(0, 32)}`;
                if (knownIds.has(stableId)) return;
                knownIds.add(stableId);
                message.generatedImageIds.push(stableId);
                newChunks.push(window.createImageContainerHTML(
                    img.image_data,
                    img.mime_type || 'image/png',
                    normalizeStoredMessageId(message.id) || generateId()
                ));
            });

            if (newChunks.length === 0) return false;

            let content = typeof message.content === 'string' ? message.content : '';
            if (content.includes(GENERATED_IMAGE_PLACEHOLDER)) {
                content = content.split(GENERATED_IMAGE_PLACEHOLDER).join('').trim();
            }
            const imagesHtml = newChunks.join('');
            message.content = content ? `${content}\n\n${imagesHtml}` : imagesHtml;
            message.hasGeneratedImages = true;
            message.hasGeneratedImagesHint = true;

            const latest = sortedImages[sortedImages.length - 1];
            if (latest?.image_data) {
                const latestTs = Date.parse(latest.created_at || latest.updated_at || '') || 0;
                if (!lastGeneratedImageTimestamp || latestTs >= lastGeneratedImageTimestamp) {
                    lastGeneratedImageData = latest.image_data;
                    lastGeneratedImagePrompt = latest.prompt || lastGeneratedImagePrompt;
                    lastGeneratedImageMimeType = latest.mime_type || latest.mimeType || 'image/png';
                    lastGeneratedImageId = latest.id || lastGeneratedImageId;
                    lastGeneratedImageTimestamp = latestTs || Date.now();
                }
            }
            return true;
        }

        function refreshMessageIfRendered(message) {
            if (!message || !message.id) return;
            const el = document.getElementById(`message-${message.id}`);
            if (!el) return;
            updateMessageContent(el, message);
        }

        async function hydrateImagesForMessageBatch(chat, messages) {
            if (!chat || !Array.isArray(messages) || messages.length === 0) return;
            const runtime = getChatRuntime(chat.id);
            if (!runtime) return;

            const messageMap = getMessageMapById(chat);
            const candidates = messages
                .map(msg => normalizeStoredMessageId(msg.id))
                .filter(Boolean)
                .filter(id => !runtime.loadedImageMessageIds.has(id) && !runtime.pendingImageMessageIds.has(id));

            if (candidates.length === 0) return;
            candidates.forEach(id => runtime.pendingImageMessageIds.add(id));

            const userMessageIds = [];
            const assistantMessageIds = [];
            candidates.forEach(id => {
                const msg = messageMap.get(id);
                if (!msg) return;
                if (msg.role === 'user') userMessageIds.push(id);
                if (msg.role === 'assistant') assistantMessageIds.push(id);
            });

            const processedIds = new Set();
            try {
                const [uploadedMap, generatedMap] = await Promise.all([
                    fetchUploadedImagesForMessageIds(chat.id, userMessageIds),
                    fetchGeneratedImagesForMessageIds(chat.id, assistantMessageIds)
                ]);

                userMessageIds.forEach(id => {
                    const msg = messageMap.get(id);
                    if (!msg) return;
                    const images = uploadedMap.get(id) || [];
                    const changed = applyUploadedImagesToMessage(msg, images);
                    if (changed) refreshMessageIfRendered(msg);
                    processedIds.add(id);
                });

                assistantMessageIds.forEach(id => {
                    const msg = messageMap.get(id);
                    if (!msg) return;
                    const images = generatedMap.get(id) || [];
                    const changed = applyGeneratedImagesToMessage(msg, images);
                    if (changed) refreshMessageIfRendered(msg);
                    processedIds.add(id);
                });
            } catch (err) {
                console.warn('Failed to hydrate lazy-loaded images for message batch:', err);
            } finally {
                candidates.forEach(id => {
                    runtime.pendingImageMessageIds.delete(id);
                    if (processedIds.has(id)) {
                        runtime.loadedImageMessageIds.add(id);
                    }
                });
            }
        }

        async function loadOlderMessagesForCurrentChat() {
            const chat = appState.chats.find(c => c.id == appState.currentChatId);
            if (!chat || !Array.isArray(chat.messages) || chat.messages.length === 0) return;
            const runtime = getChatRuntime(chat.id);
            if (!runtime || runtime.isLoadingOlder || !runtime.hasMoreOlder) return;

            const messagesArea = document.getElementById('messagesArea');
            if (!messagesArea) return;

            runtime.isLoadingOlder = true;
            const previousHeight = messagesArea.scrollHeight;
            const previousTop = messagesArea.scrollTop;
            const previousStart = runtime.visibleStartIndex;
            const nextStart = Math.max(0, previousStart - LAZY_CHAT_BATCH_SIZE);
            runtime.visibleStartIndex = nextStart;
            runtime.hasMoreOlder = nextStart > 0;

            try {
                const newlyVisible = chat.messages.slice(nextStart, previousStart);
                renderVisibleMessagesForChat(chat);
                const newHeight = messagesArea.scrollHeight;
                messagesArea.scrollTop = previousTop + Math.max(0, newHeight - previousHeight);
                await hydrateImagesForMessageBatch(chat, newlyVisible);
            } catch (err) {
                console.warn('Failed loading older messages:', err);
            } finally {
                runtime.isLoadingOlder = false;
            }
        }

        function handleMessagesAreaScroll() {
            const messagesArea = document.getElementById('messagesArea');
            if (!messagesArea) return;
            if (messagesArea.scrollTop > LAZY_CHAT_TOP_THRESHOLD_PX) return;
            if (currentRequestController) return;
            void loadOlderMessagesForCurrentChat();
        }

        function loadChat(chatId) {
            // Handle ID type mismatch (server IDs are numbers, local are strings)
            const chat = appState.chats.find(c => c.id == chatId);
            if (!chat) return;

            // Clean up image data from previous chat to prevent memory leaks
            if (appState.currentChatId && String(appState.currentChatId) !== String(chat.id)) {
                cleanupChatImageData(appState.currentChatId);
            }

            appState.currentChatId = chat.id;

            // Update URL to reflect the current chat (User requested format: /c/UUID)
            try {
                const state = { chatId: chat.id };
                const title = `Chat ${chat.id}`;

                if (window.location.protocol !== 'file:') {
                    let basePath = window.location.pathname;
                    // Remove existing /c/UUID if present to avoid stacking
                    basePath = basePath.replace(/\/c\/[a-zA-Z0-9-]+$/, '');
                    // Also handle if it ends with index.html or similar, we might want to keep it or replace it?
                    // The user example is chatgpt.com/c/UUID.
                    // If we are at /test_ini.html, replacing it with /c/UUID might be what is desired visually,
                    // but technically /test_ini.html/c/UUID is safer if we want to keep the file name.
                    // However, usually "clean URL" implies hiding the .html.
                    // Let's try to append /c/UUID to the base path.

                    if (basePath.endsWith('/')) basePath = basePath.slice(0, -1);

                    // If the path ends in .html, we probably want to append to it?
                    // e.g. /test_ini.html -> /test_ini.html/c/UUID
                    // This works with many servers.

                    const newPath = `${basePath}/c/${chat.id}`;
                    window.history.pushState(state, title, newPath);
                } else {
                    const newUrl = new URL(window.location);
                    newUrl.searchParams.set('c', chat.id);
                    window.history.pushState(state, title, newUrl);
                }
            } catch (e) {
                console.warn('Failed to update URL', e);
            }

            // Update sidebar IMMEDIATELY to show active state
            updateChatHistory();

            if (!chat.loaded && !chat.isLocal) {
                // Hide welcome message immediately to prevent overlap
                updateWelcomeMessage(false);

                const messagesArea = document.getElementById('messagesArea');
                if (messagesArea) messagesArea.innerHTML = '<div style="text-align:center; color:#888; margin-top:20px;">Loading history...</div>';
                loadSessionMessages(chat.id).catch(console.error);
                return;
            }

            switchSection(chat.section);
            initializeChatLazyWindow(chat, true);
            const visibleMessages = renderVisibleMessagesForChat(chat);
            if (visibleMessages.length > 0) {
                void hydrateImagesForMessageBatch(chat, visibleMessages);
            }
            updateUI();
            if (visibleMessages.length > 0) {
                scrollToBottom();
            }
            saveState();
        }

        function updateChatHistory() {
            const historyList = document.getElementById('chatHistoryList');
            if (!historyList) {
                console.error('Chat history list element not found!');
                return;
            }
            historyList.innerHTML = appState.chats
                .filter(chat => !chat.isLocal || chat.messages.length > 0)
                .map(chat => {
                    const title = (chat.title === 'New Chat' && chat.messages.length > 0 && chat.messages[0].content)
                        ? chat.messages[0].content.substring(0, 30) + '...'
                        : chat.title;

                    // Correctly map section/mode to name
                    const sectionKey = chat.section || 'general';
                    const sectionName = (sections[sectionKey])
                        ? sections[sectionKey].name
                        : 'General';

                    return `
            <button class="chat-history-item ${chat.id === appState.currentChatId ? 'active' : ''}" onclick="loadChat('${chat.id}')">
                <div class="chat-history-title">${escapeHTML(title)}</div>
                <div class="chat-history-time">${new Date(chat.lastMessage).toLocaleDateString()} • ${sectionName}</div>
            </button>`;
                }).join('');
        }

        function saveState() {
            saveStateToDB(appState).catch(err => console.error("Async save failed", err));
        }

        // Independent mobile keyboard docking for the input dock
        function setupKeyboardDocking() {
            const inputDock = document.getElementById('uiInputDock');
            const messagesArea = document.getElementById('messagesArea');
            const headerEl = document.getElementById('uiHeader');
            const welcomeCenter = document.getElementById('uiWelcomeCenter');
            if (!inputDock || !messagesArea) return;

            // Only adjust padding to prevent content occlusion
            const adjustLayout = () => {
                const dockH = inputDock.offsetHeight || 100;
                const headerH = headerEl ? headerEl.offsetHeight : 0;

                // Ensure messages area has enough padding at bottom so last message isn't hidden
                messagesArea.style.paddingBottom = `${dockH + 24}px`;

                try { document.documentElement.style.setProperty('--header-h', `${headerH}px`); } catch (e) { }

                if (typeof syncFixedToMain === 'function') syncFixedToMain();

                // Keep the welcome text visible
                if (welcomeCenter && !welcomeCenter.classList.contains('hidden')) {
                    // Simple centering logic
                    const usableH = window.innerHeight;
                    const desired = Math.round(headerH + Math.max(56, usableH * 0.22));
                    welcomeCenter.style.top = desired + 'px';
                }
            };

            // Initial adjustment
            adjustLayout();

            // Re-adjust on resize (which happens when keyboard opens due to interactive-widget=resizes-content)
            window.addEventListener('resize', adjustLayout);

            // Prevent swiping/scrolling on the dock
            inputDock.addEventListener('touchmove', (e) => {
                if (e.target.id === 'messageInput') return;
                e.preventDefault();
            }, { passive: false });
        }

        // Keep fixed elements (composer and welcome center) horizontally aligned with chat-main on desktop
        function syncFixedToMain() {
            const inputDock = document.getElementById('uiInputDock');
            const center = document.getElementById('uiWelcomeCenter');
            const sidebar = document.getElementById('sidebar');
            const isDesktop = window.innerWidth > 768;
            if (!inputDock && !center) return;
            if (isDesktop) {
                const main = document.querySelector('.chat-main');
                if (main && sidebar) {
                    // Get sidebar state
                    const sidebarCollapsed = sidebar.classList.contains('collapsed');
                    const sidebarWidth = sidebarCollapsed ? 64 : 280;

                    // Calculate left offset to center elements with chat-main
                    const left = sidebarWidth;
                    const right = 0;

                    if (inputDock) { inputDock.style.left = left + 'px'; inputDock.style.right = right + 'px'; }
                    if (center) { center.style.left = left + 'px'; center.style.right = right + 'px'; }
                }
            } else {
                if (inputDock) { inputDock.style.left = '0px'; inputDock.style.right = '0px'; }
                if (center) { center.style.left = '0px'; center.style.right = '0px'; }
            }
        }

        // Ensure header stays visible when virtual keyboard changes visual viewport offsets
        let __headerLockInit = false;
        function lockHeaderToVisualViewport() {
            // Disabled: relying on interactive-widget=resizes-content and position:fixed
            return;
        }

        // --------------------------------------------------------------
        // Developer Query Parsing Test Harness (runs once per page load)
        // --------------------------------------------------------------
        (() => {
            if (window.__QUERY_PARSE_TESTED) return;
            window.__QUERY_PARSE_TESTED = true;
            try {
                if (typeof parseSearchQueries !== 'function') return;
                const samples = [
                    '["indexeddb vs localstorage performance", "browser storage limits 2025", "when use indexeddb over localstorage", "indexeddb transactional example"]',
                    'Here are your queries:\n1. "indexeddb vs localstorage"\n2. "localstorage size limit 5mb"\n3. "indexeddb advantages offline"\n4. "web app persistent storage best practice"',
                    '```json\n["localstorage vs indexeddb security", "indexeddb large data", "client side database options", "browser storage api compare"]\n```',
                    'Yes, for a move you should research: "move data localstorage to indexeddb", "migrate localstorage to indexeddb best practice", "indexeddb api tutorial", "indexeddb durability"]'
                ];
                console.log('[QueryParseTest] Starting');
                samples.forEach((s, i) => {
                    try { console.log(`[QueryParseTest][${i}]`, parseSearchQueries(s, 4)); }
                    catch (e) { console.warn(`[QueryParseTest][${i}] Error`, e); }
                });
            } catch (e) { console.warn('Query parse harness failed', e); }
        })();
