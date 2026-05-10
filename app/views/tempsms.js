'use strict';

function getTempSmsPageBody() {
    return `
    <main class="wrap">
        <header class="page-head">
            <div>
                <div class="page-eyebrow">☎ SĐT Ảo · Public</div>
                <h1 class="page-title">Số điện thoại ảo<br>nhận SMS công cộng</h1>
                <p class="page-lead">Danh sách số điện thoại miễn phí ai cũng dùng được — nguồn <b>sms-online.co</b>. <b>Lưu ý:</b> Đây là số công cộng, ai cũng đọc tin. Đa số dịch vụ lớn (Google, Facebook, Zalo, Telegram) đã <b>chặn các số này</b>. Chỉ phù hợp test hoặc các site nhỏ.</p>
            </div>
            <div class="page-meta"><span>● <b id="ts-state">sẵn sàng</b></span></div>
        </header>

        <section class="card ts-card">
            <div class="ts-head">
                <h2>Số khả dụng</h2>
                <div class="ts-head-actions">
                    <input id="ts-apikey" type="password" placeholder="API key LauNa" autocomplete="off">
                    <button class="btn" type="button" id="ts-reload">↻ Làm mới</button>
                </div>
            </div>
            <div id="ts-numbers" class="ts-grid">
                <div class="ts-empty">Đang tải danh sách số…</div>
            </div>
        </section>

        <section class="card ts-card" id="ts-inbox-card" hidden>
            <div class="ts-head">
                <h2 id="ts-inbox-title">Hộp thư SMS</h2>
                <div class="ts-head-actions">
                    <button class="btn" type="button" id="ts-inbox-refresh">↻ Làm mới</button>
                    <button class="btn" type="button" id="ts-inbox-close">✕ Đóng</button>
                </div>
            </div>
            <div class="ts-inbox-meta" id="ts-inbox-meta"></div>
            <div id="ts-inbox-list" class="ts-list">
                <div class="ts-empty">Đang tải tin nhắn…</div>
            </div>
        </section>
    </main>`;
}

function getTempSmsPageStyles() {
    return `
    <style>
        .ts-card { margin-bottom:16px; }
        .ts-head { display:flex; align-items:center; justify-content:space-between; gap:14px; flex-wrap:wrap; margin-bottom:14px; }
        .ts-head h2 { margin:0; font-size:16px; }
        .ts-head-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
        .ts-head-actions input { padding:9px 12px; font-family:var(--mono); font-size:12px; color:#fff; background:var(--surface-2); border:1px solid var(--border); border-radius:8px; min-width:200px; }
        .ts-head-actions input:focus { outline:none; border-color:var(--primary); }

        .ts-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); gap:10px; }
        .ts-num { display:flex; flex-direction:column; gap:6px; padding:14px 16px; background:var(--surface-2); border:1px solid var(--border); border-radius:10px; cursor:pointer; transition:all .2s var(--ease); }
        .ts-num:hover { border-color:var(--primary); transform:translateY(-2px); }
        .ts-num-top { display:flex; align-items:center; gap:8px; }
        .ts-num-flag { width:24px; height:18px; border-radius:3px; background:var(--surface); display:flex; align-items:center; justify-content:center; font-size:13px; }
        .ts-num-country { font-family:var(--mono); font-size:11px; color:var(--muted-2); text-transform:uppercase; letter-spacing:1.2px; }
        .ts-num-display { font-family:var(--mono); font-size:15px; font-weight:600; color:#fff; letter-spacing:.3px; }
        .ts-num-raw { font-family:var(--mono); font-size:11px; color:var(--muted); margin-top:2px; }

        .ts-empty { padding:36px 14px; text-align:center; font-family:var(--mono); font-size:13px; color:var(--muted-2); border:1px dashed var(--border); border-radius:10px; grid-column:1/-1; }

        .ts-inbox-meta { margin-bottom:12px; padding:10px 14px; background:var(--surface-2); border:1px solid var(--border); border-radius:8px; font-family:var(--mono); font-size:12px; color:var(--muted); }

        .ts-list { display:flex; flex-direction:column; gap:8px; }
        .ts-msg { display:grid; grid-template-columns:1fr auto; gap:6px 14px; padding:14px 16px; background:var(--surface-2); border:1px solid var(--border); border-radius:10px; }
        .ts-msg-from { font-family:var(--mono); font-size:12px; font-weight:600; color:var(--primary); }
        .ts-msg-time { font-family:var(--mono); font-size:11px; color:var(--muted-2); }
        .ts-msg-text { grid-column:1/-1; font-size:13.5px; color:#fff; line-height:1.55; word-break:break-word; }
        .ts-msg-text a { color:var(--primary); text-decoration:underline; }
    </style>`;
}

