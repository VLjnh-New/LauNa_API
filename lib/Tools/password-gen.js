'use strict';

/**
 * /tools/password-gen — Tạo mật khẩu ngẫu nhiên mạnh.
 *
 * Cách dùng:
 *   /tools/password-gen                               (1 mật khẩu 16 ký tự, đầy đủ)
 *   /tools/password-gen?length=24&n=5
 *   /tools/password-gen?length=12&upper=1&lower=1&digits=1&symbols=0
 *   /tools/password-gen?type=pin&length=6            (chỉ số, ví dụ PIN)
 *   /tools/password-gen?type=passphrase&words=4      (passphrase kiểu "correct-horse-battery")
 *   /tools/password-gen?type=hex&length=32           (hex token)
 *
 * Tham số:
 *   type    : random (mặc định) | pin | hex | passphrase
 *   length  : độ dài (4–512, mặc định 16) — không áp dụng cho passphrase
 *   n       : số lượng mật khẩu cần tạo (1–50, mặc định 1)
 *   upper   : 1 = có chữ hoa (mặc định 1)
 *   lower   : 1 = có chữ thường (mặc định 1)
 *   digits  : 1 = có số (mặc định 1)
 *   symbols : 1 = có ký tự đặc biệt (mặc định 1) — chỉ cho type=random
 *   words   : số từ trong passphrase (3–10, mặc định 4) — chỉ cho type=passphrase
 *   sep     : ký tự phân cách passphrase (mặc định -)
 */

const crypto = require('crypto');

const UPPER   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';    // bỏ I, O dễ nhầm
const LOWER   = 'abcdefghjkmnpqrstuvwxyz';      // bỏ i, l dễ nhầm
const DIGITS  = '23456789';                      // bỏ 0, 1 dễ nhầm
const SYMBOLS = '!@#$%^&*-_=+?';

const WORDLIST = [
    'apple','brave','cloud','dance','eagle','flame','grace','heart','ivory','jewel',
    'knife','lunar','magic','noble','ocean','pearl','queen','river','stone','tiger',
    'ultra','vivid','water','xenon','youth','zesty','amber','beach','coral','delta',
    'ember','frost','globe','honey','index','joker','karma','lemon','maple','nexus',
    'olive','pixel','quest','radar','solar','tower','unity','vapor','waltz','xenon',
    'yacht','zebra','adobe','blaze','crane','drift','elite','forge','gamma','havoc',
    'icons','jelly','kudos','laser','metro','night','ozone','prism','quark','rebel',
    'sigma','talon','umbra','vault','whirl','xerox','yodel','zonal','acid','bolt',
    'cave','dawn','echo','fern','glow','haze','iron','jade','kelp','lime','mint',
    'nova','opal','pine','quiz','rose','silk','tide','urge','vibe','wave','xylo',
];

function randInt(max) {
    return crypto.randomInt(0, max);
}

function pickRandom(arr) {
    return arr[randInt(arr.length)];
}

function generateRandom({ length, upper, lower, digits, symbols }) {
    const pool = [
        ...(upper   ? UPPER   : ''),
        ...(lower   ? LOWER   : ''),
        ...(digits  ? DIGITS  : ''),
        ...(symbols ? SYMBOLS : ''),
    ];
    if (!pool.length) throw new Error('Phải bật ít nhất 1 loại ký tự');

    // Đảm bảo ít nhất 1 ký tự của từng loại được bật
    const required = [];
    if (upper)   required.push(pickRandom([...UPPER]));
    if (lower)   required.push(pickRandom([...LOWER]));
    if (digits)  required.push(pickRandom([...DIGITS]));
    if (symbols) required.push(pickRandom([...SYMBOLS]));

    const chars = [];
    for (let i = required.length; i < length; i++) {
        chars.push(pool[randInt(pool.length)]);
    }
    // Shuffle required + rest
    const all = [...required, ...chars];
    for (let i = all.length - 1; i > 0; i--) {
        const j = randInt(i + 1);
        [all[i], all[j]] = [all[j], all[i]];
    }
    return all.join('');
}

function generatePin(length) {
    return Array.from({ length }, () => randInt(10)).join('');
}

function generateHex(length) {
    return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

function generatePassphrase(words, sep) {
    const picks = Array.from({ length: words }, () => pickRandom(WORDLIST));
    const num = randInt(900) + 100;
    picks.push(String(num));
    return picks.join(sep);
}

function calcEntropy(password) {
    const chars = new Set(password).size;
    return Math.round(password.length * Math.log2(chars));
}

function strengthLabel(bits) {
    if (bits >= 80) return 'Rất mạnh';
    if (bits >= 60) return 'Mạnh';
    if (bits >= 40) return 'Trung bình';
    return 'Yếu';
}

module.exports = {
    name: '/tools/password-gen',
    index: (req, res) => {
        try {
            const type = (req.query.type || 'random').toLowerCase();
            const n    = Math.min(50, Math.max(1, parseInt(req.query.n, 10) || 1));

            let passwords;

            if (type === 'pin') {
                const length = Math.min(20, Math.max(4, parseInt(req.query.length, 10) || 6));
                passwords = Array.from({ length: n }, () => generatePin(length));
                return res.json({
                    status: true, type: 'pin',
                    passwords: n === 1 ? undefined : passwords,
                    password:  n === 1 ? passwords[0] : undefined,
                    count: n, creator: 'Ljzi'
                });
            }

            if (type === 'hex') {
                const length = Math.min(512, Math.max(4, parseInt(req.query.length, 10) || 32));
                passwords = Array.from({ length: n }, () => generateHex(length));
                return res.json({
                    status: true, type: 'hex',
                    passwords: n === 1 ? undefined : passwords,
                    password:  n === 1 ? passwords[0] : undefined,
                    count: n, creator: 'Ljzi'
                });
            }

            if (type === 'passphrase') {
                const words = Math.min(10, Math.max(3, parseInt(req.query.words, 10) || 4));
                const sep   = String(req.query.sep || '-').slice(0, 3);
                passwords = Array.from({ length: n }, () => generatePassphrase(words, sep));
                const sample = passwords[0];
                return res.json({
                    status: true, type: 'passphrase',
                    passwords: n === 1 ? undefined : passwords,
                    password:  n === 1 ? sample : undefined,
                    entropy:   calcEntropy(sample) + ' bits',
                    strength:  strengthLabel(calcEntropy(sample)),
                    count: n, creator: 'Ljzi'
                });
            }

            // type = random (mặc định)
            const length  = Math.min(512, Math.max(4, parseInt(req.query.length, 10) || 16));
            const upper   = req.query.upper   !== '0';
            const lower   = req.query.lower   !== '0';
            const digits  = req.query.digits  !== '0';
            const symbols = req.query.symbols !== '0';

            passwords = Array.from({ length: n }, () => generateRandom({ length, upper, lower, digits, symbols }));
            const sample = passwords[0];
            const entropy = calcEntropy(sample);

            return res.json({
                status: true, type: 'random',
                passwords: n === 1 ? undefined : passwords,
                password:  n === 1 ? sample : undefined,
                length, upper, lower, digits, symbols,
                entropy:  entropy + ' bits',
                strength: strengthLabel(entropy),
                count: n,
                creator: 'Ljzi'
            });

        } catch (e) {
            const log = require('../../utils/logger');
            log(`[PASS-GEN] lỗi: ${e.message}`, 'WARN');
            return res.status(400).json({ status: false, message: 'Tham số không hợp lệ' });
        }
    }
};
