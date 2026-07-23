const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const upload = require('../middleware/upload');

router.post('/config/asset', upload.asset.single('asset'), (req, res) => {
    if (!req.file) return res.status(400).json({ status: 'error', message: 'Tidak ada file diunggah.' });
    const fileUrl = `/uploads_assets/${req.file.filename}`;
    res.json({ status: 'success', fileUrl });
});

router.get('/config/assets-list', (req, res) => {
    const { PUBLIC_DIR } = require('../config/defaults');
    const dirs = [
        { path: path.join(PUBLIC_DIR, 'uploads_logo'), url: '/uploads_logo' },
        { path: path.join(PUBLIC_DIR, 'uploads_assets'), url: '/uploads_assets' }
    ];

    let allFiles = [];
    dirs.forEach(dir => {
        if (fs.existsSync(dir.path)) {
            const files = fs.readdirSync(dir.path);
            files.forEach(file => {
                if (!file.startsWith('.') && fs.lstatSync(path.join(dir.path, file)).isFile()) {
                    allFiles.push({
                        name: file,
                        url: `${dir.url}/${file}`,
                        type: dir.url.includes('logo') ? 'logo' : 'asset'
                    });
                }
            });
        }
    });

    res.json({ status: 'success', assets: allFiles });
});

router.delete('/config/asset-delete', (req, res) => {
    const { PUBLIC_DIR } = require('../config/defaults');
    const { fileUrl } = req.body;
    if (!fileUrl) return res.status(400).json({ status: 'error', message: 'No file URL provided' });

    if (!fileUrl.startsWith('/uploads_logo/') && !fileUrl.startsWith('/uploads_assets/')) {
        return res.status(403).json({ status: 'error', message: 'Unauthorized path' });
    }

    const filePath = path.join(PUBLIC_DIR, fileUrl);
    if (fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
            res.json({ status: 'success', message: 'File deleted successfully' });
        } catch (err) {
            res.status(500).json({ status: 'error', message: 'Failed to delete file' });
        }
    } else {
        res.status(404).json({ status: 'error', message: 'File not found on server' });
    }
});

module.exports = router;
