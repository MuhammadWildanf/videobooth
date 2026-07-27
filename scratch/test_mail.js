require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SMTP_EMAIL || 'scmdigitalday2025@gmail.com',
        pass: process.env.SMTP_PASSWORD || 'dcdqbuzhvupckabx'
    },
    tls: {
        rejectUnauthorized: false
    }
});

async function runTests() {
    console.log("Menjalankan Tes 1: Link dengan domain HTTPS (https://videobooth.id)...");
    try {
        const info1 = await transporter.sendMail({
            from: `"Local Hunt Videobooth" <${process.env.SMTP_EMAIL || 'scmdigitalday2025@gmail.com'}>`,
            to: "wildanferdiansyah08@gmail.com",
            subject: "✨ Hasil Video Local Hunt (HTTPS Domain Test)",
            text: "Halo! Video Anda sudah siap di: https://videobooth.id/result?id=session-test-123",
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; text-align: center;">
                    <h2>✨ Local Hunt Videobooth</h2>
                    <p>Halo Muhammad Wildan, video Anda telah siap!</p>
                    <a href="https://videobooth.id/result?id=session-test-123" style="background: #1d3d29; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">Tonton Video Saya</a>
                </div>
            `
        });
        console.log("✅ TES 1 (HTTPS) OK:", info1.messageId);
    } catch (e) {
        console.error("❌ TES 1 Error:", e.message);
    }
}

runTests();
