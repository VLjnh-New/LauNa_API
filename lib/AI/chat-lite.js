'use strict';

const axios = require('axios');
const { runSpace } = require('../../utils/http/hf-space');
const { shouldUseProxy, noteBlocked, tiersFor, explicitProxyFlag } = require('../../utils/ai-proxy-helper');
const { randomUA } = require('../../utils/http/browser-headers');

const BASE = 'https://qwen-qwen3-omni-demo.hf.space/';
const REFERER = 'https://taoanhdep.com/';
const FN_INDEX = 4;        // /chat_predict
const TRIGGER_ID = 38;

const EXT_MIME = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac', aac: 'audio/aac', opus: 'audio/opus',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska', avi: 'video/x-msvideo'
};

const SLOT_DEFAULT_EXT = { image: 'jpg', audio: 'mp3', video: 'mp4' };
const SLOT_INDEX = { audio: 1, image: 2, video: 3 };

function extFromUrl(url) {
    const m = String(url).split('?')[0].match(/\.([a-zA-Z0-9]{2,5})$/);
    return m ? m[1].toLowerCase() : null;
}
function extFromCt(ct) {
    if (!ct) return null;
    const c = ct.toLowerCase();
    if (c.includes('jpeg') || c.includes('jpg')) return 'jpg';
    if (c.includes('png'))  return 'png';
    if (c.includes('webp')) return 'webp';
    if (c.includes('gif'))  return 'gif';
    if (c.includes('mpeg') && c.startsWith('audio')) return 'mp3';
    if (c.includes('wav'))  return 'wav';
    if (c.includes('ogg'))  return 'ogg';
    if (c.includes('mp4')  && c.startsWith('video')) return 'mp4';
    if (c.includes('webm')) return 'webm';
    if (c.includes('quicktime')) return 'mov';
    return null;
}

async function fetchMedia(url, slot) {
    const r = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30_000,
        maxContentLength: 50 * 1024 * 1024,    // 50 MB
        validateStatus: () => true,
        headers: {
            'User-Agent': randomUA(),         // xoay UA mỗi lần tải để tránh bị chặn theo IP+UA cố định
            'Accept': '*/*',
            'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
        }
    });
    if (r.status >= 400) throw new Error(`Tải media HTTP ${r.status}`);
    const buf = Buffer.from(r.data);
    const ct  = r.headers?.['content-type'];
    const ext = extFromUrl(url) || extFromCt(ct) || SLOT_DEFAULT_EXT[slot];
    const mime = EXT_MIME[ext] || ct || 'application/octet-stream';
    return { buf, ext, ct: mime, origName: `media.${ext}` };
}

function extractText(out) {
    if (!out || !out.data) return null;
    const arr = out.data;
    if (typeof arr[0] === 'string' && arr[0].trim()) return arr[0];
    const candidates = [arr[4], arr[0], arr[1]];
    for (const list of candidates) {
        if (!Array.isArray(list) || !list.length) continue;
        for (let i = list.length - 1; i >= 0; i--) {
            const m = list[i];
            if (!m) continue;
            if (m.role === 'assistant' && typeof m.content === 'string' && m.content.trim()) return m.content;
            if (m.role === 'assistant' && Array.isArray(m.content)) {
                const txt = m.content.find(c => c?.type === 'text' && c?.text);
                if (txt) return txt.text;
            }
            if (typeof m === 'string' && m.trim()) return m;
            if (Array.isArray(m) && m.length >= 2 && typeof m[1] === 'string' && m[1].trim()) return m[1];
        }
    }
    return null;
}

