'use strict';

/**
 * /ai/support  (internal — không phải API public)
 *
 * Chatbot hỗ trợ kèm:
 *  - Streaming SSE  (/ai/support/stream)
 *  - Liệt kê model  (/ai/support/models)
 *  - Lưu lịch sử ở Postgres (fallback RAM nếu DB tắt)
 *  - Rate-limit theo session + IP
 *  - Vision (gửi kèm ?image=URL)
 *  - Tự gắn link endpoint liên quan vào reply
 */

const db  = require('../../utils/data/db');
const log = require('../../utils/logger');

const APP_VERSION   = '4.0.0';
const PROMPT_TTL    = 60 * 1000;
const MAX_HISTORY   = 12;
const MAX_PROMPT    = 1000;
const HISTORY_DAYS  = 7;

const FREE_AI_BASE  = 'https://text.pollinations.ai/openai';
const FREE_AI_KEY   = null;

/* ── Model aliases ───────────────────────────────────────────────────────── */
const MODEL_MAP = {
    qwen:        'qwen',
    qwen7b:      'qwen',
    gpt:         'openai',
    gpt4o:       'openai-large',
    gpt4omini:   'openai',
    gpt5:        'openai-large',
    claude:      'claude-hybridspace',
    claude35:    'claude-hybridspace',
    claude3:     'claude-hybridspace',
    llama:       'llama',
    llama3:      'llama',
    mistral:     'mistral',
    deepseek:    'deepseek',
    deepseekr1:  'deepseek-r1'
};
const DEFAULT_MODEL = 'openai';

function resolveModel(alias) {
    const k = (alias || '').toLowerCase().trim();
    return MODEL_MAP[k] || k || DEFAULT_MODEL;
}

/* ── Rate limit ──────────────────────────────────────────────────────────── */
const RL_WINDOW = 60_000;
const RL_MAX    = 20;
const buckets   = new Map();

function rateLimited(key) {
    const now = Date.now();
    const arr = (buckets.get(key) || []).filter(t => now - t < RL_WINDOW);
    if (arr.length >= RL_MAX) {
        buckets.set(key, arr);
        return true;
    }
    arr.push(now);
    buckets.set(key, arr);
    return false;
}

/* ── History (Postgres + RAM fallback) ───────────────────────────────────── */
let dbReady = false;
const ramHist = new Map();

