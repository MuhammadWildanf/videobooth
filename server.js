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

// Initialize Express App
const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Serve frontend html

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
// ------------------------------

// Background Queue Worker Engine
const worker = async (task) => {
    console.log(`\n[QUEUE] ⏳ Memulai proses rendering untuk: ${task.name} (${task.phone})`);

    return new Promise(async (resolve, reject) => {
        try {
            const inputPath = task.videoPath;
            const photoInputPath = task.photoPath; // ✅ TAMBAHKAN INI
            const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
            const overlayPath = path.join(__dirname, 'public', config.overlayImageUrl || 'overlay.png');

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

            // 2. Process Video
            console.log(`[RENDER] 🎬 Step 2/6: Processing Video with Overlay...`);
            let videoProcessed = false;
            await new Promise((res, rej) => {
                let cmd = ffmpeg(inputPath);
                if (fs.existsSync(overlayPath)) {
                    console.log(`[FFMPEG] Mendeteksi overlay.png, sedang merender bingkai...`);
                    cmd = cmd.input(overlayPath)
                        .complexFilter(['[1:v]scale=1080:1920[over];[0:v][over]overlay=0:0'])
                        .addOptions(['-preset ultrafast', '-crf 28']);
                } else {
                    cmd = cmd.addOptions(['-preset ultrafast']);
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
                            .complexFilter(['[1:v]scale=1080:1920[over];[0:v][over]overlay=0:0'])
                            .addOptions(['-preset ultrafast']);
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
            
            // 4.5 Save Session Data locally for Result Preview Page
            const sessionData = {
                id: sessionId,
                name: task.name,
                videoLink: videoLink,
                photoLink: photoLink,
                createdAt: new Date().toISOString()
            };
            const sessionsDir = path.join(__dirname, 'data', 'sessions');
            if (!fs.existsSync(sessionsDir)) {
                fs.mkdirSync(sessionsDir, { recursive: true });
            }
            const sessionFilePath = path.join(sessionsDir, `${sessionId}.json`);
            fs.writeFileSync(sessionFilePath, JSON.stringify(sessionData, null, 2));
            
            // This is the link we actually send to the user
            let domainStr = process.env.PUBLIC_DOMAIN || 'localhost:3000';
            let localResultLink = '';
            if (domainStr.startsWith('http')) {
                localResultLink = `${domainStr}/result.html?id=${sessionId}`;
            } else {
                const protocol = domainStr === 'localhost:3000' ? 'http' : 'https';
                localResultLink = `${protocol}://${domainStr}/result.html?id=${sessionId}`;
            }

            // 5. Send Notification
            if (videoLink || photoLink) {
                let msgTemplate = config.messageTemplate || `Halo {name}! ✨\n\nKenangan Anda di *ScribbleBooth* sudah siap! Silakan lihat dan download melalui link di bawah ini:\n\n🔗 {link}\n\nTerima kasih sudah mampir!`;
                const customMsg = msgTemplate.replace(/{name}/g, task.name).replace(/{link}/g, localResultLink);

                let emailSubj = config.emailSubject || "Kenangan ScribbleBooth Anda sudah siap! ✨";
                
                if (task.deliveryMethod === 'email') {
                    console.log(`[EMAIL] 📤 Menyiapkan pengiriman email ke: ${task.phone}`);

                    try {
                        await sendEmailMessage(task.phone, emailSubj, customMsg);
                        console.log(`[EMAIL] ✅ Email sukses dikirim ke ${task.phone}`);
                    } catch (err) {
                        console.log(`[EMAIL] ❌ Email gagal, fallback ke WhatsApp...`);

                        const result = await sendWhatsAppMessage(task.phone, customMsg);
                        console.log(`[WhatsApp] ✅ Pesan fallback dikirim ke ${task.phone}`);
                    }

                } else {
                    const result = await sendWhatsAppMessage(task.phone, customMsg);
                    console.log(`[WhatsApp] ✅ Pesan sukses dikirim ke ${task.phone}: ${result?.message || "Berhasil"}`);
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
app.get('/api/result/:id', (req, res) => {
    const sessionId = req.params.id;
    const sessionFilePath = path.join(__dirname, 'data', 'sessions', `${sessionId}.json`);
    
    if (fs.existsSync(sessionFilePath)) {
        const data = JSON.parse(fs.readFileSync(sessionFilePath, 'utf8'));
        res.json({ status: 'success', data });
    } else {
        res.status(404).json({ status: 'error', message: 'Session not found' });
    }
});

// API Endpoint: Submit Video
app.post('/api/videobooth/submit', (req, res, next) => {
    console.log(`\n[CONNECTION] ⚡ Terdeteksi upaya pengiriman data...`);
    next();
}, cpUpload, (req, res) => {
    // 1. LOG IMMEDIATELY
    const { name, phone } = req.body;
    console.log(`[API] 📥 Data diterima dari: ${name} (${phone})`);

    try {
        const videoFile = req.files['video'] ? req.files['video'][0] : null;
        const photoFile = req.files['photo'] ? req.files['photo'][0] : null;

        if (!videoFile) {
            return res.status(400).json({ status: 'error', message: 'Tidak ada file video yang dikirim' });
        }

        console.log(`[API] Menerima video dari ${name}. Memasukkan ke Antrean...`);

        // PUSH task ke Queue (Background)
        queue.push({
            name: name,
            phone: phone,
            deliveryMethod: req.body.deliveryMethod || 'whatsapp',
            videoPath: videoFile.path,
            photoPath: photoFile ? photoFile.path : null
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
        } else {
            console.log(`[WhatsApp] ⚠️ Server RuangWA merespons, tapi pesan mungkin gagal:`, result);
        }
        return result;
    } catch (error) {
        console.error(`[WhatsApp] ❌ Error: ${error.message}`);
        // Jika error 523 (Origin Unreachable) dari RuangWA
        if (error.statusCode === 523) {
            console.error(`[WhatsApp] 🛑 Server RuangWA Sedang Down (Error 523). Pesan masuk ke antrean tapi gagal kirim otomatis.`);
        }
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
    title: 'Audric & Catherine',
    subtitle: 'A special moment awaits you.',
    descPremium: 'Enter your details to unveil a personalized wedding experience.',
    startText: 'Begin your experience',
    messageTemplate: 'Halo {name}! ✨\n\nKenangan Anda di ScribbleBooth sudah siap! Silakan lihat dan download melalui link folder di bawah ini:\n\n🔗 {link}\n\nTerima kasih sudah mampir!',
    emailSubject: 'Kenangan ScribbleBooth Anda sudah siap! ✨',
    bgColor1: '#2c3e50',
    logoUrl: "/uploads_logo/logo-placeholder.png",
    tutorialVideoUrl: "",
    resultVideoUrl: "",
    frameColor: "#3d3d3d",
    recordingDuration: 15
};

// Buat config.json jika baru pertama kali di-run
if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 4));
}

app.get('/api/config', (req, res) => {
    try {
        const configData = fs.readFileSync(CONFIG_FILE);
        res.json(JSON.parse(configData));
    } catch (err) {
        res.json(DEFAULT_CONFIG);
    }
});

app.post('/api/config', (req, res) => {
    try {
        const currentData = fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE)) : DEFAULT_CONFIG;
        const newConfig = { ...currentData, ...req.body };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 4));
        res.json({ status: 'success', message: 'Setelan UI berhasil disimpan!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Gagal menyimpan konfigurasi UI.' });
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
