const express = require('express');
const router = express.Router();
const { queue } = require('../services/queue');
const { isEventActive, saveTransaction, getEventConfig } = require('../services/database');

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
    try {
        let eventId = req.body.eventId || 'localhunt';
        if (Array.isArray(eventId)) eventId = eventId[0];
        let name = req.body.name || 'Guest';
        if (Array.isArray(name)) name = name[0];
        let phone = req.body.phone || '-';
        if (Array.isArray(phone)) phone = phone[0];
        let email = req.body.email || '-';
        if (Array.isArray(email)) email = email[0];
        let paymentMethod = req.body.paymentMethod || 'Static QRIS';
        if (Array.isArray(paymentMethod)) paymentMethod = paymentMethod[0];
        let orderId = req.body.orderId;
        if (Array.isArray(orderId)) orderId = orderId[0];

        console.log(`[API] Data diterima dari: ${name} (${phone}) | Event: ${eventId} | Metode: ${paymentMethod}`);

        const active = await isEventActive(eventId);
        if (!active) {
            return res.status(400).json({ status: 'error', message: 'Event ini sedang tidak aktif.' });
        }

        const config = await getEventConfig(eventId);
        const sessionPrice = parseInt(config.sessionPrice) || 0;

        const videoFile = req.files && req.files['video'] ? req.files['video'][0] : null;
        const photoFile = req.files && req.files['photo'] ? req.files['photo'][0] : null;

        if (!videoFile) {
            return res.status(400).json({ status: 'error', message: 'Tidak ada file video yang dikirim' });
        }

        const txOrderId = orderId || `TX-${eventId}-${Date.now()}`;

        // Simpan transaksi di database lokal / Firestore dengan metode pembayaran asli
        await saveTransaction(txOrderId, {
            orderId: txOrderId,
            eventId: eventId,
            name: name,
            phone: phone,
            email: email,
            paymentMethod: paymentMethod,
            price: paymentMethod.toLowerCase().includes('voucher') ? 0 : sessionPrice,
            status: paymentMethod.toLowerCase().includes('voucher') ? 'Voucher Redeemed' : 'PAID',
            createdAt: new Date().toISOString()
        });
        console.log(`[DATABASE] Transaksi ${txOrderId} disimpan | Metode: ${paymentMethod} | Nama: ${name} (${phone})`);

        console.log(`[API] Menerima video dari ${name}. Memasukkan ke Antrean...`);

        queue.push({
            name: name,
            phone: phone || null,
            email: email || null,
            paymentMethod: paymentMethod,
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
