'use strict';

function getProxyPageBody() {
    return `<main class="content">
        <section class="card">
            <h2 style="margin:0 0 6px;">◈ Proxy Pool · Đóng góp & Backup</h2>
            <p class="muted" style="margin:0 0 14px;">
                Đóng góp proxy <code>ip:port</code> hoặc URL nguồn proxy để hệ thống dùng khi API trực tiếp bị chặn.
                Tất cả proxy được lưu vào database và tự động khôi phục sau khi server restart.
            </p>

            <div class="prx-tabs">
                <button class="prx-tab is-active" data-tab="proxies">Thêm proxy</button>
                <button class="prx-tab" data-tab="sources">Thêm nguồn</button>
                <button class="prx-tab" data-tab="status">Trạng thái IP của tôi</button>
            </div>

            <!-- ── Tab: Proxies ──────────────────────────────────── -->
            <div class="prx-pane is-active" data-pane="proxies">
                <div class="prx-grid">
                    <div class="prx-field">
                        <span>Danh sách proxy <em>*</em> <small>(mỗi dòng 1 cái: <code>ip:port</code> hoặc <code>http://ip:port</code>)</small></span>
                        <textarea id="prx-input" rows="6" placeholder="103.149.162.194:80&#10;138.197.157.32:8080&#10;http://104.207.32.63:5868"></textarea>
                    </div>
                    <div class="prx-actions">
                        <button id="prx-submit" class="btn btn-primary">↑ Gửi proxy</button>
                        <button id="prx-refresh-list" class="btn">↻ Làm mới danh sách</button>
                        <span id="prx-result" class="muted prx-result"></span>
                    </div>
                </div>

                <div class="prx-stats" id="prx-stats">Đang tải…</div>

                <div class="prx-list-title">Proxy đã đóng góp (alive trước):</div>
                <div id="prx-list" class="prx-list">Đang tải…</div>
            </div>

            <!-- ── Tab: Sources ──────────────────────────────────── -->
            <div class="prx-pane" data-pane="sources">
                <div class="prx-grid">
                    <div class="prx-field">
                        <span>URL nguồn proxy <em>*</em> <small>(trang trả về danh sách <code>ip:port</code> mỗi dòng)</small></span>
                        <input id="prx-src-url" type="url" placeholder="https://example.com/proxies.txt"/>
                    </div>
                    <div class="prx-actions">
                        <button id="prx-src-submit" class="btn btn-primary">↑ Thêm nguồn</button>
                        <button id="prx-src-refresh" class="btn">↻ Làm mới</button>
                        <span id="prx-src-result" class="muted prx-result"></span>
                    </div>
                </div>
                <div class="prx-list-title">Nguồn đã đăng ký:</div>
                <div id="prx-src-list" class="prx-list">Đang tải…</div>
            </div>

            <!-- ── Tab: My IP status ─────────────────────────────── -->
            <div class="prx-pane" data-pane="status">
                <div class="prx-status-card">
                    <div><b>IP của bạn:</b> <code id="prx-my-ip">—</code></div>
                    <div><b>Auto-proxy:</b> <span id="prx-my-auto">—</span></div>
                    <div><b>Lý do:</b> <span id="prx-my-reason" class="muted">—</span></div>
                    <div><b>Hết hạn:</b> <span id="prx-my-exp" class="muted">—</span></div>
                    <div style="margin-top:10px;">
                        <button id="prx-my-enable" class="btn primary">Bật auto-proxy (24h)</button>
                        <button id="prx-my-clear" class="btn">Tắt / Xoá đánh dấu</button>
                        <button id="prx-my-refresh" class="btn">↻ Kiểm tra lại</button>
                    </div>
                </div>
                <div class="prx-list-title">Top IP đang được auto-proxy:</div>
                <div id="prx-auto-list" class="prx-list">Đang tải…</div>
            </div>
        </section>
    </main>`;
}

