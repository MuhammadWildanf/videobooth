const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');
const { EVENTS_DIR, SESSIONS_DIR_LEGACY, TRANSACTIONS_DIR, CONFIG_FILE, ROOT, DEFAULT_CONFIG } = require('../config/defaults');

let db = null;
try {
    const firebaseKeyFile = process.env.FIREBASE_KEY_FILE || process.env.GCP_KEY_FILE || 'gcp-key.json';
    const firebaseKeyPath = path.join(ROOT, 'config', firebaseKeyFile);
    if (fs.existsSync(firebaseKeyPath)) {
        admin.initializeApp({
            credential: admin.credential.cert(firebaseKeyPath)
        });
        db = admin.firestore();
        console.log('[FIRESTORE] Inisialisasi Firestore Storage berhasil.');
    } else {
        console.log('[FIRESTORE] File kunci GCP/Firestore tidak ditemukan. Menggunakan penyimpanan lokal JSON.');
    }
} catch (err) {
    console.error('[FIRESTORE] Gagal inisialisasi Firestore:', err.message);
}

async function getEventConfig(eventId) {
    eventId = eventId || 'audric-cathrine';
    if (db) {
        try {
            const doc = await db.collection('events').doc(eventId).get();
            if (doc.exists) return doc.data();
            await db.collection('events').doc(eventId).set(DEFAULT_CONFIG);
            return DEFAULT_CONFIG;
        } catch (e) {
            console.error('[DB] Firestore getEventConfig error:', e.message);
        }
    }
    const eventConfigFile = path.join(EVENTS_DIR, eventId, 'config.json');
    if (fs.existsSync(eventConfigFile)) {
        return JSON.parse(fs.readFileSync(eventConfigFile, 'utf8'));
    }
    if (fs.existsSync(CONFIG_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
    return DEFAULT_CONFIG;
}

async function saveEventConfig(eventId, config) {
    eventId = eventId || 'audric-cathrine';
    let saved = false;
    if (db) {
        try {
            const doc = await db.collection('events').doc(eventId).get();
            const currentData = doc.exists ? doc.data() : DEFAULT_CONFIG;
            const newConfig = { ...currentData, ...config };
            await db.collection('events').doc(eventId).set(newConfig);
            saved = true;
        } catch (e) {
            console.error('[DB] Firestore saveEventConfig error:', e.message);
        }
    }
    if (saved) return saved;
    const eventDir = path.join(EVENTS_DIR, eventId);
    if (!fs.existsSync(eventDir)) fs.mkdirSync(eventDir, { recursive: true });
    const eventConfigFile = path.join(eventDir, 'config.json');
    const currentData = fs.existsSync(eventConfigFile)
        ? JSON.parse(fs.readFileSync(eventConfigFile))
        : (fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE)) : DEFAULT_CONFIG);
    const newConfig = { ...currentData, ...config };
    fs.writeFileSync(eventConfigFile, JSON.stringify(newConfig, null, 4));
    return true;
}

async function saveSession(sessionId, sessionData) {
    if (db) {
        try {
            await db.collection('sessions').doc(sessionId).set(sessionData);
            return true;
        } catch (e) {
            console.error('[DB] Firestore saveSession error:', e.message);
        }
    }
    const eventDir = path.join(EVENTS_DIR, sessionData.eventId || 'audric-cathrine');
    const sessionsDir = path.join(eventDir, 'sessions');
    if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(path.join(sessionsDir, `${sessionId}.json`), JSON.stringify(sessionData, null, 2));
    return true;
}

async function getSession(sessionId) {
    if (db) {
        try {
            const doc = await db.collection('sessions').doc(sessionId).get();
            if (doc.exists) return doc.data();
        } catch (e) {
            console.error('[DB] Firestore getSession error:', e.message);
        }
    }
    const eventsDir = EVENTS_DIR;
    if (fs.existsSync(eventsDir)) {
        const events = fs.readdirSync(eventsDir);
        for (const ev of events) {
            const sessionFile = path.join(eventsDir, ev, 'sessions', `${sessionId}.json`);
            if (fs.existsSync(sessionFile)) {
                return JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
            }
        }
    }
    const legacyPath = path.join(SESSIONS_DIR_LEGACY, `${sessionId}.json`);
    if (fs.existsSync(legacyPath)) {
        return JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
    }
    return null;
}

async function listSessions(eventId) {
    eventId = eventId || 'audric-cathrine';
    if (db) {
        try {
            const snapshot = await db.collection('sessions')
                .where('eventId', '==', eventId)
                .orderBy('createdAt', 'desc')
                .get();
            const sessions = [];
            snapshot.forEach(doc => sessions.push(doc.data()));
            return sessions;
        } catch (e) {
            console.error('[DB] Firestore listSessions error:', e.message);
        }
    }
    const sessions = [];
    const sessionsDir = path.join(EVENTS_DIR, eventId, 'sessions');
    if (fs.existsSync(sessionsDir)) {
        const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
        files.forEach(file => {
            try {
                sessions.push(JSON.parse(fs.readFileSync(path.join(sessionsDir, file), 'utf8')));
            } catch (e) { }
        });
    }
    if (eventId === 'audric-cathrine' && fs.existsSync(SESSIONS_DIR_LEGACY)) {
        const files = fs.readdirSync(SESSIONS_DIR_LEGACY).filter(f => f.endsWith('.json'));
        files.forEach(file => {
            try {
                const data = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR_LEGACY, file), 'utf8'));
                if (!sessions.some(s => s.id === data.id)) sessions.push(data);
            } catch (e) { }
        });
    }
    sessions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return sessions;
}

