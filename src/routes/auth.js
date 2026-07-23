const express = require('express');
const router = express.Router();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_TOKEN = 'lumea-admin-token-xyz789';

router.post('/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        res.json({ status: 'success', token: ADMIN_TOKEN });
    } else {
        res.status(401).json({ status: 'error', message: 'Password salah!' });
    }
});

router.post('/verify-token', (req, res) => {
    const { token } = req.body;
    if (token === ADMIN_TOKEN) {
        res.json({ status: 'success' });
    } else {
        res.status(401).json({ status: 'error' });
    }
});

module.exports = router;
