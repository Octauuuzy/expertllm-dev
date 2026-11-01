        // Auth Logic
        const authModal = document.getElementById('authModal');
        const authTitle = document.getElementById('authTitle');
        const authForm = document.getElementById('authForm');
        const authUsernameInput = document.getElementById('authUsername');
        const authEmailInput = document.getElementById('authEmail');
        const authEmailGroup = document.getElementById('authEmailGroup');
        const authPasswordInput = document.getElementById('authPassword');
        const authSubmitBtn = document.getElementById('authSubmitBtn');
        const authSwitchText = document.getElementById('authSwitchText');
        const authSwitchLink = document.getElementById('authSwitchLink');
        const authError = document.getElementById('authError');

        let isLoginMode = true;
        // Use relative path if on same domain, or configure properly
        const API_BASE_URL = '';
        let isStorageFull = false;

        // --- Chat Sync Logic ---
        async function syncMessageToServer(role, content, messageId = null) {
            if (isStorageFull) return; // Stop trying if full
            const token = localStorage.getItem('authToken');
            if (!token) return;

            // Pre-process content to strip base64 media (images, audio, etc) to save DB space
            let processedContent = content;
            if (typeof processedContent === 'string') {
                // Strip AI-generated image containers entirely (don't store generated images)
                processedContent = processedContent.replace(/<div class="ai-generated-image-container"[\s\S]*?<\/div>\s*<\/div>/g, '[AI Generated Image]');
                // Strip Markdown base64 images: ![alt](data:image/...)
                processedContent = processedContent.replace(/!\[(.*?)\]\(data:[^)]+;base64,[^)]+\)/g, '![$1]([Media Data Removed])');
                // Strip HTML src base64: src="data:..."
                processedContent = processedContent.replace(/src="data:[^"]+;base64,[^"]+"/g, 'src="[Media Data Removed]"');
                // Strip data-image-src attributes with base64 data
                processedContent = processedContent.replace(/data-image-src="data:[^"]+"/g, 'data-image-src="[Media Data Removed]"');
            }

            // Only sync text content, skip if empty or media-only (after stripping)
            if (!processedContent || typeof processedContent !== 'string') return;

            const currentChat = appState.chats.find(c => c.id === appState.currentChatId);
            let sessionId = null;

            if (currentChat) {
                sessionId = currentChat.id;

                // Optimistic Title Update: If it's a new chat, update title locally immediately
                if (currentChat.title === 'New Chat' && role === 'user') {
                    currentChat.title = processedContent.substring(0, 30) + '...';
                    updateChatHistory(); // Refresh sidebar immediately
                }
            } else {
                // Should not happen if newChat() works correctly
                console.warn('No current chat found for sync');
                return;
            }

            try {
                const response = await fetch(`${API_BASE_URL}/chat/message`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        role,
                        content: processedContent,
                        message_id: messageId,
                        session_id: sessionId,
                        model: appState.currentModel,
                        section: (currentChat ? currentChat.section : appState.currentSection) || 'general', // Send section/mode
                        enabled_tools: {
                            webSearch: appState.webSearchEnabled,
                            extendThinking: appState.extendThinking,
                            createImage: appState.createImageEnabled,
                            debug: appState.debugEnabled
                        }
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    // If we just created a session on the server (implicit), update our local state
                    if (data.session_id && currentChat && currentChat.isLocal) {
                        // currentChat.id = data.session_id; // ID is already UUID, no need to change
                        currentChat.isLocal = false;
                        // appState.currentChatId = data.session_id;
                        updateChatHistory();
                    }
                } else if (response.status === 403) {
                    const data = await response.json();
                    if (data.error === 'STORAGE_LIMIT_EXCEEDED') {
                        isStorageFull = true;
                        document.getElementById('storagePopup').classList.add('active');
                    } else {
                        // Other 403 errors (like invalid token)
                        console.warn('Sync failed: Forbidden', data.error);
                        if (data.error === 'Invalid or expired token') {
                            window.logout();
                        }
                    }
                } else if (response.status === 401) {
                    window.logout();
                }
            } catch (err) {
                console.warn('Failed to sync message:', err);
            }
        }

        async function fetchSessions() {
            const token = localStorage.getItem('authToken');
            if (!token) return;

            try {
                const response = await fetch(`${API_BASE_URL}/chat/sessions`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.status === 403 || response.status === 401) {
                    // Token invalid or expired
                    console.warn('Session expired, logging out...');
                    window.logout();
                    return;
                }

                if (response.ok) {
                    const sessions = await response.json();

                    // Convert sessions to App format
                    const serverChats = sessions.map(session => {
                        const existing = appState.chats.find(c => c.id === session.id);

                        // Check if server has newer content
                        let isOutdated = false;
                        if (existing && existing.lastMessage) {
                            const localTime = new Date(existing.lastMessage).getTime();
                            const serverTime = new Date(session.updated_at).getTime();
                            // If server time is newer, mark as outdated to force re-fetch
                            if (serverTime > localTime) {
                                isOutdated = true;
                            }
                        }

                        return {
                            id: session.id, // UUID from server
                            title: session.title || 'New Chat',
                            section: session.section || 'general', // Map section from server
                            // If outdated, discard local messages so they get re-fetched
                            messages: (existing && !isOutdated) ? existing.messages : [],
                            created: session.created_at,
                            lastMessage: session.updated_at,
                            // If outdated, mark as not loaded so it fetches again
                            loaded: (existing && !isOutdated) ? existing.loaded : false,
                            model: session.model,
                            enabled_tools: session.enabled_tools
                        };
                    });

                    // Merge with local state to preserve unsaved "New Chat" sessions
                    // We keep local chats that are NOT in the server list (meaning they are new/unsaved)
                    const localOnlyChats = appState.chats.filter(c => c.isLocal);

                    // Rebuild appState.chats: Local unsaved ones first, then server ones
                    appState.chats = [...localOnlyChats, ...serverChats];

                    if (appState.chats.length > 0) {
                        // Check URL for chat ID (path /c/UUID or query ?c=UUID)
                        let targetChatId = null;
                        const pathMatch = window.location.pathname.match(/\/c\/([a-zA-Z0-9-]+)$/);
                        if (pathMatch) {
                            targetChatId = pathMatch[1];
                        }
                        if (!targetChatId) {
                            const params = new URLSearchParams(window.location.search);
                            targetChatId = params.get('c');
                        }

                        const targetChat = targetChatId ? appState.chats.find(c => c.id === targetChatId) : null;

                        if (targetChat) {
                            appState.currentChatId = targetChat.id;
                            await loadSessionMessages(targetChat.id);
                        } else {
                            // If we have a current chat selected, keep it if it exists
                            const currentStillExists = appState.chats.find(c => c.id === appState.currentChatId);
                            if (!currentStillExists) {
                                // Load the most recent session
                                const mostRecent = appState.chats[0];
                                appState.currentChatId = mostRecent.id;
                                await loadSessionMessages(mostRecent.id);
                            } else {
                                // Force refresh the current chat to ensure we have the latest messages
                                // This fixes the issue where refreshing doesn't show new messages from other devices
                                await loadSessionMessages(currentStillExists.id);
                            }
                        }
                        // Ensure we are in the chat interface
                        showChatInterface();
                    } else {
                        // No sessions, create a local one
                        createNewLocalChat();
                        showChatInterface();
                    }

                    updateChatHistory(); // Update sidebar
                    updateUI(); // Update main view
                }
            } catch (err) {
                console.error('Failed to fetch sessions:', err);
            }
        }

        async function loadSessionMessages(sessionId) {
            const token = localStorage.getItem('authToken');
            if (!token) return;

            const chat = appState.chats.find(c => c.id == sessionId);
            if (!chat) return;
            const runtime = getChatRuntime(chat.id);
            if (!runtime) return;
            if (runtime.contextPromise) {
                return runtime.contextPromise;
            }

            runtime.contextReady = false;
            const inFlight = (async () => {
                const historyResponse = await fetch(`${API_BASE_URL}/chat/history?session_id=${sessionId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!historyResponse.ok) {
                    throw new Error(`History fetch failed with status ${historyResponse.status}`);
                }

                const history = await historyResponse.json();
                const list = Array.isArray(history) ? history : [];
                const messageRecords = list.map((msg) => {
                    const key = normalizeStoredMessageId(msg.message_id) || (msg.id !== null && msg.id !== undefined ? String(msg.id) : generateId());
                    const rawContent = msg.content || '';
                    const hasUploadedImagesHint = msg.role === 'user' && IMAGE_ATTACHMENT_INDICATOR_REGEX.test(rawContent);
                    const hasGeneratedImagesHint = msg.role === 'assistant' && rawContent.includes(GENERATED_IMAGE_PLACEHOLDER);
                    const content = msg.role === 'user'
                        ? rawContent.replace('[Image Attached] ', '')
                        : rawContent;
                    return {
                        id: key,
                        role: msg.role,
                        content: content,
                        files: [],
                        thinking: safeParseJson(msg.thinking) || undefined,
                        thinkingMeta: safeParseJson(msg.thinking_meta) || undefined,
                        sources: safeParseJson(msg.sources) || undefined,
                        parts: [{ text: content }],
                        timestamp: msg.created_at,
                        hasUploadedImagesHint,
                        hasGeneratedImagesHint,
                        hasGeneratedImages: hasGeneratedImagesHint
                    };
                });

                chat.messages = messageRecords;
                chat.loaded = true;
                runtime.loadedImageMessageIds.clear();
                runtime.pendingImageMessageIds.clear();
                runtime.generatedImageCacheByMessageId.clear();
                runtime.generatedImageCacheFull = false;
                initializeChatLazyWindow(chat, true);
                runtime.contextReady = true;

                if (appState.currentChatId == sessionId) {
                    // Warm the "last generated image" cache in the background for image editing flows.
                    ensureLastGeneratedImage(chat.id).catch(() => { });

                    // Restore model and tools if available
                    if (chat.model && models[chat.model]) {
                        appState.currentModel = chat.model;
                        const selectedModelName = document.getElementById('selectedModelName');
                        if (selectedModelName) selectedModelName.textContent = models[chat.model].name;
                    }
                    if (chat.enabled_tools) {
                        appState.webSearchEnabled = !!chat.enabled_tools.webSearch;
                        appState.extendThinking = !!chat.enabled_tools.extendThinking;
                        appState.createImageEnabled = !!chat.enabled_tools.createImage;
                        appState.debugEnabled = !!chat.enabled_tools.debug;
                        if (appState.createImageEnabled) {
                            appState.webSearchEnabled = false;
                        }
                        updateSelectedFeatures();
                        updateToolAvailability();
                    }
                    loadChat(chat.id);
                } else {
                    updateUI();
                }
            })();

            runtime.contextPromise = inFlight;
            try {
                await inFlight;
            } catch (err) {
                runtime.contextReady = false;
                console.error('Failed to load session messages:', err);
                if (appState.currentChatId == sessionId) {
                    const messagesArea = document.getElementById('messagesArea');
                    if (messagesArea) messagesArea.innerHTML = '<div style="text-align:center; color:red; margin-top:20px;">Failed to load history.</div>';
                }
                throw err;
            } finally {
                if (runtime.contextPromise === inFlight) {
                    runtime.contextPromise = null;
                }
            }
        }

        function createNewLocalChat() {
            // Prevent duplicate empty chats
            if (appState.chats.length > 0) {
                const topChat = appState.chats[0];
                if (topChat.title === 'New Chat' && topChat.messages.length === 0) {
                    // Already have an empty new chat at top, just switch to it
                    loadChat(topChat.id);
                    return;
                }
            }

            const chatId = generateId(); // Local UUID
            const chat = {
                id: chatId,
                title: 'New Chat',
                section: 'general',
                messages: [],
                created: new Date().toISOString(),
                lastMessage: new Date().toISOString(),
                isLocal: true // Flag to indicate it's not on server yet (though ID is ready)
            };
            appState.chats.unshift(chat);
            const runtime = getChatRuntime(chatId);
            if (runtime) {
                runtime.contextReady = true;
                runtime.contextPromise = null;
            }
            loadChat(chatId); // Use loadChat to handle UI updates consistently
        }

        function showAuthModal() {
            authModal.classList.add('active');
        }

        function hideAuthModal() {
            authModal.classList.remove('active');
        }

        function toggleAuthMode() {
            isLoginMode = !isLoginMode;
            if (isLoginMode) {
                authTitle.textContent = 'Login';
                authSubmitBtn.textContent = 'Login';
                authSwitchText.textContent = "Don't have an account?";
                authSwitchLink.textContent = 'Register';
                authEmailGroup.style.display = 'none';
                authEmailInput.required = false;
            } else {
                authTitle.textContent = 'Register';
                authSubmitBtn.textContent = 'Register';
                authSwitchText.textContent = "Already have an account?";
                authSwitchLink.textContent = 'Login';
                authEmailGroup.style.display = 'block';
                authEmailInput.required = true;
            }
            authError.style.display = 'none';
        }

        authSwitchLink.addEventListener('click', toggleAuthMode);
        document.getElementById('authClose').addEventListener('click', hideAuthModal);

        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = authUsernameInput.value;
            const password = authPasswordInput.value;
            const email = authEmailInput.value;
            const endpoint = isLoginMode ? '/auth/login' : '/auth/register';

            authSubmitBtn.disabled = true;
            authSubmitBtn.textContent = 'Processing...';
            authError.style.display = 'none';

            const payload = { username, password };
            if (!isLoginMode) {
                payload.email = email;
            }

            try {
                const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Authentication failed');
                }

                // Success
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('authUser', JSON.stringify(data.user));
                hideAuthModal();
                if (typeof showChatInterface === 'function') showChatInterface();
                console.log('Authenticated as:', data.user.username);

                // Update UI immediately
                if (typeof loadUserProfile === 'function') {
                    loadUserProfile();
                }

                // Load history
                fetchSessions();

            } catch (err) {
                authError.textContent = err.message;
                authError.style.display = 'block';
            } finally {
                authSubmitBtn.disabled = false;
                authSubmitBtn.textContent = isLoginMode ? 'Login' : 'Register';
            }
        });

        // Expose logout function
        window.logout = function () {
            localStorage.removeItem('authToken');
            localStorage.removeItem('authUser');
            showAuthModal();
        };