async function deleteSession(sessionId, eventId) {
    if (!/^[a-zA-Z0-9\-_]+$/.test(sessionId)) return false;
    let deleted = false;
    if (db) {
        try {
            await db.collection('sessions').doc(sessionId).delete();
            deleted = true;
        } catch (e) {
            console.error('[DB] Firestore deleteSession error:', e.message);
        }
    }
    if (eventId) {
        const sessionFile = path.join(EVENTS_DIR, eventId, 'sessions', `${sessionId}.json`);
        if (fs.existsSync(sessionFile)) { fs.unlinkSync(sessionFile); deleted = true; }
    } else {
        const eventsDir = EVENTS_DIR;
        if (fs.existsSync(eventsDir)) {
            const events = fs.readdirSync(eventsDir);
            for (const ev of events) {
                const f = path.join(eventsDir, ev, 'sessions', `${sessionId}.json`);
                if (fs.existsSync(f)) { fs.unlinkSync(f); deleted = true; }
            }
        }
    }
    const legacyPath = path.join(SESSIONS_DIR_LEGACY, `${sessionId}.json`);
    if (fs.existsSync(legacyPath)) { fs.unlinkSync(legacyPath); deleted = true; }
    return deleted;
}

async function saveTransaction(orderId, data) {
    if (db) {
        try {
            await db.collection('transactions').doc(orderId).set(data, { merge: true });
            return true;
        } catch (e) {
            console.error('[DB] Firestore saveTransaction error:', e.message);
        }
    }
    if (!fs.existsSync(TRANSACTIONS_DIR)) fs.mkdirSync(TRANSACTIONS_DIR, { recursive: true });
    const filePath = path.join(TRANSACTIONS_DIR, `${orderId}.json`);
    let existing = {};
    if (fs.existsSync(filePath)) existing = JSON.parse(fs.readFileSync(filePath));
    fs.writeFileSync(filePath, JSON.stringify({ ...existing, ...data }, null, 2));
    return true;
}

async function listTransactions() {
    if (db) {
        try {
            const snapshot = await db.collection('transactions').orderBy('createdAt', 'desc').get();
            const results = [];
            snapshot.forEach(doc => results.push(doc.data()));
            return results;
        } catch (e) {
            console.error('[DB] Firestore listTransactions error:', e.message);
        }
    }
    if (!fs.existsSync(TRANSACTIONS_DIR)) return [];
    const files = fs.readdirSync(TRANSACTIONS_DIR).filter(f => f.endsWith('.json'));
    const results = [];
    for (let file of files) {
        try {
            results.push(JSON.parse(fs.readFileSync(path.join(TRANSACTIONS_DIR, file))));
        } catch (e) { }
    }
    results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return results;
}

async function listEvents() {
    if (db) {
        try {
            const snapshot = await db.collection('events').get();
            const events = [];
            snapshot.forEach(doc => {
                events.push({ id: doc.id, status: doc.data().status || 'active' });
            });
            if (!events.some(e => e.id === 'audric-cathrine')) {
                events.push({ id: 'audric-cathrine', status: 'active' });
            }
            return events;
        } catch (e) {
            console.error('[DB] Firestore listEvents error:', e.message);
        }
    }
    let events = [];
    if (fs.existsSync(EVENTS_DIR)) {
        const dirs = fs.readdirSync(EVENTS_DIR).filter(f => fs.statSync(path.join(EVENTS_DIR, f)).isDirectory());
        dirs.forEach(d => {
            const configPath = path.join(EVENTS_DIR, d, 'config.json');
            let status = 'active';
            if (fs.existsSync(configPath)) {
                try {
                    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    status = cfg.status || 'active';
                } catch (e) { }
            }
            events.push({ id: d, status });
        });
    }
    if (!events.some(e => e.id === 'audric-cathrine')) {
        let status = 'active';
        if (fs.existsSync(CONFIG_FILE)) {
            try {
                const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
                status = cfg.status || 'active';
            } catch (e) { }
        }
        events.push({ id: 'audric-cathrine', status });
    }
    return events;
}

async function createEvent(eventId) {
    const cleanId = eventId.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!cleanId) return null;
    if (db) {
        try {
            const docRef = db.collection('events').doc(cleanId);
            const doc = await docRef.get();
            if (doc.exists) return null;
            await docRef.set(DEFAULT_CONFIG);
            return cleanId;
        } catch (e) {
            console.error('[DB] Firestore createEvent error:', e.message);
        }
    }
    const eventDir = path.join(EVENTS_DIR, cleanId);
    if (fs.existsSync(eventDir)) return null;
    fs.mkdirSync(eventDir, { recursive: true });
    fs.mkdirSync(path.join(eventDir, 'sessions'), { recursive: true });
    fs.writeFileSync(path.join(eventDir, 'config.json'), JSON.stringify(DEFAULT_CONFIG, null, 4));
    return cleanId;
}

async function isEventActive(eventId) {
    if (!eventId) return false;
    if (eventId === 'audric-cathrine') return true;
    const config = await getEventConfig(eventId);
    return config ? config.status !== 'inactive' : false;
}

module.exports = {
    db,
    getEventConfig,
    saveEventConfig,
    saveSession,
    getSession,
    listSessions,
    deleteSession,
    saveTransaction,
    listTransactions,
    listEvents,
    createEvent,
    isEventActive
};
