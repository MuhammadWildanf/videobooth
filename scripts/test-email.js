require('dotenv').config();
const nodemailer = require('nodemailer');

async function testSMTP() {
    console.log("EMAIL:", process.env.SMTP_EMAIL);
    console.log("PASS:", process.env.SMTP_PASSWORD ? "ADA" : "KOSONG");

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.SMTP_EMAIL,
            pass: process.env.SMTP_PASSWORD
        }
    });

    try {
        // 🔹 Test koneksi SMTP
        await transporter.verify();
        console.log("✅ SMTP CONNECTED (verify sukses)");

        // 🔹 Test kirim email
        const info = await transporter.sendMail({
            from: `"Test SMTP" <${process.env.SMTP_EMAIL}>`,
            to: process.env.SMTP_EMAIL, // kirim ke diri sendiri
            subject: "Test Email Nodemailer",
            text: "Ini test email dari Node.js"
        });

        console.log("✅ EMAIL TERKIRIM:", info.response);

    } catch (err) {
        console.error("❌ SMTP ERROR:");
        console.error(err);
    }
}

testSMTP();