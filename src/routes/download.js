const express = require('express');
const router = express.Router();
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const { UPLOADS_DIR } = require('../config/defaults');

router.get('/download', (req, res) => {
    const fileUrl = req.query.url;
    const filename = req.query.name || `Videobooth-${Date.now()}`;

    if (!fileUrl) {
        return res.status(400).send('Invalid URL');
    }

    // Jika file berupa path lokal atau rute /uploads/
    if (fileUrl.includes('/uploads/')) {
        const basename = path.basename(fileUrl);
        const localPath = path.join(UPLOADS_DIR, basename);

        if (fs.existsSync(localPath)) {
            return res.download(localPath, filename);
        }
    }

    // Jika file berupa URL luar (HTTP / HTTPS)
    const client = fileUrl.startsWith('https') ? https : http;

    client.get(fileUrl, (response) => {
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
        response.pipe(res);
    }).on('error', (err) => {
        console.error('[DOWNLOAD] Error proxying file:', err.message);
        res.status(500).send('Gagal mengunduh file.');
    });
});

module.exports = router;
