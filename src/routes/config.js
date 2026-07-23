const express = require('express');
const router = express.Router();
const { getEventConfig, saveEventConfig } = require('../services/database');

router.get('/config', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    const eventId = req.query.event || 'audric-cathrine';
    try {
        const config = await getEventConfig(eventId);
        res.json(config);
    } catch (err) {
        console.error('[API GET CONFIG] Error:', err.message);
        res.status(500).json({ error: 'Failed to load config' });
    }
});

router.post('/config', async (req, res) => {
    const eventId = req.query.event || 'audric-cathrine';
    try {
        await saveEventConfig(eventId, req.body);
        res.json({ status: 'success', message: 'Setelan UI berhasil disimpan!' });
    } catch (err) {
        console.error('[API POST CONFIG] Error:', err.message);
        res.status(500).json({ status: 'error', message: 'Gagal menyimpan konfigurasi UI.' });
    }
});

router.post('/config/logo', require('../middleware/upload').logo.single('logo'), (req, res) => {
    if (!req.file) return res.status(400).json({ status: 'error', message: 'No file uploaded' });
    const logoUrl = `/uploads_logo/${req.file.filename}`;
    res.json({ status: 'success', logoUrl });
});

router.post('/config/video', require('../middleware/upload').logo.single('video'), (req, res) => {
    if (!req.file) return res.status(400).json({ status: 'error', message: 'No file uploaded' });
    const videoUrl = `/uploads_logo/${req.file.filename}`;
    res.json({ status: 'success', videoUrl });
});

module.exports = router;
