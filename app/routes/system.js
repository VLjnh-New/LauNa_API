'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const startedAt = Date.now();

const { version: API_VERSION } = require('../../package.json');
const ffmpegPath = (() => { try { return require('ffmpeg-static'); } catch { return null; } })();
const { isAdminKey } = require('../../utils/security/admin-check');

router.get('/healthz', function (req, res) {
    res.set('Cache-Control', 'no-store');
    const mem = process.memoryUsage();
    const { loadedRoutes } = require('../server.js');
    const totalRoutes = Object.values(loadedRoutes || {}).reduce((s, r) => s + r.length, 0);
    const totalCategories = Object.keys(loadedRoutes || {}).length;

    let cacheStats, reqStats;
    try { cacheStats = require('../middleware/response-cache').getStats(); } catch { cacheStats = null; }
    try { reqStats   = require('../middleware/access-log').getStats();    } catch { reqStats   = null; }

    res.status(200).json({
        status: 'ok',
        version: API_VERSION,
        uptime: Math.floor((Date.now() - startedAt) / 1000),
        routes: { total: totalRoutes, categories: totalCategories },
        memory: {
            rss:          mem.rss,
            heap:         mem.heapUsed,
            heapTotal:    mem.heapTotal,
            external:     mem.external,
            arrayBuffers: mem.arrayBuffers,
        },
        node: process.version,
        pid: process.pid,
        ffmpeg: !!ffmpegPath,
        redis: !!process.env.REDIS_URL,
        env: process.env.NODE_ENV || 'development',
        cache: cacheStats,
        requests: reqStats,
    });
});

router.get('/readyz', function (req, res) {
    res.set('Cache-Control', 'no-store');
    res.status(200).json({ status: 'ready', version: API_VERSION });
});

// Ví dụ mẫu cho các tham số phổ biến — giúp người dùng biết phải nhập gì khi Try it out
const PARAM_EXAMPLES = {
    url:         'https://www.tiktok.com/@user/video/7000000000000000000',
    q:           'tiktok trend remix',
    query:       'sơn tùng mtp',
    prompt:      'Vẽ một con mèo cyberpunk neon',
    text:        'Xin chào, đây là giọng đọc thử nghiệm.',
    voice:       'vi-VN-HoaiMyNeural',
    lang:        'vi',
    gender:      'Female',
    rate:        '0',
    pitch:       '0',
    volume:      '100',
    format:      'mp3',
    base64:      '',
    proxy:       '',
    type:        'video',
    stream:      'false',
    download:    '0',
    limit:       '20',
    timeout:     '30',
    scale:       '2',
    quality:     '85',
    max:         '1280',
    model:       'flux-1.1-pro',
    action:      'enhance',
    session:     'demo-session-1',
    nocache:     '0',
    concurrency: '4',
    start:       '1',
    raw:         '0',
    title:       'Có chàng trai viết lên cây',
    track:       'Có chàng trai viết lên cây',
    artist:      'Phan Mạnh Quỳnh',
    album:       '',
    duration:    '240',
    id:          '',
    UUID:        'abc123',
    key:         '',
    uid:         '123456789',
    server:      'sg',
    keyword:     'Free Fire VN',
    gamemode:    'br',
    matchmode:   'ranked',
    name:        'Yena',
    hero:        'Yena',
    lane:        'Mid',
    position:    'AP',
    class:       'Mage',
    count:       '5',
    need_gallery_info: 'false',
    need_blacklist:    'false',
    need_spark_info:   'false',
    call_sign_src:     'false',
    token:       'YOUR_BOT_TOKEN',
    captchaKey:  'YOUR_CAPTCHA_KEY',
    provider:    'yescaptcha',
    hcaptchaToken: '',
    lowquality:  '0',
    mute:        '0',
    resolve:     'true',
    email:       'demo@launa.vn',
    number:      '+84901234567',
    apikey:      '',
    ui:          '0'
};

function exampleFor(paramName){
    if (Object.prototype.hasOwnProperty.call(PARAM_EXAMPLES, paramName)) return PARAM_EXAMPLES[paramName];
    return '';
}

