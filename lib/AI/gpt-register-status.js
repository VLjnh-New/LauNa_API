'use strict';

// Dùng chung jobs store từ gpt-register.js
const { _jobs: jobs } = require('./gpt-register');

function elapsed(job) {
    const ms = (job.finishedAt || Date.now()) - job.createdAt;
    return `${(ms / 1000).toFixed(1)}s`;
}

module.exports = {
    name:   '/gpt/reggpt/status',
    params: ['id'],
    index:  async (req, res) => {
        const id  = (req.query.id || '').trim();
        if (!id) return res.status(400).json({ status: false, message: 'Thiếu id' });

        const job = jobs.get(id);
        if (!job) return res.status(404).json({ status: false, message: 'Job không tồn tại hoặc đã hết hạn (tối đa 2 giờ)' });

        return res.status(200).json({
            status:   true,
            jobId:    job.id,
            state:    job.status,           // running | done | error
            limit:    job.limit,
            done:     job.done,
            failed:   job.failed,
            pending:  job.limit - job.done - job.failed,
            mail:     job.mailType,
            proxy:    job.proxyUrl || null,
            elapsed:  elapsed(job),
            accounts: job.accounts,
            logs:     job.logs.slice(-80),
        });
    },
};
