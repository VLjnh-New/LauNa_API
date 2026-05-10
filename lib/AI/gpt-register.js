'use strict';

const crypto = require('crypto');
const { RegistrationEngine } = require('../../utils/gpt-reg/engine');
const { getMailService }     = require('../../utils/gpt-reg/mail');

const MAIL_LABELS = {
    smv: 'smvmail.com', smvmail: 'smvmail.com',
    mailtm: 'mail.tm', 'mail.tm': 'mail.tm',
};

// ─── Shared in-memory job store (exported for status route) ──────────────────
const jobs = new Map();

// Auto-cleanup jobs older than 2h
setInterval(() => {
    const cutoff = Date.now() - 7_200_000;
    for (const [id, job] of jobs) if (job.createdAt < cutoff) jobs.delete(id);
}, 600_000).unref?.();

// ─── Registration worker ──────────────────────────────────────────────────────
async function runWorker(job, index) {
    const { service } = getMailService(job.mailType);
    const log = msg => {
        const line = `[${new Date().toLocaleTimeString('vi-VN', { hour12: false })}][acc${index + 1}] ${msg}`;
        job.logs.push(line);
        if (job.logs.length > 300) job.logs.shift();
    };
    try {
        const engine = new RegistrationEngine({
            mailService: service,
            proxyUrl:    job.proxyUrl,
            logger:      log,
            taskId:      `acc${index + 1}`,
        });
        const result = await engine.run();
        if (result.success) {
            job.accounts.push({
                email:        result.email,
                password:     result.password,
                accessToken:  result.accessToken  || null,
                refreshToken: result.refreshToken || null,
                idToken:      result.idToken      || null,
                sessionToken: result.sessionToken || null,
                accountId:    result.accountId    || null,
            });
            job.done++;
            log(`✓ Thành công: ${result.email}`);
        } else {
            job.failed++;
            log(`✗ Thất bại: ${result.error || 'unknown error'}`);
        }
    } catch (e) {
        job.failed++;
        log(`✗ Exception: ${e.message}`);
    }
}

async function runJob(job) {
    job.logs.push(`[job:${job.id}] Bắt đầu tạo ${job.limit} acc | mail=${job.mailType} | proxy=${job.proxyUrl || 'none'}`);
    const queue = Array.from({ length: job.limit }, (_, i) => i);
    const MAX_C = Math.min(job.limit, 3);

    const worker = async () => {
        while (queue.length > 0) {
            const idx = queue.shift();
            await runWorker(job, idx);
        }
    };
    await Promise.all(Array.from({ length: MAX_C }, worker));
    job.status     = 'done';
    job.finishedAt = Date.now();
    job.logs.push(`[job:${job.id}] Xong: ${job.done} thành công / ${job.failed} thất bại`);
}

// ─── Route: GET /gpt/reggpt ───────────────────────────────────────────────────
module.exports = {
    _jobs:  jobs,
    name:   '/gpt/reggpt',
    params: ['limit', 'mail', 'proxy'],
    index:  async (req, res) => {
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 1, 1), 10);
        const mail  = (req.query.mail  || 'smv').toLowerCase().trim();
        const proxy = (req.query.proxy || '').trim();

        const validMail = ['smv', 'smvmail', 'mailtm', 'mail.tm'];
        if (!validMail.includes(mail)) {
            return res.status(400).json({ status: false, message: `mail không hợp lệ. Dùng: ${validMail.join(', ')}` });
        }

        const proxyUrl = proxy ? (proxy.startsWith('http') ? proxy : `http://${proxy}`) : null;
        const id = crypto.randomBytes(8).toString('hex');

        const job = {
            id, status: 'running', limit, mailType: mail, proxyUrl,
            accounts: [], logs: [], done: 0, failed: 0,
            createdAt: Date.now(), finishedAt: null,
        };
        jobs.set(id, job);

        // Chạy nền
        runJob(job).catch(e => {
            job.status = 'error';
            job.logs.push(`[FATAL] ${e.message}`);
        });

        return res.status(202).json({
            status:    true,
            message:   `Đang tạo ${limit} tài khoản ChatGPT...`,
            jobId:     id,
            state:     'running',
            limit,
            mail:      MAIL_LABELS[mail] || mail,
            proxy:     proxyUrl || null,
            statusUrl: `/gpt/reggpt/status?id=${id}`,
        });
    },
};
