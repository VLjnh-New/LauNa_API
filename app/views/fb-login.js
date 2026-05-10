'use strict';

function getFbLoginPageStyles() {
    return `<style>
    .fbl-wrap { max-width: 980px; margin: 0 auto; padding: 0 4px; }
    .fbl-head { display:flex; flex-direction:column; gap:8px; margin-bottom:24px; }
    .fbl-eyebrow { font-family: var(--mono); font-size: 11px; letter-spacing: 1.6px; color: var(--primary); text-transform: uppercase; }
    .fbl-title { font-family: var(--display); font-size: 30px; font-weight: 700; letter-spacing: -.5px; line-height: 1.15; }
    .fbl-lead { color: var(--muted); max-width: 720px; line-height: 1.65; font-size: 15px; }

    .fbl-tabs { display:flex; gap:4px; padding:4px; background:var(--surface-2); border:1px solid var(--border); border-radius:12px; margin-bottom:18px; width:fit-content; }
    .fbl-tab { padding:8px 18px; border-radius:8px; font-family:var(--mono); font-size:12px; font-weight:600; color:var(--muted); cursor:pointer; transition:all .2s var(--ease); border:none; background:transparent; letter-spacing:.5px; }
    .fbl-tab:hover { color:var(--text); }
    .fbl-tab.is-active { background:var(--elev); color:var(--primary); box-shadow: inset 0 0 0 1px var(--border-2); }

    .fbl-panel { background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:24px; box-shadow: var(--shadow-card); }
    .fbl-panel h3 { font-family:var(--display); font-size:18px; margin-bottom:6px; }
    .fbl-panel .desc { color:var(--muted); font-size:13px; margin-bottom:18px; line-height:1.6; }

    .fbl-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    @media (max-width: 700px) { .fbl-grid { grid-template-columns:1fr; } }

    .fbl-field { display:flex; flex-direction:column; gap:6px; margin-bottom:14px; }
    .fbl-field label { font-family:var(--mono); font-size:11px; font-weight:600; color:var(--muted-2); text-transform:uppercase; letter-spacing:1.2px; }
    .fbl-field input, .fbl-field select, .fbl-field textarea { padding:11px 13px; background:var(--bg); border:1px solid var(--border); border-radius:9px; color:var(--text); font-family:var(--mono); font-size:13px; transition:border-color .2s var(--ease); }
    .fbl-field input:focus, .fbl-field select:focus, .fbl-field textarea:focus { border-color:var(--primary); outline:none; }
    .fbl-field .hint { color:var(--muted-2); font-size:11px; font-family:var(--mono); }

    .fbl-row { display:flex; gap:10px; align-items:center; margin:6px 0 14px; }
    .fbl-row label { font-family:var(--mono); font-size:12px; color:var(--muted); cursor:pointer; }

    .fbl-app-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:8px; padding:14px; background:var(--surface-2); border:1px solid var(--border); border-radius:10px; margin-bottom:14px; }
    .fbl-app-grid label { display:flex; align-items:center; gap:8px; font-family:var(--mono); font-size:12px; color:var(--muted); cursor:pointer; padding:6px 8px; border-radius:6px; transition:background .15s var(--ease); }
    .fbl-app-grid label:hover { background:rgba(255,255,255,.03); color:var(--text); }
    .fbl-app-grid input[type=checkbox] { accent-color: var(--primary); }

    .fbl-btn { padding:12px 22px; background:var(--primary); color:#06241a; border:none; border-radius:9px; font-family:var(--mono); font-size:13px; font-weight:700; letter-spacing:.6px; cursor:pointer; transition:filter .2s var(--ease); text-transform:uppercase; }
    .fbl-btn:hover:not(:disabled) { filter:brightness(1.1); }
    .fbl-btn:disabled { opacity:.6; cursor:not-allowed; }
    .fbl-btn.secondary { background:var(--surface-2); color:var(--text); border:1px solid var(--border-2); }

    .fbl-status { padding:12px 14px; border-radius:9px; font-family:var(--mono); font-size:12.5px; line-height:1.55; margin-top:14px; display:none; }
    .fbl-status.is-show { display:block; }
    .fbl-status.ok  { background:rgba(52,211,153,.08); border:1px solid rgba(52,211,153,.3); color:var(--primary); }
    .fbl-status.err { background:rgba(251,113,133,.08); border:1px solid rgba(251,113,133,.3); color:var(--rose); }
    .fbl-status.info{ background:rgba(34,211,238,.06); border:1px solid rgba(34,211,238,.25); color:var(--cyan); }

    .fbl-result { display:none; margin-top:18px; }
    .fbl-result.is-show { display:block; }
    .fbl-result-block { background:var(--surface-2); border:1px solid var(--border); border-radius:11px; padding:14px 16px; margin-bottom:12px; }
    .fbl-result-block .rb-head { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:8px; flex-wrap:wrap; }
    .fbl-result-block .rb-title { font-family:var(--mono); font-size:11px; color:var(--muted-2); text-transform:uppercase; letter-spacing:1.2px; }
    .fbl-result-block .rb-prefix { font-family:var(--display); font-size:14px; color:var(--primary); font-weight:700; }
    .fbl-result-block textarea { width:100%; min-height:60px; padding:10px 12px; background:var(--bg); border:1px solid var(--border); border-radius:8px; color:var(--text); font-family:var(--mono); font-size:12px; resize:vertical; word-break:break-all; line-height:1.5; }
    .fbl-result-block .copy-btn { padding:6px 12px; background:var(--surface); color:var(--text); border:1px solid var(--border-2); border-radius:6px; font-family:var(--mono); font-size:11px; cursor:pointer; transition:all .15s var(--ease); }
    .fbl-result-block .copy-btn:hover { background:var(--primary); color:#06241a; border-color:var(--primary); }
    .fbl-result-block .copy-btn.copied { background:var(--primary); color:#06241a; border-color:var(--primary); }

    .fbl-conv-grid { display:grid; grid-template-columns:1fr; gap:10px; }

    .fbl-warn { padding:14px 16px; background:rgba(251,191,36,.06); border:1px solid rgba(251,191,36,.25); border-radius:10px; color:var(--amber); font-size:12.5px; font-family:var(--mono); line-height:1.7; margin-top:18px; }
    .fbl-warn b { color:#fde68a; }

    .fbl-code { background:var(--surface-2); border:1px solid var(--border); border-radius:9px; padding:12px 14px; font-family:var(--mono); font-size:12px; color:var(--muted); line-height:1.7; overflow-x:auto; }
    .fbl-code b { color:var(--primary); }
    </style>`;
}

