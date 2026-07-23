const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
const { Storage } = require('@google-cloud/storage');
const { Readable } = require('stream');
const { ROOT } = require('../config/defaults');

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

try {
    const token = fs.readFileSync(path.join(ROOT, 'config', 'token.json'));
    oauth2Client.setCredentials(JSON.parse(token));
    console.log('[DRIVE] Token OAuth2 Google Drive berhasil dimuat.');
} catch (error) {
    console.error('[DRIVE] Error muat token.json! File mungkin tidak valid:', error.message);
}

const drive = google.drive({ version: 'v3', auth: oauth2Client });

const uploadToDrive = async (filePath, fileName, parentId = null) => {
    const fileStream = fs.createReadStream(filePath);
    const mimeType = fileName.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg';

    const response = await drive.files.create({
        requestBody: {
            name: fileName,
            parents: [parentId || process.env.GOOGLE_DRIVE_FOLDER_ID],
        },
        media: {
            mimeType: mimeType,
            body: fileStream,
        },
        fields: 'id, webViewLink',
    });

    await drive.permissions.create({
        fileId: response.data.id,
        requestBody: {
            role: 'reader',
            type: 'anyone',
        },
    });

    return response.data;
};

const createDriveFolder = async (folderName) => {
    const fileMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
    };
    const response = await drive.files.create({
        resource: fileMetadata,
        fields: 'id, webViewLink',
    });

    await drive.permissions.create({
        fileId: response.data.id,
        requestBody: {
            role: 'reader',
            type: 'anyone',
        },
    });

    return { id: response.data.id, link: response.data.webViewLink };
};

let gcpStorage = null;
try {
    gcpStorage = new Storage({
        projectId: process.env.GCP_PROJECT_ID,
        keyFilename: path.join(ROOT, 'config', 'gcp-key.json')
    });
} catch (err) {
    console.error('[GCP] Error inisialisasi GCP Storage (pastikan gcp-key.json ada):', err.message);
}

const uploadToGCP = async (filePath, fileName, folderName = 'videobooth') => {
    const bucketName = process.env.GCP_BUCKET_NAME;
    if (!bucketName) throw new Error("GCP_BUCKET_NAME tidak diatur di .env");
    const bucket = gcpStorage.bucket(bucketName);

    const safeFolderName = folderName.replace(/[^a-zA-Z0-9 ]/g, '_');
    const destination = `${safeFolderName}/${fileName}`;

    await bucket.upload(filePath, {
        destination: destination,
        metadata: {
            cacheControl: 'public, max-age=31536000',
        },
    });

    return `https://storage.googleapis.com/${bucketName}/${destination}`;
};

const storageProvider = () => (process.env.STORAGE_PROVIDER || 'drive').toLowerCase();

module.exports = {
    drive,
    oauth2Client,
    uploadToDrive,
    createDriveFolder,
    gcpStorage,
    uploadToGCP,
    storageProvider
};
