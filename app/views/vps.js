'use strict';

function getVpsPageStyles() {
    return `<style>
    .vps-wrap { max-width: 980px; margin: 0 auto; padding: 0 4px; }
    .vps-head { display:flex; flex-direction:column; gap:8px; margin-bottom:24px; }
    .vps-eyebrow { font-family: var(--mono); font-size: 11px; letter-spacing: 1.6px; color: var(--primary); text-transform: uppercase; }
    .vps-title { font-family: var(--display); font-size: 30px; font-weight: 700; letter-spacing: -.5px; line-height: 1.15; }
    .vps-lead { color: var(--muted); max-width: 720px; line-height: 1.65; font-size: 15px; }

    .vps-tabs { display:flex; gap:4px; padding:4px; background:var(--surface-2); border:1px solid var(--border); border-radius:12px; margin-bottom:18px; width:fit-content; }
    .vps-tab { padding:8px 18px; border-radius:8px; font-family:var(--mono); font-size:12px; font-weight:600; color:var(--muted); cursor:pointer; transition:all .2s var(--ease); border:none; background:transparent; letter-spacing:.5px; }
    .vps-tab:hover { color:var(--text); }
    .vps-tab.is-active { background:var(--elev); color:var(--primary); box-shadow: inset 0 0 0 1px var(--border-2); }

    .vps-panel { background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:24px; box-shadow: var(--shadow-card); }
    .vps-panel h3 { font-family:var(--display); font-size:18px; margin-bottom:6px; }
    .vps-panel .desc { color:var(--muted); font-size:13px; margin-bottom:18px; line-height:1.6; }

    .vps-field { display:flex; flex-direction:column; gap:6px; margin-bottom:16px; }
    .vps-field label { font-family:var(--mono); font-size:11px; font-weight:600; color:var(--muted-2); text-transform:uppercase; letter-spacing:1.2px; }
    .vps-field input { padding:12px 14px; background:var(--bg); border:1px solid var(--border); border-radius:9px; color:var(--text); font-family:var(--mono); font-size:13px; transition:border-color .2s var(--ease); }
    .vps-field input:focus { border-color:var(--primary); outline:none; }
    .vps-field .hint { color:var(--muted-2); font-size:11px; font-family:var(--mono); }

    .vps-btn { padding:12px 22px; background:var(--primary); color:#06241a; border:none; border-radius:9px; font-family:var(--mono); font-size:13px; font-weight:700; letter-spacing:.6px; cursor:pointer; transition:filter .2s var(--ease); text-transform:uppercase; }
    .vps-btn:hover:not(:disabled) { filter:brightness(1.1); }
    .vps-btn:disabled { opacity:.6; cursor:not-allowed; }
    .vps-btn.secondary { background:var(--surface-2); color:var(--text); border:1px solid var(--border-2); }

    .vps-progress { height:6px; background:var(--surface-2); border-radius:99px; overflow:hidden; margin:18px 0 8px; display:none; }
    .vps-progress.is-active { display:block; }
    .vps-progress-bar { height:100%; background:linear-gradient(90deg, var(--primary), var(--cyan)); transition:width .3s var(--ease); width:0%; }

    .vps-status { padding:12px 14px; border-radius:9px; font-family:var(--mono); font-size:12.5px; line-height:1.55; margin-top:14px; display:none; }
    .vps-status.is-show { display:block; }
    .vps-status.ok { background:rgba(52,211,153,.08); border:1px solid rgba(52,211,153,.3); color:var(--primary); }
    .vps-status.err { background:rgba(251,113,133,.08); border:1px solid rgba(251,113,133,.3); color:var(--rose); }
    .vps-status.info { background:rgba(34,211,238,.06); border:1px solid rgba(34,211,238,.25); color:var(--cyan); }

    .vps-result { display:none; margin-top:18px; padding:16px; border:1px dashed var(--primary); border-radius:11px; background:rgba(52,211,153,.04); }
    .vps-result.is-show { display:block; }
    .vps-result .r-link { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:8px; }
    .vps-result .r-link a { color:var(--primary); text-decoration:underline; word-break:break-all; font-family:var(--mono); font-size:12.5px; }

    .vps-list { display:flex; flex-direction:column; gap:10px; }
    .vps-list .empty { text-align:center; padding:42px 16px; color:var(--muted-2); font-family:var(--mono); font-size:13px; }
    .vps-item { display:flex; justify-content:space-between; align-items:center; gap:14px; padding:14px 16px; background:var(--surface-2); border:1px solid var(--border); border-radius:10px; flex-wrap:wrap; }
    .vps-item .tk { font-family:var(--mono); font-size:12.5px; color:var(--text); }
    .vps-item .tk small { color:var(--muted-2); display:block; font-size:10.5px; margin-top:2px; }
    .vps-item .open { padding:8px 14px; background:var(--primary); color:#06241a; border-radius:7px; font-family:var(--mono); font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; }

    .vps-info-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:10px; margin-top:16px; }
    .vps-info-grid .ig-item { padding:12px; background:var(--surface-2); border:1px solid var(--border); border-radius:9px; }
    .vps-info-grid .ig-item b { display:block; font-family:var(--display); font-size:15px; margin-bottom:2px; color:#fff; }
    .vps-info-grid .ig-item span { color:var(--muted-2); font-family:var(--mono); font-size:10.5px; text-transform:uppercase; letter-spacing:1.1px; }

    .vps-warn { padding:14px 16px; background:rgba(251,191,36,.06); border:1px solid rgba(251,191,36,.25); border-radius:10px; color:var(--amber); font-size:12.5px; font-family:var(--mono); line-height:1.7; margin-top:18px; }
    .vps-warn b { color:#fde68a; }
    </style>`;
}

