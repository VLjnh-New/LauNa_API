'use strict';

const sharp = require('sharp');
const { fetchBuffer: fetchBufferShared } = require('../../utils/http');
const { shouldUseProxy, noteBlocked } = require('../../utils/ai-proxy-helper');

async function fetchBufferDirect(url) {
    const result = await fetchBufferShared(url);
    return result.buffer;
}

async function fetchBufferProxy(url) {
    if (!global.proxyPool) throw new Error('Proxy pool chưa khởi động');
    const resp = await global.proxyPool.axios({
        method: 'get',
        url,
        responseType: 'arraybuffer',
        timeout: 20000,
        headers: { 'User-Agent': require('../../utils/http/browser-headers').randomUA() },
        maxRedirects: 5,
        validateStatus: () => true,
    });
    if (resp.status >= 400) throw new Error(`Không thể tải ảnh qua proxy (HTTP ${resp.status})`);
    return Buffer.from(resp.data);
}

async function fetchBuffer(url, useProxy = false) {
    if (useProxy) {
        try { return await fetchBufferProxy(url); }
        catch { return await fetchBufferDirect(url); }
    }
    try { return await fetchBufferDirect(url); }
    catch (e) {
        if (global.proxyPool) {
            try { return await fetchBufferProxy(url); } catch (_) {}
        }
        throw e;
    }
}

async function applyAlphaMask(maskBuf, imageBuf) {
    // Lấy alpha channel từ ảnh gốc PNG (mask)
    const maskMeta = await sharp(maskBuf).metadata();
    if (!maskMeta.hasAlpha) throw new Error('Ảnh gốc (mask) không có kênh alpha (không phải PNG trong suốt)');

    // Lấy kích thước của ảnh đã làm nét
    const imageMeta = await sharp(imageBuf).metadata();
    const { width, height } = imageMeta;

    // Resize mask về đúng kích thước ảnh đã làm nét, rồi extract alpha channel dạng raw
    const { data: alphaData } = await sharp(maskBuf)
        .resize(width, height, { fit: 'fill' })
        .extractChannel('alpha')
        .raw()
        .toBuffer({ resolveWithObject: true });

    // Gán alpha channel của mask vào ảnh đã làm nét
    const result = await sharp(imageBuf)
        .ensureAlpha(1)
        .joinChannel(alphaData, { raw: { width, height, channels: 1 } })
        .png()
        .toBuffer();

    return result;
}

module.exports = {
    name: '/ai/xoa-nen',
    index: async (req, res) => {
        const { mask, image, format } = req.query;
        const explicit = req.query.proxy === '1' || req.query.proxy === 'true';
        const useProxy = await shouldUseProxy(req, explicit);

        if (!mask || !image) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'mask' hoặc 'image'",
                params: {
                    mask:   'URL ảnh gốc PNG (có nền trong suốt, chưa làm nét)',
                    image:  'URL ảnh đã làm nét AI (bị mất nền trong suốt)',
                    format: '(tuỳ chọn) png (mặc định trả binary) | base64'
                },
                example: '/ai/xoa-nen?mask=https://cdn.example.com/anh-goc.png&image=https://cdn.example.com/anh-lam-net.jpg',
                huong_dan: [
                    'Bước 1: Upload ảnh gốc PNG (có nền trong suốt) lên host rồi lấy URL',
                    'Bước 2: Upload ảnh đã làm nét (bị nền đen) lên host rồi lấy URL',
                    'Bước 3: Gọi API này, nhận về PNG trong suốt đã làm nét'
                ]
            });
        }

        try {
            const [maskBuf, imageBuf] = await Promise.all([
                fetchBuffer(mask, useProxy),
                fetchBuffer(image, useProxy)
            ]);

            const resultBuf = await applyAlphaMask(maskBuf, imageBuf);

            if (format === 'base64') {
                const b64 = resultBuf.toString('base64');
                return res.json({
                    status: true,
                    format: 'base64',
                    mime: 'image/png',
                    base64: `data:image/png;base64,${b64}`
                });
            }

            // Mặc định trả về file PNG binary
            res.set('Content-Type', 'image/png');
            res.set('Content-Disposition', 'inline; filename="result.png"');
            res.set('Cache-Control', 'no-store');
            return res.send(resultBuf);

        } catch (e) {
            noteBlocked(req, e, '/ai/xoa-nen').catch(() => {});
            const log = require('../../utils/logger');
            log(`[XOA-NEN] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({
                status: false,
                message: 'Lỗi xóa nền ảnh'
            });
        }
    }
};
