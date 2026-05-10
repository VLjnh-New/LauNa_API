'use strict';

/**
 * /tools/captcha — Bypass CAPTCHA đa loại
 *
 * Hỗ trợ:
 *   - image      : Đọc text/số trong ảnh captcha bằng Gemini Vision AI
 *   - recaptchav2: Giải reCAPTCHA v2 (checkbox / invisible) qua CapSolver
 *   - recaptchav3: Giải reCAPTCHA v3 (token) qua CapSolver
 *   - hcaptcha   : Giải hCaptcha qua CapSolver
 *   - turnstile  : Giải Cloudflare Turnstile qua CapSolver
 *
 * Params chung:
 *   type        — loại captcha (bắt buộc)
 *   capsolver_key — API key CapSolver (hoặc set env CAPSOLVER_KEY)
 *
 * Params cho type=image:
 *   url         — URL ảnh captcha
 *   base64      — chuỗi base64 của ảnh captcha
 *   hint        — gợi ý thêm cho AI (ví dụ: "chỉ lấy số", "bỏ qua nhiễu")
 *
 * Params cho type=recaptchav2/v3/hcaptcha/turnstile:
 *   sitekey     — site key của trang web (bắt buộc)
 *   pageurl     — URL trang chứa captcha (bắt buộc)
 *   action      — (recaptchav3) tên action, mặc định "submit"
 *   min_score   — (recaptchav3) điểm tối thiểu, mặc định 0.5
 */

const axios = require('axios');
const { askGeminiVision } = require('../../utils/gemini-vision');

const CAPSOLVER_API   = 'https://api.capsolver.com';
const POLL_INTERVAL   = 3000;
const POLL_TIMEOUT    = 120000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getCapsolverKey(req) {
    return req.query.capsolver_key
        || req.body?.capsolver_key
        || process.env.CAPSOLVER_KEY
        || null;
}

async function capsolverRequest(path, payload, apiKey) {
    const { data } = await axios.post(`${CAPSOLVER_API}${path}`, {
        clientKey: apiKey,
        ...payload,
    }, { timeout: 30000 });
    return data;
}

async function pollTask(taskId, apiKey) {
    const started = Date.now();
    while (Date.now() - started < POLL_TIMEOUT) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL));
        const res = await capsolverRequest('/getTaskResult', { taskId }, apiKey);
        if (res.status === 'ready') return res.solution;
        if (res.status === 'failed') throw new Error(`CapSolver thất bại: ${res.errorDescription || 'unknown'}`);
    }
    throw new Error('CapSolver timeout — quá 120 giây chưa có kết quả');
}

async function solveViaCapsolver(taskData, apiKey) {
    const created = await capsolverRequest('/createTask', { task: taskData }, apiKey);
    if (created.errorId && created.errorId !== 0) {
        throw new Error(`CapSolver lỗi tạo task: ${created.errorDescription || created.errorCode}`);
    }
    return pollTask(created.taskId, apiKey);
}

// ─── Solvers ─────────────────────────────────────────────────────────────────