function getVpsPageBody() {
    return `<main class="wrap"><div class="vps-wrap">
    <header class="vps-head">
        <div class="vps-eyebrow">▲ VPS Manager · Free Windows VPS via GitHub Actions</div>
        <h1 class="vps-title">Tạo VPS Windows miễn phí<br>chạy ~5.5 giờ + tự restart</h1>
        <p class="vps-lead">Hệ thống tự dựng máy chủ Windows + noVNC trên GitHub Actions của chính bạn, có Cloudflare tunnel để truy cập trên trình duyệt. Dựa theo source <b>VPS-Github</b> của Hiếu Dz (DuckNoVis).</p>
    </header>

    <div class="vps-tabs" role="tablist">
        <button class="vps-tab is-active" data-tab="create">Tạo VPS</button>
        <button class="vps-tab" data-tab="manage">Quản lý</button>
        <button class="vps-tab" data-tab="guide">Hướng dẫn</button>
    </div>

    <section class="vps-panel" id="vps-tab-create">
        <h3>Khởi tạo VPS mới</h3>
        <p class="desc">Nhập GitHub Personal Access Token có quyền <b>repo</b> + <b>workflow</b>. Hệ thống sẽ tạo 1 repo public trong account của bạn, dựng workflow Windows + noVNC, và bắn link truy cập về đây.</p>

        <div class="vps-field">
            <label>GitHub Token</label>
            <input id="vps-token" type="password" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx hoặc github_pat_..." autocomplete="off" spellcheck="false">
            <div class="hint">Token chỉ được giữ trong RAM của server để tạo repo + secret, không lưu vào DB.</div>
        </div>

        <button class="vps-btn" id="vps-create-btn" type="button">▶ Tạo VPS</button>

        <div class="vps-progress" id="vps-progress"><div class="vps-progress-bar" id="vps-progress-bar"></div></div>
        <div class="vps-status" id="vps-status"></div>

        <div class="vps-result" id="vps-result">
            <div style="font-family:var(--mono);font-size:12px;color:var(--muted-2);text-transform:uppercase;letter-spacing:1.2px;">VPS Ready</div>
            <div class="r-link"><b style="color:var(--primary);">Link:</b> <a id="vps-link" target="_blank" rel="noopener"></a></div>
            <div style="font-family:var(--mono);font-size:12px;color:var(--muted);margin-top:8px;">Mật khẩu VNC: <b style="color:var(--text);">hieudz</b></div>
        </div>

        <div class="vps-info-grid">
            <div class="ig-item"><b>Windows Server</b><span>OS</span></div>
            <div class="ig-item"><b>noVNC (Web)</b><span>Truy cập</span></div>
            <div class="ig-item"><b>~5.5 giờ</b><span>Runtime + auto restart</span></div>
            <div class="ig-item"><b>Cloudflare Tunnel</b><span>Public URL</span></div>
        </div>
    </section>

    <section class="vps-panel" id="vps-tab-manage" style="display:none;">
        <h3>Danh sách VPS đang hoạt động</h3>
        <p class="desc">Liệt kê các VPS đã được workflow report về server (token bị mask). Bấm để mở lại link noVNC.</p>
        <div style="display:flex;gap:8px;margin-bottom:14px;">
            <button class="vps-btn secondary" id="vps-reload-btn" type="button">↻ Tải lại</button>
        </div>
        <div class="vps-list" id="vps-list"><div class="empty">Bấm "Tải lại" để xem danh sách.</div></div>
    </section>

    <section class="vps-panel" id="vps-tab-guide" style="display:none;">
        <h3>Hướng dẫn lấy GitHub Token</h3>
        <ol style="padding-left:20px;color:var(--muted);line-height:1.8;font-size:14px;">
            <li>Vào <a href="https://github.com/settings/tokens" target="_blank" rel="noopener" style="color:var(--primary);">github.com/settings/tokens</a> → <b>Generate new token (classic)</b>.</li>
            <li>Đặt tên (vd: <code>vps-launa</code>), chọn expiration tuỳ ý.</li>
            <li>Tick các scope: <b>repo</b> (full), <b>workflow</b>.</li>
            <li>Bấm <b>Generate token</b>, copy chuỗi <code>ghp_…</code> rồi dán vào trang này.</li>
        </ol>

        <div class="vps-warn">
            <b>⚠️ Lưu ý:</b><br>
            • Workflow chạy trên GitHub Actions của <b>account của bạn</b>, sẽ tốn quota miễn phí của bạn.<br>
            • VPS không có persistent storage, mọi dữ liệu sẽ mất khi restart (~5.5h).<br>
            • Phù hợp test/dev, <b>KHÔNG</b> dùng cho production hoặc lưu data nhạy cảm.<br>
            • Mặc định mật khẩu noVNC là <code>hieudz</code> (hard-code trong workflow gốc).<br>
            • Repo tạo ra ở chế độ <b>public</b>, bạn có thể vào GitHub đổi sang private nếu muốn.
        </div>

        <h3 style="margin-top:24px;">API endpoints</h3>
        <div style="font-family:var(--mono);font-size:12.5px;color:var(--muted);line-height:1.9;background:var(--surface-2);padding:14px;border:1px solid var(--border);border-radius:9px;">
            POST <b style="color:var(--primary);">/vps/create</b> &nbsp; body: <code>{ "github_token": "ghp_..." }</code><br>
            GET &nbsp;&nbsp;<b style="color:var(--primary);">/vps/users</b> &nbsp; → danh sách (mask)<br>
            GET &nbsp;&nbsp;<b style="color:var(--primary);">/vps/users?token=ghp_...</b> &nbsp; → poll link cho đúng token
        </div>
    </section>
    </div></main>`;
}

