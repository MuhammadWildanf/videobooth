require('dotenv').config();
const app = require('./src/app');
const port = process.env.PORT || 3000;

// Anti-crash process error handlers for all-day event stability
process.on('uncaughtException', (err) => {
    console.error('[CRITICAL SERVER ERROR] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[CRITICAL SERVER ERROR] Unhandled Rejection at:', promise, 'reason:', reason);
});

app.listen(port, () => {
    console.log(`Videobooth Backend Server beroperasi di http://localhost:${port}`);
    console.log(`Panel Config UI di: http://localhost:${port}/config.html`);
    console.log(`Akses Web Utama di: http://localhost:${port}/`);
});
