const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fastq = require('fastq');
const cloudscraper = require('cloudscraper');

require('dotenv').config();
const { google } = require('googleapis');
const { Storage } = require('@google-cloud/storage');
const { Readable } = require('stream');
const nodemailer = require('nodemailer');
const midtransClient = require('midtrans-client');
const qrcode = require('qrcode');

// Inisialisasi Midtrans Core API (Untuk nanti jika QRIS murni sudah aktif)
const coreApi = new midtransClient.CoreApi({
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
    serverKey: process.env.MIDTRANS_SERVER_KEY || '',
    clientKey: process.env.MIDTRANS_CLIENT_KEY || ''
});

// Inisialisasi Midtrans Snap API (Untuk testing saat ini)
const snapApi = new midtransClient.Snap({
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
    serverKey: process.env.MIDTRANS_SERVER_KEY || '',
    clientKey: process.env.MIDTRANS_CLIENT_KEY || ''
});

// In-memory cache untuk status pembayaran (webhook callback)
const paymentCache = {};
// Initialize Express App
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Intercept root route to require event parameter
app.get('/', (req, res, next) => {
    if (!req.query.event) {
        return res.sendFile(path.join(__dirname, 'public', 'landing.html'));
    }
    next();
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] })); // Serve frontend html with clean URLs

// --- ADMIN AUTHENTICATION ---
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_TOKEN = 'lumea-admin-token-xyz789'; // Simple static token for validation

app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        res.json({ status: 'success', token: ADMIN_TOKEN });
    } else {
        res.status(401).json({ status: 'error', message: 'Password salah!' });
    }
});

app.post('/api/verify-token', (req, res) => {
    const { token } = req.body;
    if (token === ADMIN_TOKEN) {
        res.json({ status: 'success' });
    } else {
        res.status(401).json({ status: 'error' });
    }
});

// Setup Multer for Video Uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'uploads';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });
// Middleware untuk handle multiple upload (video & photo)
const cpUpload = upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'photo', maxCount: 1 }
]);

const ffmpeg = require('fluent-ffmpeg');

// --- SETUP GOOGLE DRIVE API ---
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

try {
    const token = fs.readFileSync(path.join(__dirname, 'token.json'));
    oauth2Client.setCredentials(JSON.parse(token));
    console.log('[DRIVE] ✅ Token OAuth2 Google Drive berhasil dimuat.');
} catch (error) {
    console.error('[DRIVE] ❌ Error muat token.json! File mungkin tidak valid:', error.message);
}

const drive = google.drive({ version: 'v3', auth: oauth2Client });

const uploadToDrive = async (filePath, fileName, parentId = null) => {
    const fileStream = fs.createReadStream(filePath);
    const mimeType = fileName.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg';

    const response = await drive.files.create({
        requestBody: {
            name: fileName,
            parents: [parentId || process.env.GOOGLE_DRIVE_FOLDER_ID],
        },
        media: {
            mimeType: mimeType,
            body: fileStream,
        },
        fields: 'id, webViewLink',
    });

    // Ubah akses menjadi public agar bisa dibuka dari link WA
    await drive.permissions.create({
        fileId: response.data.id,
        requestBody: {
            role: 'reader',
            type: 'anyone',
        },
    });

    return response.data;
};

const createDriveFolder = async (folderName) => {
    const fileMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
    };
    const response = await drive.files.create({
        resource: fileMetadata,
        fields: 'id, webViewLink',
    });

    // Make folder public
    await drive.permissions.create({
        fileId: response.data.id,
        requestBody: {
            role: 'reader',
            type: 'anyone',
        },
    });

    return { id: response.data.id, link: response.data.webViewLink };
};

// --- SETUP GCP STORAGE ---
let gcpStorage = null;
try {
    gcpStorage = new Storage({
        projectId: process.env.GCP_PROJECT_ID,
        keyFilename: path.join(__dirname, 'gcp-key.json')
    });
} catch (err) {
    console.error('[GCP] ❌ Error inisialisasi GCP Storage (pastikan gcp-key.json ada):', err.message);
}

const uploadToGCP = async (filePath, fileName, folderName = 'videobooth') => {
    const bucketName = process.env.GCP_BUCKET_NAME;
    if (!bucketName) throw new Error("GCP_BUCKET_NAME tidak diatur di .env");
    const bucket = gcpStorage.bucket(bucketName);
    
    // Hapus karakter aneh dari nama folder agar URL lebih aman
    const safeFolderName = folderName.replace(/[^a-zA-Z0-9 ]/g, '_');
    const destination = `${safeFolderName}/${fileName}`;
    
    await bucket.upload(filePath, {
        destination: destination,
        metadata: {
            cacheControl: 'public, max-age=31536000',
        },
    });
    
    return `https://storage.googleapis.com/${bucketName}/${destination}`;
};
// ------------------------------

// --- SETUP FIRESTORE SDK ---
const admin = require('firebase-admin');
let db = null;
try {
    const firebaseKeyFile = process.env.FIREBASE_KEY_FILE || process.env.GCP_KEY_FILE || 'gcp-key.json';
    const firebaseKeyPath = path.join(__dirname, firebaseKeyFile);
    if (fs.existsSync(firebaseKeyPath)) {
        admin.initializeApp({
            credential: admin.credential.cert(firebaseKeyPath)
        });
        db = admin.firestore();
        console.log('[FIRESTORE] ✅ Inisialisasi Firestore Storage berhasil.');
    } else {
        console.log('[FIRESTORE] ⚠️ File kunci GCP/Firestore tidak ditemukan. Menggunakan penyimpanan lokal JSON tersegregasi.');
    }
} catch (err) {
    console.error('[FIRESTORE] ❌ Gagal inisialisasi Firestore:', err.message);
}

// --- SETUP NODEMAILER (EMAIL) ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASSWORD
    }
});

