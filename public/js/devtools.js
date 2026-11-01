        /* User Profile & Logout Logic */
        function toggleUserMenu(event) {
            event.stopPropagation();
            const menu = document.getElementById('userMenu');
            menu.classList.toggle('hidden');

            // Refresh user profile when opening the menu to ensure tier is up-to-date
            if (!menu.classList.contains('hidden')) {
                // Sync fresh data from server
                syncUserPreferences();
            }
        }

        function openSettings(event) {
            event.stopPropagation();
            // Placeholder for settings
            console.log('Settings clicked');
            document.getElementById('userMenu').classList.add('hidden');
        }

        function openUpgradeModal(event) {
            if (event) event.stopPropagation();
            document.getElementById('userMenu').classList.add('hidden');

            const modal = document.getElementById('upgradeModal');
            modal.classList.remove('hidden');

            // Determine current tier
            const authUserStr = localStorage.getItem('authUser');
            let currentTier = 'Free';
            if (authUserStr) {
                const authUser = JSON.parse(authUserStr);
                currentTier = authUser.tier || authUser.plan || 'Free';
            }
            // Normalize
            currentTier = currentTier.toLowerCase();

            const btnFree = document.getElementById('btn-plan-free');
            const btnPlus = document.getElementById('btn-plan-plus');

            // Reset states
            btnFree.disabled = false;
            btnFree.textContent = 'Downgrade';
            btnFree.onclick = () => selectPlan('Free');
            btnFree.className = 'btn btn--outline pricing-btn';

            btnPlus.disabled = false;
            btnPlus.textContent = 'Upgrade to Plus';
            btnPlus.className = 'btn btn--primary pricing-btn';
            btnPlus.onclick = () => selectPlan('Plus');

            if (currentTier === 'plus' || currentTier === 'pro' || currentTier === 'founder') {
                // Current is Plus/Pro
                btnPlus.disabled = true;
                btnPlus.textContent = 'Current Plan';
                btnPlus.className = 'btn btn--outline pricing-btn';
                btnPlus.onclick = null;
            } else {
                // Current is Free
                btnFree.disabled = true;
                btnFree.textContent = 'Current Plan';
                btnFree.onclick = null;
            }
        }

        function closeUpgradeModal() {
            document.getElementById('upgradeModal').classList.add('hidden');
        }

        function selectPlan(planName) {
            alert(`You selected ${planName}. This feature is a demo prototype.`);
        }

        function confirmLogout(event) {
            event.stopPropagation();
            document.getElementById('userMenu').classList.add('hidden');
            document.getElementById('logoutModal').classList.remove('hidden');
        }

        function closeLogoutModal() {
            document.getElementById('logoutModal').classList.add('hidden');
        }

        function performLogout() {
            // Clear local storage and session storage
            localStorage.clear();
            sessionStorage.clear();

            // Also clear IndexedDB to ensure no data leaks to next user
            if (db) {
                try {
                    const transaction = db.transaction(['appStateStore'], 'readwrite');
                    const store = transaction.objectStore('appStateStore');
                    store.clear();
                } catch (e) { console.warn('Failed to clear IndexedDB on logout', e); }
            }

            // Close modal
            closeLogoutModal();

            // Reload page to reset state (simulating logout)
            window.location.reload();
        }

        function loadUserProfile() {
            try {
                const authUserStr = localStorage.getItem('authUser');
                if (authUserStr) {
                    const authUser = JSON.parse(authUserStr);

                    // Update Name
                    const nameEl = document.querySelector('.user-name');
                    if (nameEl) nameEl.textContent = authUser.username || 'User';

                    // Update Tier (assume 'tier' or 'plan' property, default to 'Free' if missing)
                    const tierEl = document.querySelector('.user-tier');
                    if (tierEl) {
                        const rawTier = String(authUser.tier || authUser.plan || 'Free');
                        tierEl.textContent = rawTier.charAt(0).toUpperCase() + rawTier.slice(1);
                    }

                    // Optional: Update Avatar if URL exists in object
                    if (authUser.avatar) {
                        const avatarEl = document.querySelector('.user-avatar');
                        if (avatarEl) avatarEl.src = authUser.avatar;
                    }
                } else {
                    // Fallback for unauthenticated state
                    document.querySelector('.user-name').textContent = 'Guest';
                    document.querySelector('.user-tier').textContent = 'Visitor';
                }
            } catch (e) {
                console.error("Failed to load user profile from storage:", e);
            }
        }

        // Initial load
        loadUserProfile();

        // Close user menu when clicking outside
        document.addEventListener('click', function (event) {
            const menu = document.getElementById('userMenu');
            const profile = document.querySelector('.user-profile');

            if (menu && !menu.classList.contains('hidden')) {
                if (profile && !profile.contains(event.target)) {
                    menu.classList.add('hidden');
                }
            }
        });

        // --- Custom Console & Security Logic ---

        const customConsole = document.getElementById('customConsole');
        const contextMenu = document.getElementById('customContextMenu');
        const consoleBody = document.getElementById('consoleBody');
        const payloadViewer = document.getElementById('payloadViewer');
        const payloadViewerBody = document.getElementById('payloadViewerBody');

        // Formatter and Renderer
        function formatValue(val, depth = 0) {
            if (depth > 2) return '<span class="t-meta">...</span>';

            if (val === null) return '<span class="t-null">null</span>';
            if (val === undefined) return '<span class="t-undefined">undefined</span>';

            const type = typeof val;
            if (type === 'boolean') return `<span class="t-bool">${val}</span>`;
            if (type === 'number') return `<span class="t-num">${val}</span>`;
            if (type === 'string') return `<span class="t-str">"${val.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}"</span>`;

            if (type === 'object') {
                if (Array.isArray(val)) {
                    const len = val.length;
                    const items = val.slice(0, 50).map(v => formatValue(v, depth + 1)).join(', ');
                    const meta = len > 50 ? ', ...' : '';
                    return `<span class="t-array-meta">Array(${len})</span> [${items}${meta}]`;
                }

                try {
                    const keys = Object.keys(val);
                    if (keys.length === 0) return '{}';
                    const props = keys.slice(0, 50).map(k => {
                        return `<span class="t-key">${k}</span>: ${formatValue(val[k], depth + 1)}`;
                    }).join(', ');
                    const meta = keys.length > 50 ? ', ...' : '';
                    return `{ ${props}${meta} }`;
                } catch (e) {
                    return String(val);
                }
            }
            return String(val);
        }

        // Exposed renderer for the head hook to call
        window.__renderLogEntry = function (type, args, dateObj) {
            if (!consoleBody) return;

            const entry = document.createElement('div');
            entry.className = `log-entry ${type}`;

            const now = dateObj || new Date();
            const time = now.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0');

            const timestamp = document.createElement('span');
            timestamp.className = 'log-timestamp';
            timestamp.textContent = `[${time}]`;

            const content = document.createElement('span');
            content.className = 'log-content';
            content.innerHTML = args.map(arg => formatValue(arg)).join(' ');

            entry.appendChild(timestamp);
            entry.appendChild(content);
            consoleBody.appendChild(entry);

            // Auto-scroll
            if (consoleBody.scrollHeight - consoleBody.scrollTop - consoleBody.clientHeight < 100) {
                consoleBody.scrollTop = consoleBody.scrollHeight;
            }
        };

        // Flush early logs
        (function flushBuffer() {
            if (window.__consoleBuffer) {
                window.__consoleBuffer.forEach(item => {
                    window.__renderLogEntry(item.type, item.args, item.time);
                });
                window.__consoleBuffer = null; // Clear buffer to stop growing
            }
        })();

        window.toggleCustomConsole = function () {
            customConsole.classList.toggle('visible');
            contextMenu.classList.remove('visible');
            if (customConsole.classList.contains('visible')) {
                consoleBody.scrollTop = consoleBody.scrollHeight;
            }
        };

        window.clearCustomConsole = function () {
            consoleBody.innerHTML = '';
        };

        function getLatestPayloadSnapshot() {
            if (window.__LAST_LLM_PAYLOAD) return window.__LAST_LLM_PAYLOAD;
            const history = Array.isArray(window.__LLM_PAYLOAD_HISTORY) ? window.__LLM_PAYLOAD_HISTORY : [];
            return history.length ? history[history.length - 1] : null;
        }

        function renderPayloadViewer() {
            if (!payloadViewerBody) return;
            const snapshot = getLatestPayloadSnapshot();
            if (!snapshot) {
                payloadViewerBody.textContent = 'No payload captured yet. Send a model request first, then open this viewer again.';
                return;
            }
            payloadViewerBody.textContent = JSON.stringify(snapshot, null, 2);
            payloadViewerBody.scrollTop = 0;
        }

        window.openPayloadViewer = function () {
            if (!payloadViewer) return;
            renderPayloadViewer();
            payloadViewer.classList.add('visible');
            contextMenu.classList.remove('visible');
        };

        window.togglePayloadViewer = function () {
            if (!payloadViewer) return;
            const willShow = !payloadViewer.classList.contains('visible');
            if (willShow) renderPayloadViewer();
            payloadViewer.classList.toggle('visible');
            contextMenu.classList.remove('visible');
        };

        window.refreshPayloadViewer = function () {
            renderPayloadViewer();
        };

        window.copyPayloadViewer = async function () {
            const snapshot = getLatestPayloadSnapshot();
            if (!snapshot) return;
            const text = JSON.stringify(snapshot, null, 2);
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(text);
                    console.log('Payload copied to clipboard.');
                    return;
                }
            } catch (_) { /* fallback below */ }

            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.setAttribute('readonly', 'readonly');
            textarea.style.position = 'fixed';
            textarea.style.left = '-99999px';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                console.log('Payload copied to clipboard.');
            } catch (err) {
                console.warn('Failed to copy payload:', err);
            } finally {
                document.body.removeChild(textarea);
            }
        };

        // Draggable Logic
        function makeFloatingWindowDraggable(winEl, headerEl) {
            if (!winEl || !headerEl) return;
            let isDragging = false;
            let startX, startY, initialLeft, initialTop;

            headerEl.addEventListener('mousedown', e => {
                if (e.target.closest('i')) return;
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                const rect = winEl.getBoundingClientRect();
                initialLeft = rect.left;
                initialTop = rect.top;
                document.addEventListener('mousemove', onDrag);
                document.addEventListener('mouseup', stopDrag);
                headerEl.style.cursor = 'grabbing';
            });

            function onDrag(e) {
                if (!isDragging) return;
                e.preventDefault();
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                winEl.style.left = `${initialLeft + dx}px`;
                winEl.style.top = `${initialTop + dy}px`;
                winEl.style.right = 'auto';
                winEl.style.bottom = 'auto';
            }

            function stopDrag() {
                isDragging = false;
                document.removeEventListener('mousemove', onDrag);
                document.removeEventListener('mouseup', stopDrag);
                headerEl.style.cursor = 'grab';
            }
        }

        makeFloatingWindowDraggable(customConsole, document.getElementById('consoleHeader'));
        makeFloatingWindowDraggable(payloadViewer, document.getElementById('payloadViewerHeader'));

        // Custom Context Menu Logic
        document.addEventListener('contextmenu', function (e) {
            e.preventDefault(); // Disable native menu

            const x = e.clientX;
            const y = e.clientY;
            const winW = window.innerWidth;
            const winH = window.innerHeight;
            const menuW = 220;
            const estimatedMenuHeight = Math.max(contextMenu.offsetHeight || 0, (contextMenu.childElementCount || 1) * 36 + 12);
            const menuH = estimatedMenuHeight || 50;

            let posX = x;
            let posY = y;

            // Boundary checks
            if (x + menuW > winW) posX = x - menuW;
            if (y + menuH > winH) posY = y - menuH;

            contextMenu.style.left = `${posX}px`;
            contextMenu.style.top = `${posY}px`;
            contextMenu.classList.add('visible');
        });

        // Close context menu on click outside
        document.addEventListener('click', function (e) {
            if (!contextMenu.contains(e.target)) {
                contextMenu.classList.remove('visible');
            }
        });

        // Block Native DevTools & Handle Shortcuts
        document.addEventListener('keydown', function (e) {
            // Toggle Custom Console: Ctrl+Shift+Q
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'q' || e.key === 'Q')) {
                e.preventDefault();
                window.toggleCustomConsole();
                return;
            }

            // Block Native Shortcuts
            // F12
            if (e.key === 'F12') { e.preventDefault(); return; }

            if (e.ctrlKey || e.metaKey) {
                // Ctrl+U (View Source)
                if (e.key === 'u' || e.key === 'U') { e.preventDefault(); return; }

                // Ctrl+Shift+I/J/C (DevTools)
                if (e.shiftKey) {
                    if (['i', 'I', 'j', 'J', 'c', 'C'].includes(e.key)) {
                        e.preventDefault();
                        return;
                    }
                }
            }
        });
