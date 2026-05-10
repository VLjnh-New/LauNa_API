'use strict';

/**
 * Shared admin-check helpers — dùng chung cho tất cả route.
 * Tập trung tại đây, tránh nhân bản isAdmin() ở nhiều file.
 */

const { isAdminKey, isAdminReq } = require('./apikey');

module.exports = { isAdminKey, isAdminReq };