const sendVideoEmail = async (toEmail, userName, videoLink) => {
    const mailOptions = {
        from: `"Imajiwa Videobooth" <${process.env.SMTP_EMAIL}>`,
        to: toEmail,
        subject: '🎥 Ini Video Keseruan Anda dari Imajiwa!',
        html: `
            <div style="font-family: Arial, sans-serif; background: #fdfdfd; padding: 40px 20px; text-align: center; color: #222; max-width: 500px; margin: auto; border: 1px solid #ddd; border-radius: 12px;">
                <h1 style="color: #E11D48; margin-top: 0;">✨ Imajiwa</h1>
                <p style="font-size: 18px;">Halo <strong>${userName}</strong>,</p>
                <p style="font-size: 15px; color: #555;">Terima kasih sudah berkreasi di Videobooth kami! Momen seru Anda telah berhasil diproses.</p>
                <p style="font-size: 15px; color: #555;">Klik tombol di bawah ini untuk melihat dan mengunduh video Anda:</p>
                <br>
                <a href="${videoLink}" style="background-color: #E11D48; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">Tonton Video Saya</a>
                <br><br><br>
                <hr style="border: none; border-top: 1px solid #eee;">
                <p style="font-size: 12px; color: #999; margin-top: 20px;">
                    Pesan otomatis dari Sistem Videobooth. Jangan ragu membagikan video Anda di media sosial!
                </p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`[EMAIL] ✅ Sukses mengirim hasil ke: ${toEmail}`);
    } catch (err) {
        console.error(`[EMAIL] ❌ Gagal mengirim, cek setelan password Anda:`, err.message);
    }
};

async function sendNotificationForSession(sessionData, config) {
    let domainStr = process.env.PUBLIC_DOMAIN || 'localhost:3000';
    let claimLink = '';
    if (domainStr.startsWith('http')) {
        claimLink = `${domainStr}/claim.html?id=${sessionData.id}`;
    } else {
        const protocol = domainStr === 'localhost:3000' ? 'http' : 'https';
        claimLink = `${protocol}://${domainStr}/claim.html?id=${sessionData.id}`;
    }

    let msgTemplate = config.messageTemplate || `Halo {name}! ✨\n\nKenangan Anda di *ScribbleBooth* sudah siap! Silakan lihat dan download melalui link di bawah ini:\n\n🔗 {link}\n\nTerima kasih sudah mampir!`;
    const customMsg = msgTemplate.replace(/{name}/g, sessionData.name).replace(/{link}/g, claimLink);

    let emailSubj = config.emailSubject || "Kenangan ScribbleBooth Anda sudah siap! ✨";
    
    if (sessionData.email) {
        console.log(`[EMAIL] 📤 Menyiapkan pengiriman email ke: ${sessionData.email}`);
        try {
            await sendEmailMessage(sessionData.email, emailSubj, customMsg);
            console.log(`[EMAIL] ✅ Email sukses dikirim ke ${sessionData.email}`);
        } catch (err) {
            console.log(`[EMAIL] ❌ Email gagal dikirim ke ${sessionData.email}: ${err.message}`);
        }
    }
    
    if (sessionData.phone) {
        try {
            const result = await sendWhatsAppMessage(sessionData.phone, customMsg);
            console.log(`[WhatsApp] ✅ Pesan sukses dikirim ke ${sessionData.phone}`);
        } catch (err) {
            console.log(`[WhatsApp] ❌ Pesan gagal dikirim ke ${sessionData.phone}: ${err.message}`);
        }
    }
}

// Helper function to read media dimensions dynamically using ffprobe
const getMediaDimensions = (filePath) => {
    return new Promise((resolve) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) {
                console.warn(`[FFPROBE WARNING] Gagal mendeteksi resolusi untuk ${filePath}, menggunakan default 1080x1920:`, err.message);
                return resolve({ width: 1080, height: 1920 });
            }
            const stream = metadata.streams.find(s => s.codec_type === 'video');
            if (!stream) {
                return resolve({ width: 1080, height: 1920 });
            }
            resolve({ width: stream.width, height: stream.height });
        });
    });
};

// Background Queue Worker Engine
const worker = async (task) => {
    console.log(`\n[QUEUE] ⏳ Memulai proses rendering untuk: ${task.name} (${task.phone})`);

    return new Promise(async (resolve, reject) => {
        try {
            const eventId = task.eventId || 'audric-cathrine';
            const inputPath = task.videoPath;
            const photoInputPath = task.photoPath;
            let config = DEFAULT_CONFIG;
            if (db) {
                try {
                    const doc = await db.collection('events').doc(eventId).get();
                    if (doc.exists) {
                        config = doc.data();
                    } else {
                        // Use default and write to Firestore so it exists
                        await db.collection('events').doc(eventId).set(DEFAULT_CONFIG);
                        config = DEFAULT_CONFIG;
                    }
                } catch (e) {
                    console.error('[WORKER] Error loading event config from Firestore:', e.message);
                }
            } else {
                const eventDir = path.join(__dirname, 'data', 'events', eventId);
                const eventConfigFile = path.join(eventDir, 'config.json');
                if (fs.existsSync(eventConfigFile)) {
                    config = JSON.parse(fs.readFileSync(eventConfigFile, 'utf8'));
                } else {
                    if (fs.existsSync(CONFIG_FILE)) {
                        config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
                    } else {
                        config = DEFAULT_CONFIG;
                    }
                }
            }
            let overlayFile = 'overlay.png';
            if (config.overlayImageUrl === 'none') {
                overlayFile = 'none-nonexistent-file';
            } else if (config.overlayImageUrl && config.overlayImageUrl !== 'Default') {
                overlayFile = config.overlayImageUrl;
            }
            const overlayPath = path.join(__dirname, 'public', overlayFile);

            const timestamp = Date.now();
            const outputVideoPath = path.join('uploads', `FINAL-${timestamp}-video.mp4`);
            const outputPhotoPath = path.join('uploads', `FINAL-${timestamp}-photo.jpg`);
            const sessionId = `session-${timestamp}-${Math.random().toString(36).substring(2, 8)}`;

            const storageProvider = (process.env.STORAGE_PROVIDER || 'drive').toLowerCase();
            let userFolderId = null;
            let userFolderLink = null; // Unused directly for user if using result page, but useful for Drive tracking

            // 1. Create Folder (Only for Drive)
            if (storageProvider === 'drive') {
                console.log(`[G-DRIVE] 📂 Creating folder for ${task.name}...`);
                const driveFolder = await createDriveFolder(`${task.name} - ${task.phone}`);
                userFolderId = driveFolder.id;
                userFolderLink = driveFolder.link;
            } else {
                console.log(`[GCP] ☁️ Using Google Cloud Storage (Bucket: ${process.env.GCP_BUCKET_NAME})`);
            }

            // Get dynamic dimensions for video & photo to ensure 100% perfect scaling across all FFmpeg versions
            let videoWidth = 1080;
            let videoHeight = 1920;
            try {
                const dims = await getMediaDimensions(inputPath);
                videoWidth = dims.width;
                videoHeight = dims.height;
                console.log(`[RENDER] 🎬 Resolusi Video Terdeteksi: ${videoWidth}x${videoHeight}`);
            } catch (e) {
                console.log(`[RENDER] ⚠️ Gagal mendeteksi resolusi video, menggunakan fallback 1080x1920.`);
            }

            let photoWidth = 1080;
            let photoHeight = 1920;
            if (photoInputPath && fs.existsSync(photoInputPath)) {
                try {
                    const dims = await getMediaDimensions(photoInputPath);
                    photoWidth = dims.width;
                    photoHeight = dims.height;
                    console.log(`[RENDER] 📸 Resolusi Foto Terdeteksi: ${photoWidth}x${photoHeight}`);
                } catch (e) {
                    console.log(`[RENDER] ⚠️ Gagal mendeteksi resolusi foto, menggunakan fallback 1080x1920.`);
                }
            }

            // 2. Process Video
            console.log(`[RENDER] 🎬 Step 2/6: Processing Video with Overlay...`);
            let videoProcessed = false;
            await new Promise((res, rej) => {
                let cmd = ffmpeg(inputPath);
                if (fs.existsSync(overlayPath)) {
                    console.log(`[FFMPEG] Mendeteksi overlay.png, sedang merender bingkai...`);
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
                        console.log(`[QUEUE SUCCESS] 🌟 Tugas Selesai! Video matang disimpan di: ${outputVideoPath}`);
                        videoProcessed = true;
                        res();
                    })
                    .on('error', (err) => {
                        console.error(`[RENDER] ❌ Video Error:`, err.message);
                        rej(err);
                    })
                    .run();
            });

            // 3. Process Photo
            let photoProcessed = false;
            if (photoInputPath && fs.existsSync(photoInputPath)) {
                console.log(`[RENDER] 📸 Step 3/6: Processing Photo with Overlay...`);
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
                            console.log(`[RENDER] ✅ Photo Render Complete.`);
                            photoProcessed = true;
                            res();
                        })
                        .on('error', (err) => rej(err))
                        .run();
                });
            }
            // 4. Upload to Cloud
            console.log(`[UPLOAD] ☁️ Step 4/6: Uploading to Cloud...`);
            let videoLink = null;
            let photoLink = null;
            const gcpFolderName = `${task.name} - ${task.phone}`;

            if (videoProcessed) {
                console.log(`[UPLOAD] ☁️ Mengunggah video...`);
                if (storageProvider === 'drive') {
                    const driveVideo = await uploadToDrive(outputVideoPath, `Video-${task.name}-${timestamp}.mp4`, userFolderId);
                    videoLink = driveVideo.webViewLink;
                } else {
                    videoLink = await uploadToGCP(outputVideoPath, `Video-${task.name}-${timestamp}.mp4`, gcpFolderName);
                }
                console.log(`[UPLOAD] ✅ Sukses! Link Video: ${videoLink}`);
            }

            if (photoProcessed) {
                console.log(`[UPLOAD] 📸 Mengunggah photo...`);
                if (storageProvider === 'drive') {
                    const drivePhoto = await uploadToDrive(outputPhotoPath, `Photo-${task.name}-${timestamp}.jpg`, userFolderId);
                    photoLink = drivePhoto.webViewLink;
                } else {
                    photoLink = await uploadToGCP(outputPhotoPath, `Photo-${task.name}-${timestamp}.jpg`, gcpFolderName);
                }
                console.log(`[UPLOAD] ✅ Sukses! Link Photo: ${photoLink}`);
            }
            
            // 4.5 Save Session Data (Firestore or Local JSON)
            const price = parseInt(config.sessionPrice) || 0;
            const sessionData = {
                id: sessionId,
                name: task.name,
                phone: task.phone || null,
                email: task.email || null,
                videoLink: videoLink,
                photoLink: photoLink,
                eventId: eventId,
                createdAt: new Date().toISOString(),
                price: price,
                paid: price === 0
            };

            if (db) {
                try {
                    await db.collection('sessions').doc(sessionId).set(sessionData);
                    console.log(`[FIRESTORE] ✅ Sukses menyimpan data sesi: ${sessionId}`);
                } catch (e) {
                    console.error(`[FIRESTORE] ❌ Gagal menyimpan data sesi:`, e.message);
                }
            } else {
                const eventDir = path.join(__dirname, 'data', 'events', eventId);
                const sessionsDir = path.join(eventDir, 'sessions');
                if (!fs.existsSync(sessionsDir)) {
                    fs.mkdirSync(sessionsDir, { recursive: true });
                }
                const sessionFilePath = path.join(sessionsDir, `${sessionId}.json`);
                fs.writeFileSync(sessionFilePath, JSON.stringify(sessionData, null, 2));
            }
            // 5. Send Notification (Delayed if unpaid)
            if (videoLink || photoLink) {
                if (price > 0 && !sessionData.paid) {
                    console.log(`[PAYWALL] 💰 Sesi ${sessionId} belum dibayar (Rp${price}). Menunggu pembayaran untuk mengirim WhatsApp/Email.`);
                } else {
                    await sendNotificationForSession(sessionData, config);
                }
            }

            // 6. Cleanup
            [inputPath, photoInputPath, outputVideoPath, outputPhotoPath].forEach(p => {
                if (p && fs.existsSync(p)) fs.unlinkSync(p);
            });
            console.log(`[CLEANUP] 🧹 temporary files deleted.`);
            resolve();

        } catch (err) {
            console.error(`\n[QUEUE ERROR] ❌ Error processing task for: ${task.name}`);
            console.error(`[ERROR DETAILS]:`, err);

            // Clean up even on error to prevent disk filling
            [task.videoPath, task.photoPath].forEach(p => {
                if (p && fs.existsSync(p)) {
                    try { fs.unlinkSync(p); } catch (e) { }
                }
            });
            reject(err);
        }
    });
};

