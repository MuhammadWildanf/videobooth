const express = require('express');
const router = express.Router();
const qrcode = require('qrcode');
const { paymentCache } = require('../services/queue');
const { getEventConfig, saveTransaction, listTransactions, db } = require('../services/database');
const { DEFAULT_CONFIG } = require('../config/defaults');

const XENDIT_API_URL = 'https://api.xendit.co';
const getXenditHeaders = () => {
    const key = process.env.XENDIT_SECRET_KEY || '';
    return {
        'Content-Type': 'application/json',
        'api-version': '2022-07-31',
        'Authorization': `Basic ${Buffer.from(key + ':').toString('base64')}`
    };
};

router.post('/payment/create', async (req, res) => {
    try {
        const { eventId, name, phone, email } = req.body;
        if (!eventId) return res.status(400).json({ error: 'Event ID required' });

        let config = await getEventConfig(eventId);

        const price = parseInt(config.sessionPrice) || 0;
        if (price <= 0) {
            return res.json({ status: 'bypassed', message: 'Event is free' });
        }

        const orderId = `ORDER-${eventId}-${Date.now()}`;
        const parameter = {
            reference_id: orderId,
            type: "DYNAMIC",
            currency: "IDR",
            amount: price
        };

        const response = await fetch(`${XENDIT_API_URL}/qr_codes`, {
            method: 'POST',
            headers: getXenditHeaders(),
            body: JSON.stringify(parameter)
        });

        if (!response.ok) {
            const errData = await response.json();
            console.error('[XENDIT ERROR]', errData);
            throw new Error(errData.message || 'Failed to generate QRIS');
        }

        const data = await response.json();
        const qrString = data.qr_string;

        const qrBase64 = await qrcode.toDataURL(qrString, {
            errorCorrectionLevel: 'H',
            margin: 2,
            width: 400,
            color: { dark: '#000000', light: '#ffffff' }
        });

        paymentCache[orderId] = 'pending';

        await saveTransaction(orderId, {
            orderId: orderId,
            eventId: eventId,
            name: name || 'Guest',
            phone: phone || '-',
            email: email || '-',
            price: price,
            status: 'pending',
            paymentMethod: 'Xendit QRIS',
            createdAt: new Date().toISOString()
        });

        res.json({
            status: 'success',
            orderId: orderId,
            qrImageBase64: qrBase64,
            price: price
        });

    } catch (err) {
        console.error('[XENDIT CREATE ERROR]', err.message);
        res.status(500).json({ error: 'Gagal membuat transaksi pembayaran via Xendit' });
    }
});

router.post('/payment/simulate/:orderId', async (req, res) => {
    const orderId = req.params.orderId;
    try {
        const key = process.env.XENDIT_SECRET_KEY || '';
        const response = await fetch(`${XENDIT_API_URL}/qr_codes/${orderId}/payments/simulate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${Buffer.from(key + ':').toString('base64')}`
            }
        });

        if (!response.ok) {
            const errData = await response.json();
            console.error('[XENDIT SIMULATE ERROR]', errData);
            return res.status(500).json({ error: errData.message });
        }

        paymentCache[orderId] = 'settlement';
        await saveTransaction(orderId, { status: 'settlement', paymentMethod: 'Xendit QRIS (Simulated)' });

        res.json({ status: 'success', message: 'Simulasi berhasil dikirim ke Xendit & dipaksa Lunas!' });
    } catch (err) {
        console.error('[XENDIT SIMULATE ERROR]', err.message);
        res.status(500).json({ error: 'Gagal menyimulasikan pembayaran' });
    }
});

router.get('/payment/status/:orderId', async (req, res) => {
    const orderId = req.params.orderId;
    try {
        if (paymentCache[orderId] === 'settlement' || paymentCache[orderId] === 'capture') {
            return res.json({ status: 'settlement' });
        }

        if (paymentCache[orderId] === 'settlement') {
            return res.json({ status: 'settlement' });
        } else if (paymentCache[orderId] === 'failed') {
            return res.json({ status: 'failed' });
        }

        res.json({ status: 'pending' });

    } catch (err) {
        res.json({ status: paymentCache[orderId] || 'pending' });
    }
});

router.post('/payment/callback', async (req, res) => {
    try {
        const payload = req.body;

        if (payload.event === 'qr.payment') {
            const qrData = payload.data;
            const orderId = qrData.reference_id;
            const status = qrData.status;

            console.log(`[XENDIT WEBHOOK] Order: ${orderId} | Status: ${status}`);

            if (status === 'SUCCEEDED' || status === 'COMPLETED') {
                paymentCache[orderId] = 'settlement';
            } else {
                paymentCache[orderId] = 'failed';
            }
        } else {
            console.log(`[XENDIT WEBHOOK] Event tidak dikenal:`, payload.event);
            return res.status(200).json({ status: 'ignored' });
        }

        const orderId = payload.data.reference_id;

        await saveTransaction(orderId, {
            status: paymentCache[orderId],
            updatedAt: new Date().toISOString()
        });

        res.status(200).json({ status: 'ok' });
    } catch (err) {
        console.error('[XENDIT WEBHOOK ERROR]', err.message);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

router.get('/admin/transactions', async (req, res) => {
    try {
        let results = await listTransactions();

        for (let i = 0; i < results.length; i++) {
            if (results[i].status === 'pending') {
                try {
                    const key = process.env.XENDIT_SECRET_KEY || '';
                    const statusResponse = await fetch(`${XENDIT_API_URL}/qr_codes/${results[i].orderId}`, {
                        headers: {
                            'Authorization': `Basic ${Buffer.from(key + ':').toString('base64')}`
                        }
                    });
                    if (statusResponse.ok) {
                        const trData = await statusResponse.json();
                        const trStatus = trData.status;
                        let updated = false;

                        if (trStatus === 'SUCCEEDED' || trStatus === 'COMPLETED') {
                            results[i].status = 'settlement';
                            updated = true;
                        } else if (trStatus === 'FAILED' || trStatus === 'EXPIRED') {
                            results[i].status = 'failed';
                            updated = true;
                        }

                        if (updated) {
                            results[i].updatedAt = new Date().toISOString();
                            await saveTransaction(results[i].orderId, {
                                status: results[i].status,
                                updatedAt: results[i].updatedAt
                            });
                            paymentCache[results[i].orderId] = results[i].status;
                        }
                    }
                } catch (err) {
                    // Silently ignore sync errors
                }
            }
        }

        res.json({ success: true, data: results });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