module.exports = {
    name: '/ai/chat-lite',
    index: async (req, res) => {
        const { system, temperature, top_p, top_k, image_url, audio_url, video_url } = req.query;
        const q = req.query.q ? String(req.query.q).slice(0, 4000) : req.query.q;

        if (!q && !image_url && !audio_url && !video_url) {
            return res.status(400).json({
                status: false,
                message: "Cần ít nhất 'q' hoặc một trong 'image_url' / 'audio_url' / 'video_url'",
                model: 'Qwen/Qwen3-Omni-Demo (đa modal text/ảnh/audio/video — nhanh, nhẹ)',
                params: {
                    q:           'Câu hỏi / nội dung chat (có thể bỏ trống nếu chỉ gửi media để hỏi mặc định)',
                    image_url:   '(tuỳ chọn) URL ảnh — jpg/png/webp/gif',
                    audio_url:   '(tuỳ chọn) URL audio — mp3/wav/ogg/m4a/flac',
                    video_url:   '(tuỳ chọn) URL video — mp4/webm/mov',
                    system:      '(tuỳ chọn) system prompt',
                    temperature: '(tuỳ chọn) 0.0–2.0 — mặc định 0.7',
                    top_p:       '(tuỳ chọn) 0.0–1.0 — mặc định 0.95',
                    top_k:       '(tuỳ chọn) 1–100 — mặc định 50'
                },
                note: 'Mỗi lượt chỉ nhận một media (ưu tiên image > audio > video).',
                example: '/ai/chat-lite?q=Mô tả ảnh này&image_url=https://...'
            });
        }

        try {
            const temp = parseFloat(temperature);
            const tp   = parseFloat(top_p);
            const tk   = parseInt(top_k, 10);

            // Chọn 1 media (ưu tiên image > audio > video)
            let slot = null, mediaUrl = null;
            if (image_url)      { slot = 'image'; mediaUrl = image_url; }
            else if (audio_url) { slot = 'audio'; mediaUrl = audio_url; }
            else if (video_url) { slot = 'video'; mediaUrl = video_url; }

            let mediaArg;
            if (slot) {
                const m = await fetchMedia(mediaUrl, slot);
                mediaArg = { buf: m.buf, ext: m.ext, ct: m.ct, origName: m.origName };
            }

            const useProxy = await shouldUseProxy(req, explicitProxyFlag(req));
            const out = await runSpace({
                base: BASE,
                referer: REFERER,
                fnIndex: FN_INDEX,
                triggerId: TRIGGER_ID,
                tiers: tiersFor(useProxy),
                image: mediaArg,                                  // dùng kênh upload chung của runSpace
                buildData: (meta) => {
                    const data = [
                        String(q || ''),                          // 0 text
                        null,                                     // 1 audio
                        null,                                     // 2 image
                        null,                                     // 3 video
                        [],                                       // 4 history
                        String(system || ''),                     // 5 system_prompt
                        'Cherry / 芊悦',                          // 6 voice_choice (kệ vì return_audio=false)
                        Number.isFinite(temp) ? temp : 0.7,       // 7 temperature
                        Number.isFinite(tp)   ? tp   : 0.95,      // 8 top_p
                        Number.isFinite(tk)   ? tk   : 50,        // 9 top_k
                        false,                                    // 10 return_audio
                        false                                     // 11 enable_thinking
                    ];
                    if (meta && slot) data[SLOT_INDEX[slot]] = meta;
                    return data;
                },
                sseTimeoutMs: 240_000  // 4 phút (video / audio dài có thể lâu)
            });

            const text = extractText(out);
            if (!text) {
                const { sanitizeString } = require('../../utils/security/url-cloak');
                return res.status(502).json({
                    status: false,
                    model: 'Qwen3-Omni',
                    message: 'Không trích được câu trả lời từ mô hình',
                    raw_preview: sanitizeString(JSON.stringify(out.data).slice(0, 500))
                });
            }
            return res.json({
                status:    true,
                model:     'Qwen3-Omni',
                modality:  slot || 'text',
                answer:    text,
                transport: out.transport,
                viaProxy:  out.viaProxy
            });
        } catch (e) {
            noteBlocked(req, e, '/ai/chat-lite').catch(() => {});
            const log = require('../../utils/logger');
            log(`[CHAT-LITE] lỗi: ${e.message}`, 'WARN');
            return res.status(502).json({
                status: false,
                model: 'Qwen3-Omni',
                message: 'Lỗi xử lý chat',
                hint: 'Qwen3-Omni Space có thể đang ngủ hoặc bị giới hạn GPU — thử lại sau 30-60s.'
            });
        }
    }
};