function buildSpec() {
    const { loadedRoutes } = require('../server.js');
    const paths = {};
    for (const [category, routes] of Object.entries(loadedRoutes || {})) {
        for (const route of routes) {
            const oasPath = String(route.name).replace(/:(\w+)/g, '{$1}');
            paths[oasPath] = paths[oasPath] || {};
            paths[oasPath].get = {
                tags: [category],
                summary: route.name,
                description: `Endpoint: \`GET ${route.name}\`. Bấm **Try it out** rồi **Execute** để test trực tiếp. Apikey sẽ được tự động đính kèm nếu bạn đã dán vào ô ở thanh trên cùng.`,
                parameters: (route.params || []).map(p => {
                    const ex = exampleFor(p);
                    const isPath = oasPath.includes('{' + p + '}');
                    return {
                        name: p,
                        in: isPath ? 'path' : 'query',
                        required: isPath,
                        description: ex ? `Ví dụ: \`${ex}\`` : '',
                        example: ex || undefined,
                        schema: { type: 'string', example: ex || undefined }
                    };
                }),
                security: [{ ApiKeyQuery: [] }, { ApiKeyHeader: [] }],
                responses: {
                    '200': { description: 'OK' },
                    '401': { description: 'Thiếu / sai API key' },
                    '429': { description: 'Vượt quota' }
                }
            };
        }
    }
    paths['/healthz']       = { get: { tags: ['Hệ thống'], summary: 'Healthcheck',  responses: { '200': { description: 'OK' } } } };
    paths['/readyz']        = { get: { tags: ['Hệ thống'], summary: 'Readiness',    responses: { '200': { description: 'OK' } } } };
    paths['/total_request'] = { get: { tags: ['Hệ thống'], summary: 'Tổng request', responses: { '200': { description: 'OK' } } } };

    return {
        openapi: '3.0.3',
        info: {
            title: 'LauNa API',
            version: require('../../package.json').version || '4.0.0',
            description: 'REST API Hub cho cộng đồng ChatBot & Dev Việt — AI · Download · Music · Note · Share File · FreeFire · LiênQuân · Tools',
            contact: { name: 'Ljzi' },
            license: { name: 'ISC' }
        },
        servers: [{ url: '/', description: 'Server hiện tại' }],
        tags: Object.keys(require('../server.js').loadedRoutes || {}).map(t => ({ name: t })).concat([{ name: 'Hệ thống' }]),
        components: {
            securitySchemes: {
                ApiKeyQuery:  { type: 'apiKey', in: 'query',  name: 'apikey' },
                ApiKeyHeader: { type: 'apiKey', in: 'header', name: 'x-api-key' }
            }
        },
        paths
    };
}

// /openapi.json — ẩn, chỉ admin mới truy cập trực tiếp
router.get('/openapi.json', function (req, res) {
    const token = req.query.apikey || req.headers['x-api-key'] || req.headers['apikey'];
    if (!isAdminKey(token)) {
        return res.status(404).type('text/plain').send('Not Found');
    }
    res.set('Cache-Control', 'no-store');
    res.json(buildSpec());
});

