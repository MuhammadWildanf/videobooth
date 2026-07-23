const express = require('express');
const router = express.Router();
const https = require('https');

router.get('/download', (req, res) => {
    const fileUrl = req.query.url;
    const filename = req.query.name || `ScribbleBooth-${Date.now()}`;

    if (!fileUrl || !fileUrl.startsWith('http')) {
        return res.status(400).send('Invalid URL');
    }

    https.get(fileUrl, (response) => {
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
        response.pipe(res);
    }).on('error', (err) => {
        console.error('[DOWNLOAD] Error proxying file:', err.message);
        res.status(500).send('Gagal mengunduh file.');
    });
});

module.exports = router;
