const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const fastq = require('fastq');
const { DEFAULT_CONFIG, UPLOADS_DIR, PUBLIC_DIR, OFFLINE_QUEUE_DIR, CONFIG_FILE, EVENTS_DIR, ROOT } = require('../config/defaults');
const { getEventConfig, saveSession, db } = require('./database');
const { uploadToDrive, createDriveFolder, uploadToGCP, storageProvider } = require('./storage');
const { sendWhatsAppMessage, sendEmailMessage } = require('./notification');
const { getMediaDimensions } = require('./media');

const paymentCache = {};

const worker = async (task) => {
    console.log(`\n[QUEUE] Memulai proses rendering untuk: ${task.name} (${task.phone})`);

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
            } else {
                console.log(`[GCP] Menggunakan Google Cloud Storage (Bucket: ${process.env.GCP_BUCKET_NAME})`);
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

            console.log(`[RENDER] Step 2/6: Processing Video with Overlay...`);
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
                        console.log(`[QUEUE SUCCESS] Tugas Selesai! Video matang disimpan di: ${outputVideoPath}`);
                        videoProcessed = true;
                        res();
                    })
                    .on('error', (err) => {
                        console.error(`[RENDER] Video Error:`, err.message);
                        rej(err);
                    })
                    .run();
            });

            let photoProcessed = false;
            if (photoInputPath && fs.existsSync(photoInputPath)) {
                console.log(`[RENDER] Step 3/6: Processing Photo with Overlay...`);
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
                            console.log(`[RENDER] Photo Render Complete.`);
                            photoProcessed = true;
                            res();
                        })
                        .on('error', (err) => rej(err))
                        .run();
                });
            }

            console.log(`[UPLOAD] Step 4/6: Uploading to Cloud...`);
            let videoLink = null;
            let photoLink = null;
            const gcpFolderName = `${task.name} - ${task.phone}`;

            if (videoProcessed) {
                console.log(`[UPLOAD] Mengunggah video...`);
                if (provider === 'drive') {
                    const driveVideo = await uploadToDrive(outputVideoPath, `Video-${task.name}-${timestamp}.mp4`, userFolderId);
                    videoLink = driveVideo.webViewLink;
                } else {
                    videoLink = await uploadToGCP(outputVideoPath, `Video-${task.name}-${timestamp}.mp4`, gcpFolderName);
                }
                console.log(`[UPLOAD] Sukses! Link Video: ${videoLink}`);
            }

            if (photoProcessed) {
                console.log(`[UPLOAD] Mengunggah photo...`);
                if (provider === 'drive') {
                    const drivePhoto = await uploadToDrive(outputPhotoPath, `Photo-${task.name}-${timestamp}.jpg`, userFolderId);
                    photoLink = drivePhoto.webViewLink;
                } else {
                    photoLink = await uploadToGCP(outputPhotoPath, `Photo-${task.name}-${timestamp}.jpg`, gcpFolderName);
                }
                console.log(`[UPLOAD] Sukses! Link Photo: ${photoLink}`);
            }

            const sessionData = {
                id: sessionId,
                name: task.name,
                phone: task.phone || null,
                email: task.email || null,
                videoLink: videoLink,
                photoLink: photoLink,
                eventId: eventId,
                createdAt: new Date().toISOString()
            };

            await saveSession(sessionId, sessionData);

            let domainStr = process.env.PUBLIC_DOMAIN || 'localhost:3000';
            let localResultLink = '';
            if (domainStr.startsWith('http')) {
                localResultLink = `${domainStr}/result?id=${sessionId}`;
            } else {
                const protocol = domainStr === 'localhost:3000' ? 'http' : 'https';
                localResultLink = `${protocol}://${domainStr}/result?id=${sessionId}`;
            }

            if (videoLink || photoLink) {
                let msgTemplate = config.messageTemplate || `Halo {name}! ✨\n\nKenangan Anda di *ScribbleBooth* sudah siap! Silakan lihat dan download melalui link di bawah ini:\n\n🔗 {link}\n\nTerima kasih sudah mampir!`;
                const customMsg = msgTemplate.replace(/{name}/g, task.name).replace(/{link}/g, localResultLink);

                let emailSubj = config.emailSubject || "Kenangan ScribbleBooth Anda sudah siap! ✨";

                if (task.email) {
                    console.log(`[EMAIL] Menyiapkan pengiriman email ke: ${task.email}`);
                    try {
                        await sendEmailMessage(task.email, emailSubj, customMsg);
                        console.log(`[EMAIL] Email sukses dikirim ke ${task.email}`);
                    } catch (err) {
                        console.log(`[EMAIL] Email gagal dikirim ke ${task.email}: ${err.message}`);
                    }
                }

                if (task.phone) {
                    try {
                        const result = await sendWhatsAppMessage(task.phone, customMsg);
                        console.log(`[WhatsApp] Pesan sukses dikirim ke ${task.phone}`);
                    } catch (err) {
                        console.log(`[WhatsApp] Pesan gagal dikirim ke ${task.phone}: ${err.message}`);
                        throw err;
                    }
                }
            }

            [inputPath, photoInputPath, outputVideoPath, outputPhotoPath].forEach(p => {
                if (p && fs.existsSync(p)) fs.unlinkSync(p);
            });
            console.log(`[CLEANUP] temporary files deleted.`);
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
