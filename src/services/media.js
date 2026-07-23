const ffmpeg = require('fluent-ffmpeg');

const getMediaDimensions = (filePath) => {
    return new Promise((resolve) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) {
                console.warn(`[FFPROBE] Gagal mendeteksi resolusi untuk ${filePath}, menggunakan default 1080x1920:`, err.message);
                return resolve({ width: 1080, height: 1920 });
            }
            const stream = metadata.streams.find(s => s.codec_type === 'video');
            if (!stream) {
                return resolve({ width: 1080, height: 1920 });
            }
            resolve({ width: stream.width, height: stream.height });
        });
    });
};

module.exports = { getMediaDimensions };
