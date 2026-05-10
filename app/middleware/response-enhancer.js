'use strict';

/**
 * Response Enhancer Middleware
 *
 * Tự động inject vào MỌI JSON response:
 *   - ts         : ISO timestamp của response
 *   - ms         : thời gian xử lý (milliseconds)
 *   - requestId  : UUID ngắn (8 ký tự hex) để trace log
 *
 * Headers thêm vào mọi response:
 *   - X-Request-ID    : requestId
 *   - X-Response-Time : "42ms"
 *   - X-API-Version   : phiên bản API từ package.json
 *
 * Normalize error format:
 *   {status:false, message:"..."} → {status:false, message:"...", error:{...}}
 */

const { version } = require('../../package.json');
const { randomBytes } = require('crypto');

function makeRequestId() {
    return randomBytes(4).toString('hex');
}

function enhancer(req, res, next) {
    const startedAt = Date.now();
    req.requestId = makeRequestId();
    req.startedAt = startedAt;

    res.setHeader('X-Request-ID', req.requestId);
    res.setHeader('X-API-Version', version);

    const originalJson = res.json.bind(res);

    res.json = function enhancedJson(body) {
        const ms = Date.now() - startedAt;
        res.setHeader('X-Response-Time', `${ms}ms`);

        if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
            const isError = body.status === false;

            body.ts = new Date().toISOString();
            body.ms = ms;
            body.requestId = req.requestId;

            if (isError && body.message && !body.error) {
                body.error = {
                    message: body.message,
                    status: res.statusCode >= 400 ? res.statusCode : 400
                };
            }
        }

        return originalJson(body);
    };

    next();
}

module.exports = enhancer;
