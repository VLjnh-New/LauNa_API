'use strict';

const { Pool } = require('pg');
const config = require('../config-loader');

let pool = null;

function getConnectionString() {
    return config?.database?.connectionString || null;
}

function isEnabled() {
    return !!getConnectionString();
}

function getPool() {
    if (pool) return pool;
    const connectionString = getConnectionString();
    if (!connectionString) {
        throw new Error('Thiếu DB connection string. Set env LAUNA_DATABASE_URL hoặc DATABASE_URL.');
    }
    pool = new Pool({
        connectionString,
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000
    });
    pool.on('error', (err) => {
        try { require('../logger')(`[PG] pool error: ${err.message}`, 'ERROR'); } catch { /* ignore */ }
    });
    return pool;
}

async function query(text, params) {
    return getPool().query(text, params);
}

module.exports = { getPool, query, isEnabled };