router.get('/docs', function (req, res) {
    const spec = buildSpec();
    const specJson = JSON.stringify(spec).replace(/</g, '\\u003c');
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="vi"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LauNa · API Docs</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
<style>
:root{
  --bg:#070a13; --surface:#0e1422; --surface-2:#131a2c; --elev:#1a2238;
  --border:#1d2840; --border-2:#283455; --text:#e7ecf7; --muted:#7d8aaa; --muted-2:#566184;
  --primary:#34d399; --primary-glow:rgba(52,211,153,.16); --primary-deep:#059669;
  --amber:#fbbf24; --rose:#fb7185; --cyan:#22d3ee; --violet:#a78bfa;
  --mono:'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  --sans:'Inter', system-ui, sans-serif;
  --display:'Space Grotesk', 'Inter', sans-serif;
}
*,*::before,*::after{box-sizing:border-box}
html,body{background:var(--bg);color:var(--text);font-family:var(--sans);margin:0;padding:0;-webkit-font-smoothing:antialiased}
body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:0;background:radial-gradient(900px 520px at 12% -10%,rgba(52,211,153,.07),transparent 60%),radial-gradient(720px 480px at 100% 0%,rgba(34,211,238,.05),transparent 60%);}

/* ── Topbar branding ── */
.docs-top{position:sticky;top:0;z-index:50;display:flex;align-items:center;gap:14px;padding:14px 22px;background:linear-gradient(180deg,#0a1020,rgba(7,10,19,.85));backdrop-filter:blur(10px);border-bottom:1px solid var(--border)}
.docs-mark{width:32px;height:32px;border-radius:9px;background:conic-gradient(from 200deg,var(--primary),var(--cyan),var(--violet),var(--primary));box-shadow:0 4px 18px var(--primary-glow);position:relative;flex-shrink:0}
.docs-mark::after{content:'';position:absolute;inset:6px;border-radius:5px;background:#070a13}
.docs-title{font-family:var(--display);font-weight:700;font-size:18px;letter-spacing:-.3px}
.docs-ver{font-family:var(--mono);font-size:11px;color:var(--primary);border:1px solid rgba(52,211,153,.4);padding:2px 7px;border-radius:5px;margin-left:6px}
.docs-actions{margin-left:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.docs-btn{font-family:var(--sans);font-size:13px;font-weight:600;color:var(--text);background:var(--surface-2);border:1px solid var(--border-2);padding:7px 14px;border-radius:8px;cursor:pointer;text-decoration:none;transition:all .15s}
.docs-btn:hover{border-color:var(--primary);color:var(--primary)}
.docs-btn.primary{background:var(--primary);color:#062319;border-color:var(--primary)}
.docs-btn.primary:hover{background:var(--primary-deep);color:#fff}
.docs-key{font-family:var(--mono);font-size:13px;background:var(--surface-2);border:1px solid var(--border-2);color:var(--text);padding:7px 12px;border-radius:8px;width:240px;max-width:36vw}
.docs-key:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-glow)}

/* ── Hero ── */
.docs-hero{padding:28px 22px 6px;max-width:1280px;margin:0 auto}
.docs-eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:1.6px;color:var(--primary);text-transform:uppercase}
.docs-h1{font-family:var(--display);font-size:30px;font-weight:700;margin:6px 0 6px;letter-spacing:-.5px}
.docs-lead{color:var(--muted);font-size:14.5px;max-width:760px;line-height:1.55}
.docs-stats{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.docs-stat{font-family:var(--mono);font-size:12px;color:var(--muted);background:var(--surface-2);border:1px solid var(--border);padding:6px 12px;border-radius:99px}
.docs-stat b{color:var(--primary);margin-right:4px}

/* ── Quick-start guide ── */
.docs-guide{max-width:1280px;margin:18px auto 0;padding:0 22px}
.docs-guide-card{background:linear-gradient(135deg,rgba(52,211,153,.06),rgba(34,211,238,.04));border:1px solid rgba(52,211,153,.22);border-radius:14px;padding:18px 20px}
.docs-guide-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}
.docs-guide-eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:1.4px;color:var(--primary);text-transform:uppercase}
.docs-guide-title{font-family:var(--display);font-size:17px;font-weight:700;margin:0}
.docs-guide-toggle{margin-left:auto;font-family:var(--mono);font-size:12px;color:var(--muted);background:var(--surface-2);border:1px solid var(--border-2);border-radius:7px;padding:5px 10px;cursor:pointer}
.docs-guide-toggle:hover{color:var(--primary);border-color:var(--primary)}
.docs-guide-body{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-top:12px}
.docs-step{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px}
.docs-step-num{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:var(--primary);color:#062319;font-family:var(--mono);font-weight:700;font-size:12px;margin-right:8px}
.docs-step-title{font-family:var(--display);font-weight:600;font-size:14px;color:var(--text);display:flex;align-items:center;margin-bottom:8px}
.docs-step p{margin:0 0 8px;color:var(--muted);font-size:13px;line-height:1.55}
.docs-step a{color:var(--primary);text-decoration:none;font-weight:600}
.docs-step a:hover{text-decoration:underline}
.docs-code{background:#070b16;border:1px solid var(--border);border-radius:8px;padding:12px 14px;font-family:var(--mono);font-size:12.5px;line-height:1.6;color:#cdd6f4;overflow-x:auto;white-space:pre;margin:0;position:relative;min-height:48px}
.docs-code-tabs{display:flex;gap:4px;margin-bottom:6px;flex-wrap:wrap}
.docs-code-tab{font-family:var(--mono);font-size:11px;color:var(--muted);background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:3px 9px;cursor:pointer}
.docs-code-tab.is-active{color:var(--primary);border-color:var(--primary);background:var(--primary-glow)}
.docs-copy{position:absolute;top:6px;right:6px;font-family:var(--mono);font-size:10.5px;color:var(--muted);background:var(--surface-2);border:1px solid var(--border-2);border-radius:5px;padding:2px 7px;cursor:pointer;opacity:.7;transition:opacity .15s,color .15s}
.docs-code:hover .docs-copy{opacity:1}
.docs-copy:hover{color:var(--primary);border-color:var(--primary)}
.docs-copy.ok{color:var(--primary);border-color:var(--primary)}
.docs-key-hl{color:#fbbf24}
.docs-guide.is-collapsed .docs-guide-body{display:none}
.docs-guide.is-collapsed .docs-guide-head{margin-bottom:0}

/* ── Swagger UI overrides (dark) ── */
#swagger{max-width:1280px;margin:14px auto 60px;padding:0 12px}
.swagger-ui, .swagger-ui .info, .swagger-ui .scheme-container{background:transparent !important;color:var(--text) !important;font-family:var(--sans) !important}
.swagger-ui .topbar{display:none}
.swagger-ui .info{display:none}
.swagger-ui .scheme-container{box-shadow:none;border:1px solid var(--border);background:var(--surface) !important;border-radius:12px;padding:14px 18px;margin:8px 0 18px}
.swagger-ui .scheme-container .schemes>label,.swagger-ui label{color:var(--muted) !important;font-family:var(--mono) !important;font-size:12px}
.swagger-ui .filter-container{padding:0;margin-bottom:14px}
.swagger-ui .filter .operation-filter-input{background:var(--surface-2) !important;color:var(--text) !important;border:1px solid var(--border-2) !important;border-radius:10px;padding:11px 14px;font-family:var(--mono);font-size:13px}
.swagger-ui .opblock-tag{font-family:var(--display);font-size:18px;color:var(--text) !important;border:none;border-bottom:1px solid var(--border) !important;padding:14px 8px}
.swagger-ui .opblock-tag small{color:var(--muted) !important}
.swagger-ui .opblock{background:var(--surface) !important;border:1px solid var(--border) !important;border-radius:12px !important;box-shadow:none !important;margin:0 0 10px}
.swagger-ui .opblock .opblock-summary{border-bottom:1px solid var(--border) !important;padding:10px 14px}
.swagger-ui .opblock .opblock-summary-method{background:var(--primary) !important;color:#062319 !important;text-shadow:none !important;border-radius:6px;font-family:var(--mono) !important;font-weight:700;min-width:72px;padding:6px 10px}
.swagger-ui .opblock.opblock-get .opblock-summary-method{background:var(--cyan) !important;color:#062a30 !important}
.swagger-ui .opblock.opblock-post .opblock-summary-method{background:var(--primary) !important}
.swagger-ui .opblock.opblock-delete .opblock-summary-method{background:var(--rose) !important;color:#3a0c14 !important}
.swagger-ui .opblock-summary-path,.swagger-ui .opblock-summary-path a{color:var(--text) !important;font-family:var(--mono) !important;font-size:14px;font-weight:600}
.swagger-ui .opblock-summary-description{color:var(--muted) !important;font-family:var(--sans) !important}
.swagger-ui .opblock-section-header{background:var(--surface-2) !important;box-shadow:none !important;border-radius:0 !important;padding:10px 14px}
.swagger-ui .opblock-section-header h4,.swagger-ui .tab li,.swagger-ui table thead tr th,.swagger-ui table thead tr td,.swagger-ui .parameter__name,.swagger-ui .parameter__type,.swagger-ui .parameter__in,.swagger-ui .response-col_status,.swagger-ui .response-col_description,.swagger-ui .responses-inner h4,.swagger-ui .responses-inner h5,.swagger-ui .opblock-description-wrapper p,.swagger-ui .opblock-external-docs-wrapper p,.swagger-ui .opblock-title_normal p{color:var(--text) !important}
.swagger-ui .parameter__name.required::after{color:var(--rose) !important}
.swagger-ui .parameter__type{color:var(--muted) !important;font-family:var(--mono) !important}
.swagger-ui input[type=text],.swagger-ui input[type=password],.swagger-ui input[type=email],.swagger-ui textarea,.swagger-ui select{background:var(--surface-2) !important;color:var(--text) !important;border:1px solid var(--border-2) !important;border-radius:8px !important;padding:8px 12px !important;font-family:var(--mono) !important}
.swagger-ui .btn{background:var(--surface-2);color:var(--text);border:1px solid var(--border-2);border-radius:8px;font-family:var(--sans);font-weight:600;box-shadow:none}
.swagger-ui .btn:hover{border-color:var(--primary);color:var(--primary)}
.swagger-ui .btn.execute{background:var(--primary) !important;color:#062319 !important;border-color:var(--primary) !important;font-size:14px;padding:8px 22px;font-weight:700;box-shadow:0 4px 14px rgba(52,211,153,.35)}
.swagger-ui .btn.execute:hover{background:var(--primary-deep) !important;color:#fff !important}
.swagger-ui .btn.try-out__btn{background:linear-gradient(135deg,#22d3ee,#34d399) !important;color:#062319 !important;border:0 !important;font-weight:700 !important;font-size:13px !important;padding:7px 16px !important;box-shadow:0 4px 12px rgba(34,211,238,.3) !important}
.swagger-ui .btn.try-out__btn::before{content:'▶ '}
.swagger-ui .btn.try-out__btn:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(52,211,153,.4) !important}
.swagger-ui .btn.cancel{background:var(--surface-2) !important;color:var(--rose) !important;border:1px solid rgba(251,113,133,.3) !important;font-weight:600}
.swagger-ui .try-out{padding:10px 14px;background:var(--surface-2);border-radius:8px;margin-bottom:10px}
.swagger-ui .opblock.is-open .opblock-section-header{background:linear-gradient(180deg,rgba(52,211,153,.05),transparent) !important}
.swagger-ui .parameters-col_description input[type=text]{width:100% !important;min-height:38px !important;cursor:text !important}
.swagger-ui .parameters-col_description input[type=text]:focus{border-color:var(--primary) !important;box-shadow:0 0 0 3px var(--primary-glow) !important}
.swagger-ui .parameter__example{color:var(--amber) !important;font-family:var(--mono) !important;font-size:11.5px !important}
.swagger-ui .markdown code,.swagger-ui .renderedMarkdown code{background:#070b16 !important;color:var(--amber) !important;font-family:var(--mono) !important;padding:1px 6px !important;border-radius:4px !important;border:1px solid var(--border) !important}
.swagger-ui .markdown p,.swagger-ui .renderedMarkdown p{color:var(--text) !important}
.swagger-ui .responses-table .response,.swagger-ui table tbody tr td{background:transparent !important;border-color:var(--border) !important;color:var(--text)}
.swagger-ui .highlight-code,.swagger-ui .microlight,.swagger-ui pre,.swagger-ui code{background:#0a1020 !important;color:#cdd6f4 !important;font-family:var(--mono) !important;border-radius:8px !important;border:1px solid var(--border) !important}
.swagger-ui .model-box,.swagger-ui section.models{background:var(--surface) !important;border:1px solid var(--border) !important;border-radius:12px !important;color:var(--text)}
.swagger-ui section.models h4 span,.swagger-ui section.models .model-container,.swagger-ui .model{color:var(--text) !important}
.swagger-ui .auth-wrapper .authorize{color:var(--primary) !important;border-color:var(--primary) !important}
.swagger-ui .dialog-ux .modal-ux{background:var(--surface) !important;color:var(--text) !important;border:1px solid var(--border) !important;border-radius:14px}
.swagger-ui .dialog-ux .modal-ux-header{background:var(--surface-2) !important;border-bottom:1px solid var(--border) !important}
.swagger-ui svg{fill:var(--text)}
.swagger-ui .opblock-summary-control:focus{outline:none;box-shadow:0 0 0 3px var(--primary-glow)}
@media (max-width:720px){
  .docs-h1{font-size:23px}
  .docs-key{width:160px}
}
</style>
</head>
<body>
<header class="docs-top">
  <span class="docs-mark"></span>
  <span class="docs-title">LauNa API <span class="docs-ver">v${spec.info.version}</span></span>
  <div class="docs-actions">
    <input id="docs-key" class="docs-key" type="text" placeholder="apikey (lưu vào trình duyệt)" autocomplete="off">
    <a href="/" class="docs-btn">← Trang chủ</a>
    <a href="/api" class="docs-btn">API Catalog</a>
  </div>
</header>
<section class="docs-hero">
  <div class="docs-eyebrow">§ OPENAPI 3.0 · INTERACTIVE DOCS</div>
  <h1 class="docs-h1">Tài liệu API LauNa</h1>
  <p class="docs-lead">Spec OpenAPI 3 đầy đủ cho mọi endpoint. Bấm <b>Try it out</b> ở từng route, dán apikey vào ô bên trên rồi chạy thẳng trong trình duyệt — kết quả + cURL trả về ngay.</p>
  <div class="docs-stats" id="docs-stats"></div>
</section>

<section class="docs-guide" id="docs-guide">
  <div class="docs-guide-card">
    <div class="docs-guide-head">
      <span class="docs-guide-eyebrow">⚡ Hướng dẫn nhanh</span>
      <h2 class="docs-guide-title">Cách lấy apikey & test trong 30 giây</h2>
      <button type="button" class="docs-guide-toggle" id="docs-guide-toggle">Ẩn</button>
    </div>
    <div class="docs-guide-body">

      <div class="docs-step">
        <div class="docs-step-title"><span class="docs-step-num">1</span>Lấy free apikey</div>
        <p>Vào trang <a href="/api" target="_blank">API Catalog</a> → bấm <b>"Nhận key ngay"</b> (giải Turnstile nếu có). Mỗi IP sẽ nhận được 1 key miễn phí, giới hạn ${(global.config && global.config.freeKey && global.config.freeKey.requestsPerHour) || 60} request/giờ và tự reset.</p>
        <p style="margin:0;color:var(--muted-2);font-size:12px;">💡 Cần key admin/quota cao? Nhắn tác giả Ljzi.</p>
      </div>

      <div class="docs-step">
        <div class="docs-step-title"><span class="docs-step-num">2</span>Dán key vào ô phía trên</div>
        <p>Nhập apikey vào ô <b>"apikey (lưu vào trình duyệt)"</b> ở thanh trên cùng. Key sẽ được lưu trong trình duyệt (localStorage) và <b>tự động đính kèm</b> vào mọi request <b>Try it out</b> bên dưới — không cần dán lại.</p>
        <button type="button" class="docs-btn primary" id="docs-focus-key" style="font-size:12px;padding:6px 12px;">↑ Dán apikey ngay</button>
      </div>

      <div class="docs-step">
        <div class="docs-step-title"><span class="docs-step-num">3</span>Test thử trong trình duyệt</div>
        <p>Mở 1 endpoint bất kỳ → bấm <b>Try it out</b> → điền tham số → bấm <b>Execute</b>. Kết quả JSON và cURL sẽ hiện ngay bên dưới.</p>
        <p style="margin:0;color:var(--muted-2);font-size:12px;">Hoặc test trực tiếp bằng URL: <code style="color:var(--primary);font-family:var(--mono);font-size:11.5px;">/ai/voices?apikey=KEY_CỦA_BẠN</code></p>
      </div>

      <div class="docs-step" style="grid-column:1/-1">
        <div class="docs-step-title"><span class="docs-step-num">4</span>Ví dụ gọi từ code (chọn ngôn ngữ)</div>
        <div class="docs-code-tabs" id="docs-tabs">
          <button type="button" class="docs-code-tab is-active" data-lang="curl">cURL</button>
          <button type="button" class="docs-code-tab" data-lang="js">JavaScript (fetch)</button>
          <button type="button" class="docs-code-tab" data-lang="node">Node.js (axios)</button>
          <button type="button" class="docs-code-tab" data-lang="py">Python (requests)</button>
          <button type="button" class="docs-code-tab" data-lang="header">Header thay vì query</button>
        </div>
        <div style="position:relative">
          <pre class="docs-code" id="docs-code-block"></pre>
          <button type="button" class="docs-copy" id="docs-copy-btn">Copy</button>
        </div>
        <p style="margin:8px 0 0;color:var(--muted-2);font-size:12px;">Trả về <code style="color:var(--rose)">401</code> nghĩa là <b>thiếu/sai apikey</b>. Trả về <code style="color:var(--amber)">429</code> nghĩa là <b>vượt quota</b> (60 req/giờ với free key).</p>
      </div>

    </div>
  </div>
</section>

<div id="swagger"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
<script>
(function(){
  var SPEC = ${specJson};
  var KEY_LS = 'launa_docs_apikey';
  var keyInput = document.getElementById('docs-key');
  try { keyInput.value = localStorage.getItem(KEY_LS) || ''; } catch(e){}

  var pathCount = Object.keys(SPEC.paths || {}).length;
  var tagCount = (SPEC.tags || []).length;
  var stats = document.getElementById('docs-stats');
  stats.innerHTML = '<span class="docs-stat"><b>' + pathCount + '</b> endpoints</span>'
                  + '<span class="docs-stat"><b>' + tagCount + '</b> nhóm</span>'
                  + '<span class="docs-stat"><b>OpenAPI</b> 3.0.3</span>';

  var ui = SwaggerUIBundle({
    spec: SPEC,
    dom_id: '#swagger',
    deepLinking: true,
    docExpansion: 'none',
    filter: true,
    tryItOutEnabled: true,
    persistAuthorization: true,
    defaultModelsExpandDepth: -1,
    displayRequestDuration: true,
    syntaxHighlight: { theme: 'monokai' },
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset.slice(1)],
    requestInterceptor: function(req){
      var k = '';
      try { k = (localStorage.getItem(KEY_LS) || '').trim(); } catch(e){}
      if (!k) return req;
      try {
        var u = new URL(req.url, location.origin);
        if (!u.searchParams.has('apikey')) u.searchParams.set('apikey', k);
        req.url = u.toString();
      } catch(e){}
      req.headers = req.headers || {};
      if (!req.headers['x-api-key']) req.headers['x-api-key'] = k;
      return req;
    }
  });

  // ── Auto-bấm "Try it out" khi user mở 1 endpoint ──
  // SwaggerUI mặc định bắt user phải bấm Try it out trước mới gõ được.
  // Quan sát DOM, mỗi khi opblock chuyển sang trạng thái .is-open thì auto-click nút try-out.
  var swaggerRoot = document.getElementById('swagger');
  if (swaggerRoot && window.MutationObserver) {
    var triggered = new WeakSet();
    var mo = new MutationObserver(function(){
      var openBlocks = swaggerRoot.querySelectorAll('.opblock.is-open');
      openBlocks.forEach(function(block){
        if (triggered.has(block)) return;
        var tryBtn = block.querySelector('.try-out__btn');
        if (tryBtn && !block.querySelector('.execute')) {
          triggered.add(block);
          setTimeout(function(){ try { tryBtn.click(); } catch(e){} }, 60);
        }
      });
    });
    mo.observe(swaggerRoot, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  keyInput.addEventListener('input', function(){
    try { localStorage.setItem(KEY_LS, keyInput.value.trim()); } catch(e){}
    renderCode();
  });

  // ── Quick-start guide: focus key, code tabs, copy, collapse ──
  var focusBtn = document.getElementById('docs-focus-key');
  if (focusBtn) focusBtn.addEventListener('click', function(){
    keyInput.focus(); keyInput.select();
    keyInput.style.boxShadow = '0 0 0 4px rgba(52,211,153,.35)';
    setTimeout(function(){ keyInput.style.boxShadow=''; }, 1400);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  var guideToggle = document.getElementById('docs-guide-toggle');
  var guide = document.getElementById('docs-guide');
  var GUIDE_LS = 'launa_docs_guide_collapsed';
  try { if (localStorage.getItem(GUIDE_LS) === '1') { guide.classList.add('is-collapsed'); guideToggle.textContent = 'Hiện'; } } catch(e){}
  if (guideToggle) guideToggle.addEventListener('click', function(){
    var collapsed = guide.classList.toggle('is-collapsed');
    guideToggle.textContent = collapsed ? 'Hiện' : 'Ẩn';
    try { localStorage.setItem(GUIDE_LS, collapsed ? '1' : '0'); } catch(e){}
  });

  var origin = location.origin;
  var samplePaths = Object.keys(SPEC.paths || {}).filter(function(p){
    return p !== '/healthz' && p !== '/readyz' && p !== '/total_request';
  });
  var samplePath = samplePaths[0] || '/ai/voices';
  var sampleParams = (SPEC.paths[samplePath] && SPEC.paths[samplePath].get && SPEC.paths[samplePath].get.parameters) || [];

  function snippetFor(lang){
    var key = (keyInput.value || '').trim() || 'YOUR_API_KEY';
    var keyHl = '<span class="docs-key-hl">' + esc(key) + '</span>';
    var qsExtra = sampleParams.map(function(p){ return '&' + p.name + '=...'; }).join('');
    var url = origin + samplePath + '?apikey=' + key + qsExtra;
    var urlNoKey = origin + samplePath + (sampleParams.length ? '?' + sampleParams.map(function(p){ return p.name + '=...'; }).join('&') : '');
    var urlHl = esc(origin + samplePath + '?apikey=') + keyHl + esc(qsExtra);

    if (lang === 'curl') {
      return 'curl "' + urlHl + '"';
    }
    if (lang === 'js') {
      return 'const res = await fetch("' + urlHl + '");\\nconst data = await res.json();\\nconsole.log(data);';
    }
    if (lang === 'node') {
      return 'const axios = require("axios");\\n\\nconst { data } = await axios.get("' + esc(origin + samplePath) + '", {\\n  params: { apikey: "' + keyHl + '"' + sampleParams.map(function(p){ return ', ' + p.name + ': "..."'; }).join('') + ' }\\n});\\nconsole.log(data);';
    }
    if (lang === 'py') {
      return 'import requests\\n\\nr = requests.get(\\n    "' + esc(origin + samplePath) + '",\\n    params={"apikey": "' + keyHl + '"' + sampleParams.map(function(p){ return ', "' + p.name + '": "..."'; }).join('') + '},\\n    timeout=30,\\n)\\nprint(r.json())';
    }
    if (lang === 'header') {
      return '# Truyền apikey qua HEADER thay vì query string\\n\\ncurl -H "x-api-key: ' + keyHl + '" \\\\\\n     "' + esc(urlNoKey) + '"';
    }
    return '';
  }
  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  var codeBlock = document.getElementById('docs-code-block');
  var copyBtn   = document.getElementById('docs-copy-btn');
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.docs-code-tab'));
  var currentLang = 'curl';
  function renderCode(){
    if (!codeBlock) return;
    codeBlock.innerHTML = snippetFor(currentLang);
  }
  tabs.forEach(function(tab){
    tab.addEventListener('click', function(){
      tabs.forEach(function(t){ t.classList.remove('is-active'); });
      tab.classList.add('is-active');
      currentLang = tab.getAttribute('data-lang');
      renderCode();
    });
  });
  if (copyBtn) copyBtn.addEventListener('click', function(){
    var text = codeBlock.textContent || '';
    var done = function(){
      copyBtn.textContent = '✓ Đã copy';
      copyBtn.classList.add('ok');
      setTimeout(function(){ copyBtn.textContent = 'Copy'; copyBtn.classList.remove('ok'); }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function(){
        var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
        ta.select(); try { document.execCommand('copy'); } catch(e){} document.body.removeChild(ta); done();
      });
    } else {
      var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
      ta.select(); try { document.execCommand('copy'); } catch(e){} document.body.removeChild(ta); done();
    }
  });
  renderCode();
})();
</script>
</body></html>`);
});

module.exports = router;
