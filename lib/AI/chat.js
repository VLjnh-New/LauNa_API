'use strict';

const axios = require('axios');
const { shouldUseProxy, noteBlocked } = require('../../utils/ai-proxy-helper');

const BASE_URL = 'https://text.pollinations.ai/openai';

const MODEL_MAP = {
    openai:         'openai',
    gpt:            'openai',
    mini:           'openai',
    '4omini':       'openai',
    gpt4omini:      'openai',
    'openai-large': 'openai-large',
    large:          'openai-large',
    gpt4o:          'openai-large',
    '4o':           'openai-large',
    claude:         'claude-hybridspace',
    claude35:       'claude-hybridspace',
    claude3:        'claude-hybridspace',
    llama:          'llama',
    llama3:         'llama',
    mistral:        'mistral',
    deepseek:       'deepseek',
    deepseekr1:     'deepseek-r1',
    'deepseek-r1':  'deepseek-r1',
    qwen:           'qwen',
    qwen7b:         'qwen',
};

const MODEL_LABELS = {
    'openai':             'GPT-4o Mini',
    'openai-large':       'GPT-4o',
    'claude-hybridspace': 'Claude',
    'llama':              'Llama 3',
    'mistral':            'Mistral',
    'deepseek':           'DeepSeek',
    'deepseek-r1':        'DeepSeek R1',
    'qwen':               'Qwen',
};

const DEFAULT_MODEL = 'openai';

async function callPollinations(messages, model = DEFAULT_MODEL, useProxy = false) {
    const config = {
        method:  'post',
        url:     BASE_URL,
        data:    { model, messages },
        timeout: 30_000,
        headers: { 'Content-Type': 'application/json', 'User-Agent': require('../../utils/http/browser-headers').randomUA() },
    };

    const res = (useProxy && global.proxyPool)
        ? await global.proxyPool.axios(config)
        : await axios(config);

    const content = res.data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('Không nhận được phản hồi từ AI');
    return content;
}

module.exports = {
    name: "/ai/chat",
    MODEL_MAP,
    MODEL_LABELS,
    DEFAULT_MODEL,
    callPollinations,
    index: async (req, res) => {
        const prompt      = req.query.prompt;
        const modelAlias  = (req.query.model || '').toLowerCase();
        const explicit    = req.query.proxy === '1' || req.query.proxy === 'true';
        const useProxy    = await shouldUseProxy(req, explicit);

        if (!prompt) {
            return res.status(400).json({
                status:  false,
                message: "Thiếu tham số 'prompt'",
                example: "/ai/chat?prompt=Xin chào&model=gpt4o",
                models: {
                    "gpt / mini / 4omini":    "GPT-4o Mini (mặc định)",
                    "gpt4o / 4o / large":     "GPT-4o",
                    "claude / claude35":      "Claude",
                    "llama / llama3":         "Llama 3",
                    "mistral":                "Mistral",
                    "deepseek":               "DeepSeek",
                    "deepseekr1 / deepseek-r1": "DeepSeek R1",
                    "qwen":                   "Qwen",
                },
            });
        }

        const resolvedModel = MODEL_MAP[modelAlias] || modelAlias || DEFAULT_MODEL;
        const modelLabel    = MODEL_LABELS[resolvedModel] || resolvedModel;

        try {
            const reply = await callPollinations(
                [{ role: 'user', content: prompt }],
                resolvedModel,
                useProxy,
            );
            return res.status(200).json({
                status: true,
                model:  modelLabel,
                prompt,
                proxy:  useProxy,
                result: reply,
            });
        } catch (e) {
            noteBlocked(req, e, '/ai/chat').catch(() => {});
            const log = require('../../utils/logger');
            log(`[AI-CHAT] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({
                status:  false,
                message: 'Lỗi xử lý chat AI',
            });
        }
    },
};
