        // Landing page behaviour: Get Started entry points + floating CTA on scroll
        (function () {
            const landing = document.getElementById('landingPage');
            const intro = document.getElementById('lpIntro');
            const floating = document.getElementById('lpFloatingCta');
            const yearEl = document.getElementById('lpYear');
            if (yearEl) yearEl.textContent = new Date().getFullYear();

            function setAuthMode(wantLogin) {
                if (typeof isLoginMode !== 'undefined' && isLoginMode !== wantLogin && typeof toggleAuthMode === 'function') {
                    toggleAuthMode();
                }
            }

            // Signed-in users go straight to the app; others see the register form.
            window.openGetStarted = function () {
                if (localStorage.getItem('authToken')) {
                    showChatInterface();
                    return;
                }
                setAuthMode(false);
                showAuthModal();
            };

            window.openLogin = function () {
                if (localStorage.getItem('authToken')) {
                    showChatInterface();
                    return;
                }
                setAuthMode(true);
                showAuthModal();
            };

            // Show the floating Get Started button once the user scrolls past the intro.
            function updateFloating() {
                if (!landing || !intro || !floating) return;
                const threshold = intro.offsetTop + intro.offsetHeight - 120;
                const show = landing.scrollTop > threshold && !landing.classList.contains('hidden');
                floating.classList.toggle('visible', show);
                floating.setAttribute('aria-hidden', show ? 'false' : 'true');
                floating.tabIndex = show ? 0 : -1;
            }

            if (landing) {
                landing.addEventListener('scroll', updateFloating, { passive: true });
                window.addEventListener('resize', updateFloating);
                updateFloating();
            }
        })();
