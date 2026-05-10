'use strict';

function getApiCatalogPageBody({ total, totalRoutes, totalCategories, chipHtml, categoryHtml, requestsPerHour }) {
    return `
    <main class="wrap">
        <header class="page-head">
            <div>
                <div class="page-eyebrow">⌘ API Catalog · OpenAPI 3.0</div>
                <h1 class="page-title">Tất cả endpoint trong<br>một bảng tra cứu</h1>
                <p class="page-lead">Tìm kiếm tức thì theo path hoặc tham số, bấm <b>Test</b> để gọi GET trực tiếp. Cần spec đầy đủ và Try-it-out thì mở <a href="/docs" style="color:var(--primary)" target="_blank">/docs</a>.</p>
            </div>
        </header>
        <section class="stats">
            <div class="stat"><b>${(total || 0).toLocaleString('vi-VN')}</b><span>Tổng Requests</span></div>
            <div class="stat"><b>${totalRoutes}</b><span>Endpoints</span></div>
            <div class="stat"><b>${totalCategories}</b><span>Danh Mục</span></div>
        </section>
        <section class="api-toolbar">
            <div class="api-search">
                <input id="api-q" type="search" placeholder="Tìm endpoint, tham số, danh mục..." autocomplete="off">
                <button id="api-q-clear" class="api-search-clear" title="Xóa">✕</button>
            </div>
        </section>
        <section class="api-toolbar"><div class="api-filter-chips">${chipHtml}</div></section>
        <section class="card freekey-card">
            <div class="freekey-head">
                <div>
                    <div class="freekey-eyebrow">▣ Free Access</div>
                    <h2 class="freekey-title">Nhận API Key miễn phí</h2>
                    <p class="freekey-desc">Mỗi key giới hạn ${requestsPerHour} request/giờ (tự reset mỗi giờ). Mỗi IP chỉ có 1 key — bấm lại sẽ trả về key cũ của IP này.</p>
                </div>
                <button type="button" class="btn primary" id="fk-btn">Nhận key ngay</button>
            </div>
            <div id="fk-ts-widget" style="margin-top:12px;"></div>
            <div id="fk-result" class="freekey-result" style="display:none;"></div>
        </section>
        <section class="categories-grid" id="api-grid">${categoryHtml}</section>
        <div id="api-empty" class="api-empty" style="display:none;">Không tìm thấy endpoint nào khớp.</div>
    </main>`;
}

function getApiCatalogPageStyles() {
    return `
    <style>
        .freekey-card { margin: 0 0 18px; padding: 22px 24px; background: linear-gradient(135deg, rgba(52,211,153,.06), rgba(34,211,238,.04)); border: 1px solid rgba(52,211,153,.18); }
        .freekey-head { display:flex; gap:18px; align-items:center; justify-content:space-between; flex-wrap:wrap; }
        .freekey-eyebrow { font-family: var(--mono); font-size: 11px; color:#34d399; letter-spacing:1.4px; text-transform:uppercase; }
        .freekey-title { font-family: var(--display); font-size: 20px; margin:6px 0 4px; color:#fff; }
        .freekey-desc { font-size: 13.5px; color: var(--muted); margin:0; max-width: 560px; line-height:1.55; }
        .freekey-result { margin-top: 14px; padding: 14px 16px; border-radius: 10px; background:#0b1528; border:1px solid #1d3a5f; font-family: var(--mono); font-size: 12.5px; color:#cbd5e1; line-height:1.7; word-break:break-all; }
        .freekey-result.ok { border-color:#1d5f3a; }
        .freekey-result.err { border-color:#7f1d1d; color:#fca5a5; }
        .freekey-key { color:#34d399; font-weight:700; font-size:13.5px; }
        .freekey-copy { margin-left:8px; background:#1d2840; border:1px solid #2a3f60; border-radius:6px; color:#cbd5e1; font-size:11px; padding:3px 10px; cursor:pointer; font-family:inherit; }
    </style>`;
}

