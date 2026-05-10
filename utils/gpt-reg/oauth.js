'use strict';

const crypto = require('crypto');
const https  = require('https');

const CLIENT_ID   = 'app_EMoamEEZ73f0CkXaXp7hrann';
const AUTH_URL    = 'https://auth.openai.com/oauth/authorize';
const TOKEN_URL   = 'https://auth.openai.com/oauth/token';
const REDIRECT    = 'http://localhost:1455/auth/callback';
const SCOPE       = 'openid email profile offline_access';

function b64url(buf)   { return buf.toString('base64url'); }
function sha256(str)   { return b64url(crypto.createHash('sha256').update(str, 'ascii').digest()); }

function buildAuthUrl(screenHint = null) {
    const state        = crypto.randomBytes(16).toString('base64url');
    const codeVerifier = crypto.randomBytes(64).toString('base64url');
    const params = new URLSearchParams({
        client_id: CLIENT_ID, response_type: 'code',
        redirect_uri: REDIRECT, scope: SCOPE, state,
        code_challenge: sha256(codeVerifier), code_challenge_method: 'S256',
        prompt: 'login', id_token_add_organizations: 'true',
        codex_cli_simplified_flow: 'true',
    });
    if (screenHint) params.set('screen_hint', screenHint);
    return { authUrl: `${AUTH_URL}?${params}`, state, codeVerifier };
}

function parseCallback(url) {
    try {
        const u = new URL(url.startsWith('http') ? url : `http://localhost${url.startsWith('?') ? url : '/' + url}`);
        return Object.fromEntries(u.searchParams);
    } catch { return {}; }
}

function jwtClaims(token) {
    if (!token || token.split('.').length < 3) return {};
    try {
        const p = token.split('.')[1];
        return JSON.parse(Buffer.from(p + '='.repeat((4 - p.length % 4) % 4), 'base64url').toString('utf8'));
    } catch { return {}; }
}

async function postForm(url, data) {
    const body   = new URLSearchParams(data).toString();
    const parsed = new URL(url);
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: parsed.hostname, port: 443,
            path: parsed.pathname + parsed.search, method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36',
            },
            timeout: 30000, rejectUnauthorized: false,
        }, res => {
            let text = '';
            res.on('data', c => text += c);
            res.on('end', () => {
                if (res.statusCode !== 200)
                    return reject(new Error(`Token exchange HTTP ${res.statusCode}: ${text.slice(0, 200)}`));
                try { resolve(JSON.parse(text)); }
                catch { reject(new Error('Token exchange: JSON parse error')); }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Token exchange timeout')); });
        req.write(body);
        req.end();
    });
}

async function exchangeCode({ callbackUrl, state: expectedState, codeVerifier }) {
    const q = parseCallback(callbackUrl);
    if (q.error)          throw new Error(`OAuth error: ${q.error} — ${q.error_description || ''}`);
    if (!q.code)          throw new Error('Callback thiếu ?code=');
    if (q.state !== expectedState) throw new Error('State mismatch');

    const tok = await postForm(TOKEN_URL, {
        grant_type: 'authorization_code', client_id: CLIENT_ID,
        code: q.code, redirect_uri: REDIRECT, code_verifier: codeVerifier,
    });

    const claims   = jwtClaims(tok.id_token || '');
    const authInfo = claims['https://api.openai.com/auth'] || {};
    return {
        accessToken:  (tok.access_token  || '').trim(),
        refreshToken: (tok.refresh_token || '').trim(),
        idToken:      (tok.id_token      || '').trim(),
        accountId:    (authInfo.chatgpt_account_id || '').trim(),
        email:        (claims.email || '').trim(),
    };
}

module.exports = { buildAuthUrl, exchangeCode };