// Initiate FastQ with concurrency = 2 (allow simultaneous upload while rendering)
const queue = fastq.promise(worker, 2);

// API Endpoint: Get Session Result
app.get('/api/result/:id', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    const sessionId = req.params.id;
    
    if (db) {
        try {
            const doc = await db.collection('sessions').doc(sessionId).get();
            if (doc.exists) {
                return res.json({ status: 'success', data: doc.data() });
            }
        } catch (e) {
            console.error('[API RESULT] Firestore error:', e.message);
        }
    }
    
    // Local File Fallback (Checking all events if event is unknown)
    const eventsDir = path.join(__dirname, 'data', 'events');
    let sessionData = null;
    
    if (fs.existsSync(eventsDir)) {
        const events = fs.readdirSync(eventsDir);
        for (const ev of events) {
            const sessionFilePath = path.join(eventsDir, ev, 'sessions', `${sessionId}.json`);
            if (fs.existsSync(sessionFilePath)) {
                sessionData = JSON.parse(fs.readFileSync(sessionFilePath, 'utf8'));
                break;
            }
        }
    }
    
    // Deprecated legacy global directory check
    if (!sessionData) {
        const legacyPath = path.join(__dirname, 'data', 'sessions', `${sessionId}.json`);
        if (fs.existsSync(legacyPath)) {
            sessionData = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
        }
    }

    if (sessionData) {
        res.json({ status: 'success', data: sessionData });
    } else {
        res.status(404).json({ status: 'error', message: 'Session not found' });
    }
});

// API Endpoint: Get All Sessions
app.get('/api/sessions', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    const eventId = req.query.event || 'audric-cathrine';
    
    if (db) {
        try {
            const snapshot = await db.collection('sessions').where('eventId', '==', eventId).orderBy('createdAt', 'desc').get();
            const sessions = [];
            snapshot.forEach(doc => {
                sessions.push(doc.data());
            });
            return res.json({ status: 'success', sessions });
        } catch (e) {
            console.error('[API SESSIONS] Firestore error:', e.message);
        }
    }
    
    // Local File Fallback
    try {
        const eventDir = path.join(__dirname, 'data', 'events', eventId);
        const sessionsDir = path.join(eventDir, 'sessions');
        const sessions = [];
        
        if (fs.existsSync(sessionsDir)) {
            const files = fs.readdirSync(sessionsDir);
            files.forEach(file => {
                if (file.endsWith('.json')) {
                    try {
                        const filePath = path.join(sessionsDir, file);
                        const fileContent = fs.readFileSync(filePath, 'utf8');
                        const sessionData = JSON.parse(fileContent);
                        sessions.push(sessionData);
                    } catch (e) {
                        console.error(`Error reading session file ${file}:`, e.message);
                    }
                }
            });
        }
        
        // Also merge legacy global sessions if request is for 'audric-cathrine'
        if (eventId === 'audric-cathrine') {
            const legacyDir = path.join(__dirname, 'data', 'sessions');
            if (fs.existsSync(legacyDir)) {
                const files = fs.readdirSync(legacyDir);
                files.forEach(file => {
                    if (file.endsWith('.json')) {
                        try {
                            const filePath = path.join(legacyDir, file);
                            const fileContent = fs.readFileSync(filePath, 'utf8');
                            const sessionData = JSON.parse(fileContent);
                            if (!sessions.some(s => s.id === sessionData.id)) {
                                sessions.push(sessionData);
                            }
                        } catch (e) {}
                    }
                });
            }
        }
        
        // Sort by createdAt descending (newest first)
        sessions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        res.json({ status: 'success', sessions });
    } catch (err) {
        console.error('[API SESSIONS] Error:', err.message);
        res.status(500).json({ status: 'error', message: 'Gagal memuat data sesi' });
    }
});

