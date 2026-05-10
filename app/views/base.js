'use strict';

const { getSoundCloudPlayerHtml, getSoundCloudPlayerScript } = require('./soundcloud-player');
const { getAiSupportHtml, getAiSupportScript } = require('./ai-support');

function getBasePage(title, body, extraScript = '', opts = {}) {
    const active = opts.active || '';
    const tsCfg = global.config?.turnstile || {};
    const siteKey = (tsCfg.siteKey && tsCfg.siteKey !== 'NHAP_SITE_KEY_CUA_BAN') ? tsCfg.siteKey : '';
    const turnstileHead = siteKey
        ? `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>\n    <script>var __TS_KEY='${siteKey}';</script>`
        : `<script>var __TS_KEY='';</script>`;
    const navItems = [
        { href: '/', label: 'Trang chủ', icon: '◉', key: 'home' },
        { href: '/download', label: 'Download', icon: '↓', key: 'download' },
        { href: '/tempmail', label: 'Mail Ảo 10p', icon: '✉', key: 'tempmail' },
        { href: '/tempsms', label: 'SĐT Ảo', icon: '☎', key: 'tempsms' },
        { href: '/vps', label: 'VPS Manager', icon: '▣', key: 'vps' },
        { href: '/voice', label: 'Voice Studio', icon: '♬', key: 'voice' },
        { href: '/proxy', label: 'Proxy Pool', icon: '◈', key: 'proxy' },
        { href: '/fb-login', label: 'FB Login (Get Token)', icon: 'ⓕ', key: 'fblogin' },
        { href: '/tools-vn', label: 'Bộ Tool VN', icon: '⚙', key: 'tools-vn' },
        { href: '/api', label: 'API Catalog', icon: '⌘', key: 'api' },
        { href: '/docs', label: 'Swagger / OpenAPI', icon: '§', key: 'docs', external: true },
        { href: '/health', label: 'Health Check', icon: '✓', key: 'health' }
    ];
    const navHtml = navItems.map(it => `<a href="${it.href}"${it.external ? ' target="_blank" rel="noopener"' : ''} class="side-link${active === it.key ? ' is-active' : ''}"><span class="side-ico">${it.icon}</span>${it.label}</a>`).join('');

    return `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link rel="icon" type="image/png" href="/avatar.png">
    <link rel="apple-touch-icon" href="/avatar.png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" media="print" onload="this.media='all'">
    <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap"></noscript>
    ${turnstileHead}
    <link rel="stylesheet" href="/style.css">
</head>
<body>
    <aside class="sidebar" id="sidebar">
        <div class="side-brand">
            <span class="side-mark"><img src="/avatar.png" alt="LauNa"></span>
            <span class="side-name">LauNa</span>
        </div>
        <div class="side-section">Khu chính</div>
        ${navHtml}
        <div class="side-foot">
            <div>Status: <b>● online</b></div>
            <div style="margin-top:4px;">© ${new Date().getFullYear()} LauNa · Ljzi</div>
        </div>
    </aside>
    <div class="scrim" id="scrim"></div>
    <div class="main">
        <div class="topbar">
            <button class="topbar-burger" id="burger" aria-label="Menu">≡</button>
            <span class="topbar-title">LauNa</span>
        </div>
        ${body}
        <div class="footer">
            <span>LauNa API · REST Hub</span>
            <span>AI · Download · Music · Note · Share · FreeFire</span>
        </div>
    </div>
    ${getSoundCloudPlayerHtml()}
    ${getAiSupportHtml()}

    <!-- ── Challenge Overlay ──────────────────────────────── -->
    <div id="challenge-overlay" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(7,10,19,.92);backdrop-filter:blur(12px);align-items:center;justify-content:center;">
        <div style="background:#0e1422;border:1px solid #1d2840;border-radius:16px;padding:32px 28px;max-width:380px;width:90%;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.6);">
            <div style="width:48px;height:48px;border-radius:12px;background:conic-gradient(from 200deg,#34d399,#22d3ee,#a78bfa,#34d399);margin:0 auto 16px;"></div>
            <h2 style="font-family:'Space Grotesk',sans-serif;font-size:18px;color:#fff;margin-bottom:8px;">Xác minh bảo mật</h2>
            <p style="color:#7d8aaa;font-size:13.5px;line-height:1.6;margin-bottom:20px;" id="challenge-msg">Hệ thống phát hiện hoạt động bất thường từ IP của bạn. Vui lòng xác minh để tiếp tục.</p>
            <div id="challenge-ts-widget" style="display:flex;justify-content:center;margin-bottom:16px;"></div>
            <div id="challenge-status" style="font-size:13px;color:#34d399;min-height:18px;margin-bottom:12px;"></div>
            <button id="challenge-close" style="font-size:12px;color:#566184;background:transparent;border:0;cursor:pointer;font-family:inherit;padding:4px 8px;">Đóng</button>
        </div>
    </div>

    <script>
    (function(){
        var burger = document.getElementById('burger');
        var sidebar = document.getElementById('sidebar');
        var scrim = document.getElementById('scrim');
        if (!burger) return;
        function closeSidebar(){ sidebar.classList.remove('is-open'); scrim.classList.remove('is-open'); }
        burger.addEventListener('click', function(){ sidebar.classList.toggle('is-open'); scrim.classList.toggle('is-open'); });
        scrim.addEventListener('click', closeSidebar);
        // Tự đóng sidebar khi bấm link trên mobile
        sidebar.querySelectorAll('a.side-link').forEach(function(link){
            link.addEventListener('click', function(){ if(window.innerWidth <= 880) closeSidebar(); });
        });
    })();

    // ── Sync AI panel height with music player visibility ────────
    (function(){
        var mplayer = document.getElementById('mplayer');
        var aiPanel = document.getElementById('ai-panel');
        if (!mplayer || !aiPanel) return;
        function syncPanel() {
            if (window.innerWidth > 880) return;
            var hasPlayer = !mplayer.classList.contains('hidden') && !mplayer.classList.contains('collapsed');
            aiPanel.classList.toggle('has-player', hasPlayer);
        }
        var mo = new MutationObserver(syncPanel);
        mo.observe(mplayer, { attributes: true, attributeFilter: ['class'] });
        window.addEventListener('resize', syncPanel);
        syncPanel();
    })();

    // ── Global Challenge Handler ──────────────────────────────
    (function(){
        var overlay = document.getElementById('challenge-overlay');
        var tsContainer = document.getElementById('challenge-ts-widget');
        var statusEl = document.getElementById('challenge-status');
        var msgEl = document.getElementById('challenge-msg');
        var closeBtn = document.getElementById('challenge-close');
        var _tsWidgetId = null;
        var _shown = false;

        function showOverlay(siteKey, serverMsg) {
            if (_shown) return;
            _shown = true;
            if (serverMsg) msgEl.textContent = serverMsg;
            overlay.style.display = 'flex';
            statusEl.textContent = '';
            if (siteKey && window.turnstile) {
                if (_tsWidgetId !== null) { try { window.turnstile.reset(_tsWidgetId); } catch(e){} }
                else {
                    _tsWidgetId = window.turnstile.render(tsContainer, {
                        sitekey: siteKey,
                        callback: function(token) { submitChallenge(token, siteKey); },
                        'error-callback': function() { statusEl.style.color='#fb7185'; statusEl.textContent = 'Xác minh thất bại. Thử lại.'; if (_tsWidgetId !== null) window.turnstile.reset(_tsWidgetId); }
                    });
                }
            } else if (siteKey) {
                // Turnstile script chưa load xong, đợi
                var tries = 0;
                var wait = setInterval(function(){
                    tries++;
                    if (window.turnstile) {
                        clearInterval(wait);
                        _tsWidgetId = window.turnstile.render(tsContainer, {
                            sitekey: siteKey,
                            callback: function(token) { submitChallenge(token, siteKey); },
                            'error-callback': function() { statusEl.style.color='#fb7185'; statusEl.textContent = 'Xác minh thất bại. Thử lại.'; if (_tsWidgetId !== null) window.turnstile.reset(_tsWidgetId); }
                        });
                    }
                    if (tries > 40) clearInterval(wait);
                }, 250);
            }
        }

        function submitChallenge(token, siteKey) {
            statusEl.style.color = '#34d399';
            statusEl.textContent = 'Đang xác minh...';
            fetch('/challenge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: token })
            }).then(function(r){ return r.json(); }).then(function(d){
                if (d.status) {
                    statusEl.textContent = '✓ Xác minh thành công! Đang tải lại...';
                    setTimeout(function(){ location.reload(); }, 1200);
                } else {
                    statusEl.style.color = '#fb7185';
                    statusEl.textContent = d.message || 'Thất bại. Thử lại.';
                    if (_tsWidgetId !== null && window.turnstile) window.turnstile.reset(_tsWidgetId);
                }
            }).catch(function(){
                statusEl.style.color = '#fb7185';
                statusEl.textContent = 'Lỗi kết nối. Thử lại.';
                if (_tsWidgetId !== null && window.turnstile) window.turnstile.reset(_tsWidgetId);
            });
        }

        if (closeBtn) closeBtn.addEventListener('click', function(){ overlay.style.display='none'; _shown=false; });

        // Interceptor toàn cục cho mọi fetch request
        var _origFetch = window.fetch;
        window.fetch = function() {
            var args = arguments;
            return _origFetch.apply(this, args).then(function(response) {
                if (response.status === 429) {
                    var clone = response.clone();
                    clone.json().then(function(data){
                        if (data && data.challenge) {
                            showOverlay(data.siteKey || window.__TS_KEY, data.message);
                        }
                    }).catch(function(){});
                }
                return response;
            });
        };
    })();
    </script>
    ${extraScript}
    ${getSoundCloudPlayerScript()}
    ${getAiSupportScript()}
</body>
</html>`;
}

module.exports = { getBasePage };
