const express = require('express');
const router = express.Router();
const { queue } = require('../services/queue');
const { isEventActive } = require('../services/database');

const multer = require('multer');
const fs = require('fs');
const path = require('path');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'uploads';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });
const cpUpload = upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'photo', maxCount: 1 }
]);

router.post('/videobooth/submit', (req, res, next) => {
    console.log(`\n[CONNECTION] Terdeteksi upaya pengiriman data...`);
    next();
}, cpUpload, async (req, res) => {
    const { name, phone } = req.body;
    console.log(`[API] Data diterima dari: ${name} (${phone})`);

    try {
        const eventId = req.body.eventId || 'audric-cathrine';
        const active = await isEventActive(eventId);
        if (!active) {
            return res.status(400).json({ status: 'error', message: 'Event ini sedang tidak aktif.' });
        }

        const videoFile = req.files['video'] ? req.files['video'][0] : null;
        const photoFile = req.files['photo'] ? req.files['photo'][0] : null;

        if (!videoFile) {
            return res.status(400).json({ status: 'error', message: 'Tidak ada file video yang dikirim' });
        }

        console.log(`[API] Menerima video dari ${name}. Memasukkan ke Antrean...`);

        queue.push({
            name: name,
            phone: phone || null,
            email: req.body.email || null,
            deliveryMethod: req.body.deliveryMethod || 'both',
            videoPath: videoFile.path,
            photoPath: photoFile ? photoFile.path : null,
            eventId: eventId
        });

        res.status(200).json({
            status: 'success',
            message: 'Data berhasil disimpan dan sedang diproses',
            data: { name, phone }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan server' });
    }
});

module.exports = router;
