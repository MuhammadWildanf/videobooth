const express = require('express');
const router = express.Router();
const { getSession, listSessions, deleteSession } = require('../services/database');

router.get('/result/:id', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    const sessionId = req.params.id;
    const sessionData = await getSession(sessionId);
    if (sessionData) {
        res.json({ status: 'success', data: sessionData });
    } else {
        res.status(404).json({ status: 'error', message: 'Session not found' });
    }
});

router.get('/sessions', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    const eventId = req.query.event || 'audric-cathrine';
    try {
        const sessions = await listSessions(eventId);
        res.json({ status: 'success', sessions });
    } catch (err) {
        console.error('[API SESSIONS] Error:', err.message);
        res.status(500).json({ status: 'error', message: 'Gagal memuat data sesi' });
    }
});

router.delete('/sessions/:id', async (req, res) => {
    try {
        const sessionId = req.params.id;
        const deleted = await deleteSession(sessionId);
        if (deleted) {
            res.json({ status: 'success', message: 'Sesi berhasil dihapus' });
        } else {
            res.status(404).json({ status: 'error', message: 'Sesi tidak ditemukan' });
        }
    } catch (err) {
        console.error('[API DELETE SESSION] Error:', err.message);
        res.status(500).json({ status: 'error', message: 'Gagal menghapus sesi' });
    }
});

module.exports = router;
