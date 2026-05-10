'use strict';

/**
 * Note service — soạn ghi chú nhanh theo UUID.
 *
 *  GET  /note/:UUID                 → editor HTML (UA = browser) hoặc raw text
 *  GET  /note/:UUID?raw=true        → trả về plain text
 *  PUT  /note/:UUID  (body=text)    → lưu nội dung; TTL 5 phút reset mỗi lần ghi
 *  PUT  /note/:UUID?raw=<otherUUID> → trỏ note này tới note khác (alias/redirect)
 *
 * Notes tự xoá sau 5 phút không hoạt động.
 */

const { randomUUID } = require('crypto');
const { query, isEnabled } = require('../../utils/data/db');
const log = require('../../utils/logger');

const UUID_MAX_LEN = 36;
const NOTE_TTL_MINUTES = 5;

// ── Migration: thêm cột expires_at nếu chưa có ───────────────────────────────
let _migrated = false;
async function ensureSchema() {
    if (_migrated || !isEnabled()) return;
    _migrated = true;
    try {
        await query(`ALTER TABLE notes ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`);
        await query(`CREATE INDEX IF NOT EXISTS notes_expires_idx ON notes(expires_at)`);
        // Gán TTL cho các note cũ chưa có expires_at
        await query(
            `UPDATE notes SET expires_at = NOW() + INTERVAL '${NOTE_TTL_MINUTES} minutes'
             WHERE expires_at IS NULL`
        );
    } catch (e) {
        log(`[Note] Migration lỗi: ${e.message}`, 'WARN');
        _migrated = false; // cho retry
    }
}

// ── Cleanup định kỳ: xoá notes hết hạn ──────────────────────────────────────
let _purgeErrAt = 0;
const PURGE_ERR_COOLDOWN = 5 * 60_000;
async function purgeExpired() {
    if (!isEnabled()) return;
    try {
        const r = await query(`DELETE FROM notes WHERE expires_at IS NOT NULL AND expires_at <= NOW()`);
        if (r.rowCount > 0) log(`[Note] Đã xoá ${r.rowCount} note hết hạn.`, 'INFO');
    } catch (e) {
        const now = Date.now();
        if (now - _purgeErrAt >= PURGE_ERR_COOLDOWN) {
            _purgeErrAt = now;
            log(`[Note] Purge lỗi: ${e.message}`, 'WARN');
        }
    }
}
setInterval(() => { purgeExpired().catch(() => {}); }, 60_000).unref();

// ── DB helpers ────────────────────────────────────────────────────────────────

async function readNote(uuid) {
    await ensureSchema();
    const r = await query(
        `SELECT content, raw_redirect FROM notes
         WHERE uuid=$1 AND (expires_at IS NULL OR expires_at > NOW())`,
        [uuid]
    );
    return r.rows[0] || null;
}

async function upsertNote(uuid, content, rawRedirect) {
    await ensureSchema();
    await query(
        `INSERT INTO notes(uuid, content, raw_redirect, updated_at, expires_at)
         VALUES ($1,$2,$3,NOW(), NOW() + INTERVAL '${NOTE_TTL_MINUTES} minutes')
         ON CONFLICT (uuid) DO UPDATE
           SET content       = COALESCE(EXCLUDED.content,       notes.content),
               raw_redirect  = COALESCE(EXCLUDED.raw_redirect,  notes.raw_redirect),
               updated_at    = NOW(),
               expires_at    = NOW() + INTERVAL '${NOTE_TTL_MINUTES} minutes'`,
        [uuid, content, rawRedirect]
    );
}