// API Endpoint: Delete Session
app.delete('/api/sessions/:id', async (req, res) => {
    try {
        const sessionId = req.params.id;
        if (!/^[a-zA-Z0-9\-_]+$/.test(sessionId)) {
            return res.status(400).json({ status: 'error', message: 'ID Sesi tidak valid' });
        }
        
        if (db) {
            try {
                await db.collection('sessions').doc(sessionId).delete();
                console.log(`[FIRESTORE] Sesi dihapus dari cloud: ${sessionId}`);
            } catch (e) {
                console.error('[API DELETE SESSION] Firestore error:', e.message);
            }
        }
        
        // Local File Fallback (Checking all events)
        const eventsDir = path.join(__dirname, 'data', 'events');
        let deleted = false;
        
        if (fs.existsSync(eventsDir)) {
            const events = fs.readdirSync(eventsDir);
            for (const ev of events) {
                const sessionFilePath = path.join(eventsDir, ev, 'sessions', `${sessionId}.json`);
                if (fs.existsSync(sessionFilePath)) {
                    fs.unlinkSync(sessionFilePath);
                    deleted = true;
                }
            }
        }
        
        // Legacy file fallback check
        const legacyPath = path.join(__dirname, 'data', 'sessions', `${sessionId}.json`);
        if (fs.existsSync(legacyPath)) {
            fs.unlinkSync(legacyPath);
            deleted = true;
        }

        if (deleted || db) {
            res.json({ status: 'success', message: 'Sesi berhasil dihapus' });
        } else {
            res.status(404).json({ status: 'error', message: 'Sesi tidak ditemukan' });
        }
    } catch (err) {
        console.error('[API DELETE SESSION] Error:', err.message);
        res.status(500).json({ status: 'error', message: 'Gagal menghapus sesi' });
    }
});

// API Endpoint: Submit Video
app.post('/api/videobooth/submit', (req, res, next) => {
    console.log(`\n[CONNECTION] ⚡ Terdeteksi upaya pengiriman data...`);
    next();
}, cpUpload, async (req, res) => {
    // 1. LOG IMMEDIATELY
    const { name, phone } = req.body;
    console.log(`[API] 📥 Data diterima dari: ${name} (${phone})`);

    try {
        const eventId = req.body.eventId || 'audric-cathrine';
        const active = await isEventActive(eventId);
        if (!active) {
            return res.status(400).json({ status: 'error', message: 'Event ini sedang tidak aktif.' });
        }

        const videoFile = req.files['video'] ? req.files['video'][0] : null;
        const photoFile = req.files['photo'] ? req.files['photo'][0] : null;

        if (!videoFile) {
            return res.status(400).json({ status: 'error', message: 'Tidak ada file video yang dikirim' });
        }

        console.log(`[API] Menerima video dari ${name}. Memasukkan ke Antrean...`);

        // PUSH task ke Queue (Background)
        queue.push({
            name: name,
            phone: phone || null,
            email: req.body.email || null,
            deliveryMethod: req.body.deliveryMethod || 'both',
            videoPath: videoFile.path,
            photoPath: photoFile ? photoFile.path : null,
            eventId: eventId
        });

        // KEMBALIKAN response secepat mungkin
        res.status(200).json({
            status: 'success',
            message: 'Data berhasil disimpan dan sedang diproses',
            data: { name, phone }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan server' });
    }
});

// ===============================
// Fungsi: Kirim Pesan via WhatsApp (RuangWA)
// ===============================
async function sendWhatsAppMessage(phone, text) {
    try {
        const result = await cloudscraper.post({
            url: "https://ruangwa.id/api-app/whatsapp/send-message",
            json: true,
            body: {
                phone: phone,
                device_key: process.env.RUANGWA_DEVICE_KEY,
                api_key: process.env.RUANGWA_API_KEY,
                method: "text",
                text: text,
                is_group: false
            }
        });
        if (result && (result.status === true || result.message === "Berhasil mengirimkan pesan")) {
            console.log(`[WhatsApp] ✅ Pesan sukses dikirim ke ${phone}:`, result.message || "Berhasil");
            return result;
        } else {
            console.log(`[WhatsApp] ⚠️ Server RuangWA merespons, tapi pesan mungkin gagal:`, result);
            throw new Error(result && result.message ? result.message : "Unknown RuangWA error");
        }
    } catch (error) {
        console.error(`[WhatsApp] ❌ Error: ${error.message}`);
        // Jika error 523 (Origin Unreachable) dari RuangWA
        if (error.statusCode === 523) {
            console.error(`[WhatsApp] 🛑 Server RuangWA Sedang Down (Error 523). Pesan masuk ke antrean tapi gagal kirim otomatis.`);
        }
        throw error;
    }
}

// ===============================
// Fungsi: Kirim Pesan via Email (Nodemailer)
// ===============================
async function sendEmailMessage(targetEmail, subject, text) {
    try {
        const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        const ec = config.email_config || {};

        const transporter = nodemailer.createTransport({
            host: ec.host || "smtp.gmail.com",
            port: ec.port || 465,
            secure: true,
            auth: {
                user: process.env.SMTP_EMAIL, // 🔥 paksa pakai env
                pass: process.env.SMTP_PASSWORD
            }
        });

        const info = await transporter.sendMail({
            from: `"ScribbleBooth" <${process.env.SMTP_EMAIL}>`,
            to: targetEmail,
            subject: subject,
            text: text,
            html: text.replace(/\n/g, "<br>")
        });

        return true; // ✅ sukses

    } catch (err) {
        console.error(`[EMAIL] ❌ Gagal mengirim email:`, err.message);
        throw err; // 🔥 INI KUNCI
    }
}

// ===============================
// Queue Worker: Proses Video & Upload
// ===============================
const CONFIG_FILE = path.join(__dirname, 'config.json');
const DEFAULT_CONFIG = {
    // === BASIC ===
    status: 'active',
    title: 'New Event',
    subtitle: '#OnceInALifetime',
    descPremium: 'Enter your details to unveil a personalized wedding experience.',
    startText: 'Begin your experience',
    messageTemplate: 'Halo {name}! ✨\n\nKenangan Anda di ScribbleBooth sudah siap! Silakan lihat dan download melalui link folder di bawah ini:\n\n🔗 {link}\n\nTerima kasih sudah mampir!',
    emailSubject: 'Kenangan ScribbleBooth Anda sudah siap! ✨',

    // === COLORS ===
    bgColor1: '#1a100a',
    bgColor2: '#3c2a21',
    accentColor: '#D3BB7C',
    frameColor: '#333333',
    titleColor: '#D3BB7C',
    connectorColor: '#D3BB7C',
    subtitleColor: '#f0e5c7',
    descColor: '#CDCDCD',
    startTextColor: '#1a0f0a',
    readyTextColor: '#f0e5c7',
    reviewTextColor: '#f0e5c7',
    successTextColor: '#f0e5c7',

    // === STATE FORM ===
    formLabelName: 'Name',
    formLabelNameColor: '#f0e5c7',
    formPlaceholderName: 'Please input your name',
    formSubmitText: 'SUBMIT',
    formSubmitTextColor: '#1a0f0a',

    // === STATE READY VIDEO ===
    readyHeaderTitle: 'Ready To Record?',
    readyHeaderTitleColor: '#f0e5c7',
    readyHeaderSubtitle: 'Position yourself in front of the camera',
    readyHeaderSubtitleColor: '#f0e5c7',
    readyTextMain: 'Look at the camera and get ready.',
    readyTextSub: 'Hit the record button when you are ready.',
    readyCountdownText: 'Start Recording',
    readyCdText: 'Recording Begins in...',
    readyBackText: 'BACK',
    readyBackTextColor: '#e7e5d8',

    // === STATE REVIEW VIDEO ===
    recordingCdText: 'Recording...',
    reviewTextMain: 'Please review your video,',
    reviewTextSub: 'you can RETAKE or NEXT.',
    reviewRetakeText: 'RETAKE',
    reviewRetakeTextColor: '#e7e5d8',
    reviewPhotoText: 'TAKE A PHOTO',
    reviewPhotoTextColor: '#1a0f0a',

    // === STATE READY PHOTO ===
    photoHeaderTitle: 'Ready for Photo Session?',
    photoHeaderTitleColor: '#f0e5c7',
    photoHeaderSubtitle: 'Strike a beautiful pose for the camera',
    photoHeaderSubtitleColor: '#f0e5c7',
    photoInstructionMain: 'Look at the camera and smile.',
    photoInstructionSub: 'Hit the shutter button when you are ready.',
    photoInstructionTextColor: '#f0e5c7',
    photoCountdownText: 'Take a Photo',
    photoCdText: 'Taking Photo in...',
    photoBackText: 'BACK',
    photoBackTextColor: '#e7e5d8',

    // === STATE REVIEW FINAL ===
    finalHeaderTitle: 'Review your session.',
    finalHeaderTitleColor: '#f0e5c7',
    finalVideoLabel: 'VIDEO',
    finalPhotoLabel: 'PHOTO',
    finalRetakeAllText: 'RETAKE ALL',
    finalRetakeAllTextColor: '#e7e5d8',
    finalRetakePhotoText: 'RETAKE PHOTO',
    finalRetakePhotoTextColor: '#e7e5d8',
    finalUploadText: 'UPLOAD BOTH',
    finalUploadTextColor: '#1a0f0a',

    // === STATE SUCCESS ===
    successTextMain: 'Your memories are ready! ✨',
    successTextSub: 'Scan this QR code to view and download your video and photo.',
    successFooterText: 'Thank you for being part of this moment',
    successFooterTextColor: '#cdcdcd',
    successDoneText: 'Done',
    successDoneTextColor: '#1a0f0a',
    successAutoResetText: 'Auto-reset in',

    // === SIDE PANEL ===
    previewPanelFooter: 'Preview Your Moment',
    loadingPreviewText: 'Loading Preview...',
    loadingTutorialText: 'Loading Tutorial...',

    // === GUEST RESULT PAGE ===
    resultLoadingText: 'Loading your memories... ✨',
    resultErrorText: 'Sorry, your session was not found or has expired.',
    resultProcessingText: 'Processing your video & photo... please wait a moment. ✨',
    resultSaveVideoText: '🎬 Save Your Video',
    resultSavePhotoText: '📸 Save Your Photo',
    resultFooterText: 'Thank you for this beautiful moment',

    // === GUEST GALLERY PAGE ===
    galleryTitle: 'Event Gallery',
    gallerySubtitle: 'A collection of beautiful moments.',
    gallerySearchPlaceholder: 'Search by name...',
    galleryEmptyText: 'No memories found yet.',
    galleryTextColor: '#ffffff',
    galleryBgColor: '#0a0a0b',

    // === FONT ===
    fontSelector: 'luxury',
    fontSourceType: 'google',
    fontUrl: "https://fonts.googleapis.com/css2?family=Luxurious+Script&family=Kaisei+Opti&display=swap",
    fontFamily: "'Kaisei Opti', serif",
    titleFontFamily: "'Luxurious Script', cursive",

    // === SYSTEM ===
    enableGesture: true,
    showLeftPanel: true,
    showRightPanel: true,
    idleHeadMode: 'title',
    recordingDuration: 15,
    qrResetDuration: 45,
    eventDate: '2026-05-23',

    // === MEDIA ===
    logoUrl: '/uploads_logo/logo-placeholder.png',
    bottomLeftLogoUrl: '/logo-lumea.png',
    bgImageUrl: '/bg1.png',
    frameImageUrl: '/frame_gold.png',
    overlayImageUrl: '/overlay.png',
    tutorialVideoUrl: '',
    resultVideoUrl: ''
};

// Buat config.json jika baru pertama kali di-run
if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 4));
}