async function solveImage(req) {
    const url    = req.query.url    || req.body?.url    || null;
    const base64 = req.query.base64 || req.body?.base64 || null;
    const hint   = req.query.hint   || req.body?.hint   || '';

    if (!url && !base64) {
        return { error: 400, message: "Thiếu tham số 'url' hoặc 'base64' cho type=image" };
    }

    const prompt = [
        'Đây là ảnh CAPTCHA. Hãy đọc và trả về ĐÚNG CHỮ/SỐ hiển thị trong ảnh.',
        'CHỈ trả về chuỗi ký tự/số đó, KHÔNG giải thích thêm bất cứ điều gì.',
        'Nếu ảnh có nhiễu/gạch chân/màu sắc rối, hãy cố gắng đọc phần chính.',
        hint ? `Lưu ý thêm: ${hint}` : '',
    ].filter(Boolean).join(' ');

    const raw    = await askGeminiVision(url || base64, prompt);
    const result = raw.replace(/[`"'\n\r]/g, '').trim();

    return {
        type:   'image',
        result,
        raw,
    };
}

async function solveRecaptchaV2(req, apiKey) {
    const sitekey = req.query.sitekey  || req.body?.sitekey;
    const pageurl = req.query.pageurl  || req.body?.pageurl;
    const invisible = (req.query.invisible || req.body?.invisible) === '1'
        || (req.query.invisible || req.body?.invisible) === 'true';

    if (!sitekey || !pageurl) {
        return { error: 400, message: "Thiếu 'sitekey' hoặc 'pageurl'" };
    }

    const solution = await solveViaCapsolver({
        type:       invisible ? 'ReCaptchaV2TaskProxyLess' : 'ReCaptchaV2TaskProxyLess',
        websiteURL: pageurl,
        websiteKey: sitekey,
        isInvisible: invisible,
    }, apiKey);

    return {
        type:  'recaptchav2',
        token: solution.gRecaptchaResponse,
    };
}

async function solveRecaptchaV3(req, apiKey) {
    const sitekey   = req.query.sitekey   || req.body?.sitekey;
    const pageurl   = req.query.pageurl   || req.body?.pageurl;
    const action    = req.query.action    || req.body?.action    || 'submit';
    const min_score = parseFloat(req.query.min_score || req.body?.min_score || '0.5');

    if (!sitekey || !pageurl) {
        return { error: 400, message: "Thiếu 'sitekey' hoặc 'pageurl'" };
    }

    const solution = await solveViaCapsolver({
        type:           'ReCaptchaV3TaskProxyLess',
        websiteURL:     pageurl,
        websiteKey:     sitekey,
        pageAction:     action,
        minScore:       min_score,
    }, apiKey);

    return {
        type:  'recaptchav3',
        token: solution.gRecaptchaResponse,
        score: solution.score,
    };
}

async function solveHcaptcha(req, apiKey) {
    const sitekey = req.query.sitekey || req.body?.sitekey;
    const pageurl = req.query.pageurl || req.body?.pageurl;

    if (!sitekey || !pageurl) {
        return { error: 400, message: "Thiếu 'sitekey' hoặc 'pageurl'" };
    }

    const solution = await solveViaCapsolver({
        type:       'HCaptchaTaskProxyLess',
        websiteURL: pageurl,
        websiteKey: sitekey,
    }, apiKey);

    return {
        type:  'hcaptcha',
        token: solution.gRecaptchaResponse || solution.token,
    };
}

async function solveTurnstile(req, apiKey) {
    const sitekey = req.query.sitekey || req.body?.sitekey;
    const pageurl = req.query.pageurl || req.body?.pageurl;

    if (!sitekey || !pageurl) {
        return { error: 400, message: "Thiếu 'sitekey' hoặc 'pageurl'" };
    }

    const solution = await solveViaCapsolver({
        type:       'AntiTurnstileTaskProxyLess',
        websiteURL: pageurl,
        websiteKey: sitekey,
    }, apiKey);

    return {
        type:  'turnstile',
        token: solution.token,
    };
}

// ─── Route ───────────────────────────────────────────────────────────────────

module.exports = {
    name: '/tools/captcha',
    methods: {
        get:  handler,
        post: handler,
    },
};

async function handler(req, res) {
    const type = (req.query.type || req.body?.type || '').toLowerCase();

    if (!type) {
        return res.status(400).json({
            status:  false,
            message: "Thiếu tham số 'type'",
            params: {
                type:          'image | recaptchav2 | recaptchav3 | hcaptcha | turnstile',
                capsolver_key: '(bắt buộc với recaptchav2/v3/hcaptcha/turnstile) API key CapSolver',
            },
            examples: {
                image:       '/tools/captcha?type=image&url=https://example.com/captcha.png',
                recaptchav2: '/tools/captcha?type=recaptchav2&sitekey=6Le...&pageurl=https://example.com&capsolver_key=CAP-...',
                recaptchav3: '/tools/captcha?type=recaptchav3&sitekey=6Le...&pageurl=https://example.com&action=login&capsolver_key=CAP-...',
                hcaptcha:    '/tools/captcha?type=hcaptcha&sitekey=abc...&pageurl=https://example.com&capsolver_key=CAP-...',
                turnstile:   '/tools/captcha?type=turnstile&sitekey=0x4A...&pageurl=https://example.com&capsolver_key=CAP-...',
            },
            creator: 'Ljzi',
        });
    }

    try {
        let result;

        if (type === 'image') {
            result = await solveImage(req);
        } else if (['recaptchav2', 'recaptchav3', 'hcaptcha', 'turnstile'].includes(type)) {
            const apiKey = getCapsolverKey(req);
            if (!apiKey) {
                return res.status(400).json({
                    status:  false,
                    message: "Thiếu 'capsolver_key'.",
                });
            }
            if (type === 'recaptchav2')  result = await solveRecaptchaV2(req, apiKey);
            else if (type === 'recaptchav3') result = await solveRecaptchaV3(req, apiKey);
            else if (type === 'hcaptcha')    result = await solveHcaptcha(req, apiKey);
            else                             result = await solveTurnstile(req, apiKey);
        } else {
            return res.status(400).json({
                status:  false,
                message: `Loại captcha '${type}' không được hỗ trợ. Dùng: image | recaptchav2 | recaptchav3 | hcaptcha | turnstile`,
            });
        }

        if (result.error) {
            return res.status(result.error).json({ status: false, message: result.message });
        }

        return res.json({
            status: true,
            ...result,
            creator: 'Ljzi',
        });

    } catch (e) {
        const log = require('../../utils/logger');
        log(`[CAPTCHA] lỗi type=${type}: ${e.message}`, 'WARN');
        return res.status(500).json({
            status:  false,
            message: `Lỗi bypass captcha: ${e.message}`,
        });
    }
}
