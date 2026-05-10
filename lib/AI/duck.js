'use strict';

const { duckFetch } = require('./duck-core');
const log           = require('../../utils/logger');

// ─── Per-model config ─────────────────────────────────────────────────────────
const MODEL_CONFIG = {
    'gpt-5-mini':                                        { canUseTools: true,  reasoningEffort: 'minimal' },
    'gpt-4o-mini':                                       { canUseTools: true,  reasoningEffort: null      },
    'gpt-4o':                                            { canUseTools: true,  reasoningEffort: null      },
    'tinfoil/gpt-oss-120b':                              { canUseTools: false, reasoningEffort: 'low'     },
    'claude-haiku-4-5':                                  { canUseTools: true,  reasoningEffort: 'none'    },
    'claude-sonnet-4-5':                                 { canUseTools: true,  reasoningEffort: null      },
    'meta-llama/Llama-4-Scout-17B-16E-Instruct':         { canUseTools: false, reasoningEffort: null      },
    'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8': { canUseTools: false, reasoningEffort: null      },
    'mistral-small-2603':                                { canUseTools: false, reasoningEffort: null      },
    'o4-mini':                                           { canUseTools: true,  reasoningEffort: 'low'     },
};

// ─── Aliases ──────────────────────────────────────────────────────────────────
const MODEL_MAP = {
    'gpt5': 'gpt-5-mini', 'gpt-5': 'gpt-5-mini', '5': 'gpt-5-mini', 'g5': 'gpt-5-mini',
    '4o': 'gpt-4o', 'gpt4o': 'gpt-4o',
    'gpt': 'gpt-4o-mini', 'mini': 'gpt-4o-mini', '4omini': 'gpt-4o-mini',
    'oss': 'tinfoil/gpt-oss-120b', 'gptoss': 'tinfoil/gpt-oss-120b', '120b': 'tinfoil/gpt-oss-120b',
    'claude': 'claude-haiku-4-5', 'haiku': 'claude-haiku-4-5',
    'sonnet': 'claude-sonnet-4-5',
    'llama': 'meta-llama/Llama-4-Scout-17B-16E-Instruct',
    'llama4': 'meta-llama/Llama-4-Scout-17B-16E-Instruct',
    'scout': 'meta-llama/Llama-4-Scout-17B-16E-Instruct',
    'maverick': 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
    'mistral': 'mistral-small-2603', 'mix': 'mistral-small-2603',
    'o4': 'o4-mini', 'o4mini': 'o4-mini',
};

const MODEL_LABELS = {
    'gpt-5-mini':                                        'GPT-5 Mini',
    'gpt-4o':                                            'GPT-4o',
    'gpt-4o-mini':                                       'GPT-4o Mini',
    'tinfoil/gpt-oss-120b':                              'GPT OSS 120B',
    'claude-haiku-4-5':                                  'Claude Haiku 4.5',
    'claude-sonnet-4-5':                                 'Claude Sonnet 4.5',
    'meta-llama/Llama-4-Scout-17B-16E-Instruct':         'Llama 4 Scout 17B',
    'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8': 'Llama 4 Maverick 17B',
    'mistral-small-2603':                                'Mistral Small 4',
    'o4-mini':                                           'o4-mini',
};

const DEFAULT_MODEL = 'gpt-4o-mini';

// ─── Parse SSE → text ─────────────────────────────────────────────────────────
function parseSse(raw) {
    let text = '';
    for (const line of raw.split('\n')) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const chunk = t.slice(5).trim();
        if (chunk === '[DONE]') break;
        try {
            const obj = JSON.parse(chunk);
            const part = obj?.message ?? obj?.choices?.[0]?.delta?.content ?? obj?.delta?.text ?? '';
            if (part) text += part;
        } catch {}
    }
    return text.trim();
}

// ─── duckChat ─────────────────────────────────────────────────────────────────
async function duckChat(messages, model = DEFAULT_MODEL) {
    const cfg = MODEL_CONFIG[model] ?? { canUseTools: true, reasoningEffort: null };

    const body = {
        model,
        messages,
        canUseTools:          cfg.canUseTools,
        canUseApproxLocation: null,
        metadata: cfg.canUseTools
            ? { toolChoice: { NewsSearch: false, VideosSearch: false, LocalSearch: false, WeatherForecast: false } }
            : undefined,
    };
    if (body.metadata === undefined) delete body.metadata;
    if (cfg.reasoningEffort !== null) body.reasoningEffort = cfg.reasoningEffort;

    const raw = await duckFetch({ path: '/duckchat/v1/chat', body });
    const text = parseSse(raw);
    if (!text) throw new Error('Duck.ai trả về nội dung rỗng.');
    return text;
}

// ─── Route ────────────────────────────────────────────────────────────────────
module.exports = {
    name:   '/ai/duck',
    params: ['prompt', 'model'],

    index: async (req, res) => {
        const prompt     = req.query.prompt;
        const modelAlias = (req.query.model || '').toLowerCase().trim();

        if (!prompt) {
            return res.status(400).json({
                status:  false,
                message: "Thiếu tham số 'prompt'",
                params: { prompt: 'Câu hỏi', model: '(tuỳ chọn)' },
                models: {
                    'gpt / mini':    'GPT-4o Mini ✓ (mặc định)',
                    'gpt5 / 5':      'GPT-5 Mini ✓',
                    'oss / 120b':    'GPT OSS 120B ✓',
                    'claude / haiku':'Claude Haiku 4.5 ✓',
                    'llama / scout': 'Llama 4 Scout 17B ✓',
                    'mistral / mix': 'Mistral Small 4 ✓',
                    '4o':            'GPT-4o',
                    'sonnet':        'Claude Sonnet 4.5',
                    'maverick':      'Llama 4 Maverick',
                    'o4':            'o4-mini',
                },
                note: 'Không cần tài khoản — reverse từ duck.ai. 2-domain + proxy rotation tự động.',
            });
        }

        const model = MODEL_MAP[modelAlias] || modelAlias || DEFAULT_MODEL;
        const label = MODEL_LABELS[model] || model;

        try {
            const answer = await duckChat([{ role: 'user', content: prompt }], model);
            return res.json({ status: true, model: label, prompt, result: answer });
        } catch (e) {
            log(`[DUCK-AI] ${model}: ${e.message}`, 'WARN');
            return res.status(502).json({ status: false, message: e.message });
        }
    },
};
