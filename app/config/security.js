'use strict';

module.exports = {
    htmlCachePaths: ['/', '/health', '/download', '/api', '/fb-login'],

    heavyTimeoutPrefixes: ['/ai/', '/download/', '/music/', '/tools/reg/'],

    turnstilePaths: ['/api/Note/sharefile', '/download/all'],

    ssrfPaths: ['/download', '/music', '/tools', '/gemini', '/ai', '/img-tool'],

    rateLimits: [
        {
            paths: ['/challenge'],
            windowMs: 60_000,
            max: 15,
            name: 'challenge',
            message: 'Quá nhiều lần thử captcha. Thử lại sau 1 phút.'
        },
        {
            paths: ['/img-tool'],
            windowMs: 60_000,
            max: 30,
            name: 'img-tool',
            message: 'Quá nhiều yêu cầu xử lý ảnh. Thử lại sau 1 phút.'
        },
        {
            paths: ['/shortener/create'],
            windowMs: 60_000,
            max: 20,
            name: 'shortener-create',
            message: 'Quá nhiều yêu cầu tạo link. Thử lại sau 1 phút.'
        }
    ],

    aiRateLimits: {
        heavy: {
            windowMs: 60_000,
            max: 10,
            name: 'ai-heavy',
            message: 'Quá nhiều yêu cầu AI. Thử lại sau 1 phút.',
            paths: [
                '/ai/capcut-edit', '/ai/faceswap', '/ai/anime-xl', '/ai/anime2real',
                '/ai/mo-rong', '/ai/nang-cap', '/ai/nang-cap-2', '/ai/lam-dep', '/ai/lam-net',
                '/ai/khoi-phuc', '/ai/net-anh-anime', '/ai/xoa-nen-ai', '/ai/xoa-nen',
                '/ai/text-to-video', '/ai/text-to-video-pro', '/ai/qwen-edit'
            ]
        },
        medium: {
            windowMs: 60_000,
            max: 20,
            name: 'ai-med',
            message: 'Quá nhiều yêu cầu AI. Thử lại sau 1 phút.',
            paths: ['/ai/tao-anh', '/ai/nsfw-check', '/ai/voice', '/gemini/vision']
        }
    }
};
