const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');
require('dotenv').config();

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent' // Forces consent to ensure we get a refresh token
});

console.log('🔗 Buka URL ini di browser Anda untuk Otorisasi Perekaman ke Google Drive:');
console.log(authUrl);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

rl.question('\n📝 Masukkan kode dari halaman tersebut ke sini: ', (code) => {
    rl.close();
    code = code.trim(); // Membersihkan spasi yang tidak sengaja ikut ter-copy
    
    oauth2Client.getToken(code, (err, token) => {
        if (err) return console.error('\n❌ Gagal mendapatkan token! Pastikan Anda memasukkan kode yang BARU saja dibuat dan menyalinnya dengan benar.', err.response ? err.response.data : err.message);
        oauth2Client.setCredentials(token);
        
        fs.writeFileSync('token.json', JSON.stringify(token, null, 2));
        console.log('✅ Token berhasil disimpan ke token.json!');
        console.log('Sekarang Anda bisa merestart server Node.js Anda.');
    });
});
