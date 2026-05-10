'use strict';

const { mergeVideoAudio, extractAudio, muteVideo, remux } = require('../../utils/ffmpeg-helper');

const VALID_MODES = new Set(['merge', 'audio', 'mute', 'remux']);

module.exports = {
    name: '/download/process',
    methods: {
        get: async (req, res) => {
            const { url, videoUrl, audioUrl, mode = 'merge', format = 'mp3', container = 'mp4', filename } = req.query;

            const m = String(mode).toLowerCase();
            if (!VALID_MODES.has(m)) {
                return res.status(400).json({
                    status: false,
                    message: "mode không hợp lệ",
                    params: {
                        mode: 'merge | audio | mute | remux',
                        url: 'URL nguồn (dùng cho mode audio / mute / remux)',
                        videoUrl: 'URL video (dùng cho mode merge)',
                        audioUrl: 'URL audio (dùng cho mode merge)',
                        format: 'mp3 | ogg | wav | opus | m4a (dùng cho mode audio)',
                        container: 'mp4 | webm | mkv (dùng cho mode remux)',
                        filename: '(tùy chọn) tên file tải về'
                    },
                    examples: [
                        '/download/process?mode=merge&videoUrl=...&audioUrl=...',
                        '/download/process?mode=audio&url=...&format=mp3',
                        '/download/process?mode=mute&url=...',
                        '/download/process?mode=remux&url=...&container=webm',
                    ]
                });
            }

            if (m === 'merge') {
                if (!videoUrl || !audioUrl) {
                    return res.status(400).json({ status: false, message: "merge cần videoUrl và audioUrl" });
                }
                try {
                    return mergeVideoAudio(videoUrl, audioUrl, res, filename || 'merged.mp4');
                } catch (e) {
                    const log = require('../../utils/logger');
                    log(`[PROCESS] merge lỗi: ${e.message}`, 'WARN');
                    return res.status(500).json({ status: false, message: 'Lỗi merge video/audio' });
                }
            }

            if (!url) {
                return res.status(400).json({ status: false, message: `mode '${m}' cần tham số url` });
            }

            try {
                if (m === 'audio') return extractAudio(url, format, res, filename);
                if (m === 'mute') return muteVideo(url, res, filename || 'muted.mp4');
                if (m === 'remux') return remux(url, container, res, filename);
            } catch (e) {
                const log = require('../../utils/logger');
                log(`[PROCESS] ${m} lỗi: ${e.message}`, 'WARN');
                return res.status(500).json({ status: false, message: 'Lỗi xử lý media' });
            }
        }
    }
};
