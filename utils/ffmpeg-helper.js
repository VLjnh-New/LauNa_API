'use strict';

const ffmpegPath = require('ffmpeg-static');
const { spawn } = require('child_process');

const VALID_AUDIO_FORMATS = new Set(['mp3', 'ogg', 'wav', 'opus', 'm4a']);
const VALID_QUALITIES = new Set(['144', '240', '360', '480', '720', '1080', '1440', '2160', 'max']);

function sanitizeAudioFormat(fmt) {
    const f = String(fmt || 'mp3').toLowerCase();
    return VALID_AUDIO_FORMATS.has(f) ? f : 'mp3';
}

function sanitizeQuality(q) {
    const v = String(q || '1080').toLowerCase();
    return VALID_QUALITIES.has(v) ? v : '1080';
}

const AUDIO_CODEC_MAP = {
    mp3: ['-c:a', 'libmp3lame', '-q:a', '2'],
    ogg: ['-c:a', 'libvorbis', '-q:a', '5'],
    wav: ['-c:a', 'pcm_s16le'],
    opus: ['-c:a', 'libopus', '-b:a', '128k'],
    m4a: ['-c:a', 'aac', '-b:a', '192k'],
};

function pipeFFmpeg(args, res, contentType, filename) {
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Transfer-Encoding', 'chunked');

    const ff = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    ff.stdout.pipe(res);

    let errBuf = '';
    ff.stderr.on('data', d => { errBuf += d.toString(); });

    ff.on('error', err => {
        const log = require('./logger');
        log(`[FFMPEG] process lỗi: ${err.message}`, 'WARN');
        if (!res.headersSent) res.status(500).json({ status: false, message: 'Lỗi xử lý ffmpeg' });
        else res.destroy();
    });

    ff.on('close', code => {
        if (code !== 0 && !res.writableEnded) {
            res.destroy();
        }
    });

    res.on('close', () => { try { ff.kill('SIGKILL'); } catch (_) {} });

    return ff;
}

function mergeVideoAudio(videoUrl, audioUrl, res, filename = 'merged.mp4') {
    const args = [
        '-y',
        '-i', videoUrl,
        '-i', audioUrl,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-movflags', 'frag_keyframe+empty_moov+faststart',
        '-f', 'mp4',
        'pipe:1'
    ];
    return pipeFFmpeg(args, res, 'video/mp4', filename);
}

function extractAudio(sourceUrl, format, res, filename) {
    const fmt = sanitizeAudioFormat(format);
    const codecArgs = AUDIO_CODEC_MAP[fmt] || AUDIO_CODEC_MAP['mp3'];
    const outFilename = filename || `audio.${fmt}`;

    const args = [
        '-y',
        '-i', sourceUrl,
        '-vn',
        ...codecArgs,
        '-f', fmt === 'm4a' ? 'adts' : fmt,
        'pipe:1'
    ];
    const mimeMap = { mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', opus: 'audio/opus', m4a: 'audio/aac' };
    return pipeFFmpeg(args, res, mimeMap[fmt] || 'audio/mpeg', outFilename);
}

function muteVideo(sourceUrl, res, filename = 'muted.mp4') {
    const args = [
        '-y',
        '-i', sourceUrl,
        '-c:v', 'copy',
        '-an',
        '-movflags', 'frag_keyframe+empty_moov+faststart',
        '-f', 'mp4',
        'pipe:1'
    ];
    return pipeFFmpeg(args, res, 'video/mp4', filename);
}

function remux(sourceUrl, container, res, filename) {
    const validContainers = { mp4: 'mp4', webm: 'webm', mkv: 'matroska' };
    const fmt = validContainers[String(container || 'mp4').toLowerCase()] || 'mp4';
    const ext = fmt === 'matroska' ? 'mkv' : fmt;
    const outFilename = filename || `video.${ext}`;

    const args = [
        '-y',
        '-i', sourceUrl,
        '-c', 'copy',
        '-movflags', fmt === 'mp4' ? 'frag_keyframe+empty_moov+faststart' : '+faststart',
        '-f', fmt,
        'pipe:1'
    ];
    const mimeMap = { mp4: 'video/mp4', webm: 'video/webm', matroska: 'video/x-matroska' };
    return pipeFFmpeg(args, res, mimeMap[fmt] || 'video/mp4', outFilename);
}

module.exports = { mergeVideoAudio, extractAudio, muteVideo, remux, sanitizeAudioFormat, sanitizeQuality };
