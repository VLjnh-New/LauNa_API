'use strict';

/**
 * Chuẩn hoá response JSON cho toàn hệ thống LauNa API.
 *
 *  ok(res, data, meta?)               -> 200 { status:true, data, meta? }
 *  created(res, data, meta?)          -> 201 { status:true, data, meta? }
 *  noContent(res)                     -> 204
 *  fail(res, status, message, extra?) -> { status:false, message, error:{message,status,...} }
 *  badRequest(res, message, extra?)   -> 400
 *  unauthorized(res, message?)        -> 401
 *  forbidden(res, message?)           -> 403
 *  notFound(res, resource?)           -> 404
 *  tooMany(res, retryAfter?)          -> 429
 *  serverError(res, message?, extra?) -> 500
 *  paginate(res, items, page, limit, total, extra?) -> 200 với pagination meta
 *  wrap(handler)                      -> bắt lỗi async + chuẩn hoá
 */

function ok(res, data, meta) {
    const body = { status: true, data };
    if (meta) body.meta = meta;
    return res.status(200).json(body);
}

function created(res, data, meta) {
    const body = { status: true, data };
    if (meta) body.meta = meta;
    return res.status(201).json(body);
}

function noContent(res) {
    return res.status(204).end();
}

function fail(res, status, message, extra) {
    const body = {
        status: false,
        message: String(message || 'Lỗi không xác định'),
        error: Object.assign({ message: String(message || 'Lỗi không xác định'), status }, extra || {})
    };
    return res.status(status).json(body);
}

function badRequest(res, message, extra) {
    return fail(res, 400, message || 'Yêu cầu không hợp lệ', extra);
}

function unauthorized(res, message) {
    return fail(res, 401, message || 'Thiếu hoặc sai API key');
}

function forbidden(res, message) {
    return fail(res, 403, message || 'Không có quyền truy cập');
}

function notFound(res, resource) {
    return fail(res, 404, resource ? `${resource} không tồn tại` : 'Không tìm thấy');
}

function tooMany(res, retryAfter) {
    const body = {
        status: false,
        message: `Quá nhiều yêu cầu${retryAfter ? `. Thử lại sau ${retryAfter}s` : ''}`,
        error: { message: 'Rate limit exceeded', status: 429 }
    };
    if (retryAfter) res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json(body);
}

function serverError(res, message, extra) {
    return fail(res, 500, message || 'Lỗi máy chủ nội bộ', extra);
}

function paginate(res, items, page, limit, total, extra) {
    const totalPages = Math.ceil(total / limit);
    return res.status(200).json({
        status: true,
        data: items,
        meta: {
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1,
            ...extra
        }
    });
}

function wrap(handler) {
    return function (req, res, next) {
        Promise.resolve()
            .then(() => handler(req, res, next))
            .catch(next);
    };
}

module.exports = { ok, created, noContent, fail, badRequest, unauthorized, forbidden, notFound, tooMany, serverError, paginate, wrap };