function getProxyPageStyles() {
    return `<style>
        .prx-tabs { display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap; }
        .prx-tab { background:var(--surface-2); border:1px solid var(--border); color:var(--muted);
            padding:8px 14px; border-radius:8px; font-family:var(--mono); font-size:12px; cursor:pointer; transition:all .2s var(--ease); }
        .prx-tab:hover { color:#fff; border-color:var(--primary); }
        .prx-tab.is-active { background:var(--primary); color:#000; border-color:var(--primary); }
        .prx-pane { display:none; }
        .prx-pane.is-active { display:block; }
        .prx-grid { display:grid; gap:12px; margin-bottom:14px; }
        .prx-field { display:flex; flex-direction:column; gap:6px; }
        .prx-field span { font-family:var(--mono); font-size:11px; color:var(--muted-2); text-transform:uppercase; letter-spacing:1.2px; }
        .prx-field span em { color:var(--rose); font-style:normal; }
        .prx-field span small { font-family:var(--sans); text-transform:none; letter-spacing:0; color:var(--muted); margin-left:4px; }
        .prx-field input, .prx-field textarea {
            background:var(--surface-2); border:1px solid var(--border); border-radius:8px;
            color:#fff; padding:10px 12px; font-family:var(--mono); font-size:13px; width:100%;
        }
        .prx-field input:focus, .prx-field textarea:focus { outline:none; border-color:var(--primary); }
        .prx-actions { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
        .btn { background:var(--surface-2); border:1px solid var(--border); color:#fff;
            padding:9px 16px; border-radius:8px; font-family:var(--mono); font-size:12px; cursor:pointer; transition:all .2s var(--ease); }
        .btn:hover { border-color:var(--primary); color:var(--primary); }
        .btn:disabled { opacity:.5; cursor:not-allowed; }
        .btn-primary { background:var(--primary); color:#000; border-color:var(--primary); }
        .btn-primary:hover { color:#000; filter:brightness(1.1); }
        .prx-result { font-family:var(--mono); font-size:12px; }
        .prx-result.ok { color:var(--primary); }
        .prx-result.err { color:var(--rose); }
        .prx-stats { padding:12px 14px; border:1px solid var(--border); background:var(--surface-2);
            border-radius:9px; font-family:var(--mono); font-size:12.5px; color:var(--muted); margin-bottom:14px; }
        .prx-stats b { color:var(--primary); }
        .prx-list-title { font-family:var(--mono); font-size:11px; text-transform:uppercase;
            letter-spacing:1.4px; color:var(--muted-2); margin:14px 0 8px; }
        .prx-list { max-height:420px; overflow-y:auto; -webkit-overflow-scrolling:touch; }
        .prx-row { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; padding:9px 12px;
            border:1px solid var(--border); background:var(--surface-2); border-radius:9px;
            font-family:var(--mono); font-size:12.5px; margin-bottom:6px; }
        .prx-row > div:first-child { flex:1; min-width:0; word-break:break-all; overflow-wrap:anywhere; }
        .prx-row.is-dead { opacity:.55; }
        .prx-row b { color:#fff; font-weight:600; }
        .prx-row .prx-tag { display:inline-block; padding:2px 6px; border-radius:4px; font-size:10.5px; background:rgba(52,211,153,.15); color:var(--primary); }
        .prx-row .prx-tag.dead { background:rgba(251,113,133,.15); color:var(--rose); }
        .prx-row .prx-meta { color:var(--muted); font-size:11px; word-break:break-word; }
        .prx-row .btn { padding:4px 10px; font-size:11px; flex-shrink:0; }
        .prx-status-card { padding:14px 16px; border:1px solid var(--border); background:var(--surface-2);
            border-radius:11px; font-family:var(--mono); font-size:13px; line-height:1.8; margin-bottom:14px; word-break:break-word; }
        .prx-status-card code { color:var(--primary); word-break:break-all; }
        .prx-status-card .ok { color:var(--primary); }
        .prx-status-card .err { color:var(--rose); }
        .prx-status-card .btn { margin:4px 6px 0 0; }

        /* ── Mobile ──────────────────────────────── */
        @media (max-width: 640px) {
            .prx-tabs { gap:6px; overflow-x:auto; flex-wrap:nowrap; -webkit-overflow-scrolling:touch;
                margin-left:-4px; margin-right:-4px; padding:0 4px 4px; scrollbar-width:none; }
            .prx-tabs::-webkit-scrollbar { display:none; }
            .prx-tab { flex:0 0 auto; padding:8px 12px; font-size:12px; white-space:nowrap; }
            .prx-actions { flex-direction:column; align-items:stretch; }
            .prx-actions .btn { width:100%; padding:11px 16px; font-size:13px; }
            .prx-result { text-align:center; }
            .prx-stats { font-size:12px; line-height:1.7; }
            .prx-row { font-size:12px; padding:10px; }
            .prx-row .prx-meta { display:block; margin-top:4px; }
            .prx-status-card { font-size:12.5px; line-height:1.7; }
            .prx-status-card .btn { width:100%; margin:6px 0 0; }
        }
    </style>`;
}

