    <div id="landingPage" class="landing-page">
        <header class="lp-header">
            <div class="lp-container">
                <a class="lp-logo" href="#lpTop"><i class="fas fa-brain"></i> ExpertLLM</a>
                <nav class="lp-nav" aria-label="Main">
                    <a class="lp-link" href="#lpFeatures">Features</a>
                    <a class="lp-link" href="#lpModels">Models</a>
                    <a class="lp-link" href="#lpPricing">Pricing</a>
                    <a class="lp-link" href="#" onclick="openLogin(); return false;">Log in</a>
                    <button type="button" class="lp-btn lp-btn--primary" id="lpHeaderCta"
                        onclick="openGetStarted()">Get started</button>
                </nav>
            </div>
        </header>

        <main id="lpTop">
            <section class="lp-hero" id="lpIntro">
                <div class="lp-container">
                    <span class="lp-pill"><i class="fas fa-circle-check"></i> Multi-model AI with web search</span>
                    <h1>Ask once. Get <span>sourced answers</span> from the best AI models.</h1>
                    <p class="lp-sub">ExpertLLM brings Gemini, Qwen, Kimi and DeepSeek into one workspace, with
                        fact-checked web research and image generation built in.</p>
                    <div class="lp-cta-row">
                        <button type="button" class="lp-btn lp-btn--primary lp-btn--lg" onclick="openGetStarted()">Get
                            started free</button>
                        <a class="lp-btn lp-btn--ghost lp-btn--lg" href="#lpFeatures">See features</a>
                    </div>
                    <p class="lp-note">No credit card required.</p>

                    <div class="lp-preview" aria-hidden="true">
                        <div class="lp-preview-bar"><i class="fas fa-brain"></i> <b>ExpertLLM</b> &middot; Fact Checker
                        </div>
                        <div class="lp-preview-body">
                            <div class="lp-bubble lp-bubble--user">What changed in the latest EU AI Act guidance?</div>
                            <div class="lp-bubble lp-bubble--ai">Here is a summary based on multiple sources, with the
                                key changes listed first.<small><i class="fas fa-link"></i> 6 sources checked</small>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section class="lp-section" id="lpFeatures">
                <div class="lp-container">
                    <div class="lp-section-head">
                        <h2>Everything you need in one place</h2>
                        <p>Research, create and code without switching tools.</p>
                    </div>
                    <div class="lp-grid">
                        <div class="lp-card">
                            <div class="lp-icon"><i class="fas fa-layer-group"></i></div>
                            <h3>Multiple LLMs</h3>
                            <p>Switch between fast, thinking and deep reasoning models in a single chat.</p>
                        </div>
                        <div class="lp-card">
                            <div class="lp-icon"><i class="fas fa-search-plus"></i></div>
                            <h3>Fact Checker mode</h3>
                            <p>Multi-step web search that gathers, cross-checks and cites sources.</p>
                        </div>
                        <div class="lp-card">
                            <div class="lp-icon"><i class="fas fa-image"></i></div>
                            <h3>Image generation</h3>
                            <p>Create and edit images with Gemini 3 Pro Image directly from the conversation.</p>
                        </div>
                        <div class="lp-card">
                            <div class="lp-icon"><i class="fas fa-file-lines"></i></div>
                            <h3>Files and OCR</h3>
                            <p>Upload PDFs, Word documents, images and audio for analysis.</p>
                        </div>
                        <div class="lp-card">
                            <div class="lp-icon"><i class="fas fa-square-root-variable"></i></div>
                            <h3>Math and code</h3>
                            <p>Rendered equations, formatted code blocks and tables out of the box.</p>
                        </div>
                        <div class="lp-card">
                            <div class="lp-icon"><i class="fas fa-cloud"></i></div>
                            <h3>Synced history</h3>
                            <p>Your chats follow you across devices when you sign in.</p>
                        </div>
                    </div>
                </div>
            </section>

            <section class="lp-section lp-section--soft" id="lpModels">
                <div class="lp-container">
                    <div class="lp-section-head">
                        <h2>Powered by leading models</h2>
                        <p>Pick the right model for the job.</p>
                    </div>
                    <div class="lp-models">
                        <span class="lp-chip"><i class="fas fa-bolt"></i> Gemini 3 Flash</span>
                        <span class="lp-chip"><i class="fas fa-brain"></i> Gemini 2.5 Pro</span>
                        <span class="lp-chip"><i class="fas fa-wand-magic-sparkles"></i> Gemini 3.1 Pro</span>
                        <span class="lp-chip"><i class="fas fa-image"></i> Gemini 3 Pro Image</span>
                        <span class="lp-chip"><i class="fas fa-microchip"></i> Qwen3 235B Thinking</span>
                        <span class="lp-chip"><i class="fas fa-moon"></i> Kimi K2 Thinking</span>
                        <span class="lp-chip"><i class="fas fa-code"></i> DeepSeek V3.1</span>
                    </div>
                </div>
            </section>

            <section class="lp-section" id="lpPricing">
                <div class="lp-container">
                    <div class="lp-section-head">
                        <h2>Simple plans</h2>
                        <p>Start free. Upgrade when you need more.</p>
                    </div>
                    <div class="lp-pricing">
                        <div class="lp-plan">
                            <h3>Free</h3>
                            <div class="lp-price">$0 <small>/ month</small></div>
                            <p class="lp-plan-desc">For trying things out.</p>
                            <ul>
                                <li><i class="fas fa-check"></i> Access to core models</li>
                                <li><i class="fas fa-check"></i> Fact Checker web search</li>
                                <li><i class="fas fa-check"></i> Daily usage limits</li>
                                <li><i class="fas fa-check"></i> Limited cloud chat storage</li>
                            </ul>
                            <button type="button" class="lp-btn lp-btn--ghost lp-btn--block"
                                onclick="openGetStarted()">Get started</button>
                        </div>
                        <div class="lp-plan lp-plan--featured">
                            <span class="lp-plan-tag">Coming soon</span>
                            <h3>Pro</h3>
                            <div class="lp-price">TBA <small>/ month</small></div>
                            <p class="lp-plan-desc">For daily research and creative work.</p>
                            <ul>
                                <li><i class="fas fa-check"></i> Higher usage limits</li>
                                <li><i class="fas fa-check"></i> Expert and deep thinking models</li>
                                <li><i class="fas fa-check"></i> More image generations</li>
                                <li><i class="fas fa-check"></i> Expanded synced chat storage</li>
                            </ul>
                            <button type="button" class="lp-btn lp-btn--primary lp-btn--block"
                                onclick="openGetStarted()">Start free, upgrade later</button>
                        </div>
                    </div>
                </div>
            </section>

            <section class="lp-section lp-section--soft lp-final">
                <div class="lp-container">
                    <h2>Ready to try ExpertLLM?</h2>
                    <p>Create a free account in under a minute.</p>
                    <button type="button" class="lp-btn lp-btn--primary lp-btn--lg" onclick="openGetStarted()">Get
                        started</button>
                </div>
            </section>
        </main>

        <footer class="lp-footer">
            <div class="lp-container">
                <span>&copy; <span id="lpYear">2026</span> ExpertLLM Ltd</span>
                <span>Answers may contain errors. Verify important information.</span>
            </div>
        </footer>

        <button type="button" class="lp-btn lp-btn--primary lp-btn--lg lp-floating-cta" id="lpFloatingCta"
            onclick="openGetStarted()" aria-hidden="true" tabindex="-1">Get started</button>
    </div>

    <!-- Independent chat header (not inside chatInterface) -->
    <header id="uiHeader" class="chat-header hidden">
        <div class="header-left">
            <button class="sidebar-toggle" onclick="toggleSidebar()">
                <i class="fas fa-bars"></i>
            </button>
            <div class="model-selector-dropdown">
                <button class="model-dropdown-btn" id="modelDropdownBtn" onclick="toggleModelDropdown()">
                    <span class="model-title">ExpertLLM</span>
                    <span class="model-subtitle" id="selectedModelName">Fast</span>
