const cloudscraper = require('cloudscraper');
const nodemailer = require('nodemailer');

const SMTP_USER = process.env.SMTP_EMAIL || 'scmdigitalday2025@gmail.com';
const SMTP_PASS = process.env.SMTP_PASSWORD || 'dcdqbuzhvupckabx';

console.log(`[EMAIL INIT] Inisialisasi SMTP Gmail dengan akun: ${SMTP_USER}`);

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    tls: { rejectUnauthorized: false }
});

// Verifikasi koneksi SMTP saat server start
transporter.verify((error) => {
    if (error) {
        console.error(`[EMAIL INIT ERROR] ❌ SMTP Gmail GAGAL terhubung: ${error.message}`);
    } else {
        console.log(`[EMAIL INIT OK] ✅ SMTP Gmail siap mengirim email!`);
    }
});

// ─── WHATSAPP ─────────────────────────────────────────────────────────────────
async function sendWhatsAppMessage(phone, text) {
    if (!phone) {
        console.log('[WhatsApp] ⚠️  Nomor telepon kosong, lewati pengiriman WA.');
        return null;
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    console.log(`[WhatsApp] 📲 Mencoba mengirim ke: ${cleanPhone}...`);

    try {
        const result = await cloudscraper.post({
            url: "https://ruangwa.id/api-app/whatsapp/send-message",
            json: true,
            body: {
                phone: cleanPhone,
                device_key: process.env.RUANGWA_DEVICE_KEY,
                api_key: process.env.RUANGWA_API_KEY,
                method: "text",
                text: text,
                is_group: false
            }
        });

        if (result && (result.status === true || result.message === "Berhasil mengirimkan pesan" || result.code === 200)) {
            console.log(`[WhatsApp SUCCESS] ✅ Pesan WA terkirim ke ${cleanPhone}!`);
            return result;
        } else {
            console.warn(`[WhatsApp WARN] ⚠️  RuangWA merespons, namun status gagal:`, JSON.stringify(result));
            return result;
        }
    } catch (error) {
        console.error(`[WhatsApp ERROR] ❌ Gagal kirim WA ke ${cleanPhone}: ${error.message}`);
        if (error.statusCode === 523 || (error.message || '').includes('523')) {
            console.error(`[WhatsApp ERROR]    ↳ Server RuangWA down atau HP terputus dari dashboard.`);
        }
        return null;
    }
}

// ─── EMAIL PLAIN ──────────────────────────────────────────────────────────────
async function sendEmailMessage(targetEmail, subject, text) {
    console.log(`[EMAIL] 📧 sendEmailMessage → ${targetEmail}`);

    if (!targetEmail || targetEmail === 'hunt@local.id' || !targetEmail.includes('@')) {
        console.log(`[EMAIL] ⚠️  Email tidak valid, dibatalkan.`);
        return false;
    }

    try {
        const info = await transporter.sendMail({
            from: `"Local Hunt Videobooth" <${SMTP_USER}>`,
            to: targetEmail,
            subject: subject,
            text: text,
            html: text.replace(/\n/g, "<br>")
        });
        console.log(`[EMAIL SUCCESS] ✅ Terkirim ke ${targetEmail} | ${info.messageId}`);
        return true;
    } catch (err) {
        console.error(`[EMAIL ERROR] ❌ Gagal kirim ke ${targetEmail}: ${err.message}`);
        return false;
    }
}

// ─── EMAIL VIDEO RESULT ───────────────────────────────────────────────────────
async function sendVideoEmail(toEmail, userName, resultLink, config = {}) {
    console.log(`[EMAIL VIDEO] ─────────────────────────────────────────`);
    console.log(`[EMAIL VIDEO] 📧 sendVideoEmail → ${toEmail}`);
    console.log(`[EMAIL VIDEO]    Nama       : ${userName}`);
    console.log(`[EMAIL VIDEO]    Result URL : ${resultLink}`);

    if (!toEmail || !toEmail.includes('@')) {
        console.log(`[EMAIL VIDEO] ⚠️  Email tidak valid (${toEmail}), pengiriman dibatalkan.`);
        return;
    }

    const senderName = (config.email_config && config.email_config.fromName) || config.title || 'Local Hunt Videobooth';
    const emailSubject = config.emailSubject || `✨ Hasil Video & Foto ${senderName} Anda Sudah Siap!`;
    const senderEmail = (config.email_config && config.email_config.user && config.email_config.user !== 'YOUR_EMAIL@gmail.com') ? config.email_config.user : SMTP_USER;

    let currentTransporter = transporter;
    if (config.email_config && config.email_config.user && config.email_config.user !== 'YOUR_EMAIL@gmail.com' && config.email_config.pass && config.email_config.pass !== 'YOUR_APP_PASSWORD') {
        try {
            currentTransporter = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: config.email_config.user, pass: config.email_config.pass },
                tls: { rejectUnauthorized: false }
            });
        } catch (e) {
            console.error(`[EMAIL VIDEO] Failed to create custom transporter for event, fallback to default SMTP:`, e.message);
        }
    }

    const mailOptions = {
        from: `"${senderName}" <${senderEmail}>`,
        to: toEmail,
        replyTo: senderEmail,
        subject: emailSubject,
        headers: {
            'X-Priority': '1',
            'Importance': 'high',
            'X-Mailer': `${senderName} System`
        },
        text: `Hi ${userName}! ✨\n\nThank you for creating memories with ${senderName}.\nYour video & photo are ready!\n\nOpen the link below to view and download:\n${resultLink}\n\nWarm regards,\nTeam ${senderName}\n\n---\nThis is an automated message sent by ${senderName}.`,
        html: `
<div style="font-family: Arial, sans-serif; background: #f5f9e1; padding: 30px 20px;">
  <div style="max-width: 480px; margin: auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2ecc2; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background: #1d3d29; padding: 28px 30px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 1px;">✨ ${senderName}</h1>
      <p style="color: #a8c5a0; margin: 6px 0 0 0; font-size: 14px;">Videobooth Experience</p>
    </div>

    <!-- Body -->
    <div style="padding: 32px 30px; text-align: center;">
      <p style="font-size: 18px; color: #222; margin: 0 0 8px 0;">Hi, <strong>${userName}</strong>! 👋</p>
      <p style="font-size: 14px; color: #666; margin: 0 0 24px 0;">
        Thank you for creating memories with ${senderName}!<br>
        Your special moment is ready to view and download.
      </p>

      <a href="${resultLink}"
         style="display: inline-block; background: #1d3d29; color: #ffffff;
                padding: 14px 32px; border-radius: 10px; font-size: 16px;
                font-weight: bold; text-decoration: none; margin-bottom: 20px;">
        🎬 Watch &amp; Download My Media
      </a>

      <p style="font-size: 12px; color: #999; margin: 0;">
        Or copy this link:<br>
        <span style="color: #1d3d29; word-break: break-all;">${resultLink}</span>
      </p>
    </div>

    <!-- Footer -->
    <div style="background: #f9f9f9; border-top: 1px solid #eee; padding: 16px 30px; text-align: center;">
      <p style="font-size: 11px; color: #aaa; margin: 0;">
        Automated message from ${senderName} &bull; Please do not reply to this email
      </p>
    </div>

  </div>
</div>`
    };

    try {
        console.log(`[EMAIL VIDEO] 🚀 Mengirim email via SMTP (${senderEmail})...`);
        const info = await currentTransporter.sendMail(mailOptions);
        console.log(`[EMAIL VIDEO SUCCESS] ✅ Email terkirim ke: ${toEmail}`);
        console.log(`[EMAIL VIDEO SUCCESS]    Message-ID : ${info.messageId}`);
        console.log(`[EMAIL VIDEO SUCCESS]    Response   : ${info.response}`);
        console.log(`[EMAIL VIDEO SUCCESS]    Accepted   : ${JSON.stringify(info.accepted)}`);
        console.log(`[EMAIL VIDEO SUCCESS]    Rejected   : ${JSON.stringify(info.rejected)}`);
    } catch (err) {
        console.error(`[EMAIL VIDEO ERROR] ❌ Gagal kirim email ke ${toEmail}`);
        console.error(`[EMAIL VIDEO ERROR]    Pesan   : ${err.message}`);
        console.error(`[EMAIL VIDEO ERROR]    Kode    : ${err.code || '-'}`);
        if (err.responseCode) {
            console.error(`[EMAIL VIDEO ERROR]    SMTP    : ${err.responseCode}`);
        }
    }
}

module.exports = { sendWhatsAppMessage, sendEmailMessage, sendVideoEmail };