function getApiCatalogPageScript(siteKey) {
    return `
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" defer></script>
    <script>
    (function(){
        var SITE_KEY = ${JSON.stringify(siteKey || '')};
        var FK_URL = '/api/_internal/freekey-issue';
        var fkBtn = document.getElementById('fk-btn');
        var fkRes = document.getElementById('fk-result');
        var fkWidgetId = null;
        function ensureTurnstile(cb){
            if (!SITE_KEY) return cb('');
            if (window.turnstile && fkWidgetId !== null) {
                var existing = window.turnstile.getResponse(fkWidgetId);
                if (existing) return cb(existing);
                window.turnstile.reset(fkWidgetId);
            }
            var tries = 0;
            var t = setInterval(function(){
                tries++;
                if (window.turnstile) {
                    clearInterval(t);
                    if (fkWidgetId === null) {
                        fkWidgetId = window.turnstile.render('#fk-ts-widget', {
                            sitekey: SITE_KEY, theme: 'dark', size: 'normal',
                            callback: function(token){ cb(token); }
                        });
                    } else {
                        window.turnstile.reset(fkWidgetId);
                    }
                } else if (tries > 40) {
                    clearInterval(t); cb('');
                }
            }, 150);
        }
        function showResult(html, cls){
            fkRes.style.display = 'block';
            fkRes.className = 'freekey-result ' + (cls || '');
            fkRes.innerHTML = html;
        }
        function escHtml(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
        window._fkCopy = function(){
            var el = document.getElementById('fk-key-val');
            if (!el) return;
            navigator.clipboard.writeText(el.textContent).then(function(){
                var b = document.getElementById('fk-copy-btn'); if (b){ b.textContent='Đã sao chép!'; setTimeout(function(){ b.textContent='Sao chép'; }, 1500); }
            });
        };
        function hideTurnstile(){
            var w = document.getElementById('fk-ts-widget');
            if (w) w.style.display = 'none';
            if (window.turnstile && fkWidgetId !== null) {
                try { window.turnstile.remove(fkWidgetId); } catch {}
                fkWidgetId = null;
            }
        }
        function doFetch(token){
            fkBtn.disabled = true; fkBtn.textContent = 'Đang tạo...';
            var qs = token ? ('?cf-turnstile-response=' + encodeURIComponent(token)) : '';
            fetch(FK_URL + qs, { headers: { 'Accept':'application/json' } })
                .then(function(r){ return r.json(); })
                .then(function(d){
                    if (d && d.status) {
                        var k = d.data || {};
                        hideTurnstile();
                        showResult(
                            '<div><span class="freekey-key" id="fk-key-val">'+escHtml(k.apikey)+'</span>'+
                            '<button type="button" class="freekey-copy" id="fk-copy-btn" onclick="_fkCopy()">Sao chép</button></div>'+
                            '<div style="margin-top:8px;color:var(--muted-2);">'+escHtml(k.note||'')+'</div>'+
                            '<div style="margin-top:4px;color:var(--muted-2);">'+escHtml(k.usage||'')+'</div>',
                            'ok'
                        );
                    } else {
                        showResult(escHtml((d && d.message) || 'Không tạo được key.'), 'err');
                        if (window.turnstile && fkWidgetId !== null) window.turnstile.reset(fkWidgetId);
                    }
                })
                .catch(function(e){
                    showResult('Lỗi kết nối: ' + escHtml(e.message), 'err');
                    if (window.turnstile && fkWidgetId !== null) window.turnstile.reset(fkWidgetId);
                })
                .finally(function(){
                    fkBtn.disabled = false; fkBtn.textContent = 'Nhận key ngay';
                });
        }
        fkBtn.addEventListener('click', function(){
            if (!SITE_KEY) return doFetch('');
            ensureTurnstile(function(token){
                if (!token) { showResult('Vui lòng hoàn thành xác minh captcha rồi bấm lại.', 'err'); return; }
                doFetch(token);
            });
        });
    })();
    </script>
    <script>
    (function(){
        var input = document.getElementById('api-q');
        var clear = document.getElementById('api-q-clear');
        var emptyEl = document.getElementById('api-empty');
        var chips = document.querySelectorAll('.chip');
        var cards = document.querySelectorAll('.category-card');
        var activeCat = '';
        function setCollapsed(card, collapsed){
            card.classList.toggle('is-collapsed', collapsed);
            var hd = card.querySelector('.category-header');
            if (hd) hd.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        }
        cards.forEach(function(card){
            var hd = card.querySelector('.category-header');
            if (!hd) return;
            hd.addEventListener('click', function(){ setCollapsed(card, !card.classList.contains('is-collapsed')); });
            hd.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hd.click(); } });
        });
        function applyFilter(){
            var q = (input.value || '').trim().toLowerCase();
            clear.style.display = q ? 'block' : 'none';
            var anyVisible = false;
            cards.forEach(function(card){
                var cat = card.getAttribute('data-category');
                if (activeCat && cat !== activeCat) { card.style.display = 'none'; return; }
                var items = card.querySelectorAll('.route-item');
                var matched = 0;
                items.forEach(function(it){
                    var name = it.getAttribute('data-route') || '';
                    var params = it.getAttribute('data-params') || '';
                    var hit = !q || name.indexOf(q) >= 0 || params.indexOf(q) >= 0 || cat.toLowerCase().indexOf(q) >= 0;
                    it.style.display = hit ? '' : 'none';
                    if (hit) matched++;
                });
                card.style.display = matched > 0 ? '' : 'none';
                if (matched > 0) anyVisible = true;
                if (q && matched > 0) setCollapsed(card, false);
            });
            emptyEl.style.display = anyVisible ? 'none' : 'block';
        }
        input.addEventListener('input', applyFilter);
        clear.addEventListener('click', function(){ input.value = ''; applyFilter(); input.focus(); });
        chips.forEach(function(ch){
            ch.addEventListener('click', function(){
                chips.forEach(function(c){ c.classList.remove('is-active'); });
                ch.classList.add('is-active');
                activeCat = ch.getAttribute('data-cat') || '';
                applyFilter();
            });
        });
    })();
    </script>`;
}

module.exports = { getApiCatalogPageBody, getApiCatalogPageStyles, getApiCatalogPageScript };