const APP_OPTIONS = [
    ['FB_ANDROID',            'Facebook For Android'],
    ['MESSENGER_ANDROID',     'Messenger For Android'],
    ['FB_LITE',               'Facebook Lite'],
    ['MESSENGER_LITE',        'Messenger Lite'],
    ['ADS_MANAGER_ANDROID',   'Ads Manager'],
    ['PAGES_MANAGER_ANDROID', 'Pages Manager']
];

function getFbLoginPageBody() {
    const appBoxes = APP_OPTIONS.map(([k, name]) =>
        `<label><input type="checkbox" class="fbl-app" value="${k}" checked>${name}<small style="color:var(--muted-2);">·${k}</small></label>`
    ).join('');

    return `<main class="wrap"><div class="fbl-wrap">
    <header class="fbl-head">
        <div class="fbl-eyebrow">▲ FB4A Login · Lấy Access Token + Cookie</div>
        <h1 class="fbl-title">Đăng nhập Facebook qua FB4A<br>lấy access token, cookies, convert đa app</h1>
        <p class="fbl-lead">Mã hoá mật khẩu chuẩn <code>#PWD_FB4A</code> (RSA + AES-GCM), gọi <code>b-graph.facebook.com/auth/login</code>, hỗ trợ 2FA TOTP, và tự convert token sang Messenger / FB Lite / Ads Manager / Pages Manager.</p>
    </header>

    <div class="fbl-tabs" role="tablist">
        <button class="fbl-tab is-active" data-tab="login">Login</button>
        <button class="fbl-tab" data-tab="guide">Hướng dẫn</button>
    </div>

    <section class="fbl-panel" id="fbl-tab-login">
        <h3>Thông tin đăng nhập</h3>
        <p class="desc">Nhập UID / số điện thoại / email và mật khẩu thật của tài khoản FB. Server sẽ mã hoá mật khẩu trước khi gửi (không lưu password). Nếu acc bật 2FA, dán secret base32 vào ô tương ứng.</p>

        <form id="fbl-form" autocomplete="off" onsubmit="return false;">
        <div class="fbl-grid">
            <div class="fbl-field">
                <label>UID / SĐT / Email</label>
                <input id="fbl-account" type="text" placeholder="100000xxxxxxxxx" autocomplete="off" spellcheck="false">
            </div>
            <div class="fbl-field">
                <label>Mật khẩu</label>
                <input id="fbl-password" type="password" placeholder="Mật khẩu thật của tài khoản" autocomplete="off">
            </div>
            <div class="fbl-field">
                <label>2FA Secret (base32) — tuỳ chọn</label>
                <input id="fbl-2fa" type="text" placeholder="ABCD1234EFGH5678 (bỏ trống nếu acc không bật 2FA)" autocomplete="off" spellcheck="false">
            </div>
            <div class="fbl-field">
                <label>Machine ID (datr) — tuỳ chọn</label>
                <input id="fbl-machine" type="text" placeholder="_2KxZzOokdiTAQGEsqoFdRJk (nếu báo sai mật khẩu)" autocomplete="off" spellcheck="false">
            </div>
        </div>

        <div class="fbl-field">
            <label>API Key (LauNa-API)</label>
            <input id="fbl-apikey" type="text" placeholder="API key của bạn — lấy trên trang /api" autocomplete="off" spellcheck="false">
            <div class="hint">Endpoint <code>/tools/fb-login</code> yêu cầu API key. Key chỉ gắn vào URL request, không lưu.</div>
        </div>

        <div class="fbl-row">
            <input type="checkbox" id="fbl-convert-all" checked>
            <label for="fbl-convert-all">Convert token sang tất cả app bên dưới (bỏ tick để chọn từng app)</label>
        </div>

        <div class="fbl-app-grid" id="fbl-app-grid">${appBoxes}</div>

        <button class="fbl-btn" id="fbl-submit" type="button">▶ Đăng nhập &amp; lấy token</button>
        </form>
        <div class="fbl-status" id="fbl-status"></div>

        <div class="fbl-result" id="fbl-result"></div>
    </section>

    <section class="fbl-panel" id="fbl-tab-guide" style="display:none;">
        <h3>Cách lấy 2FA Secret</h3>
        <ol style="padding-left:20px;color:var(--muted);line-height:1.8;font-size:14px;">
            <li>Vào FB → <b>Settings &amp; privacy</b> → <b>Settings</b> → <b>Security and login</b> → <b>Use two-factor authentication</b>.</li>
            <li>Chọn <b>Authentication app</b> → <b>Set up another way</b> → bấm <b>Set up manually</b>.</li>
            <li>Copy chuỗi <b>secret key</b> (kiểu <code>ABCD 1234 EFGH 5678</code>), dán vào ô "2FA Secret" ở trên — server sẽ tự xoá khoảng trắng.</li>
        </ol>

        <h3 style="margin-top:24px;">Khi báo sai mật khẩu (mặc dù đúng)</h3>
        <ol style="padding-left:20px;color:var(--muted);line-height:1.8;font-size:14px;">
            <li>Mở DevTools trên trình duyệt đang đăng nhập tài khoản đó.</li>
            <li>Vào tab <b>Application</b> → <b>Cookies</b> → <code>https://www.facebook.com</code>.</li>
            <li>Tìm cookie tên <b>datr</b>, copy giá trị (vd: <code>_2KxZzOokdiTAQGEsqoFdRJk</code>) dán vào ô "Machine ID".</li>
        </ol>

        <h3 style="margin-top:24px;">Gọi trực tiếp qua API</h3>
        <div class="fbl-code">
POST <b>/tools/fb-login?apikey=&lt;KEY&gt;</b><br>
Content-Type: application/json<br>
<br>
{<br>
&nbsp;&nbsp;<b>"uid_phone_mail"</b>: "100000xxxxxxxxx",<br>
&nbsp;&nbsp;<b>"password"</b>: "matkhauthat",<br>
&nbsp;&nbsp;<b>"twwwoo2fa"</b>: "ABCD1234EFGH5678",<br>
&nbsp;&nbsp;<b>"machine_id"</b>: "_2KxZzOokdiTAQGEsqoFdRJk",<br>
&nbsp;&nbsp;<b>"convert_all_tokens"</b>: true<br>
}
        </div>

        <div class="fbl-warn">
            <b>⚠️ Lưu ý:</b><br>
            • Tool này chạy trên máy chủ LauNa-API, FB sẽ thấy IP của máy chủ — có thể bị checkpoint nếu acc khác vùng đăng ký.<br>
            • Mật khẩu được mã hoá trước khi gửi tới Facebook nhưng <b>vẫn đi qua RAM máy chủ</b> trong 1 lần request. Không log, không lưu.<br>
            • Chỉ dùng với tài khoản <b>của chính bạn</b>. Tác giả không chịu trách nhiệm cho việc lạm dụng.<br>
            • Token convert qua các app khác (Messenger, FB Lite, ...) chia sẻ session với tài khoản gốc.
        </div>
    </section>
    </div></main>`;
}

