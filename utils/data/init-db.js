'use strict';

/**
 * Khởi tạo schema cho LauNa API.
 * Đọc connection string từ config.json (database.connectionString).
 *
 * Thứ tự chạy:
 *   1. SQL_TABLES   — CREATE TABLE IF NOT EXISTS (không index)
 *   2. SQL_SEED     — INSERT dữ liệu mặc định
 *   3. MIGRATIONS   — ALTER TABLE ADD COLUMN IF NOT EXISTS (thêm cột vào bảng cũ)
 *   4. SQL_INDEXES  — CREATE INDEX IF NOT EXISTS (sau khi cột đã chắc chắn tồn tại)
 */
const { Pool } = require('pg');
const config = require('../config-loader');

// ── Bước 1: Tạo bảng (không có index) ────────────────────────────────────────
const SQL_TABLES = `
CREATE TABLE IF NOT EXISTS notes (
  uuid TEXT PRIMARY KEY,
  content TEXT NOT NULL DEFAULT '',
  raw_redirect TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sharefiles (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  link TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS request_counter (
  id INT PRIMARY KEY DEFAULT 1,
  total BIGINT NOT NULL DEFAULT 0,
  by_category JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS request_hourly (
  hour TEXT PRIMARY KEY,
  n BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tempmail_inboxes (
  email TEXT PRIMARY KEY,
  password TEXT NOT NULL,
  token TEXT NOT NULL,
  account_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_proxies (
  ip TEXT NOT NULL,
  port INT NOT NULL,
  protocol TEXT NOT NULL DEFAULT 'http',
  source TEXT,
  added_by_ip TEXT,
  alive BOOLEAN NOT NULL DEFAULT TRUE,
  fail_count INT NOT NULL DEFAULT 0,
  ms INT,
  last_checked TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ip, port)
);

CREATE TABLE IF NOT EXISTS user_proxy_sources (
  url TEXT PRIMARY KEY,
  added_by_ip TEXT,
  last_fetched TIMESTAMPTZ,
  last_count INT NOT NULL DEFAULT 0,
  fail_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auto_proxy_clients (
  client_ip TEXT PRIMARY KEY,
  reason TEXT,
  marked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hits BIGINT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS short_urls (
  code TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hits BIGINT NOT NULL DEFAULT 0
);
`;

// ── Bước 2: Seed dữ liệu mặc định ────────────────────────────────────────────
const SQL_SEED = `
INSERT INTO request_counter(id, total, by_category) VALUES (1, 0, '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;
`;

// ── Bước 3: Migration — thêm cột vào bảng CŨ (chạy trước khi tạo index) ─────
const MIGRATIONS = `
ALTER TABLE notes ADD COLUMN IF NOT EXISTS raw_redirect TEXT;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE notes ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

ALTER TABLE sharefiles ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE sharefiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE request_counter ADD COLUMN IF NOT EXISTS by_category JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE tempmail_inboxes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE tempmail_inboxes ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE user_proxies ADD COLUMN IF NOT EXISTS protocol TEXT NOT NULL DEFAULT 'http';
ALTER TABLE user_proxies ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE user_proxies ADD COLUMN IF NOT EXISTS added_by_ip TEXT;
ALTER TABLE user_proxies ADD COLUMN IF NOT EXISTS alive BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE user_proxies ADD COLUMN IF NOT EXISTS fail_count INT NOT NULL DEFAULT 0;
ALTER TABLE user_proxies ADD COLUMN IF NOT EXISTS ms INT;
ALTER TABLE user_proxies ADD COLUMN IF NOT EXISTS last_checked TIMESTAMPTZ;
ALTER TABLE user_proxies ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE user_proxy_sources ADD COLUMN IF NOT EXISTS added_by_ip TEXT;
ALTER TABLE user_proxy_sources ADD COLUMN IF NOT EXISTS last_fetched TIMESTAMPTZ;
ALTER TABLE user_proxy_sources ADD COLUMN IF NOT EXISTS last_count INT NOT NULL DEFAULT 0;
ALTER TABLE user_proxy_sources ADD COLUMN IF NOT EXISTS fail_count INT NOT NULL DEFAULT 0;
ALTER TABLE user_proxy_sources ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE auto_proxy_clients ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE auto_proxy_clients ADD COLUMN IF NOT EXISTS marked_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE auto_proxy_clients ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE auto_proxy_clients ADD COLUMN IF NOT EXISTS hits BIGINT NOT NULL DEFAULT 1;

ALTER TABLE short_urls ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE short_urls ADD COLUMN IF NOT EXISTS hits BIGINT NOT NULL DEFAULT 0;
`;

// ── Bước 4: Tạo index (sau khi cột đã chắc chắn tồn tại) ─────────────────────
const SQL_INDEXES = `
CREATE INDEX IF NOT EXISTS notes_expires_idx       ON notes(expires_at);
CREATE INDEX IF NOT EXISTS sharefiles_created_idx  ON sharefiles(created_at DESC);
CREATE INDEX IF NOT EXISTS tempmail_expires_idx    ON tempmail_inboxes(expires_at);
CREATE INDEX IF NOT EXISTS user_proxies_alive_idx  ON user_proxies(alive);
CREATE INDEX IF NOT EXISTS auto_proxy_expires_idx  ON auto_proxy_clients(expires_at);
CREATE INDEX IF NOT EXISTS short_urls_created_idx  ON short_urls(created_at DESC);
`;

(async () => {
    const cs = config?.database?.connectionString;
    if (!cs) {
        try { require('../logger')('Thiếu DB connection string. Set env LAUNA_DATABASE_URL hoặc DATABASE_URL.', 'WARN'); } catch { /* ignore */ }
        process.exit(1);
    }
    const pool = new Pool({ connectionString: cs });
    try {
        await pool.query(SQL_TABLES);
        try { require('../logger')('[init-db] Tables OK', 'INFO'); } catch { /* ignore */ }

        await pool.query(SQL_SEED);
        try { require('../logger')('[init-db] Seed OK', 'INFO'); } catch { /* ignore */ }

        await pool.query(MIGRATIONS);
        try { require('../logger')('[init-db] Migrations OK', 'INFO'); } catch { /* ignore */ }

        await pool.query(SQL_INDEXES);
        try { require('../logger')('[init-db] Indexes OK', 'INFO'); } catch { /* ignore */ }

    } catch (e) {
        try { require('../logger')(`[init-db] Lỗi: ${e.message}`, 'ERROR'); } catch { /* ignore */ }
        process.exit(1);
    } finally {
        await pool.end();
    }
})();
