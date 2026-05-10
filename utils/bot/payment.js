'use strict';

/**
 * Bot handlers cho luồng thanh toán: /buy, /myorders, /orders, /approve, /reject,
 * /payment_setup. Tách module để telegram-bot.js gọn.
 *
 * Sử dụng:
 *   const payment = require('./bot/payment');
 *   payment.register(bot, { isAdmin, loadKeys, saveKeys, escapeHtml,
 *                            genApiKey, notifyAdmins, log });
 */

const { Markup } = require('telegraf');
const { listPlans, getPlan, fmtVND } = require('../payment/plans');
const { buildVietinQR, buildMomoQR } = require('../payment/qr');
const orders = require('../payment/orders');
const pcfg = require('../payment/payment-config');

// ────────────── State chờ admin nhập text ──────────────

const waitMap = new Map(); // chatId -> { mode, args, ts }
function setWait(chatId, mode, args) { waitMap.set(chatId, { mode, args: args || {}, ts: Date.now() }); }
function getWait(chatId) {
    const w = waitMap.get(chatId);
    if (!w) return null;
    if (Date.now() - w.ts > 5 * 60 * 1000) { waitMap.delete(chatId); return null; }
    return w;
}
function clearWait(chatId) { waitMap.delete(chatId); }

// ────────────── Screens ──────────────

function screenPlans() {
    const text =
        '<b>💎 Bảng giá API LauNa</b>\n\n' +
        'Chọn gói bạn muốn mua bên dưới.\n' +
        'Sau khi chuyển khoản, admin sẽ duyệt trong vài phút và gửi key về đây.';
    const rows = listPlans().map(p => [
        Markup.button.callback(`💎 ${p.name} — ${fmtVND(p.price)}`, `plan_${p.id}`)
    ]);
    rows.push([Markup.button.callback('📋 Đơn của tôi', 'myorders')]);
    return { text, ...Markup.inlineKeyboard(rows) };
}

function screenChoosePay(plan) {
    const cfg = pcfg.get();
    const text =
        `<b>💳 Chọn cổng thanh toán</b>\n\n` +
        `Gói: <b>${plan.name}</b>\n` +
        `Số tiền: <b>${fmtVND(plan.price)}</b>\n\n` +
        `Chọn cổng bạn muốn dùng:`;
    const rows = [];
    if (cfg.vietinbank.stk) rows.push([Markup.button.callback('🏦 VietinBank (QR)', `pay_vietinbank_${plan.id}`)]);
    if (cfg.momo.phone)     rows.push([Markup.button.callback('💜 MoMo (QR)',       `pay_momo_${plan.id}`)]);
    if (!rows.length) {
        return {
            text: '⚠️ Admin chưa cấu hình tài khoản nhận tiền. Vui lòng thử lại sau.',
            ...Markup.inlineKeyboard([[Markup.button.callback('« Quay lại', 'buy')]])
        };
    }
    rows.push([Markup.button.callback('« Quay lại', 'buy')]);
    return { text, ...Markup.inlineKeyboard(rows) };
}

function captionVietin(order, cfg) {
    return (
        `<b>🏦 Chuyển khoản VietinBank</b>\n\n` +
        `📦 Mã đơn: <code>${order.id}</code>\n` +
        `💰 Số tiền: <b>${fmtVND(order.amount)}</b>\n` +
        `🏦 STK: <code>${cfg.vietinbank.stk}</code>\n` +
        `👤 Chủ TK: <b>${cfg.vietinbank.name || '(chưa cấu hình tên)'}</b>\n` +
        `📝 Nội dung CK: <code>${order.id}</code>\n\n` +
        `⏰ Đơn hết hạn lúc: ${fmtTime(order.expiresAt)}\n\n` +
        `<i>Quét QR bằng app ngân hàng bất kỳ. Sau khi chuyển xong, bấm nút bên dưới.</i>`
    );
}

function captionMomo(order, cfg) {
    return (
        `<b>💜 Chuyển khoản MoMo</b>\n\n` +
        `📦 Mã đơn: <code>${order.id}</code>\n` +
        `💰 Số tiền: <b>${fmtVND(order.amount)}</b>\n` +
        `📱 SĐT MoMo: <code>${cfg.momo.phone}</code>\n` +
        `👤 Chủ ví: <b>${cfg.momo.name || '(chưa cấu hình tên)'}</b>\n` +
        `📝 Nội dung CK: <code>${order.id}</code>\n\n` +
        `⏰ Đơn hết hạn lúc: ${fmtTime(order.expiresAt)}\n\n` +
        `<i>Quét QR bằng app MoMo, hoặc mở MoMo → Chuyển tiền → nhập SĐT trên.</i>\n` +
        `<i>⚠️ Nhớ ghi nội dung CK đúng mã đơn để admin duyệt nhanh.</i>`
    );
}

