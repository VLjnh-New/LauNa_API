'use strict';

const crypto = require('node:crypto');

const SECRET = crypto.randomBytes(32).toString('hex');

function makeToken(ip, ttlMs) {
    const exp = Date.now() + ttlMs;
    const payload = `${ip}.${exp}`;
    const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('hex').slice(0, 24);
    return Buffer.from(`${payload}.${sig}`).toString('base64url');
}

function verifyToken(raw, ip) {
    if (!raw) return false;
    try {
        const decoded = Buffer.from(raw, 'base64url').toString('utf8');
        const parts = decoded.split('.');
        if (parts.length !== 3) return false;
        const [tokenIp, expStr, sig] = parts;
        if (tokenIp !== ip) return false;
        const exp = Number(expStr);
        if (!Number.isFinite(exp) || exp < Date.now()) return false;
        const expected = crypto
            .createHmac('sha256', SECRET)
            .update(`${tokenIp}.${expStr}`)
            .digest('hex')
            .slice(0, 24);
        const a = Buffer.from(sig);
        const b = Buffer.from(expected);
        if (a.length !== b.length) return false;
        return crypto.timingSafeEqual(a, b);
    } catch {
        return false;
    }
}

function challengePage(opts) {
    return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<title>Đang xác minh trình duyệt...</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root { color-scheme: dark; }
  body{margin:0;min-height:100vh;display:grid;place-items:center;
       font-family:system-ui,Segoe UI,Roboto,sans-serif;
       background:#0b0d12;color:#eaeaea;}
  .card{background:#141821;border:1px solid #232838;padding:32px 40px;
        border-radius:14px;max-width:420px;text-align:center;
        box-shadow:0 20px 50px rgba(0,0,0,.45);}
  .ring{width:48px;height:48px;border:3px solid #2a3142;border-top-color:#5dd2ff;
        border-radius:50%;animation:spin .9s linear infinite;margin:0 auto 18px}
  @keyframes spin{to{transform:rotate(360deg)}}
  h1{margin:0 0 6px;font-size:18px;letter-spacing:.3px}
  p{margin:6px 0 0;color:#9aa3b8;font-size:13px}
  small{display:block;margin-top:14px;color:#5b6075;font-size:11px}
</style>
</head>
<body>
<div class="card">
  <div class="ring"></div>
  <h1>Đang kiểm tra trình duyệt của bạn</h1>
  <p>Vui lòng đợi vài giây — không cần thao tác.</p>
  <small id="status">Đang tính toán...</small>
</div>
<script>
(async () => {
  const difficulty = ${opts.difficulty};
  const target = "0".repeat(difficulty);
  const seed = String(Date.now()) + ":" + Math.random().toString(36).slice(2);
  const enc = new TextEncoder();
  let nonce = 0;
  const status = document.getElementById("status");
  while (true) {
    const buf = await crypto.subtle.digest("SHA-256", enc.encode(seed + ":" + nonce));
    const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
    if (hex.startsWith(target)) break;
    nonce++;
    if (nonce % 2000 === 0) status.textContent = "Đang tính toán... (" + nonce + ")";
  }
  const r = await fetch("/__shield/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seed, nonce, difficulty })
  });
  if (r.ok) {
    status.textContent = "Đã xác minh ✓ Đang chuyển hướng...";
    location.replace(${JSON.stringify(opts.returnTo)});
  } else {
    status.textContent = "Xác minh thất bại. Tải lại trang.";
  }
})();
</script>
</body>
</html>`;
}

module.exports = { makeToken, verifyToken, challengePage };