app.get('/api/config', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    const eventId = req.query.event || 'audric-cathrine';
    
    if (db) {
        try {
            const doc = await db.collection('events').doc(eventId).get();
            if (doc.exists) {
                return res.json(doc.data());
            } else {
                // Initialize default config in Firestore for this event
                await db.collection('events').doc(eventId).set(DEFAULT_CONFIG);
                return res.json(DEFAULT_CONFIG);
            }
        } catch (err) {
            console.error('[API GET CONFIG] Firestore error:', err.message);
        }
    }
    
    // Local File Fallback
    try {
        const eventDir = path.join(__dirname, 'data', 'events', eventId);
        const eventConfigFile = path.join(eventDir, 'config.json');
        
        if (fs.existsSync(eventConfigFile)) {
            const configData = fs.readFileSync(eventConfigFile);
            res.json(JSON.parse(configData));
        } else {
            // Fallback to legacy global config
            if (fs.existsSync(CONFIG_FILE)) {
                const configData = fs.readFileSync(CONFIG_FILE);
                res.json(JSON.parse(configData));
            } else {
                res.json(DEFAULT_CONFIG);
            }
        }
    } catch (err) {
        res.json(DEFAULT_CONFIG);
    }
});

app.post('/api/config', async (req, res) => {
    const eventId = req.query.event || 'audric-cathrine';
    
    let isSavedInCloud = false;
    if (db) {
        try {
            const doc = await db.collection('events').doc(eventId).get();
            const currentData = doc.exists ? doc.data() : DEFAULT_CONFIG;
            const newConfig = { ...currentData, ...req.body };
            await db.collection('events').doc(eventId).set(newConfig);
            isSavedInCloud = true;
        } catch (err) {
            console.error('[API POST CONFIG] Firestore error:', err.message);
        }
    }
    
    if (isSavedInCloud) {
        return res.json({ status: 'success', message: 'Setelan UI berhasil disimpan!' });
    }
    
    // Local File Fallback
    try {
        const eventDir = path.join(__dirname, 'data', 'events', eventId);
        if (!fs.existsSync(eventDir)) {
            fs.mkdirSync(eventDir, { recursive: true });
        }
        const eventConfigFile = path.join(eventDir, 'config.json');
        
        const currentData = fs.existsSync(eventConfigFile) 
            ? JSON.parse(fs.readFileSync(eventConfigFile)) 
            : (fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE)) : DEFAULT_CONFIG);
            
        const newConfig = { ...currentData, ...req.body };
        fs.writeFileSync(eventConfigFile, JSON.stringify(newConfig, null, 4));
        res.json({ status: 'success', message: 'Setelan UI berhasil disimpan!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Gagal menyimpan konfigurasi UI.' });
    }
});

// ==========================================
// API Endpoint: SESSION & PAYMENT GATEWAY
// ==========================================

