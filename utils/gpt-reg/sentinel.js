'use strict';

const crypto = require('crypto');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0';
const SCRIPT_SRC = 'https://sentinel.openai.com/sentinel/20260124ceb8/sdk.js';

const NAV_PROPS = [
    'vendorSub','productSub','vendor','maxTouchPoints','scheduling','userActivation',
    'doNotTrack','geolocation','connection','plugins','mimeTypes','pdfViewerEnabled',
    'webkitTemporaryStorage','webkitPersistentStorage','hardwareConcurrency',
    'cookieEnabled','credentials','mediaDevices','permissions','locks','ink',
];
const DOC_KEYS = ['location','implementation','URL','documentURI','compatMode'];
const WIN_KEYS = ['Object','Function','Array','Number','parseFloat','undefined'];
const HW_CORES = [4, 8, 12, 16];

function pick(arr)               { return arr[Math.floor(Math.random() * arr.length)]; }
function randFloat(min, max)     { return Math.random() * (max - min) + min; }

function generateRequirementsToken(deviceId, ua) {
    const sid       = crypto.randomUUID();
    const now       = new Date();
    const perfNow   = randFloat(1000, 50000);
    const timeOrigin = Date.now() - perfNow;
    const config = [
        '1920x1080',
        now.toUTCString().replace('GMT', 'GMT+0000 (Coordinated Universal Time)'),
        4294705152,
        1,
        ua || USER_AGENT,
        SCRIPT_SRC,
        null, null,
        'en-US', Math.round(randFloat(5, 50)),
        Math.random(),
        `${pick(NAV_PROPS)}\u2212undefined`,
        pick(DOC_KEYS),
        pick(WIN_KEYS),
        perfNow,
        sid, '',
        pick(HW_CORES),
        timeOrigin,
    ];
    const json = JSON.stringify(config, (k, v) => v === undefined ? null : v);
    return 'gAAAAAC' + Buffer.from(json, 'utf8').toString('base64');
}

module.exports = { generateRequirementsToken, USER_AGENT };
