'use strict';

function getTempMailPageBody() {
    return `
    <main class="wrap">
        <header class="page-head">
            <div>
                <div class="page-eyebrow">✉ Mail Ảo · 10 phút</div>
                <h1 class="page-title">Temp Mail<br>Hộp thư dùng một lần</h1>
                <p class="page-lead">Tạo địa chỉ email tạm thời sống <b>10 phút</b> để nhận OTP, xác thực, đăng ký dịch vụ. Powered by mail.tm — không cần đăng ký, không cần mật khẩu của bạn.</p>
            </div>
            <div class="page-meta"><span>● <b id="tm-state">sẵn sàng</b></span></div>
        </header>

        <section class="card tm-card">
            <div class="tm-addr-wrap">
                <div class="tm-addr-label">Địa chỉ email tạm</div>
                <div class="tm-addr-row">
                    <input id="tm-addr" type="text" readonly placeholder="Bấm 'Tạo email' để bắt đầu...">
                    <button class="btn" type="button" id="tm-copy" title="Copy email" disabled>Copy</button>
                </div>
                <div class="tm-meta-row">
                    <span class="tm-countdown" id="tm-countdown">—</span>
                    <span class="tm-sep">·</span>
                    <span id="tm-status">Chưa có hộp thư</span>
                </div>
            </div>
            <div class="tm-actions">
                <button class="btn primary" type="button" id="tm-create">+ Tạo email mới</button>
                <button class="btn" type="button" id="tm-refresh" disabled>↻ Làm mới hộp thư</button>
                <button class="btn danger" type="button" id="tm-delete" disabled>✕ Xoá hộp thư</button>
                <label class="tm-auto"><input type="checkbox" id="tm-auto" checked> Tự refresh 10s</label>
            </div>
            <div class="tm-apikey-row">
                <label class="tm-field"><span>API key LauNa</span><input id="tm-apikey" type="password" placeholder="VLjnh-xx" autocomplete="off"></label>
                <small class="muted">Lưu trong trình duyệt của bạn. Lấy tại trang Admin.</small>
            </div>
        </section>

        <section class="card tm-card">
            <div class="tm-inbox-head">
                <h2>Hộp thư đến</h2>
                <span class="tm-count" id="tm-count">0 thư</span>
            </div>
            <div id="tm-list" class="tm-list">
                <div class="tm-empty">Chưa có thư nào. Hộp thư sẽ tự refresh khi bạn bật chế độ tự động.</div>
            </div>
        </section>

        <div class="tm-modal" id="tm-modal" hidden>
            <div class="tm-modal-backdrop" data-close></div>
            <div class="tm-modal-box">
                <div class="tm-modal-head">
                    <div>
                        <div class="tm-modal-from" id="tm-modal-from">—</div>
                        <div class="tm-modal-subject" id="tm-modal-subject">—</div>
                    </div>
                    <button class="btn" type="button" data-close>✕</button>
                </div>
                <div class="tm-modal-tabs">
                    <button class="tm-tab is-active" data-tab="html">HTML</button>
                    <button class="tm-tab" data-tab="text">Text</button>
                </div>
                <div class="tm-modal-body">
                    <iframe id="tm-modal-html" sandbox="allow-popups" frameborder="0"></iframe>
                    <pre id="tm-modal-text" hidden></pre>
                </div>
            </div>
        </div>
    </main>`;
}