// Fetch Session Info for Claim Page (Secure: Hides driveLink if unpaid)
app.get('/api/session/:id', async (req, res) => {
    const sessionId = req.params.id;
    let sessionData = null;
    let config = DEFAULT_CONFIG;

    try {
        if (db) {
            const doc = await db.collection('sessions').doc(sessionId).get();
            if (doc.exists) sessionData = doc.data();
        } else {
            // Local JSON search
            const eventsDir = path.join(__dirname, 'data', 'events');
            if (fs.existsSync(eventsDir)) {
                const events = fs.readdirSync(eventsDir);
                for (const ev of events) {
                    const sessionFile = path.join(eventsDir, ev, 'sessions', `${sessionId}.json`);
                    if (fs.existsSync(sessionFile)) {
                        sessionData = JSON.parse(fs.readFileSync(sessionFile));
                        break;
                    }
                }
            }
        }

        if (!sessionData) return res.status(404).json({ error: 'Sesi tidak ditemukan' });

        // Load config for this event
        if (db) {
            const evDoc = await db.collection('events').doc(sessionData.eventId || 'audric-cathrine').get();
            if (evDoc.exists) config = { ...DEFAULT_CONFIG, ...evDoc.data() };
        } else {
            const cfgFile = path.join(__dirname, 'data', 'events', sessionData.eventId || 'audric-cathrine', 'config.json');
            if (fs.existsSync(cfgFile)) config = { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(cfgFile)) };
        }

        // Hide drive link if paid event and not paid
        const price = sessionData.price || 0;
        const isPaid = sessionData.paid || price === 0;

        res.json({
            id: sessionData.id,
            name: sessionData.name,
            eventId: sessionData.eventId,
            price: price,
            paid: isPaid,
            videoLink: isPaid ? sessionData.videoLink : null,
            photoLink: isPaid ? sessionData.photoLink : null
        });

    } catch (err) {
        console.error('[API SESSION]', err);
        res.status(500).json({ error: 'Gagal memuat sesi' });
    }
});

// 1. Create Transaction (Generate QRIS for Claim)
app.post('/api/payment/create-claim', async (req, res) => {
    try {
        const { sessionId } = req.body;
        if (!sessionId) return res.status(400).json({ error: 'Session ID required' });

        let sessionData = null;
        if (db) {
            const doc = await db.collection('sessions').doc(sessionId).get();
            if (doc.exists) sessionData = doc.data();
        } else {
            const eventsDir = path.join(__dirname, 'data', 'events');
            if (fs.existsSync(eventsDir)) {
                for (const ev of fs.readdirSync(eventsDir)) {
                    const sf = path.join(eventsDir, ev, 'sessions', `${sessionId}.json`);
                    if (fs.existsSync(sf)) { sessionData = JSON.parse(fs.readFileSync(sf)); break; }
                }
            }
        }

        if (!sessionData) return res.status(404).json({ error: 'Session not found' });
        if (sessionData.paid) return res.json({ status: 'bypassed', message: 'Already paid' });

        const price = sessionData.price || 0;
        if (price <= 0) return res.json({ status: 'bypassed', message: 'Event is free' });

        const orderId = `ORDER-${sessionId}-${Date.now()}`;
        const parameter = {
            transaction_details: {
                order_id: orderId,
                gross_amount: price
            },
            customer_details: {
                first_name: sessionData.name || 'Guest',
                email: sessionData.email || 'guest@example.com',
                phone: sessionData.phone || '0800000000'
            },
            enabled_payments: ["gopay", "other_qris"]
        };

        const transaction = await snapApi.createTransaction(parameter);
        paymentCache[orderId] = 'pending';
        
        // Save orderId mapping to session for webhook
        paymentCache[`MAP_${orderId}`] = sessionId;

        res.json({
            status: 'success',
            orderId: orderId,
            token: transaction.token,
            price: price
        });

    } catch (err) {
        console.error('[MIDTRANS CREATE ERROR]', err.message);
        res.status(500).json({ error: 'Gagal membuat transaksi' });
    }
});

// 2. Webhook Notification Callback from Midtrans
app.post('/api/payment/callback', async (req, res) => {
    try {
        const notification = await coreApi.transaction.notification(req.body);
        const orderId = notification.order_id;
        const trStatus = notification.transaction_status;
        const fraudStatus = notification.fraud_status;

        console.log(`[MIDTRANS WEBHOOK] Order: ${orderId} | Status: ${trStatus}`);

        if (trStatus === 'capture' || trStatus === 'settlement') {
            const isSuccess = fraudStatus === 'challenge' ? false : true;
            if (isSuccess) {
                paymentCache[orderId] = 'settlement';
                const sessionId = paymentCache[`MAP_${orderId}`];
                if (sessionId) {
                    await markSessionAsPaidAndNotify(sessionId);
                }
            }
        } else if (trStatus === 'cancel' || trStatus === 'deny' || trStatus === 'expire') {
            paymentCache[orderId] = 'failed';
        }

        res.status(200).json({ status: 'ok' });
    } catch (err) {
        console.error('[MIDTRANS WEBHOOK ERROR]', err.message);
        res.status(500).json({ error: 'Webhook failed' });
    }
});

async function markSessionAsPaidAndNotify(sessionId) {
    console.log(`[PAYMENT SUCCESS] 💸 Memproses pembayaran lunas untuk Sesi: ${sessionId}`);
    try {
        let sessionData = null;
        let eventId = null;
        let sessionFileLocal = null;

        if (db) {
            const doc = await db.collection('sessions').doc(sessionId).get();
            if (doc.exists) {
                sessionData = doc.data();
                eventId = sessionData.eventId;
                await db.collection('sessions').doc(sessionId).update({ paid: true });
            }
        } else {
            const eventsDir = path.join(__dirname, 'data', 'events');
            if (fs.existsSync(eventsDir)) {
                for (const ev of fs.readdirSync(eventsDir)) {
                    const sf = path.join(eventsDir, ev, 'sessions', `${sessionId}.json`);
                    if (fs.existsSync(sf)) {
                        sessionData = JSON.parse(fs.readFileSync(sf));
                        eventId = sessionData.eventId;
                        sessionFileLocal = sf;
                        break;
                    }
                }
            }
            if (sessionFileLocal && sessionData) {
                sessionData.paid = true;
                fs.writeFileSync(sessionFileLocal, JSON.stringify(sessionData, null, 2));
            }
        }

        if (sessionData && !sessionData.notifiedAfterPaid) {
            sessionData.paid = true;
            let config = DEFAULT_CONFIG;
            if (db) {
                const cfgDoc = await db.collection('events').doc(eventId).get();
                if (cfgDoc.exists) config = { ...DEFAULT_CONFIG, ...cfgDoc.data() };
            } else {
                const cfgPath = path.join(__dirname, 'data', 'events', eventId, 'config.json');
                if (fs.existsSync(cfgPath)) config = { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(cfgPath)) };
            }
            
            console.log(`[PAYMENT SUCCESS] Memicu pengiriman otomatis WA/Email...`);
            await sendNotificationForSession(sessionData, config);
            
            // Mark notified to prevent duplicate
            if (db) {
                await db.collection('sessions').doc(sessionId).update({ notifiedAfterPaid: true });
            } else if (sessionFileLocal) {
                sessionData.notifiedAfterPaid = true;
                fs.writeFileSync(sessionFileLocal, JSON.stringify(sessionData, null, 2));
            }
        }
    } catch (e) {
        console.error('[MARK PAID ERROR]', e);
    }
}