function getTempSmsPageScript() {
    return `
    <script>
    (function(){
        var LS_AK = 'lna.tempmail.apikey';
        function $(id){ return document.getElementById(id); }
        function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
        function linkify(s){ return esc(s).replace(/(https?:\\/\\/[^\\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1<\\/a>'); }
        function getKey(){ return ($('ts-apikey').value||'').trim(); }
        function withKey(url){ var k=getKey(); return url + (url.indexOf('?')>=0?'&':'?') + 'apikey=' + encodeURIComponent(k); }
        function setState(t){ $('ts-state').textContent = t; }

        async function api(path){
            var r = await fetch(withKey(path));
            var d = await r.json().catch(function(){ return { status:false, message:'Phản hồi không hợp lệ' }; });
            if (!d.status) throw new Error(d.message || 'Lỗi không xác định');
            return d;
        }

        function flagEmoji(cc){
            if (!cc || cc.length !== 2) return '🌐';
            var code = cc.toUpperCase();
            return String.fromCodePoint(0x1F1E6 + code.charCodeAt(0)-65, 0x1F1E6 + code.charCodeAt(1)-65);
        }

        async function loadNumbers(){
            try {
                setState('đang tải...');
                var d = await api('/tempsms/numbers');
                var grid = $('ts-numbers');
                if (!d.items || !d.items.length) { grid.innerHTML = '<div class="ts-empty">Không có số nào.</div>'; setState('trống'); return; }
                grid.innerHTML = d.items.map(function(n){
                    return '<div class="ts-num" data-num="'+esc(n.number)+'" data-display="'+esc(n.display)+'">' +
                        '<div class="ts-num-top">' +
                            '<div class="ts-num-flag">'+flagEmoji(n.country)+'</div>' +
                            '<div class="ts-num-country">'+esc(n.countryName)+'</div>' +
                        '</div>' +
                        '<div class="ts-num-display">'+esc(n.display)+'</div>' +
                        '<div class="ts-num-raw">'+esc(n.number)+'</div>' +
                    '</div>';
                }).join('');
                grid.querySelectorAll('.ts-num').forEach(function(el){
                    el.addEventListener('click', function(){ openInbox(el.dataset.num, el.dataset.display); });
                });
                setState('sẵn sàng — '+d.total+' số');
            } catch(e){
                $('ts-numbers').innerHTML = '<div class="ts-empty">Lỗi: '+esc(e.message)+'</div>';
                setState('lỗi');
            }
        }

        var currentNumber = null, currentDisplay = null;
        async function openInbox(num, display){
            currentNumber = num; currentDisplay = display;
            var card = $('ts-inbox-card'); card.hidden = false;
            $('ts-inbox-title').textContent = 'Hộp thư: ' + display;
            $('ts-inbox-meta').textContent = 'Số: '+num+' · cache 30 giây';
            $('ts-inbox-list').innerHTML = '<div class="ts-empty">Đang tải tin nhắn…</div>';
            card.scrollIntoView({ behavior:'smooth', block:'start' });
            await refreshInbox();
        }

        async function refreshInbox(){
            if (!currentNumber) return;
            try {
                var d = await api('/tempsms/inbox?number=' + encodeURIComponent(currentNumber));
                var list = $('ts-inbox-list');
                if (!d.items || !d.items.length) { list.innerHTML = '<div class="ts-empty">Chưa có tin nhắn nào.</div>'; return; }
                list.innerHTML = d.items.map(function(m){
                    return '<div class="ts-msg">' +
                        '<div class="ts-msg-from">'+esc(m.from)+'</div>' +
                        '<div class="ts-msg-time">'+esc(m.time)+'</div>' +
                        '<div class="ts-msg-text">'+linkify(m.text)+'</div>' +
                    '</div>';
                }).join('');
                $('ts-inbox-meta').textContent = 'Số: '+currentNumber+' · '+d.total+' tin · cache 30 giây';
            } catch(e){
                $('ts-inbox-list').innerHTML = '<div class="ts-empty">Lỗi: '+esc(e.message)+'</div>';
            }
        }

        $('ts-reload').addEventListener('click', loadNumbers);
        $('ts-inbox-refresh').addEventListener('click', refreshInbox);
        $('ts-inbox-close').addEventListener('click', function(){ $('ts-inbox-card').hidden = true; currentNumber = null; });
        $('ts-apikey').addEventListener('input', function(){ try { localStorage.setItem(LS_AK, $('ts-apikey').value); } catch(_){} });
        try { var ak = localStorage.getItem(LS_AK); if (ak) $('ts-apikey').value = ak; } catch(_){}

        loadNumbers();
    })();
    </script>`;
}

module.exports = { getTempSmsPageBody, getTempSmsPageStyles, getTempSmsPageScript };