function getTempMailPageStyles() {
    return `
    <style>
        .tm-card { margin-bottom:16px; }
        .tm-addr-wrap { margin-bottom:16px; }
        .tm-addr-label { font-family:var(--mono); font-size:11px; color:var(--muted-2); text-transform:uppercase; letter-spacing:1.4px; margin-bottom:8px; }
        .tm-addr-row { display:flex; gap:8px; align-items:stretch; }
        .tm-addr-row input { flex:1; min-width:0; padding:14px 16px; font-family:var(--mono); font-size:15px; font-weight:600; color:#fff; background:var(--surface-2); border:1px solid var(--border); border-radius:10px; }
        .tm-addr-row input:focus { outline:none; border-color:var(--primary); box-shadow:0 0 0 3px var(--primary-glow); }
        .tm-meta-row { display:flex; align-items:center; gap:10px; margin-top:10px; font-family:var(--mono); font-size:12px; color:var(--muted); }
        .tm-countdown { color:var(--primary); font-weight:600; }
        .tm-countdown.is-warn { color:#fbbf24; } .tm-countdown.is-danger { color:#fb7185; }
        .tm-sep { color:var(--muted-2); }
        .tm-actions { display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
        .tm-auto { display:inline-flex; align-items:center; gap:6px; font-family:var(--mono); font-size:12px; color:var(--muted); cursor:pointer; user-select:none; margin-left:auto; }
        .tm-auto input { accent-color:var(--primary); }
        .btn.danger { background:rgba(251,113,133,.1); border-color:rgba(251,113,133,.4); color:#fb7185; }
        .btn.danger:hover:not(:disabled) { background:rgba(251,113,133,.2); border-color:#fb7185; }
        .btn:disabled { opacity:.4; cursor:not-allowed; }

        .tm-apikey-row { margin-top:14px; padding-top:14px; border-top:1px dashed var(--border); display:flex; flex-direction:column; gap:6px; }
        .tm-field { display:flex; flex-direction:column; gap:6px; max-width:340px; }
        .tm-field span { font-family:var(--mono); font-size:11px; color:var(--muted-2); text-transform:uppercase; letter-spacing:1.2px; }
        .tm-field input { padding:10px 12px; font-family:var(--mono); font-size:13px; color:#fff; background:var(--surface-2); border:1px solid var(--border); border-radius:8px; }
        .tm-field input:focus { outline:none; border-color:var(--primary); }

        .tm-inbox-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
        .tm-inbox-head h2 { margin:0; font-size:16px; }
        .tm-count { font-family:var(--mono); font-size:11.5px; color:var(--muted-2); }
        .tm-list { display:flex; flex-direction:column; gap:8px; }
        .tm-empty { padding:36px 14px; text-align:center; font-family:var(--mono); font-size:13px; color:var(--muted-2); border:1px dashed var(--border); border-radius:10px; }
        .tm-mail { display:grid; grid-template-columns:auto 1fr auto; gap:14px; align-items:center; padding:14px 16px; background:var(--surface-2); border:1px solid var(--border); border-radius:10px; cursor:pointer; transition:all .2s var(--ease); }
        .tm-mail:hover { border-color:var(--primary); transform:translateX(2px); }
        .tm-mail.is-unseen { border-left:3px solid var(--primary); }
        .tm-mail-avatar { width:38px; height:38px; border-radius:50%; background:linear-gradient(135deg,var(--primary),#22d3ee); display:flex; align-items:center; justify-content:center; font-family:var(--display); font-weight:700; color:#0e1422; font-size:15px; }
        .tm-mail-body { min-width:0; }
        .tm-mail-from { font-family:var(--mono); font-size:11.5px; color:var(--muted-2); margin-bottom:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .tm-mail-subject { font-size:14px; font-weight:600; color:#fff; margin-bottom:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .tm-mail-intro { font-size:12.5px; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .tm-mail-date { font-family:var(--mono); font-size:11px; color:var(--muted-2); white-space:nowrap; }

        .tm-modal { position:fixed; inset:0; z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px; }
        .tm-modal[hidden] { display:none !important; }
        .tm-modal-body iframe[hidden], .tm-modal-body pre[hidden] { display:none !important; }
        .tm-modal-backdrop { position:absolute; inset:0; background:rgba(7,10,19,.8); backdrop-filter:blur(6px); }
        .tm-modal-box { position:relative; width:100%; max-width:780px; max-height:85vh; background:var(--surface); border:1px solid var(--border); border-radius:14px; display:flex; flex-direction:column; box-shadow:0 30px 80px -20px rgba(0,0,0,.7); }
        .tm-modal-head { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; padding:18px 20px; border-bottom:1px solid var(--border); }
        .tm-modal-from { font-family:var(--mono); font-size:11.5px; color:var(--muted-2); margin-bottom:4px; }
        .tm-modal-subject { font-size:17px; font-weight:600; color:#fff; }
        .tm-modal-tabs { display:flex; gap:4px; padding:10px 20px 0; border-bottom:1px solid var(--border); }
        .tm-tab { padding:8px 16px; font-family:var(--mono); font-size:12px; color:var(--muted); background:transparent; border:none; border-bottom:2px solid transparent; cursor:pointer; }
        .tm-tab.is-active { color:var(--primary); border-bottom-color:var(--primary); }
        .tm-modal-body { flex:1; overflow:auto; padding:0; }
        .tm-modal-body iframe { width:100%; height:480px; background:#fff; border:0; display:block; }
        .tm-modal-body pre { margin:0; padding:18px 20px; font-family:var(--mono); font-size:12.5px; color:var(--muted); white-space:pre-wrap; word-break:break-word; }

        @media (max-width:640px) {
            .tm-actions { gap:8px; }
            .tm-auto { margin-left:0; flex-basis:100%; }
            .tm-mail { grid-template-columns:auto 1fr; }
            .tm-mail-date { grid-column:2; font-size:10.5px; }
        }
    </style>`;
}

