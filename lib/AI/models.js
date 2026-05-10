'use strict';

const { MODEL_MAP, MODEL_LABELS, DEFAULT_MODEL } = require('./chat');

module.exports = {
    name: "/ai/models",
    index: (req, res) => {
        const uniqueModels = {};
        for (const [alias, modelId] of Object.entries(MODEL_MAP)) {
            if (!uniqueModels[modelId]) {
                uniqueModels[modelId] = {
                    id:      modelId,
                    label:   MODEL_LABELS[modelId] || modelId,
                    aliases: [],
                    default: modelId === DEFAULT_MODEL,
                };
            }
            uniqueModels[modelId].aliases.push(alias);
        }

        return res.status(200).json({
            status:   true,
            provider: 'LauNa-AI',
            default:  DEFAULT_MODEL,
            models:   Object.values(uniqueModels),
            endpoints: {
                chat:         "/ai/chat?prompt=...&model=...",
                chat_session: "/ai/chat/session?prompt=...&session=...&model=...",
            },
        });
    },
};