// API Endpoint: Get All Event Slugs & Statuses
app.get('/api/events', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    if (db) {
        try {
            const snapshot = await db.collection('events').get();
            const events = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                events.push({
                    id: doc.id,
                    status: data.status || 'active'
                });
            });
            // Ensure audric-cathrine is at least returned if empty
            if (events.length === 0 || !events.some(e => e.id === 'audric-cathrine')) {
                events.push({ id: 'audric-cathrine', status: 'active' });
            }
            return res.json({ status: 'success', events });
        } catch (e) {
            console.error('[API GET EVENTS] Firestore error:', e.message);
        }
    }

    // Local File Fallback
    try {
        const eventsDir = path.join(__dirname, 'data', 'events');
        let events = [];
        if (fs.existsSync(eventsDir)) {
            const dirs = fs.readdirSync(eventsDir).filter(f => fs.statSync(path.join(eventsDir, f)).isDirectory());
            dirs.forEach(d => {
                const configPath = path.join(eventsDir, d, 'config.json');
                let status = 'active';
                if (fs.existsSync(configPath)) {
                    try {
                        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                        status = cfg.status || 'active';
                    } catch (e) {}
                }
                events.push({ id: d, status });
            });
        }
        if (!events.some(e => e.id === 'audric-cathrine')) {
            let status = 'active';
            const globalConfigPath = path.join(__dirname, 'config.json');
            if (fs.existsSync(globalConfigPath)) {
                try {
                    const cfg = JSON.parse(fs.readFileSync(globalConfigPath, 'utf8'));
                    status = cfg.status || 'active';
                } catch (e) {}
            }
            events.push({ id: 'audric-cathrine', status });
        }
        res.json({ status: 'success', events });
    } catch (err) {
        console.error('[API GET EVENTS] Fallback error:', err.message);
        res.json({ status: 'success', events: [{ id: 'audric-cathrine', status: 'active' }] });
    }
});

// API Endpoint: Create Event
app.post('/api/events', async (req, res) => {
    const rawEventId = req.body.eventId || '';
    // Slugify: lowercase, alphanumeric + hyphens
    const eventId = rawEventId.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

    if (!eventId) {
        return res.status(400).json({ status: 'error', message: 'ID Event tidak valid.' });
    }

    let isCreatedInCloud = false;
    if (db) {
        try {
            const docRef = db.collection('events').doc(eventId);
            const doc = await docRef.get();
            if (doc.exists) {
                return res.status(400).json({ status: 'error', message: 'Event dengan nama tersebut sudah ada.' });
            }
            await docRef.set(DEFAULT_CONFIG);
            isCreatedInCloud = true;
        } catch (err) {
            console.error('[API POST EVENTS] Firestore error:', err.message);
        }
    }

    if (isCreatedInCloud) {
        return res.json({ status: 'success', eventId, message: `Event "${eventId}" berhasil dibuat!` });
    }

    // Local File Fallback
    try {
        const eventDir = path.join(__dirname, 'data', 'events', eventId);
        if (fs.existsSync(eventDir)) {
            return res.status(400).json({ status: 'error', message: 'Event dengan nama tersebut sudah ada.' });
        }
        fs.mkdirSync(eventDir, { recursive: true });
        fs.mkdirSync(path.join(eventDir, 'sessions'), { recursive: true });
        
        const eventConfigFile = path.join(eventDir, 'config.json');
        fs.writeFileSync(eventConfigFile, JSON.stringify(DEFAULT_CONFIG, null, 4));
        res.json({ status: 'success', eventId, message: `Event "${eventId}" berhasil dibuat!` });
    } catch (err) {
        console.error('[API POST EVENTS] Fallback error:', err.message);
        res.status(500).json({ status: 'error', message: 'Gagal membuat event lokal.' });
    }
});

// Helper Function: Check Event Active Status
const isEventActive = async (eventId) => {
    if (!eventId) return false;
    if (eventId === 'audric-cathrine') return true; // Default event always active
    
    let config = null;
    if (db) {
        try {
            const doc = await db.collection('events').doc(eventId).get();
            if (doc.exists) {
                config = doc.data();
            }
        } catch (e) {
            console.error('[isEventActive] Firestore error:', e.message);
        }
    }
    if (!config) {
        try {
            const eventDir = path.join(__dirname, 'data', 'events', eventId);
            const eventConfigFile = path.join(eventDir, 'config.json');
            if (fs.existsSync(eventConfigFile)) {
                config = JSON.parse(fs.readFileSync(eventConfigFile, 'utf8'));
            }
        } catch (e) {
            console.error('[isEventActive] Fallback error:', e.message);
        }
    }
    return config ? config.status !== 'inactive' : false;
};

// API Endpoint: Toggle Event Active Status
app.post('/api/events/toggle-status', async (req, res) => {
    const { eventId, status } = req.body;
    if (!eventId) {
        return res.status(400).json({ status: 'error', message: 'ID Event tidak valid.' });
    }
    if (status !== 'active' && status !== 'inactive') {
        return res.status(400).json({ status: 'error', message: 'Status tidak valid.' });
    }

    let isUpdatedInCloud = false;
    if (db) {
        try {
            await db.collection('events').doc(eventId).update({ status });
            isUpdatedInCloud = true;
        } catch (err) {
            console.error('[API TOGGLE STATUS] Firestore error:', err.message);
        }
    }

    if (isUpdatedInCloud) {
        return res.json({ status: 'success', message: `Status event "${eventId}" berhasil diubah menjadi ${status}!` });
    }

    // Local Fallback
    try {
        // Special case for default event config stored in config.json
        if (eventId === 'audric-cathrine') {
            const globalConfigFile = path.join(__dirname, 'config.json');
            if (fs.existsSync(globalConfigFile)) {
                const cfg = JSON.parse(fs.readFileSync(globalConfigFile, 'utf8'));
                cfg.status = status;
                fs.writeFileSync(globalConfigFile, JSON.stringify(cfg, null, 4));
                return res.json({ status: 'success', message: `Status event "${eventId}" berhasil diubah menjadi ${status}!` });
            }
        }
        
        const eventDir = path.join(__dirname, 'data', 'events', eventId);
        const eventConfigFile = path.join(eventDir, 'config.json');
        if (!fs.existsSync(eventConfigFile)) {
            return res.status(404).json({ status: 'error', message: 'Event tidak ditemukan.' });
        }
        const cfg = JSON.parse(fs.readFileSync(eventConfigFile, 'utf8'));
        cfg.status = status;
        fs.writeFileSync(eventConfigFile, JSON.stringify(cfg, null, 4));
        res.json({ status: 'success', message: `Status event "${eventId}" berhasil diubah menjadi ${status}!` });
    } catch (err) {
        console.error('[API TOGGLE STATUS] Fallback error:', err.message);
        res.status(500).json({ status: 'error', message: 'Gagal mengubah status event.' });
    }
});

// API Endpoint: Delete Event
app.post('/api/events/delete', async (req, res) => {
    const { eventId } = req.body;
    if (!eventId || eventId === 'audric-cathrine') {
        return res.status(400).json({ status: 'error', message: 'Event default tidak dapat dihapus.' });
    }

    let isDeletedInCloud = false;
    if (db) {
        try {
            await db.collection('events').doc(eventId).delete();
            // Delete all sessions for this event in Firestore
            const sessionsRef = db.collection('sessions').where('eventId', '==', eventId);
            const snapshot = await sessionsRef.get();
            const batch = db.batch();
            snapshot.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            isDeletedInCloud = true;
        } catch (err) {
            console.error('[API DELETE EVENT] Firestore error:', err.message);
        }
    }

    if (isDeletedInCloud) {
        return res.json({ status: 'success', message: `Event "${eventId}" berhasil dihapus!` });
    }

    // Local Fallback
    try {
        const eventDir = path.join(__dirname, 'data', 'events', eventId);
        if (!fs.existsSync(eventDir)) {
            return res.status(404).json({ status: 'error', message: 'Event tidak ditemukan.' });
        }
        fs.rmSync(eventDir, { recursive: true, force: true });
        res.json({ status: 'success', message: `Event "${eventId}" dan seluruh sesinya berhasil dihapus!` });
    } catch (err) {
        console.error('[API DELETE EVENT] Fallback error:', err.message);
        res.status(500).json({ status: 'error', message: 'Gagal menghapus event lokal.' });
    }
});

