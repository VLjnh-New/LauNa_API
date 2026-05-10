'use strict';

/**
 * Text-to-Speech qua Microsoft Edge Read-Aloud (msedge-tts).
 * Hỗ trợ setup: voice, rate, pitch, volume, format, download.
 *
 *   GET /ai/voice
 *     ?text=Xin chào                       (bắt buộc, max 5000 ký tự)
 *     &voice=vi-VN-HoaiMyNeural            (tên voice; xem /ai/voices)
 *     &rate=+0%                            (x-slow|slow|medium|fast|x-fast | -50%..+200% | số 0.5–2.0)
 *     &pitch=+0Hz                          (x-low|low|medium|high|x-high | +50Hz | +2st | +20%)
 *     &volume=default                      (silent|x-soft|soft|medium|loud|x-loud | 0–100 | +/-N%)
 *     &format=mp3                          (mp3 | webm)
 *     &download=0|1                        (1 = đính kèm filename để tải xuống)
 *
 * Trả về: stream audio (Content-Type: audio/mpeg hoặc audio/webm).
 */

const { MsEdgeTTS, OUTPUT_FORMAT, ProsodyOptions } = require('msedge-tts');
const log = require('../../utils/logger');

const DEFAULT_VOICE = 'vi-VN-HoaiMyNeural';
const MAX_TEXT_LEN = 5000;

const FORMAT_MAP = {
    mp3:  { fmt: OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, mime: 'audio/mpeg', ext: 'mp3' },
    'mp3-low':  { fmt: OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, mime: 'audio/mpeg', ext: 'mp3' },
    webm: { fmt: OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS,    mime: 'audio/webm', ext: 'webm' }
};

function escapeXml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function safeFilename(s) {
    return String(s || 'voice')
        .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60) || 'voice';
}

module.exports = {
    name: '/ai/voice',
    index: async (req, res) => {
        const text = String(req.query.text || '').trim();
        const voice = String(req.query.voice || DEFAULT_VOICE).trim();
        const rate = req.query.rate != null ? String(req.query.rate).trim() : null;
        const pitch = req.query.pitch != null ? String(req.query.pitch).trim() : null;
        const volume = req.query.volume != null ? String(req.query.volume).trim() : null;
        const formatKey = String(req.query.format || 'mp3').toLowerCase();
        const wantDownload = req.query.download === '1' || req.query.download === 'true';

        if (!text) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'text'",
                params: {
                    text:    'Nội dung cần đọc (≤5000 ký tự)',
                    voice:   `Tên voice (mặc định ${DEFAULT_VOICE}). Xem danh sách qua /ai/voices`,
                    rate:    'x-slow|slow|medium|fast|x-fast | +/-N% | 0.5–2.0',
                    pitch:   'x-low|low|medium|high|x-high | +50Hz | +2st | +20%',
                    volume:  'silent|x-soft|soft|medium|loud|x-loud | 0–100 | +/-N%',
                    format:  'mp3 (default) | mp3-low | webm',
                    download:'0|1 (1 = trả Content-Disposition attachment)'
                },
                example: '/ai/voice?text=Xin chào&voice=vi-VN-NamMinhNeural&rate=+10%&pitch=+0Hz'
            });
        }
        if (text.length > MAX_TEXT_LEN) {
            return res.status(413).json({ status: false, message: `Text quá dài (>${MAX_TEXT_LEN} ký tự)` });
        }
        if (!/^[a-zA-Z]{2,5}-[a-zA-Z]{2,5}-[a-zA-Z0-9]+Neural$/i.test(voice)) {
            return res.status(400).json({
                status: false,
                message: 'Tên voice không hợp lệ. VD: vi-VN-HoaiMyNeural, en-US-JennyNeural'
            });
        }
        const fmtCfg = FORMAT_MAP[formatKey];
        if (!fmtCfg) {
            return res.status(400).json({ status: false, message: `Format không hợp lệ. Dùng: ${Object.keys(FORMAT_MAP).join(', ')}` });
        }

        try {
            const tts = new MsEdgeTTS();
            await tts.setMetadata(voice, fmtCfg.fmt);

            const opts = new ProsodyOptions();
            if (rate)   opts.rate   = rate;
            if (pitch)  opts.pitch  = pitch;
            if (volume) opts.volume = volume;

            // Escape text trước khi nhúng vào SSML
            const safeText = escapeXml(text);

            const { audioStream } = tts.toStream(safeText, opts);

            res.setHeader('Content-Type', fmtCfg.mime);
            res.setHeader('Cache-Control', 'no-store');
            if (wantDownload) {
                const fname = `${safeFilename(voice)}_${Date.now()}.${fmtCfg.ext}`;
                res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
            }

            let bytes = 0;
            let finished = false;

            audioStream.on('data', chunk => {
                bytes += chunk.length;
                res.write(chunk);
            });
            audioStream.on('end', () => {
                if (finished) return;
                finished = true;
                res.end();
                log.api(`[VOICE] ${voice} · ${text.length} chars → ${bytes} bytes (${formatKey})`);
            });
            audioStream.on('close', () => {
                if (finished) return;
                finished = true;
                res.end();
            });
            audioStream.on('error', err => {
                if (finished) return;
                finished = true;
                log.error(`[VOICE] stream error: ${err?.message || err}`);
                if (!res.headersSent) {
                    res.status(502).json({ status: false, message: 'TTS upstream lỗi', details: String(err?.message || err) });
                } else {
                    res.end();
                }
            });

            req.on('close', () => {
                if (!finished && audioStream.destroy) audioStream.destroy();
            });
        } catch (err) {
            log.error(`[VOICE] init lỗi: ${err?.message || err}`);
            if (!res.headersSent) {
                return res.status(500).json({ status: false, message: 'Lỗi khởi tạo TTS', details: String(err?.message || err) });
            }
        }
    }
};
