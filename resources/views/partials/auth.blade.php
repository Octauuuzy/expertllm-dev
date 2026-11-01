    <div id="storagePopup" class="storage-popup">
        <i class="fas fa-exclamation-triangle"></i>
        <div class="storage-popup-text">
            You are ran out of storage account for free tier, upgrade to Pro or your new messages will saved locally.
        </div>
        <button class="btn" onclick="document.getElementById('storagePopup').classList.remove('active')"
            style="padding: 4px 8px; font-size: 0.8rem;">OK</button>
    </div>

    <div id="authModal" class="auth-modal-overlay">
        <div class="auth-modal">
            <button type="button" class="auth-close" id="authClose" aria-label="Close">&times;</button>
            <h2 class="auth-title" id="authTitle">Login</h2>
            <div id="authError" class="auth-error"></div>
            <form id="authForm">
                <div class="auth-form-group">
                    <label class="auth-label" for="authUsername">Username</label>
                    <input type="text" id="authUsername" class="auth-input" required>
                </div>
                <div class="auth-form-group" id="authEmailGroup" style="display: none;">
                    <label class="auth-label" for="authEmail">Email</label>
                    <input type="email" id="authEmail" class="auth-input">
                </div>
                <div class="auth-form-group">
                    <label class="auth-label" for="authPassword">Password</label>
                    <input type="password" id="authPassword" class="auth-input" required>
                </div>
                <button type="submit" class="auth-btn" id="authSubmitBtn">Login</button>
            </form>
            <div class="auth-switch">
                <span id="authSwitchText">Don't have an account?</span>
                <a id="authSwitchLink">Register</a>
            </div>
        </div>
    </div>

