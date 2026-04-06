const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fastq = require('fastq');

require('dotenv').config();
const { google } = require('googleapis');
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

const uploadToDrive = async (filePath, fileName) => {
    const fileStream = fs.createReadStream(filePath);
    const response = await drive.files.create({
        requestBody: {
            name: fileName,
            parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
        },
        media: {
            mimeType: 'video/mp4',
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
    console.log(`\n[QUEUE] ⏳ Memulai proses rendering video untuk: ${task.name} (${task.phone})`);
    
    return new Promise((resolve, reject) => {
        const inputPath = task.videoPath;
        const outputPath = path.join('uploads', 'FINAL-' + path.basename(inputPath));
        const overlayPath = path.join(__dirname, 'public', 'overlay.png');

        let cmd = ffmpeg(inputPath);

        // Cek apakah user sudah memasukkan file overlay.png di folder public
        if (fs.existsSync(overlayPath)) {
            console.log(`[FFMPEG] Mendeteksi overlay.png, sedang merender bingkai...`);
            cmd = cmd.input(overlayPath)
                     .complexFilter([
                         '[0:v]hflip[mirrored]', // Mirroring video mentah
                         // Skalakan overlay agar pas dengan video jika ukurannya beda, lalu tempel
                         '[1:v]scale=1080:1920[over];[mirrored][over]overlay=0:0' 
                     ]);
        } else {
            console.log(`[FFMPEG] Tidak ada overlay.png, hanya me-mirroring video secara standar...`);
            cmd = cmd.videoFilters('hflip'); // Hanya mirror biasa
        }

        cmd.output(outputPath)
           .on('start', (commandLine) => {
               console.log('[FFMPEG] Spawned FFmpeg dengan command: ' + commandLine);
           })
           .on('progress', (progress) => {
               // Render log tipis-tipis agar tahu prosesnya berjalan
               if (progress.percent) console.log(`[FFMPEG] Rendering: ${Math.round(progress.percent)}% done`);
           })
           .on('end', async () => {
               console.log(`[QUEUE SUCCESS] 🌟 Tugas Selesai! Video matang disimpan di: ${outputPath}`);
               
               let driveLink = null;
               try {
                   console.log(`[G-DRIVE] ☁️ Sedang mengunggah ke Google Drive...`);
                   const driveFile = await uploadToDrive(outputPath, `Videobooth-${task.name.replace(/\s+/g, '-')}-${Date.now()}.mp4`);
                   driveLink = driveFile.webViewLink;
                   console.log(`[G-DRIVE] ✅ Sukses diunggah! Link: ${driveLink}`);
               } catch (err) {
                   console.error(`[G-DRIVE] ❌ Gagal upload!`, err.message);
               }
               
               // === DI SINI TEMPAT UNTUK KIRIM EMAIL / WA ===
               if (driveLink && task.phone.includes('@')) {
                   // Jika input mengandung @, sistem routing cerdas menganggapnya sebagai EMAIL
                   console.log(`[EMAIL] 📧 Menyiapkan pengiriman email ke ${task.phone}...`);
                   await sendVideoEmail(task.phone, task.name, driveLink);
               } else if (driveLink) {
                   // Logika fallback untuk implementasi WhatsApp ke depannya
                   console.log(`[WhatsApp] 🚀 Menunggu integrasi WhatsApp untuk nomor: ${task.phone}`);
               }
               
               // Optional: Hapus file mentahnya untuk hemat disk
               try { fs.unlinkSync(inputPath); } catch(e){} 
               // (Jika juga ingin menghapus hasil akhir outputPath, silahkan)
               
               resolve();
           })
           .on('error', (err) => {
               console.error(`[QUEUE ERROR] ❌ FFmpeg Gagal memproses video untuk: ${task.name}`);
               console.error(err);
               reject(err);
           })
           .run();
    });
};

// Initiate FastQ with concurrency = 1 (proses satu demi satu agar tidak berat)
const queue = fastq.promise(worker, 1);

// API Endpoint: Submit Video
app.post('/api/videobooth/submit', upload.single('video'), (req, res) => {
    try {
        const { name, phone } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ status: 'error', message: 'Tidak ada file video yang dikirim' });
        }

        console.log(`[API] Menerima video dari ${name}. Memasukkan ke Antrean...`);

        // PUSH task ke Queue (Background)
        queue.push({ 
            name: name, 
            phone: phone, 
            videoPath: file.path 
        });

        // KEMBALIKAN response secepat mungkin (tanpa menunggu queue selesai)
        res.status(200).json({ 
            status: 'success', 
            message: 'Video berhasil disimpan dan sedang diproses', 
            data: { name, phone } 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan server' });
    }
});

// ===============================
// API Endpoint: Dynamic UI Config
// ===============================
const CONFIG_FILE = path.join(__dirname, 'config.json');
const DEFAULT_CONFIG = {
    title: '✨ Imajiwa Videobooth',
    subtitle: 'Silakan isi data untuk menerima video Anda.',
    bgColor1: '#2c3e50',
    bgColor2: '#000000',
    bgImageUrl: '',
    accentColor: '#E11D48',
    fontUrl: '',
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
};

// Buat config.json jika baru pertama kali di-run
if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 4));
}

app.get('/api/config', (req, res) => {
    try {
        const configData = fs.readFileSync(CONFIG_FILE);
        res.json(JSON.parse(configData));
    } catch(err) {
        res.json(DEFAULT_CONFIG);
    }
});

app.post('/api/config', (req, res) => {
    try {
        const currentData = fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE)) : DEFAULT_CONFIG;
        const newConfig = { ...currentData, ...req.body };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 4));
        res.json({ status: 'success', message: 'Setelan UI berhasil disimpan!' });
    } catch(err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Gagal menyimpan konfigurasi UI.' });
    }
});

app.listen(port, () => {
    console.log(`🚀 Videobooth Backend Server beroperasi di http://localhost:${port}`);
    console.log(`📱 Panel Config UI di: http://localhost:${port}/config.html`);
    console.log(`🎥 Akses Web Utama di: http://localhost:${port}/`);
});