module.exports = {
  name: "/note/:UUID",
  methods: {
    get: async (req, res) => {
        const uuid = req.params.UUID;

        // Thiếu UUID hoặc bị truncate → tự sinh UUID mới và redirect
        if (!uuid || uuid === ':UUID' || uuid.length > UUID_MAX_LEN) {
            return res.redirect(`./${randomUUID()}`);
        }

        let row;
        try {
            row = await readNote(uuid);
        } catch (e) {
            log(`[NOTE] readNote lỗi (${uuid}): ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi đọc note' });
        }
        const text = row?.content || '';

        // Note này là alias trỏ tới note khác → trả nội dung note đích
        if (row?.raw_redirect) {
            const target = await readNote(row.raw_redirect).catch(() => null);
            if (!target) return res.status(404).end();
            res.set('content-type', 'text/plain');
            return res.end(target.content || '');
        }

        // Trả raw text khi caller yêu cầu hoặc khi không phải trình duyệt
        const ua = req.headers['user-agent'] || '';
        if (req.query.raw === 'true' || !/^Mozilla/.test(ua)) {
            res.set('content-type', 'text/plain');
            return res.end(text);
        }

        res.set('content-type', 'text/html');
      res.end(`<!DOCTYPE html>
<html data-theme="dark">
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VS Code Note Editor</title>
    <style>
        :root {
            --bg-light: #ffffff;
            --editor-bg-light: #f5f5f5;
            --text-light: #333333;
            --line-numbers-light: #858585;
            --line-numbers-bg-light: #f0f0f0;
            --border-light: #e0e0e0;
            --header-bg-light: #f3f3f3;
            --header-text-light: #333333;
            --active-line-light: #e3e8ec;
            --scrollbar-light: #c1c1c1;
            
            --bg-dark: #1e1e1e;
            --editor-bg-dark: #1e1e1e;
            --text-dark: #d4d4d4;
            --line-numbers-dark: #858585;
            --line-numbers-bg-dark: #1e1e1e;
            --border-dark: #444444;
            --header-bg-dark: #252526;
            --header-text-dark: #cccccc;
            --active-line-dark: #282828;
            --scrollbar-dark: #424242;
        }
        
        [data-theme="light"] {
            --bg: var(--bg-light);
            --editor-bg: var(--editor-bg-light);
            --text: var(--text-light);
            --line-numbers: var(--line-numbers-light);
            --line-numbers-bg: var(--line-numbers-bg-light);
            --border: var(--border-light);
            --header-bg: var(--header-bg-light);
            --header-text: var(--header-text-light);
            --active-line: var(--active-line-light);
            --scrollbar: var(--scrollbar-light);
        }
        
        [data-theme="dark"] {
            --bg: var(--bg-dark);
            --editor-bg: var(--editor-bg-dark);
            --text: var(--text-dark);
            --line-numbers: var(--line-numbers-dark);
            --line-numbers-bg: var(--line-numbers-bg-dark);
            --border: var(--border-dark);
            --header-bg: var(--header-bg-dark);
            --header-text: var(--header-text-dark);
            --active-line: var(--active-line-dark);
            --scrollbar: var(--scrollbar-dark);
        }
        
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: 'Consolas', 'Monaco', 'Menlo', monospace;
        }
        
        body {
            margin: 0;
            padding: 0;
            background-color: var(--bg);
            color: var(--text);
            height: 100vh;
            display: flex;
            flex-direction: column;
            transition: background-color 0.3s, color 0.3s;
        }
        
        .editor-header {
            background-color: var(--header-bg);
            color: var(--header-text);
            padding: 8px 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid var(--border);
        }
        
        .editor-title {
            font-size: 14px;
            font-weight: normal;
        }
        
        .editor-subtitle {
            font-size: 12px;
            opacity: 0.7;
            margin-top: 4px;
        }
        
        .theme-toggle {
            background: none;
            border: 1px solid var(--border);
            color: var(--text);
            padding: 4px 8px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        
        .theme-toggle:hover {
            background-color: rgba(255, 255, 255, 0.1);
        }
        
        .editor-container {
            display: flex;
            flex-grow: 1;
            overflow: hidden;
            position: relative;
        }
        
        .line-numbers {
            background-color: var(--line-numbers-bg);
            color: var(--line-numbers);
            padding: 8px 8px 8px 12px;
            text-align: right;
            user-select: none;
            border-right: 1px solid var(--border);
            overflow: hidden;
            min-width: 40px;
        }
        
        .line-number {
            font-size: 13px;
            line-height: 20px;
            white-space: nowrap;
        }
        
        .editor-content {
            flex-grow: 1;
            display: flex;
            position: relative;
        }
        
        .editor-textarea {
            width: 100%;
            height: 100%;
            background-color: var(--editor-bg);
            color: var(--text);
            border: none;
            resize: none;
            outline: none;
            padding: 8px 12px;
            font-size: 13px;
            line-height: 20px;
            white-space: pre;
            overflow: auto;
            tab-size: 4;
        }
        
        .editor-textarea:focus {
            outline: none;
        }
        
        .editor-textarea::-webkit-scrollbar {
            width: 14px;
            height: 14px;
        }
        
        .editor-textarea::-webkit-scrollbar-thumb {
            background-color: var(--scrollbar);
            border-radius: 7px;
            border: 3px solid var(--editor-bg);
        }
        
        .editor-textarea::-webkit-scrollbar-track {
            background-color: var(--editor-bg);
        }
        
        .status-bar {
            background-color: var(--header-bg);
            color: var(--line-numbers);
            padding: 4px 12px;
            font-size: 12px;
            display: flex;
            justify-content: space-between;
            border-top: 1px solid var(--border);
        }
        
        .status-item {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .status-indicator {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: #4caf50;
            margin-right: 4px;
        }
        
        .status-indicator.saving {
            background-color: #ff9800;
        }
    </style>
</head>
<body>
    <div class="editor-header">
        <div>
            <h3 class="editor-title">Note Service</h3>
            <div class="editor-subtitle">Auto-saved · <span id="ttlCountdown">Expires in 5:00</span></div>
        </div>
        <button class="theme-toggle" id="themeToggle">
            <svg id="theme-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
            <span id="theme-text">Light Mode</span>
        </button>
    </div>
    
    <div class="editor-container">
        <div class="line-numbers" id="lineNumbers"></div>
        <div class="editor-content">
            <textarea id="editor" class="editor-textarea" placeholder="Start typing..."></textarea>
        </div>
    </div>
    
    <div class="status-bar">
        <div class="status-item">
            <span id="statusIndicator" class="status-indicator"></span>
            <span id="statusText">Ready</span>
        </div>
        <div class="status-item">
            <span id="cursorPosition">Ln 1, Col 1</span>
        </div>
    </div>
    
    <script>
        const editor = document.getElementById('editor');
        const lineNumbers = document.getElementById('lineNumbers');
        const themeToggle = document.getElementById('themeToggle');
        const themeText = document.getElementById('theme-text');
        const themeIcon = document.getElementById('theme-icon');
        const statusIndicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');
        const cursorPosition = document.getElementById('cursorPosition');
        const html = document.documentElement;
        
        themeToggle.addEventListener('click', () => {
            const currentTheme = html.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            html.setAttribute('data-theme', newTheme);
            
            if (newTheme === 'light') {
                themeText.textContent = 'Dark Mode';
                themeIcon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
            } else {
                themeText.textContent = 'Light Mode';
                themeIcon.innerHTML = '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';
            }
        });

        const updateLineNumbers = () => {
            const lines = editor.value.split('\\n');
            lineNumbers.innerHTML = '';
            
            for (let i = 0; i < lines.length; i++) {
                const lineNumber = document.createElement('div');
                lineNumber.className = 'line-number';
                lineNumber.textContent = i + 1;
                lineNumbers.appendChild(lineNumber);
            }
        };
        
        const updateCursorPosition = () => {
            const text = editor.value;
            const position = editor.selectionStart;
            
            const lines = text.substr(0, position).split('\\n');
            const lineNumber = lines.length;
            const columnNumber = lines[lines.length - 1].length + 1;
            
            cursorPosition.textContent = 'Ln ' + lineNumber + ', Col ' + columnNumber;
        };
        
        // ── TTL Countdown (5 phút, reset mỗi lần save) ──────────────────────
        const TTL_MS = 5 * 60 * 1000;
        let _ttlDeadline = Date.now() + TTL_MS;
        const ttlEl = document.getElementById('ttlCountdown');
        function fmtTTL(ms) {
            if (ms <= 0) return 'Expired';
            const m = Math.floor(ms / 60000);
            const s = Math.floor((ms % 60000) / 1000);
            return 'Expires in ' + m + ':' + String(s).padStart(2, '0');
        }
        setInterval(() => {
            const rem = _ttlDeadline - Date.now();
            if (ttlEl) ttlEl.textContent = fmtTTL(rem);
        }, 1000);

        let saveTimeout;
        const saveNote = () => {
            statusIndicator.classList.add('saving');
            statusText.textContent = 'Saving...';
            
            fetch(location.href, {
                method: 'PUT',
                headers: {
                    'content-type': 'text/plain; charset=utf-8',
                },
                body: editor.value,
            }).then(() => {
                _ttlDeadline = Date.now() + TTL_MS; // reset countdown sau mỗi lần save
                statusIndicator.classList.remove('saving');
                statusText.textContent = 'Saved';
                
                setTimeout(() => {
                    statusText.textContent = 'Ready';
                }, 2000);
            });
        };
        
        editor.addEventListener('input', () => {
            updateLineNumbers();
            updateCursorPosition();
            
            if (saveTimeout) clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveNote, 1000);
        });
        
        editor.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = editor.selectionStart;
                const end = editor.selectionEnd;
                
                editor.value = editor.value.substring(0, start) + '    ' + editor.value.substring(end);
                editor.selectionStart = editor.selectionEnd = start + 4;
                
                updateLineNumbers();
                updateCursorPosition();
                
                if (saveTimeout) clearTimeout(saveTimeout);
                saveTimeout = setTimeout(saveNote, 1000);
            }
        });
        
        editor.addEventListener('click', updateCursorPosition);
        editor.addEventListener('keyup', updateCursorPosition);
        
        const u = new URL(location.href);
        u.searchParams.append('raw', 'true');
        
        fetch(u.href, { method: 'GET', headers: { 'user-agent': 'fetch' } })
            .then(r => r.text())
            .then(t => {
                editor.value = t;
                updateLineNumbers();
                updateCursorPosition();
            });

        editor.addEventListener('scroll', () => {
            lineNumbers.scrollTop = editor.scrollTop;
        });
    </script>
</body>
</html>
`)
    },
    put: async (req, res) => {
        const uuid   = req.params.UUID;
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        await new Promise((resolve) => req.on('end', resolve));

        try {
            if (req.query.raw) {
                // Set redirect — chỉ khi chưa có sẵn redirect (tránh lặp)
                const existing = await readNote(uuid);
                if (!existing?.raw_redirect) {
                    await upsertNote(uuid, null, String(req.query.raw));
                }
            } else {
                await upsertNote(uuid, Buffer.concat(chunks).toString('utf8'), null);
            }
            res.end();
        } catch (e) {
            log(`[NOTE] PUT lỗi (${req.params?.UUID}): ${e.message}`, 'WARN');
            res.status(500).json({ status: false, message: 'Lỗi lưu note' });
        }
    },
  },
};
