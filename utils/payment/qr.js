'use strict';

/**
 * Sinh URL ảnh QR cho VietinBank và MoMo cá nhân.
 *
 * Dùng vietqr.io cho cả hai — cùng một format VietQR chuẩn EMV/NAPAS,
 * quét được bằng MỌI app ngân hàng + ví MoMo, tự fill số tiền + nội dung.
 *
 * BIN code:
 *   - VietinBank: 970415
 *   - MoMo (CTCP DV Di Động Trực Tuyến / M_Service): 971025
 *     (MoMo đã chính thức tham gia NAPAS — VietQR routing tới ví MoMo
 *     bằng SĐT làm số tài khoản).
 */

const VIETQR_BASE = 'https://img.vietqr.io/image';
const VIETIN_BIN  = '970415';
const MOMO_BIN    = '971025';
const TEMPLATE    = 'compact2'; // có sẵn logo + thông tin đẹp

function buildVietQR({ bin, account, name, amount, note }) {
    const acc  = encodeURIComponent(name || '');
    const info = encodeURIComponent(note || '');
    const amt  = amount ? `&amount=${Number(amount)}` : '';
    return `${VIETQR_BASE}/${bin}-${account}-${TEMPLATE}.png?addInfo=${info}&accountName=${acc}${amt}`;
}

function buildVietinQR({ stk, name, amount, note }) {
    return buildVietQR({ bin: VIETIN_BIN, account: stk, name, amount, note });
}

function buildMomoQR({ phone, name, amount, note }) {
    const account = String(phone || '').replace(/\D/g, ''); // chỉ giữ số
    return buildVietQR({ bin: MOMO_BIN, account, name, amount, note });
}

module.exports = { buildVietinQR, buildMomoQR };