function payActionsKb(orderId) {
    return Markup.inlineKeyboard([
        [Markup.button.callback('✅ Tôi đã chuyển khoản', `paid_${orderId}`)],
        [Markup.button.callback('❌ Huỷ đơn',            `cancel_${orderId}`)]
    ]);
}

function fmtTime(iso) {
    return new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
}

function fmtStatus(s) {
    return ({
        pending:   '🕒 Chờ thanh toán',
        user_paid: '⏳ Chờ admin duyệt',
        approved:  '✅ Đã duyệt',
        rejected:  '❌ Bị từ chối',
        expired:   '⌛ Hết hạn'
    })[s] || s;
}

function screenMyOrders(telegramId) {
    const list = orders.listByUser(telegramId, 10);
    if (!list.length) {
        return {
            text: '<b>📋 Đơn của tôi</b>\n\n<i>Bạn chưa có đơn nào.</i>',
            ...Markup.inlineKeyboard([[Markup.button.callback('💎 Mua key', 'buy')]])
        };
    }
    const lines = list.map((o, i) => {
        const tail = o.status === 'approved' && o.apiKey
            ? `\n   🔑 <code>${o.apiKey}</code>`
            : (o.status === 'rejected' && o.rejectReason ? `\n   📝 ${escHtml(o.rejectReason)}` : '');
        return `${i + 1}. <code>${o.id}</code> · ${fmtStatus(o.status)} · ${fmtVND(o.amount)}${tail}`;
    }).join('\n\n');
    return {
        text: `<b>📋 Đơn của tôi (${list.length})</b>\n\n${lines}`,
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Làm mới', 'myorders'), Markup.button.callback('💎 Mua thêm', 'buy')]
        ])
    };
}

function screenAdminOrders() {
    const list = orders.listPending(20);
    if (!list.length) {
        return {
            text: '<b>📥 Đơn chờ duyệt</b>\n\n✅ Không có đơn nào đang chờ.',
            ...Markup.inlineKeyboard([[Markup.button.callback('🔄', 'orders_refresh')]])
        };
    }
    const lines = list.map((o, i) => {
        const who = o.telegramUsername ? `@${escHtml(o.telegramUsername)}` : `id ${o.telegramId}`;
        const flag = o.status === 'user_paid' ? '🔔' : '⏳';
        return `${i + 1}. ${flag} <code>${o.id}</code> · ${fmtVND(o.amount)} · ${o.channel} · ${who}\n` +
               `   ${escHtml(o.planName)} · ${fmtStatus(o.status)}`;
    }).join('\n\n');
    const rows = list.slice(0, 10).map(o => ([
        Markup.button.callback(`✅ ${o.id}`, `aprv_${o.id}`),
        Markup.button.callback(`❌ ${o.id}`, `rjct_${o.id}`)
    ]));
    rows.push([Markup.button.callback('🔄 Làm mới', 'orders_refresh')]);
    return {
        text: `<b>📥 Đơn chờ duyệt (${list.length})</b>\n\n${lines}`,
        ...Markup.inlineKeyboard(rows)
    };
}

function screenPaymentSetup() {
    const c = pcfg.get();
    const text =
        `<b>⚙️ Cấu hình tài khoản nhận tiền</b>\n\n` +
        `🏦 <b>VietinBank</b>\n` +
        `   STK: <code>${escHtml(c.vietinbank.stk || '(chưa)')}</code>\n` +
        `   Tên: <b>${escHtml(c.vietinbank.name || '(chưa)')}</b>\n\n` +
        `💜 <b>MoMo</b>\n` +
        `   SĐT: <code>${escHtml(c.momo.phone || '(chưa)')}</code>\n` +
        `   Tên: <b>${escHtml(c.momo.name || '(chưa)')}</b>\n\n` +
        `<i>Bấm nút bên dưới để cập nhật. Có thể đổi bất cứ lúc nào.</i>`;
    return {
        text,
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🏦 Sửa VietinBank', 'pcfg_set_vtb')],
            [Markup.button.callback('💜 Sửa MoMo',        'pcfg_set_momo')]
        ])
    };
}

function escHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ────────────── Register handlers ──────────────

/**
 * Đăng ký với bot (Telegraf instance).
 * helpers: { isAdmin, loadKeys, saveKeys, genApiKey, notifyAdmins, log,
 *            ADMIN_USERNAMES }
 */
function register(b, helpers) {
    const { isAdmin, loadKeys, saveKeys, genApiKey, notifyAdmins, log } = helpers;

    // ── /buy & /plans ──
    b.command(['buy', 'plans'], async (ctx) => {
        const s = screenPlans();
        return ctx.replyWithHTML(s.text, { reply_markup: s.reply_markup, disable_web_page_preview: true });
    });

    b.command('myorders', async (ctx) => {
        const s = screenMyOrders(ctx.from.id);
        return ctx.replyWithHTML(s.text, { reply_markup: s.reply_markup, disable_web_page_preview: true });
    });

    b.action('buy', async (ctx) => {
        await ctx.answerCbQuery();
        const s = screenPlans();
        try { await ctx.editMessageText(s.text, { parse_mode: 'HTML', reply_markup: s.reply_markup, disable_web_page_preview: true }); }
        catch { await ctx.replyWithHTML(s.text, { reply_markup: s.reply_markup }); }
    });

    b.action('myorders', async (ctx) => {
        await ctx.answerCbQuery();
        const s = screenMyOrders(ctx.from.id);
        try { await ctx.editMessageText(s.text, { parse_mode: 'HTML', reply_markup: s.reply_markup }); }
        catch { await ctx.replyWithHTML(s.text, { reply_markup: s.reply_markup }); }
    });

    // ── Chọn gói ──
    b.action(/^plan_([a-zA-Z0-9_]+)$/, async (ctx) => {
        const plan = getPlan(ctx.match[1]);
        if (!plan) return ctx.answerCbQuery('Gói không tồn tại', { show_alert: true });
        await ctx.answerCbQuery();
        const s = screenChoosePay(plan);
        try { await ctx.editMessageText(s.text, { parse_mode: 'HTML', reply_markup: s.reply_markup }); }
        catch { await ctx.replyWithHTML(s.text, { reply_markup: s.reply_markup }); }
    });

    // ── Tạo đơn + gửi QR ──
    b.action(/^pay_(vietinbank|momo)_([a-zA-Z0-9_]+)$/, async (ctx) => {
        const channel = ctx.match[1];
        const plan = getPlan(ctx.match[2]);
        if (!plan) return ctx.answerCbQuery('Gói không tồn tại', { show_alert: true });

        const cfg = pcfg.get();
        if (channel === 'vietinbank' && !cfg.vietinbank.stk) {
            return ctx.answerCbQuery('VietinBank chưa cấu hình', { show_alert: true });
        }
        if (channel === 'momo' && !cfg.momo.phone) {
            return ctx.answerCbQuery('MoMo chưa cấu hình', { show_alert: true });
        }

        await ctx.answerCbQuery('Đang tạo đơn...');

        const order = orders.create({
            telegramId: ctx.from.id,
            telegramUsername: ctx.from.username || '',
            plan, channel
        });

        const qrUrl = channel === 'vietinbank'
            ? buildVietinQR({ stk: cfg.vietinbank.stk, name: cfg.vietinbank.name, amount: order.amount, note: order.id })
            : buildMomoQR({ phone: cfg.momo.phone, name: cfg.momo.name, amount: order.amount, note: order.id });

        const caption = channel === 'vietinbank' ? captionVietin(order, cfg) : captionMomo(order, cfg);

        try {
            await ctx.replyWithPhoto({ url: qrUrl }, {
                caption,
                parse_mode: 'HTML',
                reply_markup: payActionsKb(order.id).reply_markup
            });
        } catch (e) {
            // Fallback nếu Telegram không tải được ảnh
            log && log(`[BOT][PAY] Gửi QR lỗi: ${e.message}`, 'WARN');
            await ctx.replyWithHTML(
                caption + `\n\n<a href="${qrUrl}">🔗 Xem ảnh QR</a>`,
                { reply_markup: payActionsKb(order.id).reply_markup, disable_web_page_preview: false }
            );
        }
    });

    // ── User báo đã CK ──
    b.action(/^paid_(LAUNA-[A-Z0-9]+)$/, async (ctx) => {
        const o = orders.get(ctx.match[1]);
        if (!o) return ctx.answerCbQuery('Đơn không tồn tại', { show_alert: true });
        if (o.telegramId !== ctx.from.id) return ctx.answerCbQuery('Đơn này không phải của bạn', { show_alert: true });
        if (o.status === 'approved') return ctx.answerCbQuery('Đơn đã duyệt rồi', { show_alert: true });
        if (o.status === 'rejected' || o.status === 'expired') {
            return ctx.answerCbQuery('Đơn đã đóng', { show_alert: true });
        }

        if (o.status !== 'user_paid') orders.markUserPaid(o.id);
        await ctx.answerCbQuery('Đã ghi nhận ✅', { show_alert: false });

        try {
            await ctx.editMessageReplyMarkup({
                inline_keyboard: [[{ text: '⏳ Đang chờ admin duyệt...', callback_data: 'noop' }]]
            });
        } catch {}

        await ctx.replyWithHTML(
            `🔔 Đã thông báo cho admin về đơn <code>${o.id}</code>.\n` +
            `Bạn sẽ nhận được API key ngay khi admin duyệt (thường vài phút).`,
            { reply_markup: { inline_keyboard: [[{ text: '📋 Đơn của tôi', callback_data: 'myorders' }]] } }
        );

        // Notify admin
        const who = o.telegramUsername ? `@${escHtml(o.telegramUsername)}` : `id ${o.telegramId}`;
        const text =
            `<b>🔔 Đơn mới chờ duyệt</b>\n\n` +
            `📦 <code>${o.id}</code>\n` +
            `👤 ${who}\n` +
            `💎 ${escHtml(o.planName)}\n` +
            `💰 ${fmtVND(o.amount)} qua <b>${o.channel}</b>\n\n` +
            `<i>Kiểm tra app ngân hàng/ví → bấm duyệt:</i>`;
        const kb = {
            inline_keyboard: [
                [{ text: '✅ Duyệt', callback_data: `aprv_${o.id}` },
                 { text: '❌ Từ chối', callback_data: `rjct_${o.id}` }],
                [{ text: '📥 Xem tất cả đơn', callback_data: 'orders_refresh' }]
            ]
        };
        await notifyAdmins(text, { reply_markup: kb });
    });

    // ── User huỷ đơn ──
    b.action(/^cancel_(LAUNA-[A-Z0-9]+)$/, async (ctx) => {
        const o = orders.get(ctx.match[1]);
        if (!o) return ctx.answerCbQuery('Đơn không tồn tại', { show_alert: true });
        if (o.telegramId !== ctx.from.id) return ctx.answerCbQuery('Không phải đơn của bạn', { show_alert: true });
        if (o.status === 'approved') return ctx.answerCbQuery('Đơn đã duyệt, không huỷ được', { show_alert: true });
        orders.update(o.id, { status: 'expired' });
        await ctx.answerCbQuery('Đã huỷ');
        try {
            await ctx.editMessageReplyMarkup({
                inline_keyboard: [[{ text: '🚫 Đã huỷ', callback_data: 'noop' }]]
            });
        } catch {}
    });

    b.action('noop', ctx => ctx.answerCbQuery());

    // ════════════════════════ ADMIN ════════════════════════

    b.command('orders', async (ctx) => {
        if (!isAdmin(ctx)) return;
        const s = screenAdminOrders();
        return ctx.replyWithHTML(s.text, { reply_markup: s.reply_markup });
    });

    b.action('orders_refresh', async (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔️', { show_alert: true });
        await ctx.answerCbQuery();
        const s = screenAdminOrders();
        try { await ctx.editMessageText(s.text, { parse_mode: 'HTML', reply_markup: s.reply_markup }); }
        catch { await ctx.replyWithHTML(s.text, { reply_markup: s.reply_markup }); }
    });

    // ── /approve LAUNA-XXXX ──
    b.command('approve', async (ctx) => {
        if (!isAdmin(ctx)) return;
        const id = (ctx.message.text || '').split(/\s+/)[1];
        if (!id) return ctx.reply('Cú pháp: /approve LAUNA-XXXXXX');
        return doApprove(ctx, id);
    });

    b.action(/^aprv_(LAUNA-[A-Z0-9]+)$/, async (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔️', { show_alert: true });
        await ctx.answerCbQuery('Đang duyệt...');
        return doApprove(ctx, ctx.match[1]);
    });

    async function doApprove(ctx, orderId) {
        const o = orders.get(orderId);
        if (!o) return ctx.replyWithHTML(`❌ Không tìm thấy đơn <code>${escHtml(orderId)}</code>`);
        if (o.status === 'approved') {
            return ctx.replyWithHTML(`⚠️ Đơn <code>${o.id}</code> đã duyệt trước đó.\nKey: <code>${o.apiKey}</code>`);
        }
        if (o.status === 'rejected') {
            return ctx.replyWithHTML(`⚠️ Đơn <code>${o.id}</code> đã bị từ chối, không thể duyệt.`);
        }

        // Tạo API key
        const apikey = genApiKey('premium');
        const keys = loadKeys();
        const expiresAt = new Date(Date.now() + (o.days || 30) * 86400 * 1000).toISOString();
        keys.push({
            apikey,
            type: 'premium',
            note: `Auto-issued via order ${o.id} for tg id ${o.telegramId} (@${o.telegramUsername || '?'})`,
            createdAt: new Date().toISOString(),
            expiresAt,
            paymentOrderId: o.id,
            ownerTelegramId: o.telegramId,
            ownerTelegramUsername: o.telegramUsername || ''
        });
        saveKeys(keys);

        orders.approve(o.id, ctx.from.username || '', apikey);

        // DM user
        try {
            await ctx.telegram.sendMessage(o.telegramId,
                `<b>✅ Đơn ${o.id} đã được duyệt!</b>\n\n` +
                `💎 Gói: <b>${escHtml(o.planName)}</b>\n` +
                `📅 Hết hạn: ${fmtTime(expiresAt)}\n\n` +
                `🔑 API Key của bạn:\n<code>${apikey}</code>\n\n` +
                `<i>Bấm vào key để copy. Cảm ơn bạn đã ủng hộ! ❤️</i>`,
                { parse_mode: 'HTML' }
            );
        } catch (e) {
            log && log(`[BOT][PAY] Không DM được user ${o.telegramId}: ${e.message}`, 'WARN');
        }

        // Reply admin
        await ctx.replyWithHTML(
            `✅ Đã duyệt <code>${o.id}</code>\n` +
            `🔑 <code>${apikey}</code>\n` +
            `📤 Đã gửi key cho ${o.telegramUsername ? '@' + escHtml(o.telegramUsername) : 'user id ' + o.telegramId}.`
        );
    }

    // ── /reject LAUNA-XXXX [lý do] ──
    b.command('reject', async (ctx) => {
        if (!isAdmin(ctx)) return;
        const parts = (ctx.message.text || '').split(/\s+/).slice(1);
        const id = parts[0];
        const reason = parts.slice(1).join(' ');
        if (!id) return ctx.reply('Cú pháp: /reject LAUNA-XXXXXX [lý do]');
        return doReject(ctx, id, reason);
    });

    b.action(/^rjct_(LAUNA-[A-Z0-9]+)$/, async (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔️', { show_alert: true });
        await ctx.answerCbQuery();
        setWait(ctx.chat.id, 'reject_reason', { orderId: ctx.match[1] });
        return ctx.replyWithHTML(
            `📝 Nhập lý do từ chối cho <code>${ctx.match[1]}</code> (hoặc gõ <code>-</code> để bỏ qua):`
        );
    });

    async function doReject(ctx, orderId, reason) {
        const o = orders.get(orderId);
        if (!o) return ctx.replyWithHTML(`❌ Không tìm thấy đơn <code>${escHtml(orderId)}</code>`);
        if (o.status === 'approved') {
            return ctx.replyWithHTML(`⚠️ Đơn đã duyệt, không thể từ chối.`);
        }

        orders.reject(o.id, ctx.from.username || '', reason || '');

        try {
            await ctx.telegram.sendMessage(o.telegramId,
                `<b>❌ Đơn ${o.id} bị từ chối</b>\n\n` +
                (reason ? `📝 Lý do: ${escHtml(reason)}\n\n` : '') +
                `Nếu bạn nghĩ có nhầm lẫn, liên hệ admin để được hỗ trợ.`,
                { parse_mode: 'HTML' }
            );
        } catch {}

        await ctx.replyWithHTML(`✅ Đã từ chối <code>${o.id}</code>` + (reason ? `\nLý do: ${escHtml(reason)}` : ''));
    }

    // ── /payment_setup (admin) ──
    b.command('payment_setup', async (ctx) => {
        if (!isAdmin(ctx)) return;
        const s = screenPaymentSetup();
        return ctx.replyWithHTML(s.text, { reply_markup: s.reply_markup });
    });

    b.action('pcfg_open', async (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔️', { show_alert: true });
        await ctx.answerCbQuery();
        const s = screenPaymentSetup();
        try { await ctx.editMessageText(s.text, { parse_mode: 'HTML', reply_markup: s.reply_markup }); }
        catch { await ctx.replyWithHTML(s.text, { reply_markup: s.reply_markup }); }
    });

    b.action('pcfg_set_vtb', async (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔️', { show_alert: true });
        await ctx.answerCbQuery();
        setWait(ctx.chat.id, 'pcfg_vtb');
        return ctx.replyWithHTML(
            '🏦 <b>Cấu hình VietinBank</b>\n\n' +
            'Gửi theo định dạng: <code>STK | TÊN CHỦ TK</code>\n' +
            'Ví dụ: <code>104876543210 | NGUYEN VAN A</code>'
        );
    });

    b.action('pcfg_set_momo', async (ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔️', { show_alert: true });
        await ctx.answerCbQuery();
        setWait(ctx.chat.id, 'pcfg_momo');
        return ctx.replyWithHTML(
            '💜 <b>Cấu hình MoMo</b>\n\n' +
            'Gửi theo định dạng: <code>SĐT | TÊN CHỦ VÍ</code>\n' +
            'Ví dụ: <code>0901234567 | NGUYEN VAN A</code>'
        );
    });

    // Trả về handler text để telegram-bot.js gọi nếu chat đang waiting cho payment.
    // Trả true nếu đã xử lý xong.
    async function handleText(ctx) {
        const w = getWait(ctx.chat.id);
        if (!w) return false;
        const txt = (ctx.message.text || '').trim();

        if (w.mode === 'pcfg_vtb') {
            clearWait(ctx.chat.id);
            const [stk, name] = txt.split('|').map(s => s.trim());
            if (!stk || !/^\d{4,20}$/.test(stk)) {
                await ctx.reply('❌ STK không hợp lệ (chỉ chứa số, 4-20 ký tự).');
                return true;
            }
            pcfg.setVietinbank(stk, name || '');
            await ctx.replyWithHTML(`✅ Đã cập nhật VietinBank.\nSTK: <code>${stk}</code>\nTên: <b>${escHtml(name || '')}</b>`);
            const s = screenPaymentSetup();
            await ctx.replyWithHTML(s.text, { reply_markup: s.reply_markup });
            return true;
        }

        if (w.mode === 'pcfg_momo') {
            clearWait(ctx.chat.id);
            const [phone, name] = txt.split('|').map(s => s.trim());
            if (!phone || !/^\d{8,15}$/.test(phone)) {
                await ctx.reply('❌ SĐT không hợp lệ (chỉ chứa số, 8-15 ký tự).');
                return true;
            }
            pcfg.setMomo(phone, name || '');
            await ctx.replyWithHTML(`✅ Đã cập nhật MoMo.\nSĐT: <code>${phone}</code>\nTên: <b>${escHtml(name || '')}</b>`);
            const s = screenPaymentSetup();
            await ctx.replyWithHTML(s.text, { reply_markup: s.reply_markup });
            return true;
        }

        if (w.mode === 'reject_reason') {
            clearWait(ctx.chat.id);
            const reason = txt === '-' ? '' : txt;
            await doReject(ctx, w.args.orderId, reason);
            return true;
        }

        return false;
    }

    return { handleText };
}

// Danh sách lệnh + callback prefix mà user không phải admin được dùng.
const USER_COMMANDS = new Set(['buy', 'plans', 'myorders']);
const USER_ACTION_RX = /^(buy|plans|myorders|plan_|pay_|paid_|cancel_|noop)/;

function isUserCommand(text) {
    if (!text || !text.startsWith('/')) return false;
    const cmd = text.slice(1).split(/[\s@]/)[0].toLowerCase();
    return USER_COMMANDS.has(cmd);
}

function isUserAction(data) {
    return !!data && USER_ACTION_RX.test(data);
}

module.exports = { register, isUserCommand, isUserAction };