// API Endpoint: Rename Event (Change Slug)
app.post('/api/events/rename', async (req, res) => {
    const { eventId, newEventId } = req.body;
    const cleanNewId = (newEventId || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

    if (!eventId || !cleanNewId) {
        return res.status(400).json({ status: 'error', message: 'ID Event lama atau baru tidak valid.' });
    }
    if (eventId === 'audric-cathrine') {
        return res.status(400).json({ status: 'error', message: 'Event default tidak dapat diubah namanya.' });
    }
    if (eventId === cleanNewId) {
        return res.json({ status: 'success', newEventId: cleanNewId, message: 'Nama event sama, tidak ada perubahan.' });
    }

    let isRenamedInCloud = false;
    if (db) {
        try {
            const oldDocRef = db.collection('events').doc(eventId);
            const oldDoc = await oldDocRef.get();
            if (!oldDoc.exists) {
                return res.status(404).json({ status: 'error', message: 'Event lama tidak ditemukan.' });
            }
            
            const newDocRef = db.collection('events').doc(cleanNewId);
            const newDoc = await newDocRef.get();
            if (newDoc.exists) {
                return res.status(400).json({ status: 'error', message: 'Nama event baru sudah digunakan.' });
            }

            // Copy config to new doc, delete old doc
            await newDocRef.set(oldDoc.data());
            await oldDocRef.delete();

            // Update all sessions to point to new eventId in Firestore
            const sessionsRef = db.collection('sessions').where('eventId', '==', eventId);
            const snapshot = await sessionsRef.get();
            const batch = db.batch();
            snapshot.forEach(doc => {
                batch.update(doc.ref, { eventId: cleanNewId });
            });
            await batch.commit();
            
            isRenamedInCloud = true;
        } catch (err) {
            console.error('[API RENAME EVENT] Firestore error:', err.message);
        }
    }

    if (isRenamedInCloud) {
        return res.json({ status: 'success', newEventId: cleanNewId, message: `Event berhasil diubah nama menjadi "${cleanNewId}"!` });
    }

    // Local Fallback
    try {
        const oldDir = path.join(__dirname, 'data', 'events', eventId);
        const newDir = path.join(__dirname, 'data', 'events', cleanNewId);

        if (!fs.existsSync(oldDir)) {
            return res.status(404).json({ status: 'error', message: 'Event tidak ditemukan.' });
        }
        if (fs.existsSync(newDir)) {
            return res.status(400).json({ status: 'error', message: 'Nama event baru sudah digunakan.' });
        }

        fs.renameSync(oldDir, newDir);
        res.json({ status: 'success', newEventId: cleanNewId, message: `Event berhasil diubah nama menjadi "${cleanNewId}"!` });
    } catch (err) {
        console.error('[API RENAME EVENT] Fallback error:', err.message);
        res.status(500).json({ status: 'error', message: 'Gagal mengubah nama event.' });
    }
});

// --- LOGO UPLOAD ENDPOINT ---
const logoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, 'public', 'uploads_logo');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, 'logo-' + Date.now() + ext);
    }
});
const uploadLogo = multer({ storage: logoStorage });

// Endpoint untuk Upload Logo, Background, dsb
app.post('/api/config/logo', uploadLogo.single('logo'), (req, res) => {
    if (!req.file) return res.status(400).json({ status: 'error', message: 'No file uploaded' });

    // Path untuk diakses di frontend
    const logoUrl = `/uploads_logo/${req.file.filename}`;

    res.json({ status: 'success', logoUrl });
});

// Endpoint untuk Upload Video (Tutorial/Result)
app.post('/api/config/video', uploadLogo.single('video'), (req, res) => {
    if (!req.file) return res.status(400).json({ status: 'error', message: 'No file uploaded' });

    // Path untuk diakses di frontend
    const videoUrl = `/uploads_logo/${req.file.filename}`;

    res.json({ status: 'success', videoUrl });
});

// --- ASSET UPLOAD ENDPOINT (BG, FRAME, OVERLAY) ---
const assetStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, 'public', 'uploads_assets');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = file.fieldname + '-' + Date.now() + ext;
        cb(null, name);
    }
});
const uploadAsset = multer({ storage: assetStorage });

app.post('/api/config/asset', uploadAsset.single('asset'), (req, res) => {
    if (!req.file) return res.status(400).json({ status: 'error', message: 'Tidak ada file diunggah.' });
    const fileUrl = `/uploads_assets/${req.file.filename}`;
    res.json({ status: 'success', fileUrl });
});

// --- ASSET MANAGEMENT ENDPOINTS (LIST & DELETE) ---
app.get('/api/config/assets-list', (req, res) => {
    const dirs = [
        { path: path.join(__dirname, 'public', 'uploads_logo'), url: '/uploads_logo' },
        { path: path.join(__dirname, 'public', 'uploads_assets'), url: '/uploads_assets' }
    ];

    let allFiles = [];

    dirs.forEach(dir => {
        if (fs.existsSync(dir.path)) {
            const files = fs.readdirSync(dir.path);
            files.forEach(file => {
                // Ignore hidden files and directories
                if (!file.startsWith('.') && fs.lstatSync(path.join(dir.path, file)).isFile()) {
                    allFiles.push({
                        name: file,
                        url: `${dir.url}/${file}`,
                        type: dir.url.includes('logo') ? 'logo' : 'asset'
                    });
                }
            });
        }
    });

    res.json({ status: 'success', assets: allFiles });
});

app.delete('/api/config/asset-delete', (req, res) => {
    const { fileUrl } = req.body;
    if (!fileUrl) return res.status(400).json({ status: 'error', message: 'No file URL provided' });

    // Security: Only allow deleting from authorized folders
    if (!fileUrl.startsWith('/uploads_logo/') && !fileUrl.startsWith('/uploads_assets/')) {
        return res.status(403).json({ status: 'error', message: 'Unauthorized path' });
    }

    const filePath = path.join(__dirname, 'public', fileUrl);

    if (fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
            res.json({ status: 'success', message: 'File deleted successfully' });
        } catch (err) {
            res.status(500).json({ status: 'error', message: 'Failed to delete file' });
        }
    } else {
        res.status(404).json({ status: 'error', message: 'File not found on server' });
    }
});

// --- API TO FORCE DOWNLOAD (Bypass Browser Player) ---
const https = require('https');
app.get('/api/download', (req, res) => {
    const fileUrl = req.query.url;
    const filename = req.query.name || `ScribbleBooth-${Date.now()}`;
    
    if (!fileUrl || !fileUrl.startsWith('http')) {
        return res.status(400).send('Invalid URL');
    }
    
    https.get(fileUrl, (response) => {
        // Set attachment header to force download dialog
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
        
        // Pipe the cloud storage stream directly to the user
        response.pipe(res);
    }).on('error', (err) => {
        console.error('[DOWNLOAD] Error proxying file:', err.message);
        res.status(500).send('Gagal mengunduh file.');
    });
});

app.listen(port, () => {
    console.log(`🚀 Videobooth Backend Server beroperasi di http://localhost:${port}`);
    console.log(`📱 Panel Config UI di: http://localhost:${port}/config.html`);
    console.log(`🎥 Akses Web Utama di: http://localhost:${port}/`);
});
