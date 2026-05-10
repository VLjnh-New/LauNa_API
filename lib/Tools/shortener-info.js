'use strict';

/**
 * /shortener/info — Xem chi tiết short URL (clicks, target, ngày tạo).
 * Tách file riêng vì auto-loader 1 file = 1 route.
 */

const main = require('./shortener');

module.exports = {
    name: '/shortener/info',
    index: main._info
};
