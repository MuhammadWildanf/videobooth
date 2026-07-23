    <script>
        document.addEventListener('DOMContentLoaded', async () => {
            const urlParams = new URLSearchParams(window.location.search);
            const sessionId = urlParams.get('id');

            const loadingEl = document.getElementById('loading');
            const errorEl = document.getElementById('error');
            const contentEl = document.getElementById('content');

            if (!sessionId) {
                loadingEl.style.display = 'none';
                errorEl.style.display = 'block';
                return;
            }

            // Function to apply config data to the UI
            function applyConfig(configData) {
                if (configData.bgImageUrl && configData.bgImageUrl !== 'Default' && configData.bgImageUrl !== 'none') {
                    document.body.style.backgroundImage = `url('${configData.bgImageUrl}')`;
                } else {
                    document.body.style.backgroundImage = 'none';
                }
                if (configData.accentColor) {
                    document.documentElement.style.setProperty('--accent', configData.accentColor);
                }
                if (configData.bgColor1) {
                    document.documentElement.style.setProperty('--bg-1', configData.bgColor1);
                }
                if (configData.bgColor2) {
                    document.documentElement.style.setProperty('--bg-2', configData.bgColor2);
                }
                if (configData.titleColor) {
                    document.documentElement.style.setProperty('--title-color', configData.titleColor);
                }
                if (configData.descColor) {
                    document.documentElement.style.setProperty('--desc-color', configData.descColor);
                }
                if (configData.fontUrl) {
                    let link = document.getElementById('dynamic-font');
                    if (!link) {
                        link = document.createElement('link');
                        link.id = 'dynamic-font';
                        link.rel = 'stylesheet';
                        document.head.appendChild(link);
                    }
                    link.href = configData.fontUrl;
                }
                if (configData.fontFamily || configData.titleFontFamily) {
                    let styleParams = document.getElementById('dynamic-font-styles');
                    if (!styleParams) {
                        styleParams = document.createElement('style');
                        styleParams.id = 'dynamic-font-styles';
                        document.head.appendChild(styleParams);
                    }
                    styleParams.innerHTML = `
                        :root { 
                            --title-font-dyn: ${configData.titleFontFamily || "'Luxurious Script', cursive"}; 
                            --body-font-dyn: ${configData.fontFamily || "'Aref Ruqaa', serif"};
                        }
                        body, button, .btn, .footer-text, .loading, .error-state {
                            font-family: var(--body-font-dyn) !important;
                        }
                        .title {
                            font-family: var(--title-font-dyn) !important;
                        }
                    `;
                }
            }

            try {
                const response = await fetch(`/api/result/${sessionId}`, { cache: 'no-store' });
                const result = await response.json();

                loadingEl.style.display = 'none';

                if (result.status === 'success' && result.data) {
                    contentEl.style.display = 'block';
                    const userNameEl = document.getElementById('userName');
                    if (userNameEl) {
                        userNameEl.innerText = result.data.name;
                    }

                    if (result.data.videoLink) {
                        const vContainer = document.getElementById('videoContainer');
                        vContainer.style.display = 'block';
                        document.getElementById('videoElement').src = result.data.videoLink;
                        // Use proxy route to force download dialog
                        document.getElementById('videoDownload').href = `/api/download?url=${encodeURIComponent(result.data.videoLink)}&name=Video-${result.data.name.replace(/\s+/g, '-')}.mp4`;
                    }

                    if (result.data.photoLink) {
                        const pContainer = document.getElementById('photoContainer');
                        pContainer.style.display = 'block';
                        document.getElementById('photoElement').src = result.data.photoLink;
                        // Use proxy route to force download dialog
                        document.getElementById('photoDownload').href = `/api/download?url=${encodeURIComponent(result.data.photoLink)}&name=Photo-${result.data.name.replace(/\s+/g, '-')}.jpg`;
                    }

                    // Fetch event-specific theme configuration
                    const eventId = result.data.eventId || 'audric-cathrine';
                    try {
                        const configRes = await fetch(`/api/config?event=${eventId}`, { cache: 'no-store' });
                        const configData = await configRes.json();
                        applyConfig(configData);
                    } catch (e) {
                        console.error("Failed to load event-specific theme config:", e);
                    }
                } else {
                    errorEl.style.display = 'block';
                    // Load default theme as fallback for the error page
                    try {
                        const configRes = await fetch('/api/config', { cache: 'no-store' });
                        const configData = await configRes.json();
                        applyConfig(configData);
                    } catch (e) {}
                }
            } catch (err) {
                console.error("Fetch error:", err);
                loadingEl.style.display = 'none';
                errorEl.style.display = 'block';
                // Load default theme as fallback for the error page
                try {
                    const configRes = await fetch('/api/config', { cache: 'no-store' });
                    const configData = await configRes.json();
                    applyConfig(configData);
                } catch (e) {}
            }
        });
    </script>
