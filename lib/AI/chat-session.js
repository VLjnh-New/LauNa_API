'use strict';

const { callPollinations, MODEL_MAP, MODEL_LABELS, DEFAULT_MODEL } = require('./chat');
const { shouldUseProxy } = require('../../utils/ai-proxy-helper');

const MAX_HISTORY = 20;
const sessions    = new Map();

function getHistory(sessionId) {
    return sessions.get(sessionId) || [];
}

function clearHistory(sessionId) {
    sessions.delete(sessionId);
}

function addTurn(sessionId, userMsg, assistantMsg) {
    const hist = sessions.get(sessionId) || [];
    hist.push({ role: 'user',      content: userMsg });
    hist.push({ role: 'assistant', content: assistantMsg });
    if (hist.length > MAX_HISTORY * 2) hist.splice(0, 2);
    sessions.set(sessionId, hist);
}

module.exports = {
    name: "/ai/chat/session",
    index: async (req, res) => {
        const prompt     = req.query.prompt;
        const session    = req.query.session || 'default';
        const modelAlias = (req.query.model || '').toLowerCase();
        const action     = req.query.action || '';
        const explicit   = req.query.proxy === '1' || req.query.proxy === 'true';
        const useProxy   = await shouldUseProxy(req, explicit);

        if (action === 'clear') {
            clearHistory(session);
            return res.status(200).json({
                status:  true,
                message: `Đã xoá lịch sử session '${session}'`,
            });
        }

        if (action === 'history') {
            const hist = getHistory(session);
            return res.status(200).json({
                status:  true,
                session,
                turns:   Math.floor(hist.length / 2),
                history: hist,
            });
        }

        if (!prompt) {
            return res.status(400).json({
                status:  false,
                message: "Thiếu tham số 'prompt'",
                example: "/ai/chat/session?prompt=Xin chào&session=user123&model=gpt4o",
                actions: {
                    clear:   "/ai/chat/session?action=clear&session=user123",
                    history: "/ai/chat/session?action=history&session=user123",
                },
                models: {
                    "gpt / mini / 4omini":      "GPT-4o Mini (mặc định)",
                    "gpt4o / 4o / large":       "GPT-4o",
                    "claude / claude35":        "Claude",
                    "llama / llama3":           "Llama 3",
                    "mistral":                  "Mistral",
                    "deepseek":                 "DeepSeek",
                    "deepseekr1 / deepseek-r1": "DeepSeek R1",
                    "qwen":                     "Qwen",
                },
            });
        }

        const resolvedModel = MODEL_MAP[modelAlias] || modelAlias || DEFAULT_MODEL;
        const modelLabel    = MODEL_LABELS[resolvedModel] || resolvedModel;

        const history = getHistory(session);
        const messages = [...history, { role: 'user', content: prompt }];

        try {
            const reply = await callPollinations(messages, resolvedModel, useProxy);
            addTurn(session, prompt, reply);
            const updated = getHistory(session);
            return res.status(200).json({
                status:  true,
                session,
                model:   modelLabel,
                turns:   Math.floor(updated.length / 2),
                proxy:   useProxy,
                prompt,
                result:  reply,
            });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[CHAT-SESSION] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({
                status:  false,
                message: 'Lỗi xử lý chat session',
            });
        }
    },
};
