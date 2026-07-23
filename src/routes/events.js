const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { listEvents, createEvent, getEventConfig, saveEventConfig, db } = require('../services/database');
const { EVENTS_DIR, CONFIG_FILE, DEFAULT_CONFIG } = require('../config/defaults');

router.get('/events', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    try {
        const events = await listEvents();
        res.json({ status: 'success', events });
    } catch (err) {
        console.error('[API GET EVENTS] Error:', err.message);
        res.json({ status: 'success', events: [{ id: 'audric-cathrine', status: 'active' }] });
    }
});

router.post('/events', async (req, res) => {
    const rawEventId = req.body.eventId || '';
    const eventId = rawEventId.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

    if (!eventId) {
        return res.status(400).json({ status: 'error', message: 'ID Event tidak valid.' });
    }

    const created = await createEvent(eventId);
    if (!created) {
        return res.status(400).json({ status: 'error', message: 'Event dengan nama tersebut sudah ada.' });
    }

    res.json({ status: 'success', eventId: created, message: `Event "${created}" berhasil dibuat!` });
});

router.post('/events/toggle-status', async (req, res) => {
    const { eventId, status } = req.body;
    if (!eventId) {
        return res.status(400).json({ status: 'error', message: 'ID Event tidak valid.' });
    }
    if (status !== 'active' && status !== 'inactive') {
        return res.status(400).json({ status: 'error', message: 'Status tidak valid.' });
    }

    try {
        const config = await getEventConfig(eventId);
        if (eventId === 'audric-cathrine') {
            if (fs.existsSync(CONFIG_FILE)) {
                const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
                cfg.status = status;
                fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 4));
                return res.json({ status: 'success', message: `Status event "${eventId}" berhasil diubah menjadi ${status}!` });
            }
        }
        await saveEventConfig(eventId, { status });
        res.json({ status: 'success', message: `Status event "${eventId}" berhasil diubah menjadi ${status}!` });
    } catch (err) {
        console.error('[API TOGGLE STATUS] Error:', err.message);
        res.status(500).json({ status: 'error', message: 'Gagal mengubah status event.' });
    }
});

router.post('/events/delete', async (req, res) => {
    const { eventId } = req.body;
    if (!eventId || eventId === 'audric-cathrine') {
        return res.status(400).json({ status: 'error', message: 'Event default tidak dapat dihapus.' });
    }

    if (db) {
        try {
            await db.collection('events').doc(eventId).delete();
            const sessionsRef = db.collection('sessions').where('eventId', '==', eventId);
            const snapshot = await sessionsRef.get();
            const batch = db.batch();
            snapshot.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            return res.json({ status: 'success', message: `Event "${eventId}" berhasil dihapus!` });
        } catch (err) {
            console.error('[API DELETE EVENT] Firestore error:', err.message);
        }
    }

    try {
        const eventDir = path.join(EVENTS_DIR, eventId);
        if (!fs.existsSync(eventDir)) {
            return res.status(404).json({ status: 'error', message: 'Event tidak ditemukan.' });
        }
        fs.rmSync(eventDir, { recursive: true, force: true });
        res.json({ status: 'success', message: `Event "${eventId}" dan seluruh sesinya berhasil dihapus!` });
    } catch (err) {
        console.error('[API DELETE EVENT] Fallback error:', err.message);
        res.status(500).json({ status: 'error', message: 'Gagal menghapus event lokal.' });
    }
});

router.post('/events/rename', async (req, res) => {
    const { eventId, newEventId } = req.body;
    const cleanNewId = (newEventId || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

    if (!eventId || !cleanNewId) {
        return res.status(400).json({ status: 'error', message: 'ID Event lama atau baru tidak valid.' });
    }
    if (eventId === 'audric-cathrine') {
        return res.status(400).json({ status: 'error', message: 'Event default tidak dapat diubah namanya.' });
    }
    if (eventId === cleanNewId) {
        return res.json({ status: 'success', newEventId: cleanNewId, message: 'Nama event sama, tidak ada perubahan.' });
    }

    if (db) {
        try {
            const oldDocRef = db.collection('events').doc(eventId);
            const oldDoc = await oldDocRef.get();
            if (!oldDoc.exists) {
                return res.status(404).json({ status: 'error', message: 'Event lama tidak ditemukan.' });
            }

            const newDocRef = db.collection('events').doc(cleanNewId);
            const newDoc = await newDocRef.get();
            if (newDoc.exists) {
                return res.status(400).json({ status: 'error', message: 'Nama event baru sudah digunakan.' });
            }

            await newDocRef.set(oldDoc.data());
            await oldDocRef.delete();

            const sessionsRef = db.collection('sessions').where('eventId', '==', eventId);
            const snapshot = await sessionsRef.get();
            const batch = db.batch();
            snapshot.forEach(doc => {
                batch.update(doc.ref, { eventId: cleanNewId });
            });
            await batch.commit();

            return res.json({ status: 'success', newEventId: cleanNewId, message: `Event berhasil diubah nama menjadi "${cleanNewId}"!` });
        } catch (err) {
            console.error('[API RENAME EVENT] Firestore error:', err.message);
        }
    }

    try {
        const oldDir = path.join(EVENTS_DIR, eventId);
        const newDir = path.join(EVENTS_DIR, cleanNewId);

        if (!fs.existsSync(oldDir)) {
            return res.status(404).json({ status: 'error', message: 'Event tidak ditemukan.' });
        }
        if (fs.existsSync(newDir)) {
            return res.status(400).json({ status: 'error', message: 'Nama event baru sudah digunakan.' });
        }

        fs.renameSync(oldDir, newDir);
        res.json({ status: 'success', newEventId: cleanNewId, message: `Event berhasil diubah nama menjadi "${cleanNewId}"!` });
    } catch (err) {
        console.error('[API RENAME EVENT] Fallback error:', err.message);
        res.status(500).json({ status: 'error', message: 'Gagal mengubah nama event.' });
    }
});

module.exports = router;
