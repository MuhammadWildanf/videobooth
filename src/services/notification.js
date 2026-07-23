const cloudscraper = require('cloudscraper');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASSWORD
    }
});

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
            console.log(`[WhatsApp] Pesan sukses dikirim ke ${phone}:`, result.message || "Berhasil");
            return result;
        } else {
            console.log(`[WhatsApp] Server RuangWA merespons, tapi pesan mungkin gagal:`, result);
            throw new Error(result && result.message ? result.message : "Unknown RuangWA error");
        }
    } catch (error) {
        console.error(`[WhatsApp] Error: ${error.message}`);
        if (error.statusCode === 523) {
            console.error(`[WhatsApp] Server RuangWA Sedang Down (Error 523).`);
        }
        throw error;
    }
}

async function sendEmailMessage(targetEmail, subject, text) {
    try {
        const info = await transporter.sendMail({
            from: `"ScribbleBooth" <${process.env.SMTP_EMAIL}>`,
            to: targetEmail,
            subject: subject,
            text: text,
            html: text.replace(/\n/g, "<br>")
        });
        return true;
    } catch (err) {
        console.error(`[EMAIL] Gagal mengirim email:`, err.message);
        throw err;
    }
}

async function sendVideoEmail(toEmail, userName, videoLink) {
    const mailOptions = {
        from: `"Imajiwa Videobooth" <${process.env.SMTP_EMAIL}>`,
        to: toEmail,
        subject: 'Ini Video Keseruan Anda dari Imajiwa!',
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
        console.log(`[EMAIL] Sukses mengirim hasil ke: ${toEmail}`);
    } catch (err) {
        console.error(`[EMAIL] Gagal mengirim, cek setelan password Anda:`, err.message);
    }
}

module.exports = { sendWhatsAppMessage, sendEmailMessage, sendVideoEmail };
