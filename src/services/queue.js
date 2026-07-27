const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const fastq = require('fastq');
const { DEFAULT_CONFIG, UPLOADS_DIR, PUBLIC_DIR, OFFLINE_QUEUE_DIR, CONFIG_FILE, EVENTS_DIR, ROOT } = require('../config/defaults');
const { getEventConfig, saveSession, db } = require('./database');
const { uploadToDrive, createDriveFolder, uploadToGCP, storageProvider } = require('./storage');
const { sendWhatsAppMessage, sendEmailMessage, sendVideoEmail } = require('./notification');
const { getMediaDimensions } = require('./media');

const paymentCache = {};

const worker = async (task) => {
    const taskStartTime = Date.now();
    const startTimeStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    console.log(`\n[QUEUE] [${startTimeStr}] Memulai proses rendering untuk: ${task.name} (${task.phone || 'tanpa no wa'})`);

    return new Promise(async (resolve, reject) => {
        try {
            const eventId = task.eventId || 'audric-cathrine';
            const inputPath = task.videoPath;
            const photoInputPath = task.photoPath;
            let config = await getEventConfig(eventId);

            let overlayFile = 'overlay.png';
            if (config.overlayImageUrl === 'none') {
                overlayFile = 'none-nonexistent-file';
            } else if (config.overlayImageUrl && config.overlayImageUrl !== 'Default') {
                overlayFile = config.overlayImageUrl;
            }
            const overlayPath = path.join(PUBLIC_DIR, overlayFile);

            const timestamp = Date.now();
            const outputVideoPath = path.join(UPLOADS_DIR, `FINAL-${timestamp}-video.mp4`);
            const outputPhotoPath = path.join(UPLOADS_DIR, `FINAL-${timestamp}-photo.jpg`);
            const sessionId = `session-${timestamp}-${Math.random().toString(36).substring(2, 8)}`;

            const provider = storageProvider();
            let userFolderId = null;
            let userFolderLink = null;

            if (provider === 'drive') {
                console.log(`[G-DRIVE] Membuat folder untuk ${task.name}...`);
                const driveFolder = await createDriveFolder(`${task.name} - ${task.phone}`);
                userFolderId = driveFolder.id;
                userFolderLink = driveFolder.link;
            } else if (provider === 'gcp') {
                console.log(`[GCP] Menggunakan Google Cloud Storage (Bucket: ${process.env.GCP_BUCKET_NAME})`);
            } else {
                console.log(`[LOCAL] Menggunakan Penyimpanan Lokal Server (Storage Provider: LOCAL)`);
            }

            let videoWidth = 1080;
            let videoHeight = 1920;
            try {
                const dims = await getMediaDimensions(inputPath);
                videoWidth = dims.width;
                videoHeight = dims.height;
                console.log(`[RENDER] Resolusi Video Terdeteksi: ${videoWidth}x${videoHeight}`);
            } catch (e) {
                console.log(`[RENDER] Gagal mendeteksi resolusi video, menggunakan fallback 1080x1920.`);
            }

            let photoWidth = 1080;
            let photoHeight = 1920;
            if (photoInputPath && fs.existsSync(photoInputPath)) {
                try {
                    const dims = await getMediaDimensions(photoInputPath);
                    photoWidth = dims.width;
                    photoHeight = dims.height;
                    console.log(`[RENDER] Resolusi Foto Terdeteksi: ${photoWidth}x${photoHeight}`);
                } catch (e) {
                    console.log(`[RENDER] Gagal mendeteksi resolusi foto, menggunakan fallback 1080x1920.`);
                }
            }

            // --- STEP 1: RENDERING VIDEO FFMPEG ---
            const vRenderStart = Date.now();
            console.log(`[RENDER] Step 1/4: Processing Video with Overlay...`);
            let videoProcessed = false;
            await new Promise((res, rej) => {
                let cmd = ffmpeg(inputPath);
                if (fs.existsSync(overlayPath)) {
                    console.log(`[FFMPEG] Mendeteksi overlay, sedang merender bingkai...`);
                    cmd = cmd.input(overlayPath)
                        .complexFilter([`[1:v]scale=${videoWidth}:${videoHeight}[over];[0:v][over]overlay=0:0`])
                        .addOptions(['-preset ultrafast', '-crf 18']);
                } else {
                    cmd = cmd.addOptions(['-preset ultrafast', '-crf 18']);
                }

                cmd.output(outputVideoPath)
                    .on('start', (cmdLine) => console.log(`[FFMPEG] Spawned FFmpeg dengan command: ${cmdLine}`))
                    .on('progress', (progress) => {
                        if (progress.percent) console.log(`[FFMPEG] Rendering: ${Math.round(progress.percent)}% done`);
                    })
                    .on('end', () => {
                        const vRenderDuration = ((Date.now() - vRenderStart) / 1000).toFixed(2);
                        console.log(`[RENDER SUCCESS] 🎬 Video selesai dirender dalam ${vRenderDuration} detik! Saved: ${outputVideoPath}`);
                        videoProcessed = true;
                        res();
                    })
                    .on('error', (err) => {
                        console.error(`[RENDER ERROR] Video Error:`, err.message);
                        rej(err);
                    })
                    .run();
            });

            // --- STEP 2: RENDERING PHOTO FFMPEG ---
            let photoProcessed = false;
            if (photoInputPath && fs.existsSync(photoInputPath)) {
                const pRenderStart = Date.now();
                console.log(`[RENDER] Step 2/4: Processing Photo with Overlay...`);
                await new Promise((res, rej) => {
                    let cmd = ffmpeg(photoInputPath);
                    if (fs.existsSync(overlayPath)) {
                        cmd = cmd.input(overlayPath)
                            .complexFilter([`[1:v]scale=${photoWidth}:${photoHeight}[over];[0:v][over]overlay=0:0`])
                            .addOptions(['-preset ultrafast', '-q:v 2']);
                    } else {
                        cmd = cmd.addOptions(['-q:v 2']);
                    }
                    cmd.output(outputPhotoPath)
                        .on('end', () => {
                            const pRenderDuration = ((Date.now() - pRenderStart) / 1000).toFixed(2);
                            console.log(`[RENDER SUCCESS] 📸 Foto selesai dirender dalam ${pRenderDuration} detik!`);
                            photoProcessed = true;
                            res();
                        })
                        .on('error', (err) => rej(err))
                        .run();
                });
            }

            // --- STEP 3: UPLOAD / SAVE MEDIA ---
            const uploadStart = Date.now();
            console.log(`[UPLOAD] Step 3/4: Uploading / Preparing Media Link...`);
            let videoLink = null;
            let photoLink = null;
            const gcpFolderName = `${task.name} - ${task.phone}`;

            if (videoProcessed) {
                if (provider === 'drive') {
                    const driveVideo = await uploadToDrive(outputVideoPath, `Video-${task.name}-${timestamp}.mp4`, userFolderId);
                    videoLink = driveVideo.webViewLink;
                } else if (provider === 'gcp') {
                    videoLink = await uploadToGCP(outputVideoPath, `Video-${task.name}-${timestamp}.mp4`, gcpFolderName);
                } else {
                    const domainStr = process.env.PUBLIC_DOMAIN || 'localhost:3000';
                    const protocol = domainStr.startsWith('http') ? '' : (domainStr.includes('localhost') ? 'http://' : 'https://');
                    videoLink = `${protocol}${domainStr}/uploads/FINAL-${timestamp}-video.mp4`;
                }
                const uploadDuration = ((Date.now() - uploadStart) / 1000).toFixed(2);
                console.log(`[UPLOAD SUCCESS] Video siap (${uploadDuration}s)! Link: ${videoLink}`);
            }

            if (photoProcessed) {
                const photoUploadStart = Date.now();
                if (provider === 'drive') {
                    const drivePhoto = await uploadToDrive(outputPhotoPath, `Photo-${task.name}-${timestamp}.jpg`, userFolderId);
                    photoLink = drivePhoto.webViewLink;
                } else if (provider === 'gcp') {
                    photoLink = await uploadToGCP(outputPhotoPath, `Photo-${task.name}-${timestamp}.jpg`, gcpFolderName);
                } else {
                    const domainStr = process.env.PUBLIC_DOMAIN || 'localhost:3000';
                    const protocol = domainStr.startsWith('http') ? '' : (domainStr.includes('localhost') ? 'http://' : 'https://');
                    photoLink = `${protocol}${domainStr}/uploads/FINAL-${timestamp}-photo.jpg`;
                }
                const photoUploadDuration = ((Date.now() - photoUploadStart) / 1000).toFixed(2);
                console.log(`[UPLOAD SUCCESS] Foto siap (${photoUploadDuration}s)! Link: ${photoLink}`);
            }

            const sessionData = {
                id: sessionId,
                name: task.name,
                phone: task.phone || null,
                email: task.email || null,
                paymentMethod: task.paymentMethod || 'Static QRIS',
                videoLink: videoLink,
                photoLink: photoLink,
                eventId: eventId,
                createdAt: new Date().toISOString()
            };

            await saveSession(sessionId, sessionData);

            // Tentukan halaman result yang dipakai — bisa custom per event
            // Contoh: config.resultPage = 'localhunt-result' → /localhunt-result?id=...
            // Kosong/tidak diset → pakai /result?id=... (halaman generic)
            const resultPagePath = (config.resultPage && config.resultPage.trim()) ? config.resultPage.trim() : 'result';

            let domainStr = process.env.PUBLIC_DOMAIN || 'localhost:3000';
            let localResultLink = '';
            if (domainStr.startsWith('http')) {
                localResultLink = `${domainStr}/${resultPagePath}?id=${sessionId}`;
            } else {
                const protocol = domainStr === 'localhost:3000' ? 'http' : 'https';
                localResultLink = `${protocol}://${domainStr}/${resultPagePath}?id=${sessionId}`;
            }
            console.log(`[QUEUE] Result page: /${resultPagePath} → ${localResultLink}`);

            // --- STEP 4: NOTIFICATIONS (EMAIL & WHATSAPP) ---
            if (videoLink || photoLink) {
                console.log(`[NOTIFY] Step 4/4: Sending WhatsApp & Email Notifications...`);
                console.log(`[NOTIFY]    Email task : ${task.email || '(kosong)'}`);
                console.log(`[NOTIFY]    Phone task : ${task.phone || '(kosong)'}`);
                console.log(`[NOTIFY]    Result URL : ${localResultLink}`);

                let msgTemplate = config.messageTemplate || `Halo {name}! ✨\n\nKenangan Anda di *ScribbleBooth* sudah siap! Silakan lihat dan download melalui link di bawah ini:\n\n🔗 {link}\n\nTerima kasih sudah mampir!`;
                const customMsg = msgTemplate.replace(/{name}/g, task.name).replace(/{link}/g, localResultLink);

                // ── EMAIL ──────────────────────────────────────
                if (task.email && task.email !== 'hunt@local.id' && task.email.includes('@')) {
                    const emailStart = Date.now();
                    try {
                        await sendVideoEmail(task.email, task.name, localResultLink, config);
                        const emailDuration = ((Date.now() - emailStart) / 1000).toFixed(2);
                        console.log(`[EMAIL SUCCESS] 📧 Email sukses dikirim ke ${task.email} (${emailDuration}s)!`);
                    } catch (err) {
                        console.log(`[EMAIL ERROR] ❌ Email gagal dikirim ke ${task.email}: ${err.message}`);
                    }
                } else {
                    console.log(`[EMAIL SKIP] ⚠️  Email tidak dikirim — email tidak valid atau kosong: "${task.email || ''}"`);
                }

                // ── WHATSAPP ───────────────────────────────────
                if (task.phone) {
                    const waStart = Date.now();
                    const waResult = await sendWhatsAppMessage(task.phone, customMsg);
                    const waDuration = ((Date.now() - waStart) / 1000).toFixed(2);
                    if (waResult && (waResult.status === true || waResult.message === 'Berhasil mengirimkan pesan')) {
                        console.log(`[WhatsApp SUCCESS] 📲 Pesan WA terkirim ke ${task.phone} (${waDuration}s)!`);
                    } else {
                        console.log(`[WhatsApp SKIP] ⚠️  Pesan WA tidak terkirim ke ${task.phone} (${waDuration}s) — cek koneksi RuangWA.`);
                    }
                } else {
                    console.log(`[WhatsApp SKIP] ⚠️  Nomor HP tidak tersedia, WA tidak dikirim.`);
                }
            }

            const deleteList = [inputPath, photoInputPath];
            if (provider !== 'local') {
                deleteList.push(outputVideoPath, outputPhotoPath);
            }
            deleteList.forEach(p => {
                if (p && fs.existsSync(p)) fs.unlinkSync(p);
            });
            console.log(`[CLEANUP] Temporary files cleaned.`);

            // --- TOTAL EXECUTION TIME ---
            const totalDuration = ((Date.now() - taskStartTime) / 1000).toFixed(2);
            console.log(`\n==================================================`);
            console.log(`🎉 [QUEUE SUCCESS] SELURUH PROSES SELESAI DALAM ${totalDuration} DETIK!`);
            console.log(`==================================================\n`);
            resolve();

        } catch (err) {
            console.error(`\n[QUEUE ERROR] Error processing task for: ${task.name}`);
            console.error(`[ERROR DETAILS]:`, err.message || err);

            task.retryCount = (task.retryCount || 0) + 1;
            if (task.retryCount <= 10) {
                if (!fs.existsSync(OFFLINE_QUEUE_DIR)) fs.mkdirSync(OFFLINE_QUEUE_DIR, { recursive: true });
                const failedTaskPath = path.join(OFFLINE_QUEUE_DIR, `task_${Date.now()}_${task.phone || 'no_phone'}.json`);
                fs.writeFileSync(failedTaskPath, JSON.stringify(task, null, 2));
                console.log(`[OFFLINE QUEUE] Task diselamatkan ke offline queue (Percobaan ke-${task.retryCount}).`);
            } else {
                console.log(`[OFFLINE QUEUE] Task gagal setelah 10 percobaan. Dihapus permanen.`);
                [task.videoPath, task.photoPath].forEach(p => {
                    if (p && fs.existsSync(p)) {
                        try { fs.unlinkSync(p); } catch (e) { }
                    }
                });
            }

            reject(err);
        }
    });
};

const queue = fastq.promise(worker, 2);

setInterval(async () => {
    if (fs.existsSync(OFFLINE_QUEUE_DIR)) {
        const files = fs.readdirSync(OFFLINE_QUEUE_DIR).filter(f => f.endsWith('.json'));
        if (files.length > 0) {
            console.log(`\n[OFFLINE RECOVERY] Menemukan ${files.length} tugas tertunda. Mencoba memproses ulang...`);
            for (let file of files) {
                const filePath = path.join(OFFLINE_QUEUE_DIR, file);
                try {
                    const task = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    console.log(`[OFFLINE RECOVERY] Mengirim ulang data untuk ${task.name}...`);
                    queue.push(task);
                    fs.unlinkSync(filePath);
                } catch (e) {
                    console.error("[OFFLINE RECOVERY] Error membaca file antrean:", e.message);
                }
            }
        }
    }
}, 300000);

module.exports = { queue, paymentCache };
