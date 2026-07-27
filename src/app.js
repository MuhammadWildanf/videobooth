const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { DEFAULT_CONFIG, CONFIG_FILE, PUBLIC_DIR, UPLOADS_DIR } = require('./config/defaults');

if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 4));
}

const app = express();

app.use(cors());
app.use(express.json());
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.get('/', async (req, res, next) => {
    if (!req.query.event) {
        return res.sendFile(path.join(PUBLIC_DIR, 'landing.html'));
    }
    try {
        const { getEventConfig } = require('./services/database');
        const config = await getEventConfig(req.query.event);
        if (config && config.boothPage) {
            const pageName = config.boothPage.endsWith('.html') ? config.boothPage : `${config.boothPage}.html`;
            const customPath = path.join(PUBLIC_DIR, pageName);
            if (fs.existsSync(customPath)) {
                return res.sendFile(customPath);
            }
        }
    } catch (e) {}

    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));
app.use('/uploads', express.static(UPLOADS_DIR));

app.use('/api', require('./routes/auth'));
app.use('/api', require('./routes/videobooth'));
app.use('/api', require('./routes/sessions'));
app.use('/api', require('./routes/config'));
app.use('/api', require('./routes/assets'));
app.use('/api', require('./routes/events'));
app.use('/api', require('./routes/payment'));
app.use('/api', require('./routes/download'));

module.exports = app;