function getVpsPageScript() {
    return `<script>
    (function(){
        var tabs = document.querySelectorAll('.vps-tab');
        tabs.forEach(function(t){
            t.addEventListener('click', function(){
                tabs.forEach(function(x){ x.classList.remove('is-active'); });
                t.classList.add('is-active');
                ['create','manage','guide'].forEach(function(k){
                    document.getElementById('vps-tab-'+k).style.display = (k === t.dataset.tab) ? '' : 'none';
                });
                if (t.dataset.tab === 'manage') loadList();
            });
        });

        function showStatus(msg, type){
            var s = document.getElementById('vps-status');
            s.textContent = msg;
            s.className = 'vps-status is-show ' + (type || 'info');
        }
        function setProgress(p){
            var bar = document.getElementById('vps-progress-bar');
            var box = document.getElementById('vps-progress');
            box.classList.add('is-active');
            bar.style.width = Math.min(100, Math.max(0, p)) + '%';
        }
        function showResult(link){
            var box = document.getElementById('vps-result');
            var a = document.getElementById('vps-link');
            a.href = link; a.textContent = link;
            box.classList.add('is-show');
        }

        var btn = document.getElementById('vps-create-btn');
        btn.addEventListener('click', async function(){
            var token = document.getElementById('vps-token').value.trim();
            if (!token) { showStatus('Vui lòng nhập GitHub token', 'err'); return; }
            if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
                showStatus("Token phải bắt đầu bằng 'ghp_' hoặc 'github_pat_'", 'err'); return;
            }

            btn.disabled = true; btn.textContent = '⏳ Đang tạo repo + workflow...';
            document.getElementById('vps-result').classList.remove('is-show');
            setProgress(15);
            showStatus('Đang gửi yêu cầu tới GitHub...', 'info');

            try {
                var r = await fetch('/vps/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ github_token: token })
                });
                var d = await r.json();

                if (!r.ok || !d.status) {
                    showStatus('❌ ' + (d.message || 'Lỗi khi tạo VPS'), 'err');
                    setProgress(0); btn.disabled = false; btn.textContent = '▶ Tạo VPS';
                    return;
                }

                setProgress(45);
                showStatus('✅ Repo đã tạo: ' + d.repository + '. Workflow Windows đang chạy, bắt đầu poll link...', 'ok');
                pollLink(token, 0);
            } catch(e){
                showStatus('❌ Lỗi kết nối: ' + e.message, 'err');
                setProgress(0); btn.disabled = false; btn.textContent = '▶ Tạo VPS';
            }
        });

        async function pollLink(token, attempt){
            var maxAttempts = 60; // 60 * 10s = 10 phút
            if (attempt >= maxAttempts) {
                showStatus('⏰ Quá thời gian poll. VPS có thể vẫn đang setup, vui lòng kiểm tra tab Quản lý sau ít phút.', 'err');
                document.getElementById('vps-create-btn').disabled = false;
                document.getElementById('vps-create-btn').textContent = '▶ Tạo VPS';
                return;
            }

            setProgress(45 + (attempt * 0.9));
            showStatus('🔄 Chờ workflow report link... (' + (attempt+1) + '/' + maxAttempts + ')', 'info');

            try {
                var r = await fetch('/vps/users?token=' + encodeURIComponent(token));
                var d = await r.json();
                if (r.ok && d.status && d.remote_link && d.remote_link.indexOf('TUNNEL_FAILED') === -1) {
                    setProgress(100);
                    showStatus('🎉 VPS sẵn sàng!', 'ok');
                    showResult(d.remote_link);
                    document.getElementById('vps-create-btn').disabled = false;
                    document.getElementById('vps-create-btn').textContent = '▶ Tạo VPS mới';
                    setTimeout(function(){ window.open(d.remote_link, '_blank'); }, 2500);
                    return;
                }
            } catch(_){}

            setTimeout(function(){ pollLink(token, attempt + 1); }, 10000);
        }

        async function loadList(){
            var box = document.getElementById('vps-list');
            box.innerHTML = '<div class="empty">Đang tải...</div>';
            try {
                var r = await fetch('/vps/users');
                var d = await r.json();
                if (!d.status || !d.users || !d.users.length) {
                    box.innerHTML = '<div class="empty">Chưa có VPS nào đang hoạt động.</div>'; return;
                }
                box.innerHTML = d.users.map(function(u){
                    var time = u.updatedAt ? new Date(u.updatedAt).toLocaleString('vi-VN') : '';
                    return '<div class="vps-item"><div class="tk">' +
                        u.token + '<small>' + time + '</small></div>' +
                        '<a class="open" href="' + u.link + '" target="_blank" rel="noopener">▶ Mở VPS</a></div>';
                }).join('');
            } catch(e){
                box.innerHTML = '<div class="empty" style="color:var(--rose);">Lỗi tải danh sách</div>';
            }
        }
        document.getElementById('vps-reload-btn').addEventListener('click', loadList);
    })();
    </script>`;
}

module.exports = { getVpsPageStyles, getVpsPageBody, getVpsPageScript };