async function ensureSchema() {
    if (dbReady || !db.isEnabled()) return dbReady;
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS support_history (
                id BIGSERIAL PRIMARY KEY,
                session TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS support_history_session_idx
                ON support_history(session, created_at);
        `);
        dbReady = true;
    } catch (e) {
        log(`[support] init schema fail: ${e.message}`, 'WARN');
    }
    return dbReady;
}

async function loadHistory(session) {
    if (await ensureSchema()) {
        try {
            const r = await db.query(
                `SELECT role, content FROM support_history
                 WHERE session = $1
                   AND created_at > NOW() - INTERVAL '${HISTORY_DAYS} days'
                 ORDER BY id DESC LIMIT $2`,
                [session, MAX_HISTORY * 2]
            );
            return r.rows.reverse();
        } catch (e) {
            log(`[support] load fail: ${e.message}`, 'WARN');
        }
    }
    return ramHist.get(session) || [];
}

async function appendHistory(session, role, content) {
    if (await ensureSchema()) {
        try {
            await db.query(
                'INSERT INTO support_history(session, role, content) VALUES ($1,$2,$3)',
                [session, role, content]
            );
            return;
        } catch (e) {
            log(`[support] write fail: ${e.message}`, 'WARN');
        }
    }
    const arr = ramHist.get(session) || [];
    arr.push({ role, content });
    if (arr.length > MAX_HISTORY * 2) arr.splice(0, arr.length - MAX_HISTORY * 2);
    ramHist.set(session, arr);
}

async function clearHistory(session) {
    if (await ensureSchema()) {
        try {
            await db.query('DELETE FROM support_history WHERE session=$1', [session]);
        } catch (e) {
            log(`[support] clear fail: ${e.message}`, 'WARN');
        }
    }
    ramHist.delete(session);
}

/* ── System prompt ───────────────────────────────────────────────────────── */
const CATEGORY_DESC = {
    'AI':         'Chat AI, tạo ảnh, chỉnh sửa ảnh, vision, TTS.',
    'Download':   'Tải media full chất lượng từ TikTok, Douyin, YouTube, Facebook, SoundCloud, Mixcloud.',
    'Music':      'Tìm + stream nhạc từ NCT, Spotify, YouTube, Zing, SoundCloud.',
    'Note':       'Ghi chú dạng UUID, lưu Postgres.',
    'Share File': 'Chia sẻ link file công khai.',
    'FreeFire':   'Tra info account, like, banner, visit Free Fire.',
    'Khác':       'Các tiện ích lẻ.'
};

let cachedPrompt = null;
let cachedAt = 0;
let cachedRoutes = [];

function buildSystemPrompt() {
    const now = Date.now();
    if (cachedPrompt && now - cachedAt < PROMPT_TTL) return cachedPrompt;

    const { loadedRoutes } = require('../../app/server.js');
    const categories = Object.entries(loadedRoutes || {});
    const total = categories.reduce((s, [, r]) => s + r.length, 0);

    cachedRoutes = [];
    const sections = categories.map(([cat, routes]) => {
        const desc = CATEGORY_DESC[cat] || '';
        routes.forEach(r => cachedRoutes.push(r.name));
        return `- **${cat}** (${routes.length}): ${desc} Endpoints: ${routes.map(r => r.name).join(', ')}`;
    }).join('\n');

    cachedPrompt = `Bạn là LauNa Assistant — chatbot hỗ trợ cho LauNa API v${APP_VERSION} (Node.js/Express REST hub).

Quy tắc:
- Trả lời tiếng Việt, ngắn gọn, thân thiện, đi thẳng vấn đề.
- Khi gợi ý endpoint, dùng \`backtick\` quanh path. KHÔNG bịa endpoint không có trong list.
- Nếu không chắc, nói "bạn xem /docs hoặc /api nhé".
- Format markdown nhẹ (bold, code, list).

Server:
- LauNa API v${APP_VERSION} · ${total} endpoint · ${categories.length} category
- Trang web: /, /download, /api, /docs, /openapi.json, /healthz
- Response chuẩn: {status, data, error, meta}

Endpoint theo category:
${sections}`;

    cachedAt = now;
    return cachedPrompt;
}

/* ── Endpoint extractor ──────────────────────────────────────────────────── */
function extractRelated(reply) {
    if (!cachedRoutes.length) return [];
    const found = new Set();
    for (const ep of cachedRoutes) {
        if (reply.includes(ep)) found.add(ep);
    }
    return [...found].slice(0, 5).map(ep => ({
        endpoint: ep,
        docs: `/docs#${encodeURIComponent(ep)}`
    }));
}

/* ── Build messages (vision-aware) ───────────────────────────────────────── */
function buildUserContent(prompt, imageUrl) {
    if (!imageUrl) return prompt;
    return [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageUrl } }
    ];
}

async function buildMessages(session, prompt, imageUrl) {
    const history = await loadHistory(session);
    return [
        { role: 'system', content: buildSystemPrompt() },
        ...history,
        { role: 'user', content: buildUserContent(prompt, imageUrl) }
    ];
}

