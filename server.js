require('dotenv').config();
const app = require('./src/app');
const port = process.env.PORT || 3000;

app.listen(port, () => {
    console.log(`Videobooth Backend Server beroperasi di http://localhost:${port}`);
    console.log(`Panel Config UI di: http://localhost:${port}/config.html`);
    console.log(`Akses Web Utama di: http://localhost:${port}/`);
});
