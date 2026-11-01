                    <i class="fas fa-chevron-down"></i>
                </button>
                <div id="modelDropdown" class="model-dropdown-menu hidden">
                    <div class="model-dropdown-header">Choose a model</div>
                    <div id="modelDropdownList" class="model-dropdown-list">
                        <!-- Models will be populated here -->
                    </div>
                </div>
            </div>
        </div>
        <div class="header-right">
            <button class="btn btn--outline btn--sm" onclick="showLandingPage()">
                <i class="fas fa-home"></i>
            </button>
        </div>
    </header>

    <!-- Base/wall at very bottom of the chat UI -->
    <div id="uiBase" class="ui-base hidden" aria-hidden="true">
        <div class="ui-base-inner"></div>
    </div>

    <!-- Center welcome text for new chat (desktop center, mobile center-height) -->
    <div id="uiWelcomeCenter" class="ui-welcome-center hidden">
        <h3>Where should we begin?</h3>
    </div>

    <!-- Independent input dock (not inside chatInterface) -->
    <div id="uiInputDock" class="ui-input hidden">
        <input type="file" id="fileInput" multiple
            accept=".jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.txt,.docx,.pdf,.mp3,.wav,.flac,.aac,.m4a,.ogg,.aiff,.webm,.pcm,.mpeg,.mpga"
            style="display: none;">

        <!-- Uploaded files display outside input box -->
        <div id="uploadedFiles" class="uploaded-files"></div>

        <!-- Selected features display outside input box -->
        <div id="selectedFeatures" class="selected-features"></div>

        <div class="input-box-unified" role="group" aria-label="Message composer">
            <!-- Plus button -->
            <div class="plus-menu-container">
                <button class="plus-btn-compact" id="plusBtn" onclick="togglePlusMenu()" aria-label="More">
                    <i class="fas fa-plus"></i>
                </button>
                <div id="plusMenu" class="plus-menu hidden" role="menu">
                    <button class="plus-menu-item" id="webSearchToggle" onclick="toggleFeature('webSearch')">
                        <i class="fas fa-search"></i>
                        <span>Web Search</span>
                    </button>
                    <button class="plus-menu-item" id="createImageToggle" onclick="toggleFeature('createImage')">
                        <i class="fas fa-paintbrush"></i>
                        <span>Create image</span>
                    </button>
                    <button class="plus-menu-item" onclick="toggleFeature('extendThinking')">
                        <i class="fas fa-lightbulb"></i>
                        <span>Think</span>
                    </button>
                    <button class="plus-menu-item" onclick="document.getElementById('fileInput').click()">
                        <i class="fas fa-paperclip"></i>
                        <span>Add photos & files</span>
                    </button>
                    <button class="plus-menu-item" onclick="toggleFeature('debug')">
                        <i class="fas fa-bug"></i>
                        <span>Debug</span>
                    </button>
                </div>
            </div>

            <!-- Input textarea -->
            <textarea id="messageInput" placeholder="Ask anything" rows="1" aria-label="Message"></textarea>

            <!-- Settings gear button -->
            <div class="settings-menu-container">
                <button class="settings-btn-compact" id="settingsBtn" onclick="toggleSettingsMenu()"
                    aria-haspopup="true" aria-expanded="false" aria-controls="settingsMenu">
                    <i class="fas fa-cog"></i>
                </button>
                <div id="settingsMenu" class="settings-menu hidden" role="menu">
                    <div class="settings-menu-header">Mode</div>
                    <button class="settings-menu-item mode-option" data-section="general"
                        onclick="switchMode('general')">
                        <i class="fas fa-comments"></i>
                        <span>General</span>
                        <i class="fas fa-check mode-check" id="checkGeneral"></i>
                    </button>
                    <button class="settings-menu-item mode-option" data-section="fact-checker"
                        onclick="switchMode('fact-checker')">
                        <i class="fas fa-search-plus"></i>
                        <span>Fact Checker</span>
                        <i class="fas fa-check mode-check hidden" id="checkFactChecker"></i>
                    </button>
                </div>
            </div>

            <!-- Stop/Send buttons -->
            <button id="stopButton" class="stop-btn-compact hidden" onclick="stopGeneration()" aria-label="Stop">
                <i class="fas fa-square"></i>
            </button>
            <button id="sendButton" class="send-btn-compact" onclick="sendMessage()" disabled aria-label="Send">
                <i class="fas fa-arrow-up"></i>
            </button>
        </div>
    </div>

    <div id="chatInterface" class="chat-interface hidden">

        <div class="chat-layout">
            <aside id="sidebar" class="sidebar">
                <div class="sidebar-header">
                    <button class="sidebar-newchat-btn" onclick="newChat()" title="New chat">
                        <i class="fas fa-pen"></i>
                        <span class="sidebar-newchat-label">New chat</span>
                    </button>
                </div>
                <div class="chat-history">
                    <h4>Chat History</h4>
                    <div id="chatHistoryList" class="chat-history-list">
                    </div>
                    <button class="btn btn--outline btn--sm btn--full-width" onclick="clearHistory()">
                        <i class="fas fa-trash"></i> Clear History
                    </button>
                </div>
                <div class="user-profile" onclick="toggleUserMenu(event)">
                    <img src="ico.png" alt="User" class="user-avatar">
                    <div class="user-info">
                        <div class="user-name"></div>
                        <div class="user-tier"></div>
                    </div>
                    <div id="userMenu" class="user-menu hidden">
                        <div class="user-menu-item" onclick="openUpgradeModal(event)">
                            <i class="fas fa-arrow-up"></i> Upgrade plan
                        </div>
                        <div class="user-menu-item" onclick="openSettings(event)">
                            <i class="fas fa-cog"></i> Settings
                        </div>
                        <div class="user-menu-item" onclick="confirmLogout(event)">
                            <i class="fas fa-sign-out-alt"></i> Log out
                        </div>
                    </div>
                </div>
            </aside>

            <main class="chat-main">
                <!-- Removed in-chat mode header for cleaner UI -->

                <div id="messagesArea" class="messages-area">
                    <div class="welcome-message">
                        <div class="welcome-icon">
                            <i class="fas fa-comments"></i>
                        </div>
                        <h3>Welcome to ExpertLLM General Mode</h3>
                        <p>I'm here to help you with any task. Upload files or start typing to begin!</p>
                        <div class="capabilities-grid">
                            <div class="capability-item">
                                <i class="fas fa-book"></i>
                                <span>Creative storytelling</span>
                            </div>
                            <div class="capability-item">
                                <i class="fas fa-newspaper"></i>
                                <span>Essay & article writing</span>
                            </div>
                            <div class="capability-item">
                                <i class="fas fa-bullhorn"></i>
                                <span>Marketing content</span>
                            </div>
                            <div class="capability-item">
                                <i class="fas fa-spell-check"></i>
                                <span>Grammar improvement</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Input moved out: see #uiInputDock -->
            </main>
        </div>
        <div id="sidebarBackdrop" class="sidebar-backdrop hidden" onclick="toggleSidebar()"></div>
    </div>

    <div id="fileModal" class="modal hidden">
        <div class="modal-content">
            <div class="modal-header">
                <h3>File Preview</h3>
                <button class="modal-close" onclick="closeFileModal()">&times;</button>
            </div>
            <div id="modalBody" class="modal-body">
            </div>
        </div>
    </div>

    <!-- Upgrade Plan Modal -->
    <div id="upgradeModal" class="modal hidden">
        <div class="modal-content upgrade-modal-content">
            <div class="modal-header">
                <h3>Upgrade your plan</h3>
                <button class="modal-close" onclick="closeUpgradeModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="pricing-grid">
                    <!-- Free Plan -->
                    <div class="pricing-card">
                        <div class="pricing-header">
                            <h3>Free</h3>
                            <div class="pricing-price">
                                Rp 0 <span class="pricing-period">/ month</span>
                            </div>
                            <p class="pricing-desc">For hobbies and everyday tasks.</p>
                        </div>
                        <button class="btn btn--outline pricing-btn" id="btn-plan-free" disabled>Current Plan</button>
                        <ul class="pricing-features">
                            <li>Access to standard AI models</li>
                            <li>Standard response speed</li>
                            <li>Regular model updates</li>
                            <li>Access to community support</li>
                        </ul>
                    </div>

                    <!-- Plus Plan -->
                    <div class="pricing-card">
                        <div class="pricing-header">
                            <h3>Plus</h3>
                            <div class="pricing-price">
                                Rp 349.000 <span class="pricing-period">/ month</span>
                            </div>
                            <p class="pricing-desc">Boost your productivity with more power.</p>
                        </div>
                        <button class="btn btn--primary pricing-btn" id="btn-plan-plus"
                            onclick="selectPlan('Plus')">Upgrade to Plus</button>
                        <ul class="pricing-features">
                            <li>Access to advanced AI models</li>
                            <li>Faster response times</li>
                            <li>Priority access during peak times</li>
                            <li>Early access to new features</li>
                            <li>Web search & advanced data analysis</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div id="logoutModal" class="modal hidden">
        <div class="modal-content logout-modal-content">
            <div class="modal-body logout-modal-body">
                <div class="logout-icon-area">
                    <div class="logout-icon-rect">
                        <i class="fas fa-sign-out-alt"></i>
                    </div>
                </div>
                <h3>Log out?</h3>
                <p>You will be logged out of your account. Your local data will be cleared.</p>
                <div class="logout-actions">
                    <button class="btn btn--secondary" onclick="closeLogoutModal()">Cancel</button>
                    <button class="btn btn--primary status--error" onclick="performLogout()">Log out</button>
                </div>
            </div>
        </div>
    </div>

    <!-- AI Generated Image Modal -->
    <div id="imageModal" class="image-modal-overlay" onclick="closeImageModal(event)">
        <div class="image-modal-content" onclick="event.stopPropagation()">
            <button class="image-modal-close" onclick="closeImageModal()" aria-label="Close">&times;</button>
            <img id="modalImage" src="" alt="AI Generated Image">
            <div class="image-modal-actions">
                <button class="download-btn" onclick="downloadModalImage()">
                    <i class="fas fa-download"></i> Download Image
                </button>
                <button class="close-btn" onclick="closeImageModal()">
                    <i class="fas fa-times"></i> Close
                </button>
            </div>
        </div>
    </div>
