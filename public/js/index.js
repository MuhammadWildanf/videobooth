        // --- MULTI-EVENT CONFIGURATION ---
        const urlParams = new URLSearchParams(window.location.search);
        const activeEvent = urlParams.get('event') || (window.location.pathname.includes('localhunt') ? 'localhunt' : 'audric-cathrine');

        // --- KEYBOARD SYSTEM ---
        let activeInput = null;
        let caps = true;
        let num = false;
        const row1 = "QWERTYUIOP".split(''), row2 = "ASDFGHJKL".split(''), row3 = "ZXCVBNM".split('');
        const nums = "1234567890-/@:();\"+!?. ,*#&".split('');
        let deliveryMethod = 'whatsapp'; // Default, but we collect both now

        function drawKbd() {
            const draw = (id, keys) => {
                const el = document.getElementById(id); 
                if (!el) return;
                el.innerHTML = '';
                if (id === 'kbd-3') el.innerHTML += `<div class="key wide" onclick="kCaps()">⬆️</div>`;
                keys.forEach(k => { el.innerHTML += `<div class="key" onclick="kPress('${k}')">${caps ? k : k.toLowerCase()}</div>`; });
                if (id === 'kbd-3') el.innerHTML += `<div class="key wide" onclick="kBks()">⌫</div>`;
            };

            let r1 = num ? nums.slice(0, 10) : row1;
            let r2 = num ? nums.slice(10, 19) : row2;
            let r3 = num ? nums.slice(19, 26) : row3;

            // In email mode (non-num), let's swap some less used keys for @ and .
            if (!num && activeInput?.id === 'email-input') {
                r3 = [...r3];
                r3.push('@', '.');
            }

            draw('kbd-1', r1);
            draw('kbd-2', r2);
            draw('kbd-3', r3);
        }
        drawKbd();

        const nameInput = document.getElementById('name');
        if (nameInput) {
            nameInput.addEventListener('click', () => {
                activeInput = document.getElementById('name');
                num = false;
                drawKbd();
                document.getElementById('kbd-container').classList.add('show');
                document.querySelector('.center-panel').classList.add('keyboard-active');
            });
        }
        const phoneInput = document.getElementById('phone');
        if (phoneInput) {
            phoneInput.addEventListener('click', () => {
                activeInput = document.getElementById('phone');
                num = true;
                drawKbd();
                document.getElementById('kbd-container').classList.add('show');
                document.querySelector('.center-panel').classList.add('keyboard-active');
            });
        }
        const emailInput = document.getElementById('email-input');
        if (emailInput) {
            emailInput.addEventListener('click', () => {
                activeInput = document.getElementById('email-input');
                num = false;
                drawKbd();
                document.getElementById('kbd-container').classList.add('show');
                document.querySelector('.center-panel').classList.add('keyboard-active');
            });
        }

        function kPress(k) { if (activeInput) activeInput.value += k; }
        function kBks() { if (activeInput) activeInput.value = activeInput.value.slice(0, -1); }
        function kCaps() { caps = !caps; drawKbd(); }
        function kMode() { num = !num; drawKbd(); }
        function kNext() {
            if (activeInput?.id === 'name') {
                activeInput = document.getElementById('phone');
                num = true;
                drawKbd();
            } else if (activeInput?.id === 'phone') {
                activeInput = document.getElementById('email-input');
                num = false;
                drawKbd();
            } else {
                activeInput = null;
                document.getElementById('kbd-container').classList.remove('show');
                document.querySelector('.center-panel').classList.remove('keyboard-active');
            }
        }

        // Hide keyboard when clicking outside inputs (on center panel)
        const centerPanel = document.querySelector('.center-panel');
        if (centerPanel) {
            centerPanel.addEventListener('click', (e) => {
                if (e.target.tagName !== 'INPUT' && !e.target.closest('.keyboard-wrapper')) {
                    const kbdContainer = document.getElementById('kbd-container');
                    if (kbdContainer) kbdContainer.classList.remove('show');
                    centerPanel.classList.remove('keyboard-active');
                }
            });
        }

        // --- STATE & UI TRANSITION ---
        let stateTransitionTimeout = null;
        function changeState(state) {
            window.changeState = changeState;
            window.currentState = state;

            const currentActive = document.querySelectorAll('.ui-state.active');
            
            if (currentActive.length > 0) {
                // Trigger fade-out animation
                currentActive.forEach(el => el.classList.remove('fade-out'));
                void document.body.offsetWidth; // Force reflow
                currentActive.forEach(el => el.classList.add('fade-out'));
                
                if (stateTransitionTimeout) clearTimeout(stateTransitionTimeout);
                
                stateTransitionTimeout = setTimeout(() => {
                    executeChangeState(state);
                }, 200);
            } else {
                executeChangeState(state);
            }
        }

        function executeChangeState(state) {
            // Update state classes on body
            document.body.classList.remove('state-idle', 'state-form', 'state-ready', 'state-ready-photo', 'state-recording', 'state-review-video', 'state-review-final', 'state-processing', 'state-payment', 'state-payment-qris');
            document.body.classList.add('state-' + state);

            document.querySelectorAll('.ui-state').forEach(el => {
                el.classList.remove('active', 'fade-out');
            });
            const newState = document.getElementById('state-' + state);
            if (newState) newState.classList.add('active');

            const largeImg = document.getElementById('photo-preview-large');
            if (largeImg) {
                if (state === 'review-final') {
                    largeImg.classList.remove('hidden');
                } else {
                    largeImg.classList.add('hidden');
                }
            }

            const leftPanel = document.getElementById('panel-left');
            const rightPanel = document.getElementById('panel-right');
            const rightLabel = document.getElementById('label-right-overlay');
            const idleHeader = document.getElementById('idle-header');

            if (state === 'form') {
                document.body.classList.add('state-form-active');
            } else {
                document.body.classList.remove('state-form-active');
                // explicitly hide keyboard
                const kbdContainer = document.getElementById('kbd-container');
                if (kbdContainer) kbdContainer.classList.remove('show');
                const centerPanel = document.querySelector('.center-panel');
                if (centerPanel) centerPanel.classList.remove('keyboard-active');
                activeInput = null;
            }

            if (state === 'idle') {
                document.body.classList.remove('logo-top-left');
            } else if (state === 'form') {
                document.body.classList.add('logo-top-left');
            } else {
                document.body.classList.add('logo-top-left');
            }

            // idleHeader is ALWAYS visible now, we just hide its children using CSS
            if (idleHeader) idleHeader.classList.remove('hidden');

            const webcamEl = document.getElementById('webcam');

            if (state === 'idle' || state === 'form') {
                if (state === 'idle') {
                    if (window.showLeftPanel !== false) {
                        if (leftPanel) leftPanel.classList.remove('hidden-panel');
                    } else {
                        if (leftPanel) leftPanel.classList.add('hidden-panel');
                    }

                    if (window.showRightPanel !== false) {
                        if (rightPanel) rightPanel.classList.remove('hidden-panel');
                    } else {
                        if (rightPanel) rightPanel.classList.add('hidden-panel');
                    }
                } else {
                    if (leftPanel) leftPanel.classList.add('hidden-panel');
                    if (rightPanel) rightPanel.classList.add('hidden-panel');
                }

                if (rightLabel) rightLabel.classList.remove('hidden');

                // Tampilkan video jika URL-nya ada
                const previewVid = document.getElementById('preview');
                const loopVid = document.getElementById('loop-preview');

                if (webcamEl) webcamEl.classList.add('hidden');

                if (previewVid && previewVid.getAttribute('src') && previewVid.getAttribute('src') !== 'No video' && previewVid.getAttribute('src') !== '') {
                    previewVid.classList.remove('hidden');
                    previewVid.play().catch(() => {});
                } else if (previewVid) {
                    previewVid.classList.add('hidden');
                }

                if (loopVid && loopVid.getAttribute('src') && loopVid.getAttribute('src') !== 'No video' && loopVid.getAttribute('src') !== '') {
                    loopVid.classList.remove('hidden');
                    loopVid.play().catch(() => {});
                } else if (loopVid) {
                    loopVid.classList.add('hidden');
                }
            } else {
                if (leftPanel) leftPanel.classList.remove('hidden-panel');
                if (rightPanel) rightPanel.classList.remove('hidden-panel');
                if (rightLabel) rightLabel.classList.add('hidden');

                const previewEl = document.getElementById('preview');
                const loopEl = document.getElementById('loop-preview');

                if (state === 'ready' || state === 'ready-photo' || state === 'recording') {
                    // LIVE CAMERA STATES: Show webcam, hide recorded previews
                    if (webcamEl) webcamEl.classList.remove('hidden');
                    if (previewEl) {
                        previewEl.classList.add('hidden');
                        try { previewEl.pause(); } catch(e){}
                    }
                    if (loopEl) {
                        loopEl.classList.add('hidden');
                        try { loopEl.pause(); } catch(e){}
                    }

                    if (state === 'ready') {
                        // Reset Button UI
                        const btn = document.getElementById('btn-record');
                        if (btn) {
                            btn.classList.remove('recording');
                            btn.style.pointerEvents = 'auto';
                        }
                        const cdArea = document.getElementById('countdown-area');
                        if (cdArea) cdArea.innerText = 'Start Recording';
                    } else if (state === 'ready-photo') {
                        // Reset Shutter Button UI
                        const btn = document.getElementById('btn-photo-shutter');
                        if (btn) {
                            btn.style.pointerEvents = 'auto';
                        }
                        const cdAreaPhoto = document.getElementById('countdown-area-photo');
                        if (cdAreaPhoto) cdAreaPhoto.innerText = 'Take a Photo';
                    }
                } else if (state === 'review-video' || state === 'review-final') {
                    // PLAYBACK RECORDED VIDEO
                    if (webcamEl) webcamEl.classList.add('hidden');
                    if (previewEl) {
                        previewEl.classList.remove('hidden');
                        previewEl.play().catch(() => {});
                    }
                } else {
                    if (webcamEl) webcamEl.classList.add('hidden');
                    if (previewEl) previewEl.classList.add('hidden');
                    if (loopEl) loopEl.classList.add('hidden');
                }
            }
        }

        // --- LOAD CONFIG ---
        function preloadImage(url) {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => resolve(url);
                img.onerror = () => resolve(url); // Don't block loading if one fails
                img.src = url;
            });
        }

        function checkEventStatus(status) {
            let overlay = document.getElementById('event-inactive-overlay');
            if (status === 'inactive') {
                if (!overlay) {
                    overlay = document.createElement('div');
                    overlay.id = 'event-inactive-overlay';
                    overlay.className = 'event-inactive-overlay';
                    overlay.innerHTML = `
                        <div class="event-inactive-card">
                            <div class="event-inactive-icon">⚠️</div>
                            <h1 class="event-inactive-title">Event Inactive</h1>
                            <p class="event-inactive-message">This event is currently disabled or has ended.<br>Please contact the administrator.</p>
                            <div class="event-inactive-brand">LUMEA PREMIUM</div>
                        </div>
                    `;
                    document.body.appendChild(overlay);
                }
                try {
                    if (stream) {
                        stream.getTracks().forEach(track => track.stop());
                        stream = null;
                    }
                    const webcam = document.getElementById('webcam');
                    if (webcam) webcam.srcObject = null;
                } catch (e) { }
            } else {
                if (overlay) {
                    overlay.remove();
                }
            }
        }

        function applyCachedTheme() {
            try {
                const cached = localStorage.getItem('vb_config_' + activeEvent);
                if (!cached) return;
                const data = JSON.parse(cached);

                checkEventStatus(data.status);
                if (data.status === 'inactive') return;

                // Update document title dynamically
                if (data.title) {
                    document.title = data.title + " - Videobooth";
                    if (loadingBrandText) loadingBrandText.innerText = data.title;
                } else {
                    document.title = activeEvent + " - Videobooth";
                    if (loadingBrandText) loadingBrandText.innerText = activeEvent;
                }

                // Set global state variables
                window.showLeftPanel = data.showLeftPanel !== false;
                window.showRightPanel = data.showRightPanel !== false;
                window.recordingDuration = data.recordingDuration || 30;
                const readyDurationEl = document.getElementById('ready-duration-val');
                if (readyDurationEl) {
                    readyDurationEl.innerText = `${window.recordingDuration} SECONDS`;
                }

                if (typeof data.sessionPrice !== 'undefined') {
                    const priceDisplayEl = document.getElementById('payment-price-display');
                    if (priceDisplayEl) {
                        const numericPrice = parseInt(data.sessionPrice) || 0;
                        priceDisplayEl.innerText = `Rp${numericPrice.toLocaleString('id-ID')}`;
                    }
                }

                window.readyCdText = data.readyCdText || 'Recording Begins in...';
                window.recordingCdText = data.recordingCdText || 'Recording...';
                window.photoCdText = data.photoCdText || 'Taking Photo in...';

                // Immediately show/hide Left/Right panels based on cache
                const leftPanel = document.getElementById('panel-left');
                const rightPanel = document.getElementById('panel-right');

                if (leftPanel) {
                    if (window.showLeftPanel) leftPanel.classList.remove('hidden-panel');
                    else leftPanel.classList.add('hidden-panel');
                }
                if (rightPanel) {
                    if (window.showRightPanel) rightPanel.classList.remove('hidden-panel');
                    else rightPanel.classList.add('hidden-panel');
                }

                // Immediately update titles & subtitles
                const titleRow = document.querySelector('.names-row');
                if (titleRow && data.title) {
                    let formattedTitle = '';
                    if (data.title.includes('&')) {
                        const parts = data.title.split('&');
                        formattedTitle = `<span>${parts[0].trim()}</span> <span class="title-amp">&amp;</span> <span>${parts.slice(1).join('&').trim()}</span>`;
                    } else {
                        formattedTitle = `<span>${data.title}</span>`;
                    }
                    titleRow.innerHTML = formattedTitle;
                }

                const subEl = document.getElementById('idle-sub');
                if (subEl && data.subtitle) subEl.innerText = data.subtitle;

                const descEl = document.getElementById('desc-premium');
                if (descEl && data.descPremium) descEl.innerText = data.descPremium;

                const startBtn = document.getElementById('start-btn-text');
                if (startBtn && data.startText) startBtn.innerText = data.startText;

                const logoEl = document.getElementById('main-logo');
                if (logoEl && data.logoUrl) {
                    logoEl.src = data.logoUrl;
                }

                const brandingLogoEl = document.getElementById('branding-logo');
                if (brandingLogoEl && data.logoUrl) {
                    brandingLogoEl.src = data.logoUrl;
                }
            } catch (e) {
                console.warn("Cached theme apply failed:", e);
            }
        }

        async function applyTheme() {
            try {
                const res = await fetch(`/api/config?event=${activeEvent}`, { cache: 'no-store' });
                const data = await res.json();
                localStorage.setItem('vb_config_' + activeEvent, JSON.stringify(data));

                checkEventStatus(data.status);
                if (data.status === 'inactive') return;

                // Show Xendit KYC button only if payment is required
                const kycBtn = document.getElementById('kyc-business-info-btn');
                if (kycBtn) {
                    if (data.price && parseInt(data.price) > 0) {
                        kycBtn.style.display = 'block';
                    } else {
                        kycBtn.style.display = 'none';
                    }
                }
                // 1. Preload Critical Images in Parallel
                const criticalAssets = [];
                if (data.bgImageUrl) criticalAssets.push(preloadImage(data.bgImageUrl));
                if (data.frameImageUrl) criticalAssets.push(preloadImage(data.frameImageUrl));
                if (data.logoUrl) criticalAssets.push(preloadImage(data.logoUrl));
                try {
                    await Promise.all(criticalAssets);
                } catch (e) { console.warn("Asset preload failed:", e); }

                // 2. Update Logo & Title (Only if different)
                const logoEl = document.getElementById('main-logo');
                if (logoEl && data.logoUrl) {
                    const targetLogo = new URL(data.logoUrl, window.location.origin).href;
                    if (logoEl.src !== targetLogo) logoEl.src = data.logoUrl;
                }

                const titleRow = document.querySelector('.names-row');
                if (titleRow && data.title) {
                    let formattedTitle = '';
                    if (data.title.includes('&')) {
                        const parts = data.title.split('&');
                        formattedTitle = `<span>${parts[0].trim()}</span> <span class="title-amp">&amp;</span> <span>${parts.slice(1).join('&').trim()}</span>`;
                    } else {
                        formattedTitle = `<span>${data.title}</span>`;
                    }
                    if (titleRow.innerHTML !== formattedTitle) titleRow.innerHTML = formattedTitle;
                }

                // Toggle Header Mode (Title vs Logo)
                const mainTitleEl = document.getElementById('main-title');
                const brandingLogoEl = document.getElementById('branding-logo');

                if (data.idleHeadMode === 'logo' && data.logoUrl) {
                    if (mainTitleEl && !mainTitleEl.classList.contains('hidden')) mainTitleEl.classList.add('hidden');
                    if (brandingLogoEl) {
                        const targetSrc = new URL(data.logoUrl, window.location.origin).href;
                        brandingLogoEl.onerror = function() { this.style.display = 'none'; }; // Hide if 404
                        if (brandingLogoEl.src !== targetSrc) brandingLogoEl.src = data.logoUrl;
                        if (brandingLogoEl.style.display !== 'block') brandingLogoEl.style.display = 'block';
                    }
                } else {
                    if (mainTitleEl && mainTitleEl.classList.contains('hidden')) mainTitleEl.classList.remove('hidden');
                    if (brandingLogoEl && brandingLogoEl.style.display !== 'none') brandingLogoEl.style.display = 'none';
                }

                // 2.5 Update Bottom Left Logo
                const bottomLeftLogoEl = document.getElementById('bottom-left-logo');
                if (bottomLeftLogoEl && data.bottomLeftLogoUrl) {
                    if (data.bottomLeftLogoUrl === 'none' || data.bottomLeftLogoUrl === '') {
                        bottomLeftLogoEl.style.display = 'none';
                    } else {
                        const targetBottomLeftSrc = new URL(data.bottomLeftLogoUrl, window.location.origin).href;
                        bottomLeftLogoEl.onerror = function() { this.style.display = 'none'; }; // Hide if 404
                        if (bottomLeftLogoEl.src !== targetBottomLeftSrc) bottomLeftLogoEl.src = data.bottomLeftLogoUrl;
                        bottomLeftLogoEl.style.display = 'block';
                    }
                }

                const subEl = document.getElementById('idle-sub');
                if (subEl && data.subtitle && subEl.innerText !== data.subtitle) subEl.innerText = data.subtitle;

                const descEl = document.getElementById('desc-premium');
                if (descEl && data.descPremium && descEl.innerText !== data.descPremium) descEl.innerText = data.descPremium;

                const startBtn = document.getElementById('start-btn-text');
                if (startBtn && data.startText && startBtn.innerText !== data.startText) startBtn.innerText = data.startText;

                // Update Instruction Texts (Only if different)
                const defaults = {
                    ready: "Get your pen and look at mirror. <br> Hit the record button when you are ready.",
                    review: "Please review your video, <br> you can RETAKE or UPLOAD.",
                    success: "Your video is still processing, <br> we will notify on your WhatsApp number when is done. <br><br> Thank You"
                };

                const readyEl = document.getElementById('ready-text');
                const targetReady = data.readyText || defaults.ready;
                if (readyEl && readyEl.innerHTML !== targetReady) readyEl.innerHTML = targetReady;

                const reviewEl = document.getElementById('review-video-text');
                const targetReview = data.reviewText || defaults.review;
                if (reviewEl && reviewEl.innerHTML !== targetReview) reviewEl.innerHTML = targetReview;

                const successEl = document.getElementById('success-text');
                const targetSuccess = data.successText || defaults.success;
                if (successEl && successEl.innerHTML !== targetSuccess) successEl.innerHTML = targetSuccess;

                // 3. Smart Video Asset Updates (Prevent infinite reload cycle)
                const tutorialVid = document.getElementById('preview');
                const resultVid = document.getElementById('loop-preview');

                if (data.tutorialVideoUrl && data.tutorialVideoUrl !== 'No video' && data.tutorialVideoUrl !== 'none') {
                    const cleanSrc = tutorialVid.src ? tutorialVid.src.split('?')[0] : '';
                    const targetUrl = new URL(data.tutorialVideoUrl, window.location.origin).href;
                    if (cleanSrc !== targetUrl) {
                        tutorialVid.src = targetUrl;
                        tutorialVid.muted = true;
                        tutorialVid.load();
                        tutorialVid.play().catch(e => console.warn("[THEME] Tutorial Play Skipped/Failed"));
                    }
                }
                if (data.resultVideoUrl && data.resultVideoUrl !== 'No video' && data.resultVideoUrl !== 'none' && resultVid) {
                    const cleanSrc = resultVid.src ? resultVid.src.split('?')[0] : '';
                    const targetUrl = new URL(data.resultVideoUrl, window.location.origin).href;
                    if (cleanSrc !== targetUrl) {
                        resultVid.src = targetUrl;
                        resultVid.muted = true;
                        resultVid.load();
                        resultVid.play().catch(e => console.warn("[THEME] Result Play Skipped/Failed"));
                    }
                }

                // 4. Optimized CSS Variable Updates (Prevent style flashing)
                const rootStyle = document.documentElement.style;
                if (data.bgImageUrl && data.bgImageUrl !== 'Default' && data.bgImageUrl !== 'none') {
                    const targetBg = `url("${data.bgImageUrl}")`;
                    if (document.body.style.backgroundImage !== targetBg) {
                        document.body.style.backgroundImage = targetBg;
                        document.body.style.backgroundSize = 'cover';
                    }
                } else {
                    const targetGrad = `radial-gradient(circle at center, var(--bg-1) 0%, var(--bg-2) 100%)`;
                    if (document.body.style.backgroundImage !== targetGrad) {
                        document.body.style.backgroundImage = targetGrad;
                    }
                }

                if (data.frameImageUrl && data.frameImageUrl !== 'Default' && data.frameImageUrl !== 'none') {
                    const targetFrame = `url("${data.frameImageUrl}")`;
                    if (rootStyle.getPropertyValue('--frame-image') !== targetFrame) {
                        rootStyle.setProperty('--frame-image', targetFrame);
                    }
                } else {
                    rootStyle.setProperty('--frame-image', 'none');
                }

                // Sync Overlay Frame Image
                const overlayFrameEl = document.getElementById('overlay-frame-img');
                if (overlayFrameEl) {
                    const ov = data.overlayImageUrl || data.frameImageUrl;
                    if (ov && ov !== 'none' && ov !== 'Default') {
                        const targetOvSrc = new URL(ov, window.location.origin).href;
                        if (overlayFrameEl.src !== targetOvSrc) overlayFrameEl.src = ov;
                        overlayFrameEl.style.display = 'block';
                    } else if (ov === 'none') {
                        overlayFrameEl.style.display = 'none';
                    }
                }

                if (data.accentColor && rootStyle.getPropertyValue('--accent') !== data.accentColor) rootStyle.setProperty('--accent', data.accentColor);
                if (data.titleColor && rootStyle.getPropertyValue('--title-color') !== data.titleColor) rootStyle.setProperty('--title-color', data.titleColor);
                if (data.descColor && rootStyle.getPropertyValue('--desc-color') !== data.descColor) rootStyle.setProperty('--desc-color', data.descColor);

                const targetFrameColor = data.frameColor || 'rgba(30, 41, 59, 0.95)';
                if (rootStyle.getPropertyValue('--frame') !== targetFrameColor) rootStyle.setProperty('--frame', targetFrameColor);

                const bg1 = data.bgColor1 || '#fdfbfb';
                if (rootStyle.getPropertyValue('--bg-1') !== bg1) rootStyle.setProperty('--bg-1', bg1);

                const bg2 = data.bgColor2 || '#ebedee';
                if (rootStyle.getPropertyValue('--bg-2') !== bg2) rootStyle.setProperty('--bg-2', bg2);

                const fontFamily = data.fontFamily || "'Aref Ruqaa', serif";
                if (rootStyle.getPropertyValue('--body-font-dyn') !== fontFamily) rootStyle.setProperty('--body-font-dyn', fontFamily);

                window.enableGesture = data.enableGesture !== false;
                window.recordingDuration = data.recordingDuration || 30;
                const readyDurationEl = document.getElementById('ready-duration-val');
                if (readyDurationEl) {
                    readyDurationEl.innerText = `${window.recordingDuration} SECONDS`;
                }

                if (typeof data.sessionPrice !== 'undefined') {
                    const priceDisplayEl = document.getElementById('payment-price-display');
                    if (priceDisplayEl) {
                        const numericPrice = parseInt(data.sessionPrice) || 0;
                        priceDisplayEl.innerText = `Rp${numericPrice.toLocaleString('id-ID')}`;
                    }
                }

                window.readyCdText = data.readyCdText || 'Recording Begins in...';
                window.recordingCdText = data.recordingCdText || 'Recording...';
                window.photoCdText = data.photoCdText || 'Taking Photo in...';
                window.showLeftPanel = data.showLeftPanel !== false;
                window.showRightPanel = data.showRightPanel !== false;

                // Re-apply current state if currently idle/form to immediately reflect left/right panel toggle updates
                if (window.currentState === 'idle') {
                    changeState('idle');
                }

                // Update Font if provided
                if (data.fontUrl) {
                    let link = document.getElementById('dynamic-font');
                    if (!link) {
                        link = document.createElement('link');
                        link.id = 'dynamic-font';
                        link.rel = 'stylesheet';
                        document.head.appendChild(link);
                    }
                    if (link.href !== data.fontUrl) link.href = data.fontUrl;
                }
                if (data.fontFamily || data.titleFontFamily) {
                    let styleParams = document.getElementById('dynamic-font-styles');
                    if (!styleParams) {
                        styleParams = document.createElement('style');
                        styleParams.id = 'dynamic-font-styles';
                        document.head.appendChild(styleParams);
                    }

                    styleParams.innerHTML = `
                        :root { 
                            --title-font-dyn: ${data.titleFontFamily || "'Luxurious Script', cursive"}; 
                            --body-font-dyn: ${data.fontFamily || "'Aref Ruqaa', serif"};
                        }
                        body, input, button, textarea, .subtitle-premium, .desc-premium, .panel-footer, .ui-state h2, .delivery-tab {
                            font-family: var(--body-font-dyn) !important;
                        }
                        .scribble-title, .scribble-title span, .names-row, .names-row span {
                            font-family: var(--title-font-dyn) !important;
                        }
                        #countdown-area, .countdown-text {
                            font-family: var(--body-font-dyn) !important;
                            font-style: italic;
                        }
                        #countdown-val {
                            font-family: 'Roboto', sans-serif !important;
                        }
                    `;
                }

                // Set initial state
                changeState('idle');

                // Loading complete - dismiss loading screen
                dismissLoading();

            } catch (e) {
                console.error("Theme apply error:", e);
                // Still dismiss loading even on error
                dismissLoading();
            }
        }
        // --- LOADING SCREEN ---
        const loadingBarFill = document.getElementById('loading-bar-fill');
        const loadingStatus = document.getElementById('loading-status');
        const loadingBrandText = document.getElementById('loading-brand-text');
        const loadingEl = document.getElementById('app-loading');
        let loadProgress = 0;

        function updateLoading(pct, msg) {
            if (loadingBarFill) loadingBarFill.style.width = pct + '%';
            if (loadingStatus && msg) loadingStatus.innerText = msg;
            loadProgress = pct;
        }

        function dismissLoading() {
            updateLoading(100, 'Selesai');
            setTimeout(() => {
                document.body.classList.remove('app-is-loading');
                if (loadingEl) loadingEl.classList.add('hidden');
                setTimeout(() => { if (loadingEl) loadingEl.remove(); }, 700);
            }, 500);
        }

        // Animate loading bar on first load
        (function animateLoading() {
            const steps = [
                { pct: 30, msg: 'Loading...', delay: 200 },
                { pct: 70, msg: 'Loading...', delay: 300 },
                { pct: 90, msg: 'Loading...', delay: 200 },
            ];
            let i = 0;
            function nextStep() {
                if (i < steps.length) {
                    updateLoading(steps[i].pct, steps[i].msg);
                    i++;
                    setTimeout(nextStep, steps[i - 1].delay);
                }
            }
            nextStep();
        })();

        applyCachedTheme();
        applyTheme();

        // --- BOOTH LOGIC ---
        let stream, mediaRecorder, recordedChunks = [], videoBlob, photoBlob, isProcessing = false;
        const webcam = document.getElementById('webcam'), preview = document.getElementById('preview');
        const drawing = document.getElementById('drawing_canvas');
        const dCtx = drawing ? drawing.getContext('2d') : null;

        window.paymentPollingInterval = null;
        let paymentTimeoutTimer = null;

        async function startCameraFlow() {
            const n = document.getElementById('name').value, p = document.getElementById('phone').value, e = document.getElementById('email-input').value;
            if (!n || !p) return alert("Please input your name and contact details!");
            // Simpan email ke variabel global agar tersedia saat upload
            window._savedEmail = e ? e.trim() : '';
            console.log('[FORM] Data disimpan → Nama:', n, '| WA:', p, '| Email:', window._savedEmail || '(kosong)');
            initCameraAndGo();
        }

        function cancelPaymentFlow() {
            try {
                if (paymentPollingInterval) clearInterval(paymentPollingInterval);
                stopPaymentTimer();

                const img = document.getElementById('payment-qr-image');
                if (img) img.style.display = 'none';

                const spinner = document.getElementById('payment-loading-spinner');
                if (spinner) spinner.style.display = 'block';

                const txt = document.getElementById('payment-status-text');
                if (txt) {
                    txt.innerText = 'Membuka Jendela Pembayaran...';
                    txt.style.color = 'white';
                }

                // Reset hard ke Idle agar tamu berikutnya bisa pakai mesinnya
                resetApp();
            } catch (e) {
                console.error("Error in cancelPaymentFlow:", e);
                resetApp();
            }
        }

        function startPaymentTimer(duration) {
            let timer = duration;
            const display = document.getElementById('payment-timer');
            paymentTimeoutTimer = setInterval(function () {
                let minutes = parseInt(timer / 60, 10);
                let seconds = parseInt(timer % 60, 10);
                minutes = minutes < 10 ? "0" + minutes : minutes;
                seconds = seconds < 10 ? "0" + seconds : seconds;
                display.textContent = minutes + ":" + seconds;
                if (--timer < 0) {
                    cancelPaymentFlow();
                    alert("Waktu pembayaran telah habis.");
                }
            }, 1000);
        }

        window.stopPaymentTimer = function stopPaymentTimer() {
            if (paymentTimeoutTimer) {
                clearInterval(paymentTimeoutTimer);
                paymentTimeoutTimer = null;
            }
        };

        async function initCameraAndGo() {
            try {
                // Jika kamera sudah aktif berjalan, langsung pindah ke ready tanpa panggil ulang
                if (stream && stream.active) {
                    changeState('ready');
                    return;
                }

                const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
                const obsCamera = devices.find(d =>
                    d.kind === 'videoinput' && d.label.toLowerCase().includes('obs')
                );

                const videoConstraints = obsCamera
                    ? {
                        deviceId: { exact: obsCamera.deviceId },
                        width: { ideal: 1080 },
                        height: { ideal: 1920 }
                    }
                    : {
                        width: { ideal: 1080 },
                        height: { ideal: 1920 }
                    };

                console.log('Kamera dipilih:', obsCamera ? obsCamera.label : 'Default Camera');
                
                try {
                    stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: true });
                } catch (audioOrConstErr) {
                    console.warn("Retrying camera with fallback constraints:", audioOrConstErr);
                    try {
                        stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
                    } catch (videoErr) {
                        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                    }
                }

                if (webcam) webcam.srcObject = stream;

                if (webcam) {
                    webcam.onloadedmetadata = () => {
                        const vw = webcam.videoWidth, vh = webcam.videoHeight;
                        console.log(`[Camera] Resolusi: ${vw}x${vh} | Rasio: ${(vw / vh).toFixed(4)}`);
                    };
                }

                changeState('ready');
            } catch (e) {
                console.error("Camera Initialization Note:", e);
                changeState('ready');
            }
        }

        // Gesture Hand Tracking Removed for Performance & Simplicity
        window.enableGesture = false;
        function initHandTracking() {
            window.enableGesture = false;
        }

        function startRecording() {
            // Fase 1: Persiapan 3, 2, 1
            let preTime = 3;
            document.getElementById('btn-record').style.pointerEvents = 'none'; // Disable double click
            document.getElementById('countdown-area').innerHTML = `${window.readyCdText} <span id="countdown-val">${preTime}</span>`;

            const preTimer = setInterval(() => {
                preTime--;
                document.getElementById('countdown-val').innerText = preTime;
                if (preTime <= 0) {
                    clearInterval(preTimer);
                    // Fase 2: Mulai Rekam 15 Detik
                    actuallyStartRecording();
                }
            }, 1000);
        }

        function actuallyStartRecording() {
            changeState('recording');
            recordedChunks = [];
            document.getElementById('btn-record').classList.add('recording');
            const duration = window.recordingDuration || 30;
            const formatSec = (s) => (s < 10 ? '0' + s : s);
            const liveTimerEl = document.getElementById('recording-live-timer');
            if (liveTimerEl) {
                liveTimerEl.innerText = `00:00 / 00:${formatSec(duration)}`;
            }
            const cdArea = document.getElementById('countdown-area');
            if (cdArea) cdArea.innerHTML = `${window.recordingCdText} <span id="countdown-val">${duration}</span>`;

            // Tampilkan & Reset Timer Bar (Dinamis)
            const svgTimer = document.getElementById('svg-timer');
            const rectTimer = document.getElementById('rect-timer');
            if (svgTimer && rectTimer) {
                svgTimer.classList.remove('hidden');

                setTimeout(() => {
                    const parent = svgTimer.parentElement;
                    const offset = 10; // Padding agar glow tidak terpotong
                    const w = parent.clientWidth - offset;
                    const h = parent.clientHeight - offset;

                    rectTimer.setAttribute('width', w);
                    rectTimer.setAttribute('height', h);
                    rectTimer.setAttribute('x', offset / 2);
                    rectTimer.setAttribute('y', offset / 2);

                    const perimeter = 2 * (w + h);
                    rectTimer.style.strokeDasharray = perimeter;
                    rectTimer.style.strokeDashoffset = 0;
                    rectTimer.style.transition = 'none'; // Reset transition
                    rectTimer.offsetHeight; // Force reflow
                    rectTimer.style.transition = `stroke-dashoffset ${duration}s linear`;
                    rectTimer.style.strokeDashoffset = perimeter;
                }, 50);
            }

            const rc = document.createElement('canvas'); const rctx = rc.getContext('2d');
            let isRec = true;
            const rloop = () => {
                if (!isRec) return;
                rc.width = webcam.videoWidth; rc.height = webcam.videoHeight;
                rctx.save();
                // Removed mirror logic for 'Normal' recording
                rctx.drawImage(webcam, 0, 0);
                if (window.enableGesture) rctx.drawImage(drawing, 0, 0);
                rctx.restore();
                requestAnimationFrame(rloop);
            };
            rloop();

            const cs = rc.captureStream(30);
            const at = stream.getAudioTracks()[0]; if (at) cs.addTrack(at);
            mediaRecorder = new MediaRecorder(cs, {
                mimeType: 'video/webm;codecs=h264',
                videoBitsPerSecond: 8000000 // 8 Mbps untuk kualitas jernih kristal
            });
            mediaRecorder.ondataavailable = (e) => recordedChunks.push(e.data);
            mediaRecorder.onstop = () => {
                isRec = false;
                videoBlob = new Blob(recordedChunks, { type: 'video/webm' });
                preview.src = URL.createObjectURL(videoBlob);
                const finalVid = document.getElementById('final-video-preview');
                if (finalVid) finalVid.src = preview.src;
                const playbackVid = document.getElementById('video-playback');
                if (playbackVid) playbackVid.src = preview.src;
                if (svgTimer) svgTimer.classList.add('hidden');
                changeState('review-video');
            };
            mediaRecorder.start();

            let t = duration;
            const timer = setInterval(() => {
                t--;
                const elapsed = duration - t;
                const liveTimerEl = document.getElementById('recording-live-timer');
                if (liveTimerEl) {
                    liveTimerEl.innerText = `00:${formatSec(elapsed)} / 00:${formatSec(duration)}`;
                }
                const cdVal = document.getElementById('countdown-val');
                if (cdVal) cdVal.innerText = t;
                if (t <= 0) {
                    clearInterval(timer);
                    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
                    document.getElementById('btn-record').classList.remove('recording');
                    document.getElementById('btn-record').style.pointerEvents = 'auto';
                }
            }, 1000);
        }

        window.stopRecording = function() {
            console.log("[REC] Manual stop requested");
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
            }
        };

        function retakeVideo() {
            dCtx.clearRect(0, 0, 10000, 10000);
            videoBlob = null;
            photoBlob = null;
            changeState('ready');
        }

        function retakePhotoOnly() {
            photoBlob = null;
            preparePhotoSession();
        }

        function preparePhotoSession() {
            changeState('ready-photo');
            document.getElementById('webcam').classList.remove('hidden');
            document.getElementById('preview').classList.add('hidden');
            const btn = document.getElementById('btn-photo-shutter');
            if (btn) btn.style.pointerEvents = 'auto';
            const area = document.getElementById('countdown-area-photo');
            if (area) area.innerText = 'Take a Photo';
        }

        function startPhotoCountdown() {
            let t = 3;
            const area = document.getElementById('countdown-area-photo');
            if (area) area.innerHTML = `${window.photoCdText} <span id="countdown-val-photo">${t}</span>`;
            const btn = document.getElementById('btn-photo-shutter');
            if (btn) btn.style.pointerEvents = 'none';

            const timer = setInterval(() => {
                t--;
                const valEl = document.getElementById('countdown-val-photo');
                if (valEl) valEl.innerText = t;
                if (t <= 0) {
                    clearInterval(timer);
                    takePhoto();
                }
            }, 1000);
        }

        function takePhoto() {
            // Flash Effect
            const flash = document.getElementById('flash-overlay');
            if (flash) {
                flash.classList.add('active');
                setTimeout(() => flash.classList.remove('active'), 100);
            }

            // Capture from rc canvas (already used in recording loop)
            const rc = document.createElement('canvas');
            rc.width = (webcam && webcam.videoWidth) ? webcam.videoWidth : 1080;
            rc.height = (webcam && webcam.videoHeight) ? webcam.videoHeight : 1920;
            const rctx = rc.getContext('2d');
            if (webcam) rctx.drawImage(webcam, 0, 0);
            if (window.enableGesture && drawing) rctx.drawImage(drawing, 0, 0);

            rc.toBlob((blob) => {
                photoBlob = blob;
                const url = URL.createObjectURL(blob);
                const fp = document.getElementById('final-photo-preview');
                if (fp) fp.src = url;
                const pl = document.getElementById('photo-preview-large');
                if (pl) pl.src = url;
                changeState('review-final');
                const btnRec = document.getElementById('btn-record');
                if (btnRec) btnRec.style.pointerEvents = 'auto';
            }, 'image/jpeg', 0.95);
        }

        function resetApp() {
            // Reset input values
            const nameEl = document.getElementById('name');
            if (nameEl) nameEl.value = '';

            const phoneEl = document.getElementById('phone');
            if (phoneEl) phoneEl.value = '';

            const emailEl = document.getElementById('email-input');
            if (emailEl) emailEl.value = '';

            // Bersihkan email yang disimpan agar tidak bocor ke sesi pengunjung berikutnya
            window._savedEmail = '';

            // Clear drawing canvas
            if (typeof dCtx !== 'undefined' && dCtx) {
                dCtx.clearRect(0, 0, 10000, 10000);
            }

            // Revoke Object URLs to free browser RAM memory during continuous usage
            const previewVid = document.getElementById('preview');
            if (previewVid) {
                if (previewVid.src && previewVid.src.startsWith('blob:')) URL.revokeObjectURL(previewVid.src);
                previewVid.src = '';
                previewVid.load();
            }

            const finalVid = document.getElementById('final-video-preview');
            if (finalVid) {
                if (finalVid.src && finalVid.src.startsWith('blob:')) URL.revokeObjectURL(finalVid.src);
                finalVid.src = '';
                finalVid.load();
            }

            const finalPhoto = document.getElementById('final-photo-preview');
            if (finalPhoto) {
                if (finalPhoto.src && finalPhoto.src.startsWith('blob:')) URL.revokeObjectURL(finalPhoto.src);
                finalPhoto.src = '';
            }

            const largePhoto = document.getElementById('photo-preview-large');
            if (largePhoto) {
                if (largePhoto.src && largePhoto.src.startsWith('blob:')) URL.revokeObjectURL(largePhoto.src);
                largePhoto.src = '';
            }

            // Clear recorded blobs and preview source
            videoBlob = null;
            photoBlob = null;
            recordedChunks = [];

            // Clear payment polling & timers
            if (typeof paymentPollingInterval !== 'undefined' && paymentPollingInterval) {
                clearInterval(paymentPollingInterval);
                paymentPollingInterval = null;
            }

            // Hide virtual keyboard
            const kbd = document.getElementById('kbd-container');
            if (kbd) kbd.classList.remove('show');
            const centerPanel = document.querySelector('.center-panel');
            if (centerPanel) centerPanel.classList.remove('keyboard-active');
            activeInput = null;

            // Return to idle state smoothly!
            changeState('idle');
        }

        // --- AUTOMATIC INACTIVITY RESET SAFEGUARD (90 SECONDS) ---
        let inactivityTimer = null;
        function resetInactivityTimer() {
            if (inactivityTimer) clearTimeout(inactivityTimer);
            if (window.currentState && window.currentState !== 'idle' && window.currentState !== 'recording' && window.currentState !== 'processing') {
                inactivityTimer = setTimeout(() => {
                    console.log("[INACTIVITY SAFEGUARD] Pengunjung tidak aktif selama 90 detik. Mengembalikan ke Idle...");
                    resetApp();
                }, 90000); // 90 seconds
            }
        }
        ['click', 'touchstart', 'mousemove', 'keypress'].forEach(evt => {
            window.addEventListener(evt, resetInactivityTimer, { passive: true });
        });

        let currentPaymentOrderId = null;
        
        async function simulatePaymentSecretly() {
            if (!currentPaymentOrderId) return;
            const yes = confirm("🛠️ DEV MODE: Simulasikan pembayaran lunas untuk tagihan ini?");
            if (!yes) return;
            
            try {
                const res = await fetch(`/api/payment/simulate/${currentPaymentOrderId}`, { method: 'POST' });
                const data = await res.json();
                if (data.status === 'success') {
                    console.log("Simulasi sukses, webhook akan segera dipanggil.");
                } else {
                    alert("Gagal simulasi: " + (data.error || 'Unknown Error'));
                }
            } catch (e) {
                alert("Gagal koneksi simulasi: " + e.message);
            }
        }

        function startPaymentPolling(orderId) {
            if (paymentPollingInterval) clearInterval(paymentPollingInterval);
            
            paymentPollingInterval = setInterval(async () => {
                try {
                    const res = await fetch(`/api/payment/status/${orderId}`);
                    const data = await res.json();
                    
                    if (data.status === 'settlement' || data.status === 'success') {
                        clearInterval(paymentPollingInterval);
                        paymentPollingInterval = null;
                        
                        document.getElementById('payment-status-text').innerText = 'Pembayaran Berhasil! 🟢';
                        document.getElementById('payment-status-text').style.color = '#4ade80';
                        document.getElementById('payment-qr-container').style.display = 'none';
                        const btnRepay = document.getElementById('btn-repay');
                        if (btnRepay) btnRepay.style.display = 'none';
                        
                        setTimeout(() => { processUploadVideo(); }, 1500);
                    } else if (data.status === 'failed') {
                        clearInterval(paymentPollingInterval);
                        paymentPollingInterval = null;
                        alert("Pembayaran gagal diproses atau kedaluwarsa.");
                        cancelPaymentFlow();
                    }
                } catch (e) {
                    console.error("Polling error", e);
                }
            }, 3000);
        }

        async function submitVideo() {
            const n = document.getElementById('name').value, p = document.getElementById('phone').value, e = document.getElementById('email-input').value;

            try {
                const res = await fetch('/api/payment/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ eventId: activeEvent, name: n, phone: p, email: e })
                });
                const data = await res.json();

                if (data.status === 'success') {
                    document.getElementById('payment-price-display').innerText = `Rp ${data.price.toLocaleString('id-ID')}`;
                    
                    const qrImg = document.getElementById('payment-qr-image');
                    const qrSpinner = document.getElementById('payment-loading-spinner');
                    const qrContainer = document.getElementById('payment-qr-container');
                    
                    qrContainer.style.display = 'flex';
                    qrSpinner.style.display = 'none';
                    
                    if (data.qrImageBase64) {
                        qrImg.src = data.qrImageBase64;
                        qrImg.style.display = 'block';
                    }

                    const statusTxt = document.getElementById('payment-status-text');
                    if (statusTxt) {
                        statusTxt.innerText = 'Silakan Scan QRIS untuk Membayar';
                        statusTxt.style.color = 'white';
                    }
                    
                    // Hide reopen button just in case
                    const btnRepay = document.getElementById('btn-repay');
                    if (btnRepay) btnRepay.style.display = 'none';

                    changeState('payment');
                    startPaymentTimer(180); // Set 3 minutes timeout

                    currentPaymentOrderId = data.orderId;
                    startPaymentPolling(data.orderId);
                    return;
                } else if (data.status === 'bypassed') {
                    processUploadVideo();
                } else {
                    alert("Error: " + (data.error || 'Unknown Error'));
                }
            } catch (err) {
                console.error(err);
                alert("Koneksi gagal saat membuat pembayaran.");
            }
        }

        async function processUploadVideo() {
            changeState('processing');
            const fd = new FormData();
            fd.append('video', videoBlob, 'recording.mp4');
            if (photoBlob) fd.append('photo', photoBlob, 'photo.jpg');
            fd.append('name', document.getElementById('name').value);
            fd.append('paymentMethod', window.lastPaymentMethod || 'Static QRIS');
            fd.append('eventId', activeEvent || 'localhunt');

            let phoneValueRaw = document.getElementById('phone').value;
            // Gunakan email dari variabel global yang disimpan saat form diisi
            let emailValue = window._savedEmail || document.getElementById('email-input')?.value || '';
            emailValue = emailValue.trim();
            console.log('[UPLOAD] Email yang akan dikirim:', emailValue || '(kosong)');

            if (phoneValueRaw) {
                const prefixEl = document.querySelector('.phone-prefix');
                const prefix = prefixEl ? prefixEl.innerText.replace(/[^0-9]/g, '') : '62';
                let phoneValue = phoneValueRaw.replace(/[^0-9]/g, '');
                if (phoneValue.startsWith('62')) phoneValue = phoneValue.substring(2);
                else if (phoneValue.startsWith('0')) phoneValue = phoneValue.substring(1);
                fd.append('phone', prefix + phoneValue);
            }
            if (emailValue && emailValue.includes('@')) {
                fd.append('email', emailValue);
                console.log('[UPLOAD] Email ditambahkan ke FormData:', emailValue);
            } else {
                console.log('[UPLOAD] Email tidak valid atau kosong, tidak dikirim.');
            }

            fd.append('deliveryMethod', 'both');
            if (currentPaymentOrderId || window.currentInvoiceId) {
                fd.append('orderId', currentPaymentOrderId || window.currentInvoiceId || '');
            }

            try {
                const r = await fetch('/api/videobooth/submit', { method: 'POST', body: fd });
                if (r.ok) {
                    const data = await r.json().catch(() => ({}));
                    if (data.qrCode) {
                        const qrImg = document.getElementById('qr-code-img');
                        if (qrImg) qrImg.src = data.qrCode;
                    }
                    changeState('review');
                    setTimeout(() => {
                        resetApp();
                    }, 10000);
                } else {
                    alert("Gagal mengunggah file. Silakan coba lagi.");
                    changeState('review-final');
                }
            } catch (e) {
                console.error("Upload error:", e);
                alert("Terjadi kesalahan koneksi saat pengunggahan.");
                changeState('review-final');
            }
        }

        function confirmVoucherPass() {
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    title: '🎟️ Redeem Voucher',
                    text: 'Would you like to redeem your voucher to get started?',
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonColor: '#1d3d29',
                    cancelButtonColor: '#d8695f',
                    confirmButtonText: 'Redeem Voucher',
                    cancelButtonText: 'Cancel'
                }).then((result) => {
                    if (result.isConfirmed) {
                        if (typeof stopPaymentTimer === 'function') stopPaymentTimer();
                        if (typeof paymentPollingInterval !== 'undefined' && paymentPollingInterval) {
                            clearInterval(paymentPollingInterval);
                            paymentPollingInterval = null;
                        }
                        const statusTxt = document.getElementById('payment-status-text');
                        if (statusTxt) {
                            statusTxt.innerText = "Voucher Verified! 🟢";
                            statusTxt.style.color = "#4ade80";
                        }
                        setTimeout(() => {
                            window.lastPaymentMethod = 'Voucher';
                            if (window.currentState === 'payment') {
                                if (document.getElementById('state-form')) {
                                    changeState('form');
                                } else {
                                    processUploadVideo();
                                }
                            }
                        }, 1200);
                    }
                });
            } else {
                const yes = confirm("🎟️ Would you like to redeem your voucher to get started?");
                if (yes) {
                    if (typeof stopPaymentTimer === 'function') stopPaymentTimer();
                    if (typeof paymentPollingInterval !== 'undefined' && paymentPollingInterval) clearInterval(paymentPollingInterval);
                    window.lastPaymentMethod = 'Voucher';
                    if (document.getElementById('state-form')) {
                        changeState('form');
                    } else {
                        processUploadVideo();
                    }
                }
            }
        }
    
