'use strict';

// ─── Port routing ────────────────────────────────────────────────────────────
// Trên Render (và bất kỳ hosting nào set $PORT), Mini Shield nắm cổng public.
// LauNa luôn chạy nội bộ ở 127.0.0.1:LAUNA_PORT, được proxy qua Mini Shield.
// Khi chạy local (Replit/dev), nếu không set PORT thì shield mặc định = 5000.

const PUBLIC_PORT = Number(process.env.PORT) || 5000;
const LAUNA_PORT  = Number(process.env.LAUNA_PORT) || 5050;

if (PUBLIC_PORT === LAUNA_PORT) {
    throw new Error(
        `PORT (${PUBLIC_PORT}) trùng LAUNA_PORT (${LAUNA_PORT}). ` +
        `Đặt LAUNA_PORT khác PORT để Mini Shield và LauNa không tranh cổng.`
    );
}

// Buộc LauNa bind nội bộ TRƯỚC khi config-loader đọc env.
process.env.PORT = String(LAUNA_PORT);
process.env.HOST = '127.0.0.1';

// Khởi động LauNa (Express app)
require('./utils/config-loader');
require('./app/main.js');

// Khởi động Mini Shield ở cổng public, proxy về LauNa nội bộ.
const { startShield } = require('./shield');
startShield({
    port: PUBLIC_PORT,
    upstream: `http://127.0.0.1:${LAUNA_PORT}`,
});
