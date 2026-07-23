        // Check Login Status
        const token = localStorage.getItem('adminToken');
        if (!token) {
            window.location.href = '/login.html';
        } else {
            // Verify token with backend
            fetch('/api/verify-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            }).then(res => {
                if (!res.ok) {
                    localStorage.removeItem('adminToken');
                    window.location.href = '/login.html';
                }
            }).catch(() => {});
        }

        // --- MULTI-EVENT CONFIGURATION ---
        const urlParams = new URLSearchParams(window.location.search);
        const activeEvent = urlParams.get('event') || 'audric-cathrine';

        document.addEventListener('DOMContentLoaded', () => {
            const badgeEl = document.getElementById('active-event-name');
            if (badgeEl) badgeEl.innerText = activeEvent;

            // Hide Manage Events menu item if it is not audric-cathrine
            const navEventsEl = document.getElementById('nav-events-item');
            if (navEventsEl) {
                if (activeEvent === 'audric-cathrine') {
                    navEventsEl.style.display = 'flex';
                } else {
                    navEventsEl.style.display = 'none';
                }
            }

            loadConfigData();
        });

        async function loadEventsList() {
            const container = document.getElementById('events-list-container');
            container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">⌛ Memuat daftar event...</div>';

            try {
                const res = await fetch('/api/events', { cache: 'no-store' });
                const data = await res.json();

                if (data.status === 'success' && data.events) {
                    container.innerHTML = '';
                    if (data.events.length === 0) {
                        container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">Belum ada event terdaftar.</div>';
                        return;
                    }
                    data.events.forEach(evt => {
                        const row = document.createElement('div');
                        row.style.display = 'flex';
                        row.style.justifyContent = 'space-between';
                        row.style.alignItems = 'center';
                        row.style.padding = '15px 20px';
                        row.style.background = 'rgba(255,255,255,0.02)';
                        row.style.border = '1px solid var(--border)';
                        row.style.borderRadius = '12px';
                        row.style.transition = '0.3s';
                        row.style.flexWrap = 'wrap';
                        row.style.gap = '15px';

                        row.onmouseover = () => row.style.background = 'rgba(255,255,255,0.04)';
                        row.onmouseout = () => row.style.background = 'rgba(255,255,255,0.02)';

                        const isDefault = evt.id === 'audric-cathrine';
                        const isActive = evt.status === 'active';
                        
                        const statusBadge = isActive
                            ? `<span style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); color: #10b981; font-size: 10px; padding: 2px 8px; border-radius: 50px; font-weight: 600; margin-left: 8px;">Active</span>`
                            : `<span style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); color: #ef4444; font-size: 10px; padding: 2px 8px; border-radius: 50px; font-weight: 600; margin-left: 8px;">Inactive</span>`;

                        const toggleBtn = isActive
                            ? `<button onclick="toggleEventStatus('${evt.id}', 'inactive')" class="btn-browse" style="margin:0; padding: 6px 12px; font-size: 11px; border-radius: 6px; background: rgba(245, 158, 11, 0.1); border-color: rgba(245, 158, 11, 0.3); color: #f59e0b; cursor: pointer;">🛑 Disable</button>`
                            : `<button onclick="toggleEventStatus('${evt.id}', 'active')" class="btn-browse" style="margin:0; padding: 6px 12px; font-size: 11px; border-radius: 6px; background: rgba(16, 185, 129, 0.1); border-color: rgba(16, 185, 129, 0.3); color: #10b981; cursor: pointer;">✅ Enable</button>`;

                        const deleteBtn = isDefault
                            ? `<button class="btn-browse" style="margin:0; padding: 6px 12px; font-size: 11px; border-radius: 6px; opacity: 0.3; cursor: not-allowed;" disabled>🗑️ Delete</button>`
                            : `<button onclick="deleteEvent('${evt.id}')" class="btn-browse" style="margin:0; padding: 6px 12px; font-size: 11px; border-radius: 6px; background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.3); color: #ef4444; cursor: pointer;">🗑️ Delete</button>`;

                        const renameBtn = isDefault
                            ? `<button class="btn-browse" style="margin:0; padding: 6px 12px; font-size: 11px; border-radius: 6px; opacity: 0.3; cursor: not-allowed;" disabled>✏️ Rename</button>`
                            : `<button onclick="renameEvent('${evt.id}')" class="btn-browse" style="margin:0; padding: 6px 12px; font-size: 11px; border-radius: 6px; background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.2); color: #fff; cursor: pointer;">✏️ Rename</button>`;

                        row.innerHTML = `
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <strong style="font-size: 15px; color: #fff; font-family: 'Outfit', sans-serif;">${evt.id}</strong>
                                ${statusBadge}
                            </div>
                            <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                                <a href="/config.html?event=${evt.id}" class="btn-browse" style="margin:0; padding: 6px 12px; font-size: 11px; border-radius: 6px; text-decoration: none;">⚙️ Configure</a>
                                ${renameBtn}
                                ${toggleBtn}
                                ${deleteBtn}
                                <a href="/?event=${evt.id}" target="_blank" class="btn-browse" style="margin:0; padding: 6px 12px; font-size: 11px; border-radius: 6px; text-decoration: none; background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.2); color: #fff;">🎥 Open Booth</a>
                                <a href="/gallery.html?event=${evt.id}" target="_blank" class="btn-browse" style="margin:0; padding: 6px 12px; font-size: 11px; border-radius: 6px; text-decoration: none; background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.2); color: #fff;">🖼️ Gallery</a>
                            </div>
                        `;
                        container.appendChild(row);
                    });
                } else {
                    container.innerHTML = `<div style="text-align: center; color: #ff4444; padding: 20px;">❌ Gagal memuat event: ${data.message}</div>`;
                }
            } catch (err) {
                container.innerHTML = '<div style="text-align: center; color: #ff4444; padding: 20px;">❌ Koneksi gagal ke server.</div>';
            }
        }

        async function createNewEvent() {
            const input = document.getElementById('new-event-name');
            const eventNameRaw = input.value.trim();
            if (!eventNameRaw) {
                alert('Silakan masukkan nama event terlebih dahulu!');
                return;
            }

            const slug = eventNameRaw.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
            if (!slug) {
                alert('Nama event tidak valid! Gunakan huruf, angka, dan tanda hubung (-).');
                return;
            }

            try {
                const res = await fetch('/api/events', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ eventId: slug })
                });

                const data = await res.json();
                if (data.status === 'success') {
                    input.value = '';
                    showToast(`Event "${data.eventId}" berhasil dibuat!`);
                    loadEventsList();
                } else {
                    alert('Error: ' + data.message);
                }
            } catch (err) {
                alert('Gagal menyambung ke server.');
            }
        }

        async function toggleEventStatus(eventId, newStatus) {
            try {
                const res = await fetch('/api/events/toggle-status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ eventId, status: newStatus })
                });
                const data = await res.json();
                if (data.status === 'success') {
                    showToast(`Status event "${eventId}" berhasil diubah!`);
                    loadEventsList();
                } else {
                    alert('Gagal mengubah status: ' + data.message);
                }
            } catch (e) {
                alert('Gagal menyambung ke server.');
            }
        }

        async function deleteEvent(eventId) {
            if (!confirm(`Apakah Anda yakin ingin menghapus event "${eventId}"?\n\nTindakan ini juga akan menghapus seluruh data sesi foto/video tamu pada event tersebut!`)) {
                return;
            }
            try {
                const res = await fetch('/api/events/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ eventId })
                });
                const data = await res.json();
                if (data.status === 'success') {
                    showToast(`Event "${eventId}" berhasil dihapus!`);
                    loadEventsList();
                } else {
                    alert('Gagal menghapus event: ' + data.message);
                }
            } catch (e) {
                alert('Gagal menyambung ke server.');
            }
        }

        async function renameEvent(eventId) {
            const newName = prompt(`Masukkan nama/slug baru untuk event "${eventId}":\n(Gunakan huruf kecil, angka, dan tanda hubung saja)`, eventId);
            if (newName === null) return; // Cancelled
            const cleanNewId = newName.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
            if (!cleanNewId) {
                alert('Nama event baru tidak valid!');
                return;
            }
            if (cleanNewId === eventId) return;

            try {
                const res = await fetch('/api/events/rename', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ eventId, newEventId: cleanNewId })
                });
                const data = await res.json();
                if (data.status === 'success') {
                    showToast(`Event berhasil diubah nama menjadi "${data.newEventId}"!`);
                    loadEventsList();
                } else {
                    alert('Gagal mengubah nama: ' + data.message);
                }
            } catch (e) {
                alert('Gagal menyambung ke server.');
            }
        }

        function showToast(message) {
            const toast = document.getElementById('successMsg');
            toast.innerText = message;
            toast.style.display = 'block';
            setTimeout(() => { toast.style.display = 'none'; }, 3000);
        }

        let sessionsData = [];

        function showSection(id) {
            document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.getElementById('section-' + id).classList.add('active');

            if (window.event && window.event.currentTarget) {
                window.event.currentTarget.classList.add('active');
            } else if (window.event && window.event.target) {
                window.event.target.classList.add('active');
            } else {
                document.querySelectorAll('.nav-item').forEach(n => {
                    if (n.getAttribute('onclick')?.includes(`'${id}'`)) {
                        n.classList.add('active');
                    }
                });
            }

            if (id === 'sessions') {
                loadSessions();
            } else if (id === 'events') {
                loadEventsList();
            }
        }

        let dataBackup = {};

        // LOAD DATA
        function loadConfigData() {
            fetch(`/api/config?event=${activeEvent}`, { cache: 'no-store' })
                .then(res => res.json())
                .then(data => {
                    dataBackup = data;

                    // === BASIC FIELDS ===
                    document.getElementById('title').value = data.title || '';
                    document.getElementById('subtitle').value = data.subtitle || '';
                    document.getElementById('descPremium').value = data.descPremium || '';
                    document.getElementById('startText').value = data.startText || '';
                    document.getElementById('emailSubject').value = data.emailSubject || '';
                    document.getElementById('messageTemplate').value = data.messageTemplate || '';

                    // === COLORS ===
                    document.getElementById('bgColor1').value = data.bgColor1 || '#2c3e50';
                    document.getElementById('bgColor2').value = data.bgColor2 || '#ebedee';
                    document.getElementById('accentColor').value = data.accentColor || '#D3BB7C';
                    document.getElementById('frameColor').value = data.frameColor || '#333333';
                    document.getElementById('titleColor').value = data.titleColor || '#D3BB7C';
                    document.getElementById('connectorColor').value = data.connectorColor || data.titleColor || '#D3BB7C';
                    document.getElementById('subtitleColor').value = data.subtitleColor || '#F0E5C7';
                    document.getElementById('descColor').value = data.descColor || '#CDCDCD';
                    document.getElementById('startTextColor').value = data.startTextColor || '#1a0f0a';
                    document.getElementById('readyTextColor').value = data.readyTextColor || '#f0e5c7';
                    document.getElementById('reviewTextColor').value = data.reviewTextColor || '#f0e5c7';
                    document.getElementById('successTextColor').value = data.successTextColor || '#f0e5c7';

                    // === STATE FORM ===
                    document.getElementById('formLabelName').value = data.formLabelName || 'Name';
                    document.getElementById('formLabelNameColor').value = data.formLabelNameColor || '#f0e5c7';
                    document.getElementById('formPlaceholderName').value = data.formPlaceholderName || 'Please input your name';
                    document.getElementById('formSubmitText').value = data.formSubmitText || 'SUBMIT';
                    document.getElementById('formSubmitTextColor').value = data.formSubmitTextColor || '#1a0f0a';

                    // === STATE READY VIDEO ===
                    document.getElementById('readyHeaderTitle').value = data.readyHeaderTitle || 'Ready To Record?';
                    document.getElementById('readyHeaderTitleColor').value = data.readyHeaderTitleColor || '#f0e5c7';
                    document.getElementById('readyHeaderSubtitle').value = data.readyHeaderSubtitle || 'Position yourself in front of the camera';
                    document.getElementById('readyHeaderSubtitleColor').value = data.readyHeaderSubtitleColor || '#f0e5c7';
                    document.getElementById('readyTextMain').value = data.readyTextMain || 'Look at the camera and get ready.';
                    document.getElementById('readyTextSub').value = data.readyTextSub || 'Hit the record button when you are ready.';
                    document.getElementById('readyCountdownText').value = data.readyCountdownText || 'Start Recording';
                    document.getElementById('readyCdText').value = data.readyCdText || 'Recording Begins in...';
                    document.getElementById('readyBackText').value = data.readyBackText || 'BACK';
                    document.getElementById('readyBackTextColor').value = data.readyBackTextColor || '#e7e5d8';

                    // === STATE REVIEW VIDEO ===
                    document.getElementById('recordingCdText').value = data.recordingCdText || 'Recording...';
                    document.getElementById('reviewTextMain').value = data.reviewTextMain || 'Please review your video,';
                    document.getElementById('reviewTextSub').value = data.reviewTextSub || 'you can RETAKE or NEXT.';
                    document.getElementById('reviewRetakeText').value = data.reviewRetakeText || 'RETAKE';
                    document.getElementById('reviewRetakeTextColor').value = data.reviewRetakeTextColor || '#e7e5d8';
                    document.getElementById('reviewPhotoText').value = data.reviewPhotoText || 'TAKE A PHOTO';
                    document.getElementById('reviewPhotoTextColor').value = data.reviewPhotoTextColor || '#1a0f0a';

                    // === STATE READY PHOTO ===
                    document.getElementById('photoHeaderTitle').value = data.photoHeaderTitle || 'Ready for Photo Session?';
                    document.getElementById('photoHeaderTitleColor').value = data.photoHeaderTitleColor || '#f0e5c7';
                    document.getElementById('photoHeaderSubtitle').value = data.photoHeaderSubtitle || 'Strike a beautiful pose for the camera';
                    document.getElementById('photoHeaderSubtitleColor').value = data.photoHeaderSubtitleColor || '#f0e5c7';
                    document.getElementById('photoInstructionMain').value = data.photoInstructionMain || 'Look at the camera and smile.';
                    document.getElementById('photoInstructionSub').value = data.photoInstructionSub || 'Hit the shutter button when you are ready.';
                    document.getElementById('photoInstructionTextColor').value = data.photoInstructionTextColor || '#f0e5c7';
                    document.getElementById('photoCountdownText').value = data.photoCountdownText || 'Take a Photo';
                    document.getElementById('photoCdText').value = data.photoCdText || 'Taking Photo in...';
                    document.getElementById('photoBackText').value = data.photoBackText || 'BACK';
                    document.getElementById('photoBackTextColor').value = data.photoBackTextColor || '#e7e5d8';

                    // === STATE REVIEW FINAL ===
                    document.getElementById('finalHeaderTitle').value = data.finalHeaderTitle || 'Review your session.';
                    document.getElementById('finalHeaderTitleColor').value = data.finalHeaderTitleColor || '#f0e5c7';
                    document.getElementById('finalVideoLabel').value = data.finalVideoLabel || 'VIDEO';
                    document.getElementById('finalPhotoLabel').value = data.finalPhotoLabel || 'PHOTO';
                    document.getElementById('finalRetakeAllText').value = data.finalRetakeAllText || 'RETAKE ALL';
                    document.getElementById('finalRetakeAllTextColor').value = data.finalRetakeAllTextColor || '#e7e5d8';
                    document.getElementById('finalRetakePhotoText').value = data.finalRetakePhotoText || 'RETAKE PHOTO';
                    document.getElementById('finalRetakePhotoTextColor').value = data.finalRetakePhotoTextColor || '#e7e5d8';
                    document.getElementById('finalUploadText').value = data.finalUploadText || 'UPLOAD BOTH';
                    document.getElementById('finalUploadTextColor').value = data.finalUploadTextColor || '#1a0f0a';

                    // === STATE SUCCESS ===
                    document.getElementById('successTextMain').value = data.successTextMain || 'Your memories are ready! ✨';
                    document.getElementById('successTextSub').value = data.successTextSub || 'Scan this QR code to view and download your video and photo.';
                    document.getElementById('successFooterText').value = data.successFooterText || 'Thank you for being part of this moment';
                    document.getElementById('successFooterTextColor').value = data.successFooterTextColor || '#cdcdcd';
                    document.getElementById('successDoneText').value = data.successDoneText || 'Done';
                    document.getElementById('successDoneTextColor').value = data.successDoneTextColor || '#1a0f0a';
                    document.getElementById('successAutoResetText').value = data.successAutoResetText || 'Auto-reset in';

                    // === SIDE PANEL ===
                    document.getElementById('previewPanelFooter').value = data.previewPanelFooter || 'Preview Your Moment';
                    document.getElementById('loadingPreviewText').value = data.loadingPreviewText || 'Loading Preview...';
                    document.getElementById('loadingTutorialText').value = data.loadingTutorialText || 'Loading Tutorial...';

                    // === GUEST RESULT PAGE ===
                    document.getElementById('resultLoadingText').value = data.resultLoadingText || 'Loading your memories... ✨';
                    document.getElementById('resultErrorText').value = data.resultErrorText || 'Sorry, your session was not found or has expired.';
                    document.getElementById('resultProcessingText').value = data.resultProcessingText || 'Processing your video & photo... please wait.';
                    document.getElementById('resultSaveVideoText').value = data.resultSaveVideoText || '🎬 Save Your Video';
                    document.getElementById('resultSavePhotoText').value = data.resultSavePhotoText || '📸 Save Your Photo';
                    document.getElementById('resultFooterText').value = data.resultFooterText || 'Thank you for this beautiful moment';

                    // === GUEST GALLERY PAGE ===
                    document.getElementById('galleryTitle').value = data.galleryTitle || 'Event Gallery';
                    document.getElementById('gallerySubtitle').value = data.gallerySubtitle || 'A collection of beautiful moments.';
                    document.getElementById('gallerySearchPlaceholder').value = data.gallerySearchPlaceholder || 'Search by name...';
                    document.getElementById('galleryEmptyText').value = data.galleryEmptyText || 'No memories found yet.';
                    document.getElementById('galleryTextColor').value = data.galleryTextColor || '#ffffff';
                    document.getElementById('galleryBgColor').value = data.galleryBgColor || '#0a0a0b';

                    // === SYSTEM ===
                    document.getElementById('sessionPrice').value = data.sessionPrice || 0;
                    document.getElementById('recordingDuration').value = data.recordingDuration || 15;
                    document.getElementById('qrResetDuration').value = data.qrResetDuration || 45;
                    document.getElementById('eventDate').value = data.eventDate || '2026-05-23';
                    document.getElementById('showLeftPanel').checked = data.showLeftPanel !== false;
                    document.getElementById('showRightPanel').checked = data.showRightPanel !== false;
                    document.getElementById('enableGesture').checked = data.enableGesture !== false;

                    // === FONT ===
                    document.getElementById('fontUrl').value = data.fontUrl || '';
                    document.getElementById('fontFamily').value = data.fontFamily || '';
                    document.getElementById('titleFontFamily').value = data.titleFontFamily || '';

                    const fontSourceType = data.fontSourceType || (data.fontUrl && data.fontUrl.startsWith('/uploads_assets/') ? 'upload' : 'google');
                    if (fontSourceType === 'upload') {
                        document.getElementById('font-source-upload').checked = true;
                        document.getElementById('fontFileStatus').innerText = data.fontUrl || 'No file uploaded yet';
                    } else {
                        document.getElementById('font-source-google').checked = true;
                    }

                    if (data.fontSelector) {
                        document.getElementById('fontSelector').value = data.fontSelector;
                        updateFontHidden();
                    }

                    // === IDLE HEAD MODE ===
                    if (data.idleHeadMode === 'logo') {
                        document.getElementById('mode-logo').checked = true;
                    } else {
                        document.getElementById('mode-title').checked = true;
                    }

                    // === MEDIA STATUS ===
                    document.getElementById('bgStatus').innerText = data.bgImageUrl || 'Default';
                    document.getElementById('frameStatus').innerText = data.frameImageUrl || 'Default';
                    document.getElementById('overlayStatus').innerText = data.overlayImageUrl || 'Default';

                    if (data.logoUrl) document.getElementById('logoPreview').src = data.logoUrl;
                    if (data.bottomLeftLogoUrl) document.getElementById('bottomLeftLogoPreview').src = data.bottomLeftLogoUrl;
                    document.getElementById('tutorialPath').innerText = data.tutorialVideoUrl || 'No video';
                    document.getElementById('resultPath').innerText = data.resultVideoUrl || 'No video';
                });
        }

        const fontsPreset = {
            luxury: { url: "https://fonts.googleapis.com/css2?family=Luxurious+Script&family=Kaisei+Opti&display=swap", family: "'Kaisei Opti', serif", titleFamily: "'Luxurious Script', cursive" },
            elegant: { url: "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap", family: "'Playfair Display', serif", titleFamily: "'Playfair Display', serif" },
            modern: { url: "https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;600&display=swap", family: "'Montserrat', sans-serif", titleFamily: "'Montserrat', sans-serif" },
            classic: { url: "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&display=swap", family: "'Cinzel', serif", titleFamily: "'Cinzel', serif" },
            romantic: { url: "https://fonts.googleapis.com/css2?family=Great+Vibes&family=Lora:ital@0;1&display=swap", family: "'Lora', serif", titleFamily: "'Great Vibes', cursive" }
        };

        function updateFontHidden() {
            const s = document.getElementById('fontSelector').value;
            const customFields = document.getElementById('custom-font-fields');
            if (s === 'custom') {
                if (customFields) {
                    customFields.style.display = 'block';
                    toggleFontSourceFields();
                }
            } else {
                if (customFields) customFields.style.display = 'none';
                if (fontsPreset[s]) {
                    document.getElementById('fontUrl').value = fontsPreset[s].url;
                    document.getElementById('fontFamily').value = fontsPreset[s].family;
                    document.getElementById('titleFontFamily').value = fontsPreset[s].titleFamily;
                }
            }
        }

        function toggleFontSourceFields() {
            const googleRb = document.getElementById('font-source-google');
            const uploadRb = document.getElementById('font-source-upload');
            const googleContainer = document.getElementById('font-google-container');
            const uploadContainer = document.getElementById('font-upload-container');

            if (googleRb && googleRb.checked) {
                if (googleContainer) googleContainer.style.display = 'block';
                if (uploadContainer) uploadContainer.style.display = 'none';
            } else if (uploadRb && uploadRb.checked) {
                if (googleContainer) googleContainer.style.display = 'none';
                if (uploadContainer) uploadContainer.style.display = 'block';
            }
        }

        function applyPreset(t) {
            document.querySelectorAll('.preset-card').forEach(pc => pc.classList.remove('active'));
            document.getElementById('preset-' + t).classList.add('active');

            const themes = {
                gold: { bg1: '#1a100a', bg2: '#3c2a21', accent: '#D3BB7C', title: '#D3BB7C', frame: '#333333', desc: '#CDCDCD', font: 'luxury', bg: '/bg1.png', f: '/frame_gold.png', o: '/overlay.png' },
                romantic: { bg1: '#fdf2f8', bg2: '#fbcfe8', accent: '#ec4899', title: '#831843', frame: '#fbcfe8', desc: '#4a4a4a', font: 'romantic', bg: '', f: '', o: '' },
                monochrome: { bg1: '#0a0a0a', bg2: '#1a1a1a', accent: '#a3a3a3', title: '#ffffff', frame: '#262626', desc: '#a3a3a3', font: 'modern', bg: '', f: '', o: '' },
                rustic: { bg1: '#292524', bg2: '#1c1917', accent: '#d97706', title: '#fcd34d', frame: '#44403c', desc: '#d6d3d1', font: 'classic', bg: '', f: '', o: '' }
            };
            const p = themes[t];
            if (!p) return;
            document.getElementById('bgColor1').value = p.bg1;
            document.getElementById('bgColor2').value = p.bg2;
            document.getElementById('accentColor').value = p.accent;
            document.getElementById('titleColor').value = p.title;
            document.getElementById('connectorColor').value = p.title;
            document.getElementById('subtitleColor').value = p.title;
            document.getElementById('descColor').value = p.desc;
            document.getElementById('startTextColor').value = (t === 'monochrome' ? '#000000' : '#1a0f0a');
            document.getElementById('readyTextColor').value = p.title;
            document.getElementById('reviewTextColor').value = p.title;
            document.getElementById('successTextColor').value = p.title;
            document.getElementById('formLabelNameColor').value = p.title;
            document.getElementById('formSubmitTextColor').value = (t === 'monochrome' ? '#000000' : '#1a0f0a');
            document.getElementById('readyHeaderTitleColor').value = p.title;
            document.getElementById('readyHeaderSubtitleColor').value = p.title;
            document.getElementById('readyBackTextColor').value = p.accent;
            document.getElementById('reviewRetakeTextColor').value = p.accent;
            document.getElementById('reviewPhotoTextColor').value = (t === 'monochrome' ? '#000000' : '#1a0f0a');
            document.getElementById('photoHeaderTitleColor').value = p.title;
            document.getElementById('photoHeaderSubtitleColor').value = p.title;
            document.getElementById('photoInstructionTextColor').value = p.title;
            document.getElementById('photoBackTextColor').value = p.accent;
            document.getElementById('finalHeaderTitleColor').value = p.title;
            document.getElementById('finalRetakeAllTextColor').value = p.accent;
            document.getElementById('finalRetakePhotoTextColor').value = p.accent;
            document.getElementById('finalUploadTextColor').value = (t === 'monochrome' ? '#000000' : '#1a0f0a');
            document.getElementById('successFooterTextColor').value = p.desc;
            document.getElementById('successDoneTextColor').value = (t === 'monochrome' ? '#000000' : '#1a0f0a');
            document.getElementById('frameColor').value = p.frame;
            document.getElementById('fontSelector').value = p.font;
            updateFontHidden();
            document.getElementById('bgStatus').innerText = p.bg || 'none';
            if (p.f) document.getElementById('frameStatus').innerText = p.f;
            if (p.o) document.getElementById('overlayStatus').innerText = p.o;
        }

        function applyMasterColor() {
            const masterColor = document.getElementById('masterColorPicker').value;
            const fields = [
                'accentColor', 'titleColor', 'readyTextColor', 'reviewTextColor', 'successTextColor',
                'readyHeaderTitleColor', 'readyHeaderSubtitleColor', 'readyBackTextColor',
                'reviewRetakeTextColor', 'reviewPhotoTextColor', 'photoHeaderTitleColor',
                'photoHeaderSubtitleColor', 'photoInstructionTextColor', 'photoBackTextColor',
                'finalHeaderTitleColor', 'finalRetakeAllTextColor', 'finalRetakePhotoTextColor',
                'finalUploadTextColor', 'successFooterTextColor', 'successDoneTextColor',
                'formLabelNameColor', 'formSubmitTextColor', 'galleryTextColor'
            ];
            fields.forEach(fieldId => {
                const el = document.getElementById(fieldId);
                if (el) {
                    el.value = masterColor;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
            const status = document.getElementById('masterApplyStatus');
            if (status) {
                status.innerText = "Applied successfully! Press 'Save' to save.";
                status.style.opacity = '1';
                setTimeout(() => {
                    status.style.opacity = '0';
                }, 3000);
            }
        }

        async function uploadHelper(file, fieldName) {
            if (!file) return null;
            const fd = new FormData();
            fd.append('asset', file);
            fd.append('fieldName', fieldName);
            const res = await fetch('/api/config/asset', { method: 'POST', body: fd });
            const d = await res.json();
            return d.fileUrl;
        }

        async function saveConfig() {
            const btn = document.querySelector('.btn-primary');
            btn.disabled = true;
            btn.innerText = "⏳ SAVING...";

            const logoFile = document.getElementById('logoFile').files[0];
            let finalLogoUrl = null;
            if (logoFile) {
                const formData = new FormData();
                formData.append('logo', logoFile);
                const res = await fetch('/api/config/logo', { method: 'POST', body: formData });
                const d = await res.json();
                if (d.status === 'success') finalLogoUrl = d.logoUrl;
            }

            const bottomLeftLogoFile = document.getElementById('bottomLeftLogoFile').files[0];
            let finalBottomLeftLogoUrl = null;
            if (bottomLeftLogoFile) {
                const formData2 = new FormData();
                formData2.append('logo', bottomLeftLogoFile);
                const res2 = await fetch('/api/config/logo', { method: 'POST', body: formData2 });
                const d2 = await res2.json();
                if (d2.status === 'success') finalBottomLeftLogoUrl = d2.logoUrl;
            }

            const tutFile = document.getElementById('tutorialFile').files[0];
            let tutUrl = null;
            if (tutFile) {
                const fd = new FormData(); fd.append('video', tutFile);
                const res = await fetch('/api/config/video', { method: 'POST', body: fd });
                const d = await res.json(); tutUrl = d.videoUrl;
            }

            const resUrl = await uploadHelper(document.getElementById('resultFile').files[0], 'result');
            const bgUrl = await uploadHelper(document.getElementById('bgFile').files[0], 'bg');
            const frameUrl = await uploadHelper(document.getElementById('frameFile').files[0], 'frame');
            const overlayUrl = await uploadHelper(document.getElementById('overlayFile').files[0], 'overlay');

            let uploadedFontUrl = null;
            const fontSel = document.getElementById('fontSelector').value;
            const googleRb = document.getElementById('font-source-google');
            const fontSourceType = (googleRb && googleRb.checked) ? 'google' : 'upload';

            if (fontSel === 'custom' && fontSourceType === 'upload') {
                const fontFile = document.getElementById('fontFile').files[0];
                if (fontFile) {
                    uploadedFontUrl = await uploadHelper(fontFile, 'font');
                } else {
                    const statusText = document.getElementById('fontFileStatus').innerText;
                    if (statusText && statusText.startsWith('/uploads_assets/')) {
                        uploadedFontUrl = statusText;
                    }
                }
            }

            const payload = {
                // Basic
                title: document.getElementById('title').value,
                subtitle: document.getElementById('subtitle').value,
                descPremium: document.getElementById('descPremium').value,
                startText: document.getElementById('startText').value,
                emailSubject: document.getElementById('emailSubject').value,
                messageTemplate: document.getElementById('messageTemplate').value,

                // Colors
                bgColor1: document.getElementById('bgColor1').value,
                bgColor2: document.getElementById('bgColor2').value,
                accentColor: document.getElementById('accentColor').value,
                frameColor: document.getElementById('frameColor').value,
                titleColor: document.getElementById('titleColor').value,
                connectorColor: document.getElementById('connectorColor').value,
                subtitleColor: document.getElementById('subtitleColor').value,
                descColor: document.getElementById('descColor').value,
                startTextColor: document.getElementById('startTextColor').value,
                readyTextColor: document.getElementById('readyTextColor').value,
                reviewTextColor: document.getElementById('reviewTextColor').value,
                successTextColor: document.getElementById('successTextColor').value,

                // State Form
                formLabelName: document.getElementById('formLabelName').value,
                formLabelNameColor: document.getElementById('formLabelNameColor').value,
                formPlaceholderName: document.getElementById('formPlaceholderName').value,
                formSubmitText: document.getElementById('formSubmitText').value,
                formSubmitTextColor: document.getElementById('formSubmitTextColor').value,

                // State Ready Video
                readyHeaderTitle: document.getElementById('readyHeaderTitle').value,
                readyHeaderTitleColor: document.getElementById('readyHeaderTitleColor').value,
                readyHeaderSubtitle: document.getElementById('readyHeaderSubtitle').value,
                readyHeaderSubtitleColor: document.getElementById('readyHeaderSubtitleColor').value,
                readyTextMain: document.getElementById('readyTextMain').value,
                readyTextSub: document.getElementById('readyTextSub').value,
                readyCountdownText: document.getElementById('readyCountdownText').value,
                readyCdText: document.getElementById('readyCdText').value,
                readyBackText: document.getElementById('readyBackText').value,
                readyBackTextColor: document.getElementById('readyBackTextColor').value,

                // State Review Video
                recordingCdText: document.getElementById('recordingCdText').value,
                reviewTextMain: document.getElementById('reviewTextMain').value,
                reviewTextSub: document.getElementById('reviewTextSub').value,
                reviewRetakeText: document.getElementById('reviewRetakeText').value,
                reviewRetakeTextColor: document.getElementById('reviewRetakeTextColor').value,
                reviewPhotoText: document.getElementById('reviewPhotoText').value,
                reviewPhotoTextColor: document.getElementById('reviewPhotoTextColor').value,

                // State Ready Photo
                photoHeaderTitle: document.getElementById('photoHeaderTitle').value,
                photoHeaderTitleColor: document.getElementById('photoHeaderTitleColor').value,
                photoHeaderSubtitle: document.getElementById('photoHeaderSubtitle').value,
                photoHeaderSubtitleColor: document.getElementById('photoHeaderSubtitleColor').value,
                photoInstructionMain: document.getElementById('photoInstructionMain').value,
                photoInstructionSub: document.getElementById('photoInstructionSub').value,
                photoInstructionTextColor: document.getElementById('photoInstructionTextColor').value,
                photoCountdownText: document.getElementById('photoCountdownText').value,
                photoCdText: document.getElementById('photoCdText').value,
                photoBackText: document.getElementById('photoBackText').value,
                photoBackTextColor: document.getElementById('photoBackTextColor').value,

                // State Review Final
                finalHeaderTitle: document.getElementById('finalHeaderTitle').value,
                finalHeaderTitleColor: document.getElementById('finalHeaderTitleColor').value,
                finalVideoLabel: document.getElementById('finalVideoLabel').value,
                finalPhotoLabel: document.getElementById('finalPhotoLabel').value,
                finalRetakeAllText: document.getElementById('finalRetakeAllText').value,
                finalRetakeAllTextColor: document.getElementById('finalRetakeAllTextColor').value,
                finalRetakePhotoText: document.getElementById('finalRetakePhotoText').value,
                finalRetakePhotoTextColor: document.getElementById('finalRetakePhotoTextColor').value,
                finalUploadText: document.getElementById('finalUploadText').value,
                finalUploadTextColor: document.getElementById('finalUploadTextColor').value,

                // State Success
                successTextMain: document.getElementById('successTextMain').value,
                successTextSub: document.getElementById('successTextSub').value,
                successFooterText: document.getElementById('successFooterText').value,
                successFooterTextColor: document.getElementById('successFooterTextColor').value,
                successDoneText: document.getElementById('successDoneText').value,
                successDoneTextColor: document.getElementById('successDoneTextColor').value,
                successAutoResetText: document.getElementById('successAutoResetText').value,

                // Side Panel
                previewPanelFooter: document.getElementById('previewPanelFooter').value,
                loadingPreviewText: document.getElementById('loadingPreviewText').value,
                loadingTutorialText: document.getElementById('loadingTutorialText').value,

                // Guest Result Page
                resultLoadingText: document.getElementById('resultLoadingText').value,
                resultErrorText: document.getElementById('resultErrorText').value,
                resultProcessingText: document.getElementById('resultProcessingText').value,
                resultSaveVideoText: document.getElementById('resultSaveVideoText').value,
                resultSavePhotoText: document.getElementById('resultSavePhotoText').value,
                resultFooterText: document.getElementById('resultFooterText').value,

                // Guest Gallery Page
                galleryTitle: document.getElementById('galleryTitle').value,
                gallerySubtitle: document.getElementById('gallerySubtitle').value,
                gallerySearchPlaceholder: document.getElementById('gallerySearchPlaceholder').value,
                galleryEmptyText: document.getElementById('galleryEmptyText').value,
                galleryTextColor: document.getElementById('galleryTextColor').value,
                galleryBgColor: document.getElementById('galleryBgColor').value,

                // Font
                fontSelector: document.getElementById('fontSelector').value,
                fontSourceType: fontSourceType,
                fontUrl: uploadedFontUrl || document.getElementById('fontUrl').value,
                fontFamily: document.getElementById('fontFamily').value,
                titleFontFamily: document.getElementById('titleFontFamily').value,

                // System
                sessionPrice: parseInt(document.getElementById('sessionPrice').value) || 0,
                enableGesture: document.getElementById('enableGesture').checked,
                recordingDuration: parseInt(document.getElementById('recordingDuration').value),
                qrResetDuration: parseInt(document.getElementById('qrResetDuration').value),
                eventDate: document.getElementById('eventDate').value,
                showLeftPanel: document.getElementById('showLeftPanel').checked,
                showRightPanel: document.getElementById('showRightPanel').checked,
                idleHeadMode: document.querySelector('input[name="idleHeadMode"]:checked').value,

                // Media
                bgImageUrl: bgUrl || document.getElementById('bgStatus').innerText,
                frameImageUrl: frameUrl || document.getElementById('frameStatus').innerText,
                overlayImageUrl: overlayUrl || document.getElementById('overlayStatus').innerText,
                tutorialVideoUrl: tutUrl || document.getElementById('tutorialPath').innerText,
                resultVideoUrl: resUrl || document.getElementById('resultPath').innerText,
                logoUrl: finalLogoUrl || (document.getElementById('logoPreview').src.includes('base64') ? '' : document.getElementById('logoPreview').src),
                bottomLeftLogoUrl: finalBottomLeftLogoUrl || (document.getElementById('bottomLeftLogoPreview').src.includes('base64') ? '' : document.getElementById('bottomLeftLogoPreview').src)
            };

            if (!payload.logoUrl || payload.logoUrl === 'null') {
                payload.logoUrl = dataBackup.logoUrl;
            }
            if (!payload.bottomLeftLogoUrl || payload.bottomLeftLogoUrl === 'null') {
                payload.bottomLeftLogoUrl = dataBackup.bottomLeftLogoUrl;
            }

            fetch(`/api/config?event=${activeEvent}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(() => {
                btn.disabled = false;
                btn.innerHTML = "<span>💾</span> SAVE ALL SETTINGS";
                const msg = document.getElementById('successMsg');
                msg.style.display = 'block';
                setTimeout(() => msg.style.display = 'none', 3000);

                if (bgUrl) document.getElementById('bgStatus').innerText = bgUrl;
                if (frameUrl) document.getElementById('frameStatus').innerText = frameUrl;
                if (overlayUrl) document.getElementById('overlayStatus').innerText = overlayUrl;
                if (tutUrl) document.getElementById('tutorialPath').innerText = tutUrl;
                if (resUrl) document.getElementById('resultPath').innerText = resUrl;
                if (uploadedFontUrl) {
                    document.getElementById('fontFileStatus').innerText = uploadedFontUrl;
                    document.getElementById('fontUrl').value = uploadedFontUrl;
                }

                document.getElementById('bgFile').value = '';
                document.getElementById('frameFile').value = '';
                document.getElementById('overlayFile').value = '';
                document.getElementById('logoFile').value = '';
                document.getElementById('tutorialFile').value = '';
                document.getElementById('resultFile').value = '';
                document.getElementById('fontFile').value = '';
            });
        }

        // ASSET LIBRARY LOGIC
        let currentTargetField = null;
        let currentStatusEl = null;

        async function openLibrary(field, statusId) {
            currentTargetField = field;
            currentStatusEl = statusId;
            document.getElementById('libraryModal').style.display = 'flex';
            loadAssets();
        }

        function closeLibrary() {
            document.getElementById('libraryModal').style.display = 'none';
        }

        async function loadAssets() {
            const grid = document.getElementById('assetGrid');
            grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center;">Loading assets...</p>';

            try {
                const res = await fetch('/api/config/assets-list');
                const data = await res.json();
                grid.innerHTML = '';

                if (data.assets.length === 0) {
                    grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">No assets found.</p>';
                }

                data.assets.forEach(asset => {
                    const item = document.createElement('div');
                    item.className = 'asset-item';

                    const isVideo = asset.url.toLowerCase().endsWith('.mp4') || asset.url.toLowerCase().endsWith('.webm');
                    const isFont = /\.(ttf|otf|woff|woff2)(\?.*)?$/i.test(asset.url.toLowerCase());

                    if (isVideo) {
                        item.innerHTML = `<video src="${asset.url}" muted></video>`;
                    } else if (isFont) {
                        item.innerHTML = `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #18181b; color: #d3bb7c; font-size: 36px; font-weight: bold; font-family: sans-serif;">Aa</div>`;
                    } else {
                        item.innerHTML = `<img src="${asset.url}" alt="${asset.name}">`;
                    }

                    item.innerHTML += `
                        <div class="delete-btn" onclick="confirmDelete(event, '${asset.url}')">🗑️</div>
                        <div class="asset-name">${asset.name}</div>
                    `;

                    item.onclick = (e) => {
                        if (e.target.classList.contains('delete-btn')) return;
                        selectAsset(asset.url);
                    };

                    grid.appendChild(item);
                });
            } catch (err) {
                grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #ff0000;">Error loading assets.</p>';
            }
        }

        function selectAsset(url) {
            const statusEl = document.getElementById(currentStatusEl);
            if (statusEl.tagName === 'IMG') {
                statusEl.src = url;
            } else {
                statusEl.innerText = url;
            }
            dataBackup[currentTargetField] = url;
            closeLibrary();
        }

        async function confirmDelete(event, url) {
            event.stopPropagation();
            if (!confirm(`Are you sure you want to delete this asset?\n${url}`)) return;

            try {
                const res = await fetch('/api/config/asset-delete', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fileUrl: url })
                });
                const data = await res.json();
                if (data.status === 'success') {
                    loadAssets();
                } else {
                    alert('Error: ' + data.message);
                }
            } catch (err) {
                alert('Connection error.');
            }
        }

        // --- SESSIONS & GALLERY ENGINE ---
        async function loadSessions() {
            const listEl = document.getElementById('sessions-list');
            const emptyEl = document.getElementById('sessions-empty');

            listEl.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px 0;">⌛ Memuat data sesi...</div>';
            emptyEl.style.display = 'none';

            try {
                const res = await fetch(`/api/sessions?event=${activeEvent}`);
                const data = await res.json();

                if (data.status === 'success') {
                    sessionsData = data.sessions || [];
                    renderSessions(sessionsData);
                } else {
                    listEl.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #ff4444; padding: 40px 0;">❌ Gagal memuat data: ${data.message}</div>`;
                }
            } catch (err) {
                listEl.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #ff4444; padding: 40px 0;">❌ Koneksi gagal ke server.</div>';
            }
        }

        function renderSessions(sessions) {
            const listEl = document.getElementById('sessions-list');
            const emptyEl = document.getElementById('sessions-empty');

            listEl.innerHTML = '';

            if (sessions.length === 0) {
                emptyEl.style.display = 'block';
                return;
            }

            emptyEl.style.display = 'none';

            sessions.forEach(s => {
                const formattedDate = new Date(s.createdAt).toLocaleString('id-ID', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                let displayPhone = s.phone;
                if (!displayPhone && s.videoLink) {
                    try {
                        const folderMatch = s.videoLink.match(/\/scriblebooth\/([^/]+)\//);
                        if (folderMatch) {
                            const folderName = decodeURIComponent(folderMatch[1]);
                            const parts = folderName.split('_');
                            if (parts.length > 1) {
                                displayPhone = parts[parts.length - 1].trim();
                            } else {
                                const dashParts = folderName.split('-');
                                if (dashParts.length > 1) {
                                    displayPhone = dashParts[dashParts.length - 1].trim();
                                }
                            }
                        }
                    } catch (e) {
                        console.error('Error parsing phone from URL:', e);
                    }
                }
                if (!displayPhone) {
                    displayPhone = 'Tanpa WA';
                }

                const card = document.createElement('div');
                card.className = 'card';
                card.style.margin = '0';
                card.style.padding = '20px';
                card.style.display = 'flex';
                card.style.flexDirection = 'column';
                card.style.background = 'rgba(255, 255, 255, 0.02)';
                card.style.border = '1px solid var(--border)';
                card.style.borderRadius = '16px';
                card.style.transition = '0.3s';

                card.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                        <h4 style="margin: 0; font-size: 16px; font-family: 'Outfit', sans-serif; color: var(--accent); font-weight: 600;">${escapeHtml(s.name)}</h4>
                        <span style="font-size: 11px; color: var(--text-muted);">${formattedDate}</span>
                    </div>
                    <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px; font-family: monospace;">
                        📞 ${escapeHtml(displayPhone)}
                    </div>
                    
                    <!-- Miniature Portrait 9:16 Frames -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 10px 0 20px 0; flex: 1;">
                        <!-- Video Thumbnail -->
                        <div style="position: relative; aspect-ratio: 9/16; background: #000; border-radius: 10px; overflow: hidden; border: 1px solid rgba(255,255,255,0.05); cursor: pointer;" onclick="openPreview('video', '${s.videoLink}', '${escapeJs(s.name)}')">
                            <video src="${s.videoLink}" style="width: 100%; height: 100%; object-fit: cover;" preload="metadata" muted></video>
                            <div style="position: absolute; top:0; left:0; right:0; bottom:0; background: rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 22px; transition: 0.3s;" onmouseover="this.style.background='rgba(0,0,0,0.1)'" onmouseout="this.style.background='rgba(0,0,0,0.35)'">▶</div>
                            <span style="position: absolute; bottom: 6px; left: 6px; background: rgba(0,0,0,0.65); color: #fff; font-size: 9px; padding: 2px 6px; border-radius: 4px; font-weight: 600; letter-spacing: 0.5px;">VIDEO</span>
                        </div>
                        
                        <!-- Photo Thumbnail -->
                        <div style="position: relative; aspect-ratio: 9/16; background: #000; border-radius: 10px; overflow: hidden; border: 1px solid rgba(255,255,255,0.05); cursor: pointer;" onclick="openPreview('image', '${s.photoLink}', '${escapeJs(s.name)}')">
                            <img src="${s.photoLink}" style="width: 100%; height: 100%; object-fit: cover;" loading="lazy" />
                            <span style="position: absolute; bottom: 6px; left: 6px; background: rgba(0,0,0,0.65); color: #fff; font-size: 9px; padding: 2px 6px; border-radius: 4px; font-weight: 600; letter-spacing: 0.5px;">FOTO</span>
                        </div>
                    </div>
                    
                    <!-- Action Row -->
                    <div style="display: flex; gap: 8px;">
                        <a href="/api/download?url=${encodeURIComponent(s.videoLink)}&name=Video-${encodeURIComponent(s.name)}.mp4" class="btn-browse" style="flex: 1; text-align: center; margin: 0; padding: 8px 5px; font-size: 11px; border-radius: 6px; text-decoration: none;">📥 Video</a>
                        <a href="/api/download?url=${encodeURIComponent(s.photoLink)}&name=Photo-${encodeURIComponent(s.name)}.jpg" class="btn-browse" style="flex: 1; text-align: center; margin: 0; padding: 8px 5px; font-size: 11px; border-radius: 6px; text-decoration: none;">📥 Foto</a>
                        <button onclick="deleteSession(event, '${s.id}', '${escapeJs(s.name)}')" style="background: rgba(255, 68, 68, 0.1); border: 1px solid rgba(255, 68, 68, 0.3); color: #ff4444; border-radius: 6px; width: 34px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.3s;" title="Hapus Sesi" onmouseover="this.style.background='rgba(255, 68, 68, 0.2)'" onmouseout="this.style.background='rgba(255, 68, 68, 0.1)'">🗑️</button>
                    </div>
                `;

                listEl.appendChild(card);
            });
        }

        function filterSessions() {
            const query = document.getElementById('session-search').value.toLowerCase().trim();
            if (!query) {
                renderSessions(sessionsData);
                return;
            }

            const filtered = sessionsData.filter(s => {
                const name = (s.name || '').toLowerCase();
                const phone = (s.phone || '').toLowerCase();
                const id = (s.id || '').toLowerCase();
                return name.includes(query) || phone.includes(query) || id.includes(query);
            });

            renderSessions(filtered);
        }

        function openPreview(type, url, name) {
            const modal = document.getElementById('previewModal');
            const video = document.getElementById('previewModalVideo');
            const image = document.getElementById('previewModalImage');
            const title = document.getElementById('previewModalTitle');

            title.innerText = `Preview ${type === 'video' ? 'Video' : 'Foto'} - ${name}`;
            modal.style.display = 'flex';

            if (type === 'video') {
                video.src = url;
                video.style.display = 'block';
                image.style.display = 'none';
                video.play().catch(e => { });
            } else {
                image.src = url;
                image.style.display = 'block';
                video.style.display = 'none';
                video.pause();
            }
        }

        function closePreviewModal() {
            const modal = document.getElementById('previewModal');
            const video = document.getElementById('previewModalVideo');
            video.pause();
            video.src = '';
            modal.style.display = 'none';
        }

        async function deleteSession(event, id, name) {
            event.stopPropagation();
            if (!confirm(`Apakah Anda yakin ingin menghapus sesi dari "${name}"?\nSemua data lokal sesi ini akan dihapus permanen.`)) return;

            try {
                const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
                const data = await res.json();
                if (data.status === 'success') {
                    sessionsData = sessionsData.filter(s => s.id !== id);
                    filterSessions();

                    const toast = document.getElementById('successMsg');
                    toast.innerText = `Sesi "${name}" berhasil dihapus.`;
                    toast.style.display = 'block';
                    setTimeout(() => { toast.style.display = 'none'; }, 3000);
                } else {
                    alert('Error: ' + data.message);
                }
            } catch (err) {
                alert('Gagal menyambung ke server.');
            }
        }

        function escapeHtml(str) {
            if (!str) return '';
            return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
        }

        function escapeJs(str) {
            if (!str) return '';
            return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
        }

        // MS Word-style Formatting Toolbar implementation
        function formatText(input, tag) {
            const start = input.selectionStart;
            const end = input.selectionEnd;
            const value = input.value;

            const selectedText = value.substring(start, end);
            const openTag = `<${tag}>`;
            const closeTag = `</${tag}>`;

            let newValue;
            let newCursorPos;

            if (start !== end) {
                newValue = value.substring(0, start) + openTag + selectedText + closeTag + value.substring(end);
                newCursorPos = start + openTag.length + selectedText.length + closeTag.length;
            } else {
                newValue = value.substring(0, start) + openTag + closeTag + value.substring(end);
                newCursorPos = start + openTag.length;
            }

            input.value = newValue;
            input.focus();
            input.setSelectionRange(newCursorPos, newCursorPos);

            const event = new Event('input', { bubbles: true });
            input.dispatchEvent(event);
        }

        function initTextFormatToolbars() {
            const targets = document.querySelectorAll('.content-section input[type="text"], .content-section textarea');
            targets.forEach(input => {
                const id = input.id.toLowerCase();
                if (id.includes('placeholder') || id.includes('url') || id.includes('family') || id.includes('color') || id.includes('date') || id.includes('duration') || id.includes('file')) {
                    return;
                }

                if (input.dataset.hasToolbar) return;
                input.dataset.hasToolbar = "true";

                const toolbar = document.createElement('div');
                toolbar.className = 'text-toolbar';

                const boldBtn = document.createElement('button');
                boldBtn.className = 'btn-tool';
                boldBtn.type = 'button';
                boldBtn.innerHTML = '<b>B</b>';
                boldBtn.title = 'Bold (Ctrl+B)';
                boldBtn.onmousedown = (e) => { e.preventDefault(); };
                boldBtn.onclick = (e) => { e.preventDefault(); formatText(input, 'b'); };

                const italicBtn = document.createElement('button');
                italicBtn.className = 'btn-tool';
                italicBtn.type = 'button';
                italicBtn.innerHTML = '<i style="font-family: Georgia, serif; font-weight: bold; font-style: italic;">I</i>';
                italicBtn.title = 'Italic (Ctrl+I)';
                italicBtn.onmousedown = (e) => { e.preventDefault(); };
                italicBtn.onclick = (e) => { e.preventDefault(); formatText(input, 'i'); };

                const underlineBtn = document.createElement('button');
                underlineBtn.className = 'btn-tool';
                underlineBtn.type = 'button';
                underlineBtn.innerHTML = '<u>U</u>';
                underlineBtn.title = 'Underline (Ctrl+U)';
                underlineBtn.onmousedown = (e) => { e.preventDefault(); };
                underlineBtn.onclick = (e) => { e.preventDefault(); formatText(input, 'u'); };

                toolbar.appendChild(boldBtn);
                toolbar.appendChild(italicBtn);
                toolbar.appendChild(underlineBtn);

                input.parentNode.insertBefore(toolbar, input);

                input.addEventListener('keydown', (e) => {
                    if (e.ctrlKey || e.metaKey) {
                        const key = e.key.toLowerCase();
                        if (key === 'b') { e.preventDefault(); formatText(input, 'b'); }
                        else if (key === 'i') { e.preventDefault(); formatText(input, 'i'); }
                        else if (key === 'u') { e.preventDefault(); formatText(input, 'u'); }
                    }
                });
            });
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initTextFormatToolbars);
        } else {
            initTextFormatToolbars();
        }
