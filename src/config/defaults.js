const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');

const DEFAULT_CONFIG = {
    status: 'active',
    title: 'New Event',
    subtitle: '#OnceInALifetime',
    descPremium: 'Enter your details to unveil a personalized wedding experience.',
    startText: 'Begin your experience',
    messageTemplate: 'Halo {name}! ✨\n\nKenangan Anda di ScribbleBooth sudah siap! Silakan lihat dan download melalui link folder di bawah ini:\n\n🔗 {link}\n\nTerima kasih sudah mampir!',
    emailSubject: 'Kenangan ScribbleBooth Anda sudah siap! ✨',

    bgColor1: '#1a100a',
    bgColor2: '#3c2a21',
    accentColor: '#D3BB7C',
    frameColor: '#333333',
    titleColor: '#D3BB7C',
    connectorColor: '#D3BB7C',
    subtitleColor: '#f0e5c7',
    descColor: '#CDCDCD',
    startTextColor: '#1a0f0a',
    readyTextColor: '#f0e5c7',
    reviewTextColor: '#f0e5c7',
    successTextColor: '#f0e5c7',

    formLabelName: 'Name',
    formLabelNameColor: '#f0e5c7',
    formPlaceholderName: 'Please input your name',
    formSubmitText: 'SUBMIT',
    formSubmitTextColor: '#1a0f0a',

    readyHeaderTitle: 'Ready To Record?',
    readyHeaderTitleColor: '#f0e5c7',
    readyHeaderSubtitle: 'Position yourself in front of the camera',
    readyHeaderSubtitleColor: '#f0e5c7',
    readyTextMain: 'Look at the camera and get ready.',
    readyTextSub: 'Hit the record button when you are ready.',
    readyCountdownText: 'Start Recording',
    readyCdText: 'Recording Begins in...',
    readyBackText: 'BACK',
    readyBackTextColor: '#e7e5d8',

    recordingCdText: 'Recording...',
    reviewTextMain: 'Please review your video,',
    reviewTextSub: 'you can RETAKE or NEXT.',
    reviewRetakeText: 'RETAKE',
    reviewRetakeTextColor: '#e7e5d8',
    reviewPhotoText: 'TAKE A PHOTO',
    reviewPhotoTextColor: '#1a0f0a',

    photoHeaderTitle: 'Ready for Photo Session?',
    photoHeaderTitleColor: '#f0e5c7',
    photoHeaderSubtitle: 'Strike a beautiful pose for the camera',
    photoHeaderSubtitleColor: '#f0e5c7',
    photoInstructionMain: 'Look at the camera and smile.',
    photoInstructionSub: 'Hit the shutter button when you are ready.',
    photoInstructionTextColor: '#f0e5c7',
    photoCountdownText: 'Take a Photo',
    photoCdText: 'Taking Photo in...',
    photoBackText: 'BACK',
    photoBackTextColor: '#e7e5d8',

    finalHeaderTitle: 'Review your session.',
    finalHeaderTitleColor: '#f0e5c7',
    finalVideoLabel: 'VIDEO',
    finalPhotoLabel: 'PHOTO',
    finalRetakeAllText: 'RETAKE ALL',
    finalRetakeAllTextColor: '#e7e5d8',
    finalRetakePhotoText: 'RETAKE PHOTO',
    finalRetakePhotoTextColor: '#e7e5d8',
    finalUploadText: 'UPLOAD BOTH',
    finalUploadTextColor: '#1a0f0a',

    successTextMain: 'Your memories are ready! ✨',
    successTextSub: 'Scan this QR code to view and download your video and photo.',
    successFooterText: 'Thank you for being part of this moment',
    successFooterTextColor: '#cdcdcd',
    successDoneText: 'Done',
    successDoneTextColor: '#1a0f0a',
    successAutoResetText: 'Auto-reset in',

    previewPanelFooter: 'Preview Your Moment',
    loadingPreviewText: 'Loading Preview...',
    loadingTutorialText: 'Loading Tutorial...',

    resultLoadingText: 'Loading your memories... ✨',
    resultErrorText: 'Sorry, your session was not found or has expired.',
    resultProcessingText: 'Processing your video & photo... please wait a moment. ✨',
    resultSaveVideoText: '🎬 Save Your Video',
    resultSavePhotoText: '📸 Save Your Photo',
    resultFooterText: 'Thank you for this beautiful moment',

    galleryTitle: 'Event Gallery',
    gallerySubtitle: 'A collection of beautiful moments.',
    gallerySearchPlaceholder: 'Search by name...',
    galleryEmptyText: 'No memories found yet.',
    galleryTextColor: '#ffffff',
    galleryBgColor: '#0a0a0b',

    fontSelector: 'luxury',
    fontSourceType: 'google',
    fontUrl: "https://fonts.googleapis.com/css2?family=Luxurious+Script&family=Kaisei+Opti&display=swap",
    fontFamily: "'Kaisei Opti', serif",
    titleFontFamily: "'Luxurious Script', cursive",

    enableGesture: true,
    showLeftPanel: true,
    showRightPanel: true,
    idleHeadMode: 'title',
    recordingDuration: 15,
    qrResetDuration: 45,
    eventDate: '2026-05-23',

    logoUrl: '/uploads_logo/logo-placeholder.png',
    bottomLeftLogoUrl: '/logo-lumea.png',
    bgImageUrl: '/bg1.png',
    frameImageUrl: '/frame_gold.png',
    overlayImageUrl: '/overlay.png',
    tutorialVideoUrl: '',
    resultVideoUrl: ''
};

const DATA_DIR = path.join(ROOT, 'data');
const EVENTS_DIR = path.join(DATA_DIR, 'events');
const SESSIONS_DIR_LEGACY = path.join(DATA_DIR, 'sessions');
const TRANSACTIONS_DIR = path.join(DATA_DIR, 'transactions');
const OFFLINE_QUEUE_DIR = path.join(DATA_DIR, 'offline_queue');
const UPLOADS_DIR = path.join(ROOT, 'uploads');
const PUBLIC_DIR = path.join(ROOT, 'public');
const CONFIG_DIR = path.join(ROOT, 'config');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

[TRANSACTIONS_DIR, OFFLINE_QUEUE_DIR, UPLOADS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

module.exports = {
    DEFAULT_CONFIG,
    ROOT,
    DATA_DIR,
    EVENTS_DIR,
    SESSIONS_DIR_LEGACY,
    TRANSACTIONS_DIR,
    OFFLINE_QUEUE_DIR,
    UPLOADS_DIR,
    PUBLIC_DIR,
    CONFIG_DIR,
    CONFIG_FILE
};
