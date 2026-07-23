const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { PUBLIC_DIR } = require('../config/defaults');

const logoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(PUBLIC_DIR, 'uploads_logo');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, 'logo-' + Date.now() + ext);
    }
});

const assetStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(PUBLIC_DIR, 'uploads_assets');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = file.fieldname + '-' + Date.now() + ext;
        cb(null, name);
    }
});

const logo = multer({ storage: logoStorage });
const asset = multer({ storage: assetStorage });

module.exports = { logo, asset };