function getFbLoginPageScript() {
    return `<script>
    (function(){
        var tabs = document.querySelectorAll('.fbl-tab');
        tabs.forEach(function(t){
            t.addEventListener('click', function(){
                tabs.forEach(function(x){ x.classList.remove('is-active'); });
                t.classList.add('is-active');
                ['login','guide'].forEach(function(k){
                    document.getElementById('fbl-tab-'+k).style.display = (k === t.dataset.tab) ? '' : 'none';
                });
            });
        });

        var convAll = document.getElementById('fbl-convert-all');
        var appGrid = document.getElementById('fbl-app-grid');
        function refreshAppGrid(){
            var on = convAll.checked;
            appGrid.style.opacity = on ? '.55' : '1';
            appGrid.querySelectorAll('input.fbl-app').forEach(function(c){
                c.disabled = on;
                if (on) c.checked = true;
            });
        }
        convAll.addEventListener('change', refreshAppGrid);
        refreshAppGrid();

        function showStatus(msg, type){
            var s = document.getElementById('fbl-status');
            s.textContent = msg;
            s.className = 'fbl-status is-show ' + (type || 'info');
        }
        function clearResult(){
            var r = document.getElementById('fbl-result');
            r.innerHTML = '';
            r.classList.remove('is-show');
        }
        function escapeHtml(s){
            return String(s == null ? '' : s)
                .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
        }
        function blockHtml(title, prefix, value){
            return '<div class="fbl-result-block">' +
                '<div class="rb-head">' +
                    '<div><div class="rb-title">' + escapeHtml(title) + '</div>' +
                    (prefix ? '<div class="rb-prefix">' + escapeHtml(prefix) + '</div>' : '') + '</div>' +
                    '<button type="button" class="copy-btn">Copy</button>' +
                '</div>' +
                '<textarea readonly>' + escapeHtml(value) + '</textarea>' +
            '</div>';
        }
        function bindCopy(root){
            root.querySelectorAll('.copy-btn').forEach(function(b){
                b.addEventListener('click', function(){
                    var ta = b.closest('.fbl-result-block').querySelector('textarea');
                    ta.select();
                    try {
                        navigator.clipboard.writeText(ta.value);
                        b.classList.add('copied'); b.textContent = '✓ Đã copy';
                        setTimeout(function(){ b.classList.remove('copied'); b.textContent = 'Copy'; }, 1500);
                    } catch(_) {
                        document.execCommand('copy');
                    }
                });
            });
        }

        function showResult(d){
            var r = document.getElementById('fbl-result');
            var html = '';

            if (d.original_token) {
                html += blockHtml(
                    'Original Token (' + (d.original_token.token_prefix || '') + ')',
                    d.original_token.token_prefix || '',
                    d.original_token.access_token || ''
                );
            }
            if (d.cookies && d.cookies.string) {
                html += blockHtml('Session Cookies', '', d.cookies.string);
            }
            if (d.converted_tokens) {
                html += '<div style="margin:18px 0 10px;font-family:var(--mono);font-size:12px;color:var(--muted-2);text-transform:uppercase;letter-spacing:1.4px;">Converted Tokens</div>';
                html += '<div class="fbl-conv-grid">';
                Object.keys(d.converted_tokens).forEach(function(k){
                    var t = d.converted_tokens[k];
                    html += blockHtml(k, t.token_prefix || '', t.access_token || '');
                });
                html += '</div>';
            }

            r.innerHTML = html;
            r.classList.add('is-show');
            bindCopy(r);
        }

        var btn = document.getElementById('fbl-submit');
        btn.addEventListener('click', async function(){
            var account  = document.getElementById('fbl-account').value.trim();
            var password = document.getElementById('fbl-password').value;
            var twofa    = document.getElementById('fbl-2fa').value.trim();
            var machine  = document.getElementById('fbl-machine').value.trim();
            var apikey   = document.getElementById('fbl-apikey').value.trim();

            if (!account)  { showStatus('Vui lòng nhập UID / SĐT / Email', 'err'); return; }
            if (!password) { showStatus('Vui lòng nhập mật khẩu', 'err'); return; }
            if (!apikey)   { showStatus('Vui lòng nhập API key của LauNa', 'err'); return; }

            var body = { uid_phone_mail: account, password: password };
            if (twofa)   body.twwwoo2fa = twofa;
            if (machine) body.machine_id = machine;

            if (convAll.checked) {
                body.convert_all_tokens = true;
            } else {
                var picked = [];
                appGrid.querySelectorAll('input.fbl-app:checked').forEach(function(c){ picked.push(c.value); });
                if (picked.length) body.convert_token_to = picked;
            }

            clearResult();
            btn.disabled = true; btn.textContent = '⏳ Đang đăng nhập...';
            showStatus('Đang mã hoá mật khẩu và gọi Facebook API...', 'info');

            try {
                var r = await fetch('/tools/fb-login?apikey=' + encodeURIComponent(apikey), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                var d = await r.json();

                if (!r.ok || !d.status) {
                    var msg = d.error || d.message || ('HTTP ' + r.status);
                    if (d.error_user_msg) msg += ' — ' + d.error_user_msg;
                    showStatus('❌ ' + msg, 'err');
                    btn.disabled = false; btn.textContent = '▶ Đăng nhập & lấy token';
                    return;
                }

                showStatus('🎉 Đăng nhập thành công! Đã lấy token + cookies.', 'ok');
                showResult(d);
                btn.disabled = false; btn.textContent = '▶ Đăng nhập & lấy token';
            } catch(e) {
                showStatus('❌ Lỗi kết nối: ' + e.message, 'err');
                btn.disabled = false; btn.textContent = '▶ Đăng nhập & lấy token';
            }
        });
    })();
    </script>`;
}

module.exports = { getFbLoginPageStyles, getFbLoginPageBody, getFbLoginPageScript };