function getTempMailPageScript() {
    return `
    <script>
    (function(){
        var LS_KEY = 'lna.tempmail';
        var LS_AK  = 'lna.tempmail.apikey';
        var state = { email:null, expiresAt:null, items:[] };
        var autoTimer = null;
        var countdownTimer = null;

        function $(id){ return document.getElementById(id); }
        function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
        function getKey(){ return ($('tm-apikey').value||'').trim(); }
        function withKey(url){ var k=getKey(); return url + (url.indexOf('?')>=0?'&':'?') + 'apikey=' + encodeURIComponent(k); }
        function setStatus(t){ $('tm-status').textContent = t; }
        function setState(t){ $('tm-state').textContent = t; }
        function save(){ try { localStorage.setItem(LS_KEY, JSON.stringify({ email:state.email, expiresAt:state.expiresAt })); } catch(_){} }
        function load(){ try { var s = JSON.parse(localStorage.getItem(LS_KEY)||'null'); if (s && s.email && s.expiresAt && new Date(s.expiresAt).getTime() > Date.now()) { state.email = s.email; state.expiresAt = s.expiresAt; applyAddr(); refresh(); } } catch(_){} }

        function applyAddr(){
            $('tm-addr').value = state.email || '';
            $('tm-copy').disabled = !state.email;
            $('tm-refresh').disabled = !state.email;
            $('tm-delete').disabled = !state.email;
            startCountdown();
            scheduleAuto();
        }

        function fmtCountdown(ms){
            if (ms <= 0) return 'hết hạn';
            var s = Math.floor(ms/1000);
            var m = Math.floor(s/60); s = s%60;
            return m + 'p ' + (s<10?'0':'') + s + 's';
        }
        function startCountdown(){
            if (countdownTimer) clearInterval(countdownTimer);
            var el = $('tm-countdown');
            if (!state.expiresAt) { el.textContent = '—'; el.className='tm-countdown'; return; }
            function tick(){
                var diff = new Date(state.expiresAt).getTime() - Date.now();
                el.textContent = 'còn ' + fmtCountdown(diff);
                el.className = 'tm-countdown' + (diff<60000?' is-danger':(diff<180000?' is-warn':''));
                if (diff <= 0) {
                    clearInterval(countdownTimer);
                    setStatus('Hộp thư đã hết hạn');
                    state.email=null; state.expiresAt=null; state.items=[]; save(); applyAddr(); render();
                }
            }
            tick(); countdownTimer = setInterval(tick, 1000);
        }

        function scheduleAuto(){
            if (autoTimer) { clearInterval(autoTimer); autoTimer=null; }
            if (state.email && $('tm-auto').checked) {
                autoTimer = setInterval(refresh, 10000);
            }
        }

        async function api(path, method){
            var r = await fetch(withKey(path), { method: method || 'GET' });
            var d = await r.json().catch(function(){ return { status:false, message:'Phản hồi không hợp lệ' }; });
            if (!d.status) throw new Error(d.message || 'Lỗi không xác định');
            return d;
        }

        async function create(){
            try {
                setState('đang tạo...'); setStatus('Đang tạo email...');
                var d = await api('/tempmail/create');
                state.email = d.data.email; state.expiresAt = d.data.expiresAt; state.items = [];
                save(); applyAddr(); render();
                setState('sẵn sàng'); setStatus('Đã tạo hộp thư mới');
                refresh();
            } catch(e){ setState('lỗi'); setStatus(e.message); }
        }

        async function refresh(){
            if (!state.email) return;
            try {
                var d = await api('/tempmail/inbox?email=' + encodeURIComponent(state.email));
                state.items = d.items || [];
                render();
                setStatus(state.items.length ? 'Có ' + state.items.length + ' thư' : 'Hộp thư trống');
            } catch(e){ setStatus('Lỗi: ' + e.message); }
        }

        async function del(){
            if (!state.email) return;
            if (!confirm('Xoá hộp thư ' + state.email + ' ngay bây giờ?')) return;
            try {
                await api('/tempmail/delete?email=' + encodeURIComponent(state.email));
                state.email=null; state.expiresAt=null; state.items=[]; save(); applyAddr(); render();
                setStatus('Đã xoá hộp thư');
            } catch(e){ setStatus('Lỗi: ' + e.message); }
        }

        async function readMail(id){
            try {
                var d = await api('/tempmail/read?email=' + encodeURIComponent(state.email) + '&id=' + encodeURIComponent(id));
                openModal(d.data);
            } catch(e){ alert('Lỗi đọc thư: ' + e.message); }
        }

        function openModal(m){
            var from = m.from && (m.from.name ? m.from.name + ' <' + m.from.address + '>' : m.from.address) || '—';
            $('tm-modal-from').textContent = 'Từ: ' + from;
            $('tm-modal-subject').textContent = m.subject || '(không có tiêu đề)';
            var html = Array.isArray(m.html) ? m.html.join('') : (m.html || '');
            var text = m.text || '';
            var iframe = $('tm-modal-html');
            iframe.srcdoc = html || '<div style="padding:20px;font-family:sans-serif;color:#666;">Thư không có nội dung HTML.</div>';
            $('tm-modal-text').textContent = text || '(trống)';
            switchTab('html');
            $('tm-modal').hidden = false;
        }
        function closeModal(){ $('tm-modal').hidden = true; $('tm-modal-html').srcdoc=''; }
        function switchTab(t){
            document.querySelectorAll('.tm-tab').forEach(function(b){ b.classList.toggle('is-active', b.dataset.tab===t); });
            $('tm-modal-html').hidden = t!=='html';
            $('tm-modal-text').hidden = t!=='text';
        }

        function render(){
            var list = $('tm-list');
            $('tm-count').textContent = state.items.length + ' thư';
            if (!state.items.length) {
                list.innerHTML = '<div class="tm-empty">' + (state.email ? 'Chưa có thư nào. Hộp thư tự refresh mỗi 10 giây.' : 'Tạo email để bắt đầu nhận thư.') + '</div>';
                return;
            }
            list.innerHTML = state.items.map(function(m){
                var from = m.from && (m.from.name || m.from.address) || '—';
                var initial = (from[0] || '?').toUpperCase();
                var date = new Date(m.createdAt).toLocaleString('vi-VN', { hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit' });
                return '<div class="tm-mail' + (m.seen?'':' is-unseen') + '" data-id="' + esc(m.id) + '">' +
                    '<div class="tm-mail-avatar">' + esc(initial) + '</div>' +
                    '<div class="tm-mail-body">' +
                        '<div class="tm-mail-from">' + esc(from) + '</div>' +
                        '<div class="tm-mail-subject">' + esc(m.subject || '(không có tiêu đề)') + '</div>' +
                        '<div class="tm-mail-intro">' + esc(m.intro || '') + '</div>' +
                    '</div>' +
                    '<div class="tm-mail-date">' + date + '</div>' +
                '</div>';
            }).join('');
            list.querySelectorAll('.tm-mail').forEach(function(el){
                el.addEventListener('click', function(){ readMail(el.dataset.id); });
            });
        }

        function copyAddr(){
            if (!state.email) return;
            navigator.clipboard.writeText(state.email).then(function(){
                var btn = $('tm-copy'); var old = btn.textContent; btn.textContent = '✓ Đã copy'; setTimeout(function(){ btn.textContent = old; }, 1200);
            });
        }

        // Bind
        $('tm-create').addEventListener('click', create);
        $('tm-refresh').addEventListener('click', refresh);
        $('tm-delete').addEventListener('click', del);
        $('tm-copy').addEventListener('click', copyAddr);
        $('tm-auto').addEventListener('change', scheduleAuto);
        $('tm-apikey').addEventListener('input', function(){
            try { localStorage.setItem(LS_AK, $('tm-apikey').value); } catch(_){}
        });
        document.querySelectorAll('[data-close]').forEach(function(el){ el.addEventListener('click', closeModal); });
        document.querySelectorAll('.tm-tab').forEach(function(b){ b.addEventListener('click', function(){ switchTab(b.dataset.tab); }); });
        document.addEventListener('keydown', function(e){ if (e.key==='Escape') closeModal(); });

        // Restore apikey
        try { var ak = localStorage.getItem(LS_AK); if (ak) $('tm-apikey').value = ak; } catch(_){}

        load();
    })();
    </script>`;
}

module.exports = { getTempMailPageBody, getTempMailPageStyles, getTempMailPageScript };
