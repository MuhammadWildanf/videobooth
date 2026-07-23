    <script>
        // --- MULTI-EVENT CONFIGURATION ---
        const urlParams = new URLSearchParams(window.location.search);
        const activeEvent = urlParams.get('event') || 'audric-cathrine';

        let allSessions = [];
        let activeEventDate = '2026-05-23';

        document.addEventListener('DOMContentLoaded', async () => {
            // Set Back Button Link
            const backBtn = document.getElementById('back-to-booth');
            if (backBtn) backBtn.href = `/?event=${activeEvent}`;

            // Apply Dynamic Configuration immediately if active
            const isActive = await loadThemeConfig();

            // Load session data
            if (isActive) {
                await fetchSessions();
            }
        });

        function checkEventStatus(status) {
            let overlay = document.getElementById('event-inactive-overlay');
            if (status === 'inactive') {
                document.body.classList.add('event-inactive-state');
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
            } else {
                document.body.classList.remove('event-inactive-state');
                if (overlay) {
                    overlay.remove();
                }
            }
        }

        function applyConfig(config) {
            if (!config) return;
            // Update active event date if present
            if (config.eventDate) {
                activeEventDate = config.eventDate;
            }

            // Title and subtitle syncing
            if (config.galleryTitle || config.title) {
                document.getElementById('galleryTitle').innerText = config.galleryTitle || config.title;
            }

            if (config.gallerySubtitle || config.subtitle) {
                try {
                    const dateObj = new Date(activeEventDate);
                    const formattedEventDate = dateObj.toLocaleDateString('en-US', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric'
                    });
                    document.getElementById('gallerySubtitle').innerHTML = `${config.gallerySubtitle || config.subtitle} &bull; <span style="color: var(--accent); font-weight: 700;">${formattedEventDate}</span>`;
                } catch (e) {
                    document.getElementById('gallerySubtitle').innerText = config.gallerySubtitle || config.subtitle;
                }
            } else {
                try {
                    const dateObj = new Date(activeEventDate);
                    const formattedEventDate = dateObj.toLocaleDateString('en-US', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric'
                    });
                    document.getElementById('gallerySubtitle').innerHTML = `Gallery of happiness from ScribbleBooth guests &bull; <span style="color: var(--accent); font-weight: 700;">${formattedEventDate}</span>`;
                } catch (e) { }
            }
            
            // Other texts
            if (config.gallerySearchPlaceholder) {
                document.getElementById('search-input').placeholder = config.gallerySearchPlaceholder;
            }
            if (config.galleryEmptyText) {
                document.getElementById('empty-state').innerHTML = `<p>${config.galleryEmptyText}</p>`;
            }
            if (config.galleryTextColor) {
                document.documentElement.style.setProperty('--text-main', config.galleryTextColor);
            }
            if (config.galleryBgColor) {
                document.documentElement.style.setProperty('--bg-dark', config.galleryBgColor);
            }

            // Logo syncing
            if (config.logoUrl) {
                const logo = document.getElementById('logoElement');
                logo.src = config.logoUrl;
                logo.style.display = 'inline-block';
            }
            // Background & colors syncing
            if (config.bgImageUrl && config.bgImageUrl !== 'Default' && config.bgImageUrl !== 'none') {
                document.body.style.backgroundImage = `url('${config.bgImageUrl}')`;
            } else {
                document.body.style.backgroundImage = 'none';
            }
            if (config.accentColor) {
                document.documentElement.style.setProperty('--accent', config.accentColor);
            }
        }

        async function loadThemeConfig() {
            let active = true;
            try {
                // Try from local storage first to prevent flash
                const cached = localStorage.getItem(`vb_config_${activeEvent}`);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    applyConfig(parsed);
                    if (parsed.status === 'inactive') {
                        checkEventStatus('inactive');
                        active = false;
                    }
                }

                // Always fetch fresh configuration in the background to update cache
                const res = await fetch(`/api/config?event=${activeEvent}`, { cache: 'no-store' });
                const config = await res.json();
                localStorage.setItem(`vb_config_${activeEvent}`, JSON.stringify(config));
                applyConfig(config);

                checkEventStatus(config.status);
                if (config.status === 'inactive') {
                    active = false;
                } else {
                    active = true;
                }
            } catch (e) {
                console.error("Config fetch error:", e);
            }
            return active;
        }

        async function fetchSessions() {
            const grid = document.getElementById('gallery-grid');
            const loading = document.getElementById('loading-state');

            try {
                const res = await fetch(`/api/sessions?event=${activeEvent}`, { cache: 'no-store' });
                const result = await res.json();

                loading.style.display = 'none';

                if (result.status === 'success' && result.sessions) {
                    allSessions = result.sessions;
                    filterGallery();
                } else {
                    grid.innerHTML += `<div class="status-message">❌ Failed to load data: ${result.message}</div>`;
                }
            } catch (err) {
                loading.style.display = 'none';
                grid.innerHTML += `<div class="status-message">❌ Network error occurred while loading sessions.</div>`;
                console.error("Fetch sessions error:", err);
            }
        }

        function renderGallery(sessions) {
            // Remove existing cards
            const grid = document.getElementById('gallery-grid');
            const existingCards = grid.querySelectorAll('.guest-card');
            existingCards.forEach(c => c.remove());

            const emptyState = document.getElementById('empty-state');

            if (sessions.length === 0) {
                emptyState.style.display = 'block';
                return;
            }

            emptyState.style.display = 'none';

            sessions.forEach(s => {
                const dateObj = new Date(s.createdAt);
                const formattedDate = dateObj.toLocaleString('en-US', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                const card = document.createElement('div');
                card.className = 'guest-card';

                let mediaPanelsHtml = '';

                if (s.videoLink && s.photoLink) {
                    mediaPanelsHtml = `
                        <div class="media-panels">
                            <div class="media-thumb" onclick="openLightbox('video', '${s.videoLink}', '${escapeJs(s.name)}', '${formattedDate}')">
                                <video src="${s.videoLink}" preload="metadata" muted></video>
                                <div class="play-overlay">▶</div>
                                <span class="media-tag">Video</span>
                            </div>
                            <div class="media-thumb" onclick="openLightbox('image', '${s.photoLink}', '${escapeJs(s.name)}', '${formattedDate}')">
                                <img src="${s.photoLink}" loading="lazy" alt="ScribbleBooth Photo">
                                <span class="media-tag">Photo</span>
                            </div>
                        </div>
                    `;
                } else if (s.videoLink) {
                    mediaPanelsHtml = `
                        <div class="media-panels" style="grid-template-columns: 1fr;">
                            <div class="media-thumb" onclick="openLightbox('video', '${s.videoLink}', '${escapeJs(s.name)}', '${formattedDate}')">
                                <video src="${s.videoLink}" preload="metadata" muted></video>
                                <div class="play-overlay">▶</div>
                                <span class="media-tag">Video</span>
                            </div>
                        </div>
                    `;
                } else if (s.photoLink) {
                    mediaPanelsHtml = `
                        <div class="media-panels" style="grid-template-columns: 1fr;">
                            <div class="media-thumb" onclick="openLightbox('image', '${s.photoLink}', '${escapeJs(s.name)}', '${formattedDate}')">
                                <img src="${s.photoLink}" loading="lazy" alt="ScribbleBooth Photo">
                                <span class="media-tag">Photo</span>
                            </div>
                        </div>
                    `;
                }

                // Action download row
                let actionRowHtml = '<div class="card-actions">';
                if (s.videoLink) {
                    actionRowHtml += `<a href="/api/download?url=${encodeURIComponent(s.videoLink)}&name=Video-${s.name.replace(/\s+/g, '-')}.mp4" class="btn-download">🎬 Video</a>`;
                }
                if (s.photoLink) {
                    actionRowHtml += `<a href="/api/download?url=${encodeURIComponent(s.photoLink)}&name=Photo-${s.name.replace(/\s+/g, '-')}.jpg" class="btn-download">📸 Photo</a>`;
                }
                actionRowHtml += '</div>';

                card.innerHTML = `
                    <div class="card-header">
                        <span class="guest-name">${escapeHtml(s.name)}</span>
                        <span class="guest-date">${formattedDate}</span>
                    </div>
                    ${mediaPanelsHtml}
                    ${actionRowHtml}
                `;

                grid.appendChild(card);
            });
        }

        function filterGallery() {
            const searchQuery = document.getElementById('search-input').value.toLowerCase().trim();
            const dateQuery = activeEventDate; // YYYY-MM-DD format from admin config config.json

            const filtered = allSessions.filter(s => {
                // Name & phone filter
                const nameMatches = (s.name || '').toLowerCase().includes(searchQuery) || (s.phone || '').toLowerCase().includes(searchQuery);

                // Date filter
                let dateMatches = true;
                if (dateQuery) {
                    const sessionDateStr = new Date(s.createdAt).toISOString().split('T')[0]; // Format: YYYY-MM-DD in UTC

                    // Also support local timezone checking
                    const sessionLocalDate = new Date(s.createdAt);
                    const localYear = sessionLocalDate.getFullYear();
                    const localMonth = String(sessionLocalDate.getMonth() + 1).padStart(2, '0');
                    const localDay = String(sessionLocalDate.getDate()).padStart(2, '0');
                    const sessionLocalDateStr = `${localYear}-${localMonth}-${localDay}`;

                    dateMatches = (sessionDateStr === dateQuery) || (sessionLocalDateStr === dateQuery);
                }

                return nameMatches && dateMatches;
            });

            renderGallery(filtered);
        }

        function resetFilters() {
            document.getElementById('search-input').value = '';
            filterGallery();
        }

        /* Lightbox controls */
        function openLightbox(type, url, name, dateString) {
            const lightbox = document.getElementById('mediaLightbox');
            const videoEl = document.getElementById('lightboxVideo');
            const imgEl = document.getElementById('lightboxImage');
            const downloadBtn = document.getElementById('lightboxDownloadBtn');

            document.getElementById('lightboxName').innerText = name;
            document.getElementById('lightboxDate').innerText = dateString;

            lightbox.style.display = 'flex';

            if (type === 'video') {
                videoEl.src = url;
                videoEl.style.display = 'block';
                imgEl.style.display = 'none';
                videoEl.play().catch(e => console.log("Video auto play prevented"));

                downloadBtn.href = `/api/download?url=${encodeURIComponent(url)}&name=Video-${name.replace(/\s+/g, '-')}.mp4`;
            } else {
                imgEl.src = url;
                imgEl.style.display = 'block';
                videoEl.style.display = 'none';
                videoEl.pause();

                downloadBtn.href = `/api/download?url=${encodeURIComponent(url)}&name=Photo-${name.replace(/\s+/g, '-')}.jpg`;
            }
        }

        function closeLightbox(event) {
            const lightbox = document.getElementById('mediaLightbox');
            const videoEl = document.getElementById('lightboxVideo');
            videoEl.pause();
            videoEl.src = '';
            lightbox.style.display = 'none';
        }

        /* Escaping helpers */
        function escapeHtml(str) {
            if (!str) return '';
            return str
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }

        function escapeJs(str) {
            if (!str) return '';
            return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
        }
    </script>