function getProxyPageScript() {
    return `<script>
    (function(){
        function $(id){ return document.getElementById(id); }
        function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
        function fmtTs(t){ if(!t) return '—'; var d=new Date(t); return isNaN(d)?String(t):d.toLocaleString('vi-VN',{hour12:false}); }

        // Tabs
        var tabs = document.querySelectorAll('.prx-tab');
        var panes = document.querySelectorAll('.prx-pane');
        tabs.forEach(function(t){
            t.addEventListener('click', function(){
                tabs.forEach(function(x){ x.classList.remove('is-active'); });
                panes.forEach(function(p){ p.classList.remove('is-active'); });
                t.classList.add('is-active');
                var name = t.getAttribute('data-tab');
                document.querySelector('.prx-pane[data-pane="'+name+'"]').classList.add('is-active');
                if (name === 'status') loadMyStatus();
                if (name === 'sources') loadSources();
            });
        });

        function setResult(el, msg, cls){ el.textContent = msg; el.className = 'muted prx-result' + (cls?' '+cls:''); }

        // ── Stats + proxy list ─────────────────────────────────────
        function loadStats(){
            fetch('/proxy/api/stats').then(function(r){ return r.json(); }).then(function(j){
                if (!j.status) { $('prx-stats').textContent = j.message || 'Lỗi'; return; }
                var p = j.pool || {}, db = j.db || {}, src = j.sources || {};
                $('prx-stats').innerHTML =
                    'Pool đang dùng: <b>' + (p.total||0) + '</b> proxy · ' +
                    'DB user: <b>' + (db.alive||0) + '/' + (db.total||0) + '</b> alive · ' +
                    'Nguồn user: <b>' + (src.total||0) + '</b> · ' +
                    'IP auto-proxy: <b>' + (j.autoProxyClients||0) + '</b>';
            }).catch(function(){ $('prx-stats').textContent = 'Lỗi tải stats'; });
        }
        function loadProxies(){
            $('prx-list').textContent = 'Đang tải…';
            fetch('/proxy/api/list').then(function(r){ return r.json(); }).then(function(j){
                if (!j.status) { $('prx-list').textContent = j.message || 'Lỗi'; return; }
                if (!j.proxies.length) { $('prx-list').innerHTML = '<div class="muted">Chưa có proxy nào.</div>'; return; }
                $('prx-list').innerHTML = j.proxies.map(function(p){
                    var ms = p.ms != null ? p.ms+'ms' : '—';
                    return '<div class="prx-row'+(p.alive?'':' is-dead')+'">'
                        + '<div><b>'+esc(p.ip)+':'+esc(p.port)+'</b> '
                        + '<span class="prx-tag'+(p.alive?'':' dead')+'">'+(p.alive?'alive':'dead')+'</span> '
                        + '<span class="prx-meta">'+esc(p.protocol||'http')+' · '+ms+' · src: '+esc(p.source||'?')+' · fail:'+(p.fail_count||0)+'</span></div>'
                        + '<button class="btn" data-del="'+esc(p.ip)+':'+esc(p.port)+'">×</button>'
                        + '</div>';
                }).join('');
                $('prx-list').querySelectorAll('button[data-del]').forEach(function(b){
                    b.addEventListener('click', function(){
                        var k = b.getAttribute('data-del').split(':');
                        fetch('/proxy/api/delete?ip='+k[0]+'&port='+k[1], { method:'POST' })
                            .then(function(r){ return r.json(); })
                            .then(function(){ loadProxies(); loadStats(); });
                    });
                });
            }).catch(function(){ $('prx-list').textContent = 'Lỗi tải danh sách'; });
        }

        $('prx-submit').addEventListener('click', function(){
            var txt = $('prx-input').value.trim();
            if (!txt) { setResult($('prx-result'), 'Chưa nhập proxy nào', 'err'); return; }
            this.disabled = true; setResult($('prx-result'), 'Đang gửi…', '');
            var btn = this;
            fetch('/proxy/api/submit', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ proxies: txt })
            }).then(function(r){ return r.json(); }).then(function(j){
                if (j.status) {
                    setResult($('prx-result'), '✓ Đã thêm '+j.added+' proxy (bỏ qua '+(j.skipped||0)+')', 'ok');
                    $('prx-input').value = '';
                    loadProxies(); loadStats();
                } else setResult($('prx-result'), j.message || 'Lỗi', 'err');
            }).catch(function(e){ setResult($('prx-result'), 'Lỗi: '+e.message, 'err'); })
              .finally(function(){ btn.disabled = false; });
        });
        $('prx-refresh-list').addEventListener('click', function(){ loadProxies(); loadStats(); });

        // ── Sources ────────────────────────────────────────────────
        function loadSources(){
            $('prx-src-list').textContent = 'Đang tải…';
            fetch('/proxy/api/sources').then(function(r){ return r.json(); }).then(function(j){
                if (!j.status) { $('prx-src-list').textContent = j.message || 'Lỗi'; return; }
                if (!j.sources.length) { $('prx-src-list').innerHTML = '<div class="muted">Chưa có nguồn nào.</div>'; return; }
                $('prx-src-list').innerHTML = j.sources.map(function(s){
                    return '<div class="prx-row">'
                        + '<div><b>'+esc(s.url)+'</b><br><span class="prx-meta">last fetch: '+fmtTs(s.last_fetched)+' · count: '+(s.last_count||0)+' · fail: '+(s.fail_count||0)+'</span></div>'
                        + '<button class="btn" data-del-src="'+esc(s.url)+'">×</button>'
                        + '</div>';
                }).join('');
                $('prx-src-list').querySelectorAll('button[data-del-src]').forEach(function(b){
                    b.addEventListener('click', function(){
                        fetch('/proxy/api/sources/delete', {
                            method:'POST', headers:{'Content-Type':'application/json'},
                            body: JSON.stringify({ url: b.getAttribute('data-del-src') })
                        }).then(function(){ loadSources(); loadStats(); });
                    });
                });
            }).catch(function(){ $('prx-src-list').textContent = 'Lỗi tải nguồn'; });
        }
        $('prx-src-submit').addEventListener('click', function(){
            var u = $('prx-src-url').value.trim();
            if (!u) { setResult($('prx-src-result'), 'Chưa nhập URL', 'err'); return; }
            this.disabled = true; setResult($('prx-src-result'), 'Đang gửi…', '');
            var btn = this;
            fetch('/proxy/api/sources/add', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ url: u })
            }).then(function(r){ return r.json(); }).then(function(j){
                if (j.status) { setResult($('prx-src-result'), '✓ Đã thêm nguồn', 'ok'); $('prx-src-url').value=''; loadSources(); loadStats(); }
                else setResult($('prx-src-result'), j.message || 'Lỗi', 'err');
            }).catch(function(e){ setResult($('prx-src-result'), 'Lỗi: '+e.message, 'err'); })
              .finally(function(){ btn.disabled = false; });
        });
        $('prx-src-refresh').addEventListener('click', loadSources);

        // ── My IP status ───────────────────────────────────────────
        function loadMyStatus(){
            fetch('/proxy/api/my-status').then(function(r){ return r.json(); }).then(function(j){
                $('prx-my-ip').textContent = j.ip || '—';
                if (j.autoProxy) {
                    var note = (j.reason === 'user-enabled') ? '(bật thủ công)' : '(do upstream chặn)';
                    $('prx-my-auto').innerHTML = '<span class="err">BẬT</span> ' + note;
                    $('prx-my-reason').textContent = j.reason || '—';
                    $('prx-my-exp').textContent = fmtTs(j.expiresAt);
                } else {
                    $('prx-my-auto').innerHTML = '<span class="ok">TẮT</span> (đang dùng kết nối trực tiếp)';
                    $('prx-my-reason').textContent = '—';
                    $('prx-my-exp').textContent = '—';
                }
            });
            fetch('/proxy/api/auto-list').then(function(r){ return r.json(); }).then(function(j){
                if (!j.status || !j.clients.length) { $('prx-auto-list').innerHTML = '<div class="muted">Chưa có IP nào bị đánh dấu.</div>'; return; }
                $('prx-auto-list').innerHTML = j.clients.map(function(c){
                    return '<div class="prx-row"><div><b>'+esc(c.client_ip)+'</b><br>'
                        + '<span class="prx-meta">'+esc(c.reason||'')+' · hits: '+(c.hits||0)+' · hết hạn: '+fmtTs(c.expires_at)+'</span></div></div>';
                }).join('');
            });
        }
        $('prx-my-enable').addEventListener('click', function(){
            var b=this; b.disabled=true;
            fetch('/proxy/api/my-status/enable', { method:'POST' })
              .then(function(r){ return r.json(); })
              .then(function(){ loadMyStatus(); loadStats(); })
              .finally(function(){ b.disabled=false; });
        });
        $('prx-my-clear').addEventListener('click', function(){
            fetch('/proxy/api/my-status/clear', { method:'POST' }).then(function(){ loadMyStatus(); loadStats(); });
        });
        $('prx-my-refresh').addEventListener('click', loadMyStatus);

        // Initial load
        loadStats();
        loadProxies();
    })();
    </script>`;
}

module.exports = { getProxyPageBody, getProxyPageStyles, getProxyPageScript };