/* ── AI callers ──────────────────────────────────────────────────────────── */
async function callFreeAI(messages, model, stream = false) {
    const headers = { 'Content-Type': 'application/json' };
    if (FREE_AI_KEY) headers['Authorization'] = `Bearer ${FREE_AI_KEY}`;
    const resp = await fetch(`${FREE_AI_BASE}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ messages, model, stream })
    });
    if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        throw new Error(`AI API ${resp.status}: ${txt.slice(0, 200)}`);
    }
    return resp;
}

/* ── Validation helpers ──────────────────────────────────────────────────── */
function getIp(req) {
    return (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
        || req.socket?.remoteAddress
        || 'unknown';
}

function parseQuery(req) {
    const prompt   = (req.query.prompt || '').toString().trim();
    const session  = (req.query.session || '').toString().trim() || `web-${Math.random().toString(36).slice(2, 10)}`;
    const model    = resolveModel(req.query.model);
    const image    = (req.query.image || '').toString().trim() || null;
    const reset    = req.query.reset === '1' || req.query.reset === 'true';
    return { prompt, session, model, image, reset };
}

/* ── Handlers ────────────────────────────────────────────────────────────── */
async function handleChat(req, res) {
    const { prompt, session, model, image, reset } = parseQuery(req);

    if (reset) {
        await clearHistory(`support:${session}`);
        return res.json({ status: true, data: { reply: 'Đã reset hội thoại.', session, model: 'system' } });
    }

    if (!prompt) {
        return res.status(400).json({
            status: false,
            message: "Thiếu tham số 'prompt'",
            example: '/ai/support?prompt=API nào tải tiktok&session=abc123'
        });
    }
    if (prompt.length > MAX_PROMPT) {
        return res.status(400).json({ status: false, message: `Prompt quá dài (tối đa ${MAX_PROMPT} ký tự).` });
    }

    const rlKey = `${session}|${getIp(req)}`;
    if (rateLimited(rlKey)) {
        return res.status(429).json({ status: false, message: `Quá ${RL_MAX} request/phút. Chờ chút nhé.` });
    }

    try {
        const sessKey = `support:${session}`;
        const messages = await buildMessages(sessKey, prompt, image);
        const resp = await callFreeAI(messages, model, false);
        const data = await resp.json();
        const reply = data?.choices?.[0]?.message?.content?.trim();
        if (!reply) throw new Error('AI API trả về rỗng.');

        await appendHistory(sessKey, 'user', image ? `[image:${image}] ${prompt}` : prompt);
        await appendHistory(sessKey, 'assistant', reply);

        return res.json({
            status: true,
            data: {
                reply,
                session,
                model,
                related: extractRelated(reply)
            }
        });
    } catch (e) {
        const log = require('../../utils/logger');
        log(`[AI-SUPPORT] handleChat lỗi: ${e.message}`, 'WARN');
        return res.status(500).json({ status: false, message: 'Lỗi xử lý chat AI' });
    }
}

async function handleStream(req, res) {
    const { prompt, session, model, image } = parseQuery(req);

    if (!prompt) return res.status(400).end('Thiếu prompt');
    if (prompt.length > MAX_PROMPT) return res.status(400).end('Prompt quá dài');

    const rlKey = `${session}|${getIp(req)}`;
    if (rateLimited(rlKey)) return res.status(429).end('Rate limited');

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    let full = '';
    try {
        const sessKey = `support:${session}`;
        const messages = await buildMessages(sessKey, prompt, image);
        const resp = await callFreeAI(messages, model, true);

        send('meta', { session, model });

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop() || '';
            for (const line of lines) {
                const t = line.trim();
                if (!t.startsWith('data:')) continue;
                const payload = t.slice(5).trim();
                if (payload === '[DONE]') continue;
                try {
                    const obj = JSON.parse(payload);
                    const delta = obj?.choices?.[0]?.delta?.content
                               || obj?.choices?.[0]?.message?.content
                               || '';
                    if (delta) {
                        full += delta;
                        send('delta', { text: delta });
                    }
                } catch { /* bỏ qua dòng lỗi */ }
            }
        }

        if (full) {
            await appendHistory(sessKey, 'user', image ? `[image:${image}] ${prompt}` : prompt);
            await appendHistory(sessKey, 'assistant', full);
        }
        send('done', { related: extractRelated(full) });
    } catch (e) {
        log(`[AI-SUPPORT] handleStream lỗi: ${e.message}`, 'WARN');
        send('error', { message: 'Lỗi xử lý stream AI' });
    } finally {
        res.end();
    }
}

function handleModels(req, res) {
    const aliases = {};
    for (const [alias, real] of Object.entries(MODEL_MAP)) {
        if (!aliases[real]) aliases[real] = [];
        aliases[real].push(alias);
    }
    const list = Object.entries(aliases).map(([real, alist]) => ({
        model: real,
        aliases: alist,
        default: real === DEFAULT_MODEL
    }));
    res.json({ status: true, data: { models: list, default: DEFAULT_MODEL } });
}

module.exports = {
    name: '/ai/support',
    index: handleChat,
    handleChat,
    handleStream,
    handleModels
};
