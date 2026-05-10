'use strict';

const { _jobs: jobs } = require('./gpt-register');

function elapsed(job) {
    const ms = (job.finishedAt || Date.now()) - job.createdAt;
    return `${(ms / 1000).toFixed(1)}s`;
}

module.exports = {
    name:   '/gpt/reggpt/jobs',
    params: ['state'],
    index:  async (req, res) => {
        const filterState = (req.query.state || '').toLowerCase().trim();
        const validStates = ['running', 'done', 'error'];

        if (filterState && !validStates.includes(filterState)) {
            return res.status(400).json({
                status:  false,
                message: `state không hợp lệ. Dùng: ${validStates.join(', ')} hoặc để trống để lấy tất cả`,
            });
        }

        const all = [];
        for (const job of jobs.values()) {
            if (filterState && job.status !== filterState) continue;
            all.push({
                jobId:   job.id,
                state:   job.status,
                limit:   job.limit,
                done:    job.done,
                failed:  job.failed,
                pending: job.limit - job.done - job.failed,
                mail:    job.mailType,
                proxy:   job.proxyUrl || null,
                elapsed: elapsed(job),
            });
        }

        // Sắp xếp: running trước, sau đó theo thời gian tạo mới nhất
        const ORDER = { running: 0, error: 1, done: 2 };
        all.sort((a, b) => {
            const sd = (ORDER[a.state] ?? 9) - (ORDER[b.state] ?? 9);
            if (sd !== 0) return sd;
            // Lấy job từ store để so sánh createdAt
            const ja = jobs.get(a.jobId);
            const jb = jobs.get(b.jobId);
            return (jb?.createdAt || 0) - (ja?.createdAt || 0);
        });

        return res.status(200).json({
            status: true,
            total:  all.length,
            filter: filterState || 'all',
            jobs:   all,
        });
    },
};
