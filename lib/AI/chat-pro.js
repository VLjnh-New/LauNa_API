'use strict';

const { runSpace } = require('../../utils/http/hf-space');
const { shouldUseProxy, noteBlocked, tiersFor, explicitProxyFlag } = require('../../utils/ai-proxy-helper');

const BASE       = 'https://minimaxai-minimax-text-01.hf.space/';
const REFERER    = 'https://taoanhdep.com/';
const FN_INDEX   = 16;          // chat
const TRIGGER_ID = 9;
const MODEL_LABEL = 'MiniMax-Text-01 (456B MoE, 45.9B active, context 1M tokens)';

function extractText(out) {
    if (!out || !Array.isArray(out.data) || !out.data.length) return null;
    const v = out.data[0];
    if (typeof v === 'string' && v.trim()) return v.trim();
    return null;
}

module.exports = {
    name: '/ai/chat-pro',
    index: async (req, res) => {
        const { max_tokens, temperature, top_p } = req.query;
        const q = req.query.q ? String(req.query.q).slice(0, 8000) : req.query.q;

        if (!q) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'q'",
                model: MODEL_LABEL,
                params: {
                    q:           'Câu hỏi / nội dung chat',
                    max_tokens:  '(tuỳ chọn) số token tối đa cho câu trả lời (1–32768) — mặc định 4096',
                    temperature: '(tuỳ chọn) 0.1–1.0 — mặc định 0.3',
                    top_p:       '(tuỳ chọn) 0.1–1.0 — mặc định 0.9'
                },
                note: 'MiniMax-Text-01 mạnh ở suy luận, dịch, lập trình, văn bản dài (đến 1 triệu token).',
                example: '/ai/chat-pro?q=Vi%E1%BA%BFt%20m%E1%BB%99t%20%C4%91o%E1%BA%A1n%20gi%E1%BA%A3i%20th%C3%ADch%20thuy%E1%BA%BFt%20t%C6%B0%C6%A1ng%20%C4%91%E1%BB%91i'
            });
        }

        try {
            const tokens = parseInt(max_tokens, 10);
            const temp   = parseFloat(temperature);
            const tp     = parseFloat(top_p);

            const useProxy = await shouldUseProxy(req, explicitProxyFlag(req));
            const out = await runSpace({
                base: BASE,
                referer: REFERER,
                fnIndex: FN_INDEX,
                triggerId: TRIGGER_ID,
                tiers: tiersFor(useProxy),
                buildData: () => [
                    String(q),                                              // 0 message
                    [],                                                     // 1 state (lịch sử rỗng)
                    Number.isFinite(tokens) ? Math.min(Math.max(tokens, 1), 32768) : 4096,  // 2 max_tokens
                    Number.isFinite(temp)   ? Math.min(Math.max(temp,  0.1), 1) : 0.3,     // 3 temperature
                    Number.isFinite(tp)     ? Math.min(Math.max(tp,    0.1), 1) : 0.9      // 4 top_p
                ],
                sseTimeoutMs: 240_000   // 4 phút (bài dài / suy luận sâu)
            });

            const text = extractText(out);
            if (!text) {
                const { sanitizeString } = require('../../utils/security/url-cloak');
                return res.status(502).json({
                    status: false,
                    model: MODEL_LABEL,
                    message: 'Không trích được câu trả lời từ mô hình',
                    raw_preview: sanitizeString(JSON.stringify(out.data).slice(0, 500))
                });
            }

            return res.json({
                status:    true,
                model:     'MiniMax-Text-01',
                answer:    text,
                transport: out.transport,
                viaProxy:  out.viaProxy
            });
        } catch (e) {
            noteBlocked(req, e, '/ai/chat-pro').catch(() => {});
            const log = require('../../utils/logger');
            log(`[CHAT-PRO] lỗi: ${e.message}`, 'WARN');
            return res.status(502).json({
                status: false,
                model: MODEL_LABEL,
                message: 'Lỗi xử lý chat',
                hint: 'MiniMax Space có thể đang bị giới hạn GPU — thử lại sau 30-60s.'
            });
        }
    }
};
