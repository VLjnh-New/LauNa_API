'use strict';

const { query, isEnabled } = require('./db');

async function getStats() {
    if (!isEnabled()) {
        return { total: 0, byCategory: {}, hourly: [] };
    }
    const counter = await query('SELECT total, by_category FROM request_counter WHERE id=1');
    const hourly  = await query(
        'SELECT hour AS h, n FROM request_hourly ORDER BY hour DESC LIMIT 48'
    );
    return {
        total: Number(counter.rows[0]?.total || 0),
        byCategory: counter.rows[0]?.by_category || {},
        hourly: hourly.rows.reverse().map(r => ({ h: r.h, n: Number(r.n) }))
    };
}

module.exports = { getStats };
