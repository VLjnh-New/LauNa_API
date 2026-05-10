'use strict';

function getToolsVnPageBody() {
    return `
    <main class="wrap tv-wrap">
        <header class="page-head">
            <div>
                <div class="page-eyebrow">⚙ TOOLS · BỘ TIỆN ÍCH VIỆT NAM</div>
                <h1 class="page-title">Bộ Tool<br>Việt Nam</h1>
                <p class="page-lead">12 tool free hữu ích cho dân Việt Nam: <b>VietQR</b>, tra cứu <b>chủ STK</b>, <b>FB UID</b>, vận đơn <b>5 hãng</b> (GHTK · GHN · J&T · VTP · VNPost), <b>MST</b>, <b>lịch âm</b> + giờ hoàng đạo, giá <b>vàng/USD/xăng</b>, random <b>profile VN</b>, <b>stats</b> mạng xã hội, <b>rút gọn link</b>, <b>xử lý ảnh</b>, tra <b>IP/GeoIP</b>.</p>
            </div>
            <div class="page-meta"><span>● <b>12 tool</b> free</span></div>
        </header>

        <nav class="tv-tabs" id="tv-tabs">
            <button class="tv-tab is-active" data-tab="vietqr">QR + Bank</button>
            <button class="tv-tab" data-tab="fb">FB UID</button>
            <button class="tv-tab" data-tab="ship">Vận đơn</button>
            <button class="tv-tab" data-tab="mst">MST</button>
            <button class="tv-tab" data-tab="lich">Lịch âm</button>
            <button class="tv-tab" data-tab="gia">Giá thị trường</button>
            <button class="tv-tab" data-tab="random">Random VN</button>
            <button class="tv-tab" data-tab="stats">Social Stats</button>
            <button class="tv-tab" data-tab="short">Rút gọn link</button>
            <button class="tv-tab" data-tab="img">Xử lý ảnh</button>
            <button class="tv-tab" data-tab="ip">IP / GeoIP</button>
        </nav>

        <!-- VietQR + Bank Lookup -->
        <section class="card tv-pane is-active" data-pane="vietqr">
            <h2>VietQR Generator + Tra chủ STK</h2>
            <p class="muted">Tạo QR chuyển khoản chuẩn NAPAS dùng được mọi app banking VN. Tùy chọn: tra tên chủ tài khoản (anti-scam).</p>
            <div class="tv-grid tv-grid-2">
                <div>
                    <label class="tv-field"><span>Ngân hàng</span>
                        <select id="vq-bank"><option value="">Đang tải danh sách bank...</option></select>
                    </label>
                    <label class="tv-field"><span>Số tài khoản</span><input id="vq-stk" placeholder="0123456789"></label>
                    <label class="tv-field"><span>Số tiền (VND, optional)</span><input id="vq-amount" type="number" min="0" placeholder="50000"></label>
                    <label class="tv-field"><span>Nội dung CK (optional)</span><input id="vq-note" placeholder="Ung ho launa"></label>
                    <label class="tv-field"><span>Tên chủ TK (optional)</span><input id="vq-name" placeholder="NGUYEN VAN A"></label>
                    <div class="btn-row">
                        <button class="btn primary" id="vq-gen">Tạo QR</button>
                        <button class="btn" id="vq-lookup">Tra tên chủ STK</button>
                    </div>
                    <div id="vq-result" class="tv-result muted">Kết quả sẽ hiện ở đây.</div>
                </div>
                <div>
                    <div id="vq-qr-wrap" class="tv-qr-wrap">
                        <div class="tv-qr-empty">Bấm "Tạo QR" để hiện ảnh</div>
                    </div>
                </div>
            </div>
        </section>

        <!-- FB UID -->
        <section class="card tv-pane" data-pane="fb">
            <h2>Facebook URL → UID</h2>
            <p class="muted">Convert link profile/page Facebook ra UID dạng số. Hỗ trợ vanity URL (zuck), profile.php?id=X, fb://, og:url.</p>
            <label class="tv-field"><span>URL Facebook</span><input id="fb-url" placeholder="https://facebook.com/zuck"></label>
            <div class="btn-row"><button class="btn primary" id="fb-go">Lấy UID</button></div>
            <div id="fb-result" class="tv-result muted">Kết quả sẽ hiện ở đây.</div>
        </section>

        <!-- Ship Track -->
        <section class="card tv-pane" data-pane="ship">
            <h2>Tra cứu vận đơn (5 hãng)</h2>
            <p class="muted">GHTK · GHN · J&T Express · Viettel Post · Vietnam Post. Tự detect hãng theo format mã, hoặc chọn thủ công.</p>
            <div class="tv-grid tv-grid-2">
                <label class="tv-field"><span>Mã vận đơn</span><input id="sh-code" placeholder="S12345678901"></label>
                <label class="tv-field"><span>Hãng</span>
                    <select id="sh-carrier">
                        <option value="">Tự detect</option>
                        <option value="ghtk">GHTK</option>
                        <option value="ghn">GHN</option>
                        <option value="jt">J&T Express</option>
                        <option value="vtp">Viettel Post</option>
                        <option value="vnpost">Vietnam Post</option>
                    </select>
                </label>
            </div>
            <div class="btn-row"><button class="btn primary" id="sh-go">Tra đơn</button></div>
            <div id="sh-result" class="tv-result muted">Kết quả sẽ hiện ở đây.</div>
        </section>

        <!-- MST -->
        <section class="card tv-pane" data-pane="mst">
            <h2>Tra cứu Mã số thuế</h2>
            <p class="muted">Cá nhân + Doanh nghiệp. Nhập MST, tên DN, hoặc CCCD. Nguồn dữ liệu Tổng cục Thuế.</p>
            <label class="tv-field"><span>MST / Tên DN / CCCD</span><input id="mst-q" placeholder="0123456789 hoặc Cong ty ABC"></label>
            <div class="btn-row"><button class="btn primary" id="mst-go">Tra cứu</button></div>
            <div id="mst-result" class="tv-result muted">Kết quả sẽ hiện ở đây.</div>
        </section>

        <!-- Lich am -->
        <section class="card tv-pane" data-pane="lich">
            <h2>Lịch âm + Ngày tốt xấu + Giờ hoàng đạo</h2>
            <p class="muted">Đổi dương → âm chuẩn Hồ Ngọc Đức (giờ chuẩn VN). Trả: Can Chi (ngày/tháng/năm), giờ hoàng đạo, đánh giá.</p>
            <label class="tv-field"><span>Ngày dương lịch</span><input id="lich-date" type="date"></label>
            <div class="btn-row"><button class="btn primary" id="lich-go">Tính lịch âm</button></div>
            <div id="lich-result" class="tv-result muted">Kết quả sẽ hiện ở đây.</div>
        </section>

        <!-- Gia -->
        <section class="card tv-pane" data-pane="gia">
            <h2>Giá vàng + Tỷ giá + Xăng dầu</h2>
            <p class="muted">Vàng SJC, tỷ giá Vietcombank, giá xăng Petrolimex (cache 10 phút).</p>
            <div class="btn-row">
                <button class="btn primary" data-gia="">Tất cả</button>
                <button class="btn" data-gia="vang">Vàng SJC</button>
                <button class="btn" data-gia="usd">Tỷ giá NHTM</button>
                <button class="btn" data-gia="xang">Giá xăng</button>
            </div>
            <div id="gia-result" class="tv-result muted">Bấm 1 nút bên trên để xem giá.</div>
        </section>

        <!-- Random VN -->
        <section class="card tv-pane" data-pane="random">
            <h2>Random Profile Việt Nam</h2>
            <p class="muted">Sinh họ tên + DOB + CCCD đúng format + SĐT + email cho mục đích test/dev. <b>KHÔNG phải người thật.</b></p>
            <div class="tv-grid tv-grid-3">
                <label class="tv-field"><span>Giới tính</span>
                    <select id="rd-gender"><option value="">Random</option><option value="nam">Nam</option><option value="nu">Nữ</option></select>
                </label>
                <label class="tv-field"><span>Tuổi (vd 22-30)</span><input id="rd-age" placeholder="18-45"></label>
                <label class="tv-field"><span>Số profile</span><input id="rd-n" type="number" min="1" max="50" value="1"></label>
            </div>
            <div class="btn-row"><button class="btn primary" id="rd-go">Sinh profile</button></div>
            <div id="rd-result" class="tv-result muted">Kết quả sẽ hiện ở đây.</div>
        </section>

        <!-- Stats -->
        <section class="card tv-pane" data-pane="stats">
            <h2>Social Stats — TikTok / YouTube / Instagram</h2>
            <p class="muted">Followers, likes, video count, avatar, bio. Lấy từ trang public, không cần login.</p>
            <div class="tv-grid tv-grid-2">
                <label class="tv-field"><span>Platform</span>
                    <select id="st-platform"><option value="tiktok">TikTok</option><option value="youtube">YouTube</option><option value="instagram">Instagram</option></select>
                </label>
                <label class="tv-field"><span>Username / Channel</span><input id="st-user" placeholder="mrbeast hoặc @MrBeast"></label>
            </div>
            <div class="btn-row"><button class="btn primary" id="st-go">Lấy stats</button></div>
            <div id="st-result" class="tv-result muted">Kết quả sẽ hiện ở đây.</div>
        </section>

        <!-- Shortener -->
        <section class="card tv-pane" data-pane="short">
            <h2>Rút gọn link</h2>
            <p class="muted">Tạo short URL trên domain LauNa, có click counter. Dùng được cho FB/TikTok bio.</p>
            <div class="tv-grid tv-grid-2">
                <label class="tv-field"><span>URL gốc (https://...)</span><input id="sh2-url" placeholder="https://example.com/very-long-link"></label>
                <label class="tv-field"><span>Alias tùy chọn (3-32 ký tự)</span><input id="sh2-alias" placeholder="mylink"></label>
            </div>
            <div class="btn-row">
                <button class="btn primary" id="sh2-go">Tạo short link</button>
                <button class="btn" id="sh2-info">Xem stats theo code</button>
            </div>
            <div id="sh2-result" class="tv-result muted">Kết quả sẽ hiện ở đây.</div>
        </section>

        <!-- Image tool -->
        <section class="card tv-pane" data-pane="img">
            <h2>Xử lý ảnh — convert / resize / strip EXIF</h2>
            <p class="muted">Nhập URL ảnh, đổi format (jpg/png/webp/avif), resize, xoá metadata. Dùng được trực tiếp <code>&lt;img src=...&gt;</code>.</p>
            <label class="tv-field"><span>URL ảnh nguồn</span><input id="img-url" placeholder="https://picsum.photos/1600"></label>
            <div class="tv-grid tv-grid-3">
                <label class="tv-field"><span>Format</span>
                    <select id="img-format"><option value="">Giữ nguyên</option><option value="webp">WebP</option><option value="avif">AVIF</option><option value="jpg">JPG</option><option value="png">PNG</option></select>
                </label>
                <label class="tv-field"><span>Width (px)</span><input id="img-w" type="number" min="0" max="8000" placeholder="800"></label>
                <label class="tv-field"><span>Quality (1-100)</span><input id="img-q" type="number" min="1" max="100" value="80"></label>
            </div>
            <div class="btn-row"><button class="btn primary" id="img-go">Xử lý + Hiển thị</button></div>
            <div id="img-result" class="tv-result muted">Kết quả sẽ hiện ở đây.</div>
        </section>

        <!-- IP info -->
        <section class="card tv-pane" data-pane="ip">
            <h2>Tra cứu IP / GeoIP / ASN</h2>
            <p class="muted">Country, city, ISP, ASN, cờ proxy/VPN/datacenter. Free 45req/min qua ip-api.com.</p>
            <label class="tv-field"><span>IP (để trống = IP của bạn)</span><input id="ip-q" placeholder="8.8.8.8"></label>
            <div class="btn-row"><button class="btn primary" id="ip-go">Tra IP</button></div>
            <div id="ip-result" class="tv-result muted">Kết quả sẽ hiện ở đây.</div>
        </section>
    </main>`;
}

function getToolsVnPageStyles() {
    return `
    <style>
        .tv-wrap { max-width: 1100px; }
        .tv-tabs { display:flex; flex-wrap:wrap; gap:6px; margin:16px 0 18px; padding:6px; background:var(--surface-2); border:1px solid var(--border); border-radius:12px; }
        .tv-tab { padding:8px 14px; font-size:13px; font-weight:600; color:var(--muted); background:transparent; border:1px solid transparent; border-radius:8px; cursor:pointer; transition:all .15s; }
        .tv-tab:hover { color:#fff; background:rgba(255,255,255,.04); }
        .tv-tab.is-active { color:#fff; background:var(--surface-3, #2a2a2e); border-color:var(--border); }

        .tv-pane { display:none; margin-bottom:16px; }
        .tv-pane.is-active { display:block; }
        .tv-pane h2 { margin:0 0 8px; font-size:18px; }

        .tv-field { display:block; margin-bottom:12px; }
        .tv-field span { display:block; font-family:var(--mono); font-size:11px; color:var(--muted-2); text-transform:uppercase; letter-spacing:1.2px; margin-bottom:6px; }
        .tv-field input, .tv-field select { width:100%; padding:11px 14px; font-family:inherit; font-size:14px; color:#fff; background:var(--surface-2); border:1px solid var(--border); border-radius:8px; box-sizing:border-box; }
        .tv-field input:focus, .tv-field select:focus { outline:none; border-color:var(--accent, #6cf); }

        .tv-grid { display:grid; gap:12px; }
        .tv-grid-2 { grid-template-columns: 1fr 1fr; }
        .tv-grid-3 { grid-template-columns: 1fr 1fr 1fr; }
        @media (max-width: 720px) { .tv-grid-2, .tv-grid-3 { grid-template-columns: 1fr; } }

        .tv-result { margin-top:14px; padding:14px; background:var(--surface-2); border:1px solid var(--border); border-radius:10px; font-family:var(--mono); font-size:12.5px; line-height:1.55; color:#cfe; white-space:pre-wrap; word-break:break-word; max-height:480px; overflow-y:auto; }
        .tv-result.muted { color:var(--muted); }
        .tv-result code { color:#fc8; }
        .tv-result .kv { display:flex; gap:10px; padding:4px 0; border-bottom:1px dashed rgba(255,255,255,.05); }
        .tv-result .kv .k { color:var(--muted-2); min-width:130px; flex-shrink:0; }
        .tv-result .kv .v { color:#fff; }
        .tv-result .err { color:#f88; }

        .tv-qr-wrap { padding:16px; background:#fff; border-radius:10px; min-height:240px; display:flex; align-items:center; justify-content:center; }
        .tv-qr-wrap img { max-width:100%; height:auto; border-radius:6px; }
        .tv-qr-empty { color:#888; font-size:13px; }

        .tv-pane .btn-row { margin-top:6px; }
    </style>`;
}

function getToolsVnPageScript() {
    return `
    <script>
    (function() {
        // ─── Tabs ─────────────────────────────────────────────────
        const tabs = document.querySelectorAll('.tv-tab');
        const panes = document.querySelectorAll('.tv-pane');
        tabs.forEach(t => t.addEventListener('click', () => {
            const id = t.dataset.tab;
            tabs.forEach(x => x.classList.toggle('is-active', x === t));
            panes.forEach(p => p.classList.toggle('is-active', p.dataset.pane === id));
            location.hash = '#' + id;
        }));
        if (location.hash) {
            const t = document.querySelector('.tv-tab[data-tab="' + location.hash.slice(1) + '"]');
            if (t) t.click();
        }

        function $(id) { return document.getElementById(id); }
        function setResult(id, html, isErr) {
            const el = $(id);
            el.classList.remove('muted');
            if (isErr) el.innerHTML = '<div class="err">' + html + '</div>';
            else el.innerHTML = html;
        }
        function setLoading(id) { setResult(id, 'Đang xử lý...'); }
        function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
        function kv(k, v) { return v == null || v === '' ? '' : '<div class="kv"><div class="k">' + escapeHtml(k) + '</div><div class="v">' + escapeHtml(v) + '</div></div>'; }
        function fmtNum(n) { return n == null ? '' : Number(n).toLocaleString('vi-VN'); }

        async function api(path) {
            const r = await fetch(path);
            const ct = r.headers.get('content-type') || '';
            if (ct.includes('application/json')) return [r.status, await r.json()];
            return [r.status, await r.text()];
        }

        // ─── VietQR + Bank Lookup ─────────────────────────────────
        let banks = [];
        api('/vietqr?banks=1').then(([st, j]) => {
            if (st === 200 && j.banks) {
                banks = j.banks;
                const sel = $('vq-bank');
                sel.innerHTML = '<option value="">— chọn ngân hàng —</option>' + banks.map(b => '<option value="' + b.bin + '">' + escapeHtml(b.shortName) + ' — ' + escapeHtml(b.name) + '</option>').join('');
            }
        });

        $('vq-gen').addEventListener('click', async () => {
            const bank = $('vq-bank').value, stk = $('vq-stk').value.trim();
            if (!bank || !stk) return setResult('vq-result', 'Cần chọn bank và STK.', true);
            const params = new URLSearchParams({ bank, stk });
            ['amount','note','name'].forEach(k => { const v = $('vq-'+k).value.trim(); if (v) params.set(k, v); });
            setLoading('vq-result');
            const [st, j] = await api('/vietqr?' + params.toString());
            if (st !== 200 || !j.status) return setResult('vq-result', j.message || 'Lỗi', true);
            $('vq-qr-wrap').innerHTML = '<img src="' + j.qrUrl + '" alt="QR">';
            setResult('vq-result', kv('Ngân hàng', j.bank.name) + kv('STK', j.account.stk) + (j.amount ? kv('Số tiền', fmtNum(j.amount) + ' ₫') : '') + kv('QR URL', j.qrUrl));
        });

        $('vq-lookup').addEventListener('click', async () => {
            const bank = $('vq-bank').value, stk = $('vq-stk').value.trim();
            if (!bank || !stk) return setResult('vq-result', 'Cần chọn bank và STK.', true);
            setLoading('vq-result');
            const [st, j] = await api('/bank-lookup?bank=' + encodeURIComponent(bank) + '&stk=' + encodeURIComponent(stk));
            if (st !== 200 || !j.status) return setResult('vq-result', (j.message || 'Lỗi') + (j.hint ? '\\n💡 ' + j.hint : ''), true);
            setResult('vq-result', kv('Ngân hàng', j.bank.name) + kv('STK', j.accountNumber) + kv('Tên chủ TK', j.accountName));
        });

        // ─── FB UID ────────────────────────────────────────────────
        $('fb-go').addEventListener('click', async () => {
            const url = $('fb-url').value.trim();
            if (!url) return setResult('fb-result', 'Nhập URL.', true);
            setLoading('fb-result');
            const [st, j] = await api('/fb-uid?url=' + encodeURIComponent(url));
            if (st !== 200 || !j.status) return setResult('fb-result', j.message || 'Lỗi', true);
            setResult('fb-result', kv('UID', j.uid) + kv('URL', j.url) + kv('Pattern match', j.method));
        });

        // ─── Ship Track ────────────────────────────────────────────
        $('sh-go').addEventListener('click', async () => {
            const code = $('sh-code').value.trim();
            const carrier = $('sh-carrier').value;
            if (!code) return setResult('sh-result', 'Nhập mã vận đơn.', true);
            setLoading('sh-result');
            const [st, j] = await api('/ship-track?code=' + encodeURIComponent(code) + (carrier ? '&carrier=' + carrier : ''));
            if (st !== 200 || !j.status) return setResult('sh-result', (j.message || 'Lỗi') + (j.errors ? '\\n' + JSON.stringify(j.errors, null, 2) : ''), true);
            const hist = (j.history || []).map(h => '  • ' + (h.time || '?') + ' — ' + (h.status || '?') + (h.note ? ' (' + h.note + ')' : '')).join('\\n');
            setResult('sh-result', kv('Hãng', j.carrier) + kv('Mã', j.trackingCode) + kv('Trạng thái', j.status) + kv('Người nhận', j.receiver) + kv('Từ', j.from) + kv('Đến', j.to) + (j.cod ? kv('COD', fmtNum(j.cod) + ' ₫') : '') + (hist ? '<div class="kv"><div class="k">Lịch sử</div><div class="v"><pre style="margin:0">' + escapeHtml(hist) + '</pre></div></div>' : ''));
        });

        // ─── MST ──────────────────────────────────────────────────
        $('mst-go').addEventListener('click', async () => {
            const q = $('mst-q').value.trim();
            if (!q) return setResult('mst-result', 'Nhập từ khóa.', true);
            setLoading('mst-result');
            const [st, j] = await api('/mst?q=' + encodeURIComponent(q));
            if (st !== 200 || !j.status) return setResult('mst-result', j.message || 'Lỗi', true);
            const items = Array.isArray(j.data) ? j.data : [j.data];
            setResult('mst-result', items.map(d => kv('MST', d.mst) + kv('Tên DN', d.tenDoanhNghiep) + kv('Địa chỉ', d.diaChi) + kv('Trạng thái', d.trangThai) + kv('Giám đốc', d.giamDoc) + kv('Ngành nghề', d.nganhNghe) + '<hr style="border:0;border-top:1px solid #333;margin:8px 0">').join(''));
        });

        // ─── Lich am ──────────────────────────────────────────────
        const today = new Date(); today.setMinutes(today.getMinutes() - today.getTimezoneOffset() + 7 * 60);
        $('lich-date').value = today.toISOString().slice(0, 10);
        $('lich-go').addEventListener('click', async () => {
            const date = $('lich-date').value;
            if (!date) return setResult('lich-result', 'Chọn ngày.', true);
            setLoading('lich-result');
            const [st, j] = await api('/lich-am?date=' + encodeURIComponent(date));
            if (st !== 200 || !j.status) return setResult('lich-result', j.message || 'Lỗi', true);
            setResult('lich-result',
                kv('Dương lịch', j.duong.thu + ', ' + j.duong.ngay + '/' + j.duong.thang + '/' + j.duong.nam) +
                kv('Âm lịch', j.am.ngay + '/' + j.am.thang + '/' + j.am.nam + (j.am.thangNhuan ? ' (nhuận)' : '')) +
                kv('Tên tháng âm', j.am.tenThang) +
                kv('Can chi ngày', j.canChi.ngay) +
                kv('Can chi tháng', j.canChi.thang) +
                kv('Can chi năm', j.canChi.nam) +
                kv('Đánh giá', j.danhGia) +
                kv('Giờ hoàng đạo', j.gioHoangDao.join(', '))
            );
        });

        // ─── Gia ──────────────────────────────────────────────────
        document.querySelectorAll('[data-gia]').forEach(b => b.addEventListener('click', async () => {
            const type = b.dataset.gia;
            setLoading('gia-result');
            const [st, j] = await api('/gia' + (type ? '?type=' + type : ''));
            if (st !== 200 || !j.status) return setResult('gia-result', j.message || 'Lỗi', true);
            const renderItems = (title, src, items, donVi) => {
                if (!items) return '';
                let html = '<b style="color:#fc8">▸ ' + title + (src ? ' (' + src + ')' : '') + (donVi ? ' — ' + donVi : '') + '</b>\\n';
                items.forEach(it => {
                    if (it.muaVao !== undefined) html += '  ' + (it.ten + '').padEnd(28) + 'Mua: ' + fmtNum(it.muaVao) + '   Bán: ' + fmtNum(it.banRa) + '\\n';
                    else if (it.muaTienMat !== undefined) html += '  ' + (it.ma + '').padEnd(8) + (it.muaTienMat ? 'Mua TM: ' + fmtNum(it.muaTienMat) + '  ' : '') + 'Mua CK: ' + fmtNum(it.muaChuyenKhoan) + '  Bán: ' + fmtNum(it.banRa) + '\\n';
                    else if (it.gia !== undefined) html += '  ' + (it.ten + '').padEnd(28) + fmtNum(it.gia) + '\\n';
                    else html += '  ' + JSON.stringify(it) + '\\n';
                });
                return html + '\\n';
            };
            if (j.type) {
                setResult('gia-result', renderItems(j.type.toUpperCase(), j.source, j.items, j.donVi));
            } else {
                let out = '';
                if (j.vang?.items) out += renderItems('VÀNG', j.vang.source, j.vang.items, j.vang.donVi);
                if (j.tyGia?.items) out += renderItems('TỶ GIÁ NHTM', j.tyGia.source, j.tyGia.items, j.tyGia.donVi);
                if (j.xang?.items) out += renderItems('XĂNG DẦU', j.xang.source, j.xang.items, j.xang.donVi);
                setResult('gia-result', out || 'Không có dữ liệu.');
            }
        }));

        // ─── Random VN ────────────────────────────────────────────
        $('rd-go').addEventListener('click', async () => {
            const params = new URLSearchParams();
            ['gender','age','n'].forEach(k => { const v = $('rd-'+k).value.trim(); if (v) params.set(k, v); });
            setLoading('rd-result');
            const [st, j] = await api('/random-vn?' + params.toString());
            if (st !== 200 || !j.status) return setResult('rd-result', j.message || 'Lỗi', true);
            const items = Array.isArray(j.data) ? j.data : [j.data];
            setResult('rd-result', items.map((p, i) => '<b>#' + (i+1) + '</b>\\n' + kv('Họ tên', p.fullName) + kv('Giới tính', p.gender) + kv('Ngày sinh', p.dob + ' (' + p.age + ' tuổi)') + kv('CCCD', p.cccd) + kv('SĐT', p.phone) + kv('Email', p.email) + kv('Tỉnh/TP', p.tinh)).join('<hr style="border:0;border-top:1px solid #333;margin:8px 0">'));
        });

        // ─── Stats ────────────────────────────────────────────────
        $('st-go').addEventListener('click', async () => {
            const platform = $('st-platform').value, user = $('st-user').value.trim();
            if (!user) return setResult('st-result', 'Nhập username.', true);
            setLoading('st-result');
            const [st, j] = await api('/stats?platform=' + platform + '&user=' + encodeURIComponent(user));
            if (st !== 200 || !j.status) return setResult('st-result', j.message || 'Lỗi', true);
            let html = kv('Platform', j.platform);
            if (j.nickname) html += kv('Nickname', j.nickname);
            if (j.name) html += kv('Tên', j.name);
            if (j.avatar) html += '<div class="kv"><div class="k">Avatar</div><div class="v"><img src="' + j.avatar + '" style="height:60px;border-radius:6px"></div></div>';
            if (j.followers !== undefined) html += kv('Followers', fmtNum(j.followers));
            if (j.subscribersText) html += kv('Subscribers', j.subscribersText);
            if (j.followersText) html += kv('Followers', j.followersText);
            if (j.likes !== undefined) html += kv('Tổng likes', fmtNum(j.likes));
            if (j.videos !== undefined) html += kv('Videos', fmtNum(j.videos));
            if (j.totalVideos) html += kv('Tổng videos', j.totalVideos);
            if (j.totalViews) html += kv('Tổng views', j.totalViews);
            if (j.postsText) html += kv('Posts', j.postsText);
            if (j.bio || j.description) html += kv('Bio', j.bio || j.description);
            html += kv('URL', j.url);
            setResult('st-result', html);
        });

        // ─── Shortener ────────────────────────────────────────────
        $('sh2-go').addEventListener('click', async () => {
            const url = $('sh2-url').value.trim(), alias = $('sh2-alias').value.trim();
            if (!url) return setResult('sh2-result', 'Nhập URL.', true);
            setLoading('sh2-result');
            const params = new URLSearchParams({ url }); if (alias) params.set('alias', alias);
            const [st, j] = await api('/shortener/create?' + params.toString());
            if (st !== 200 || !j.status) return setResult('sh2-result', j.message || 'Lỗi', true);
            setResult('sh2-result', kv('Code', j.code) + '<div class="kv"><div class="k">Short URL</div><div class="v"><a href="' + j.shortUrl + '" target="_blank" style="color:#6cf">' + j.shortUrl + '</a></div></div>' + kv('Target', j.target));
        });
        $('sh2-info').addEventListener('click', async () => {
            const url = $('sh2-url').value.trim(), alias = $('sh2-alias').value.trim();
            const code = alias || (url.match(/\\/s\\/([a-z0-9_-]+)/) || [])[1];
            if (!code) return setResult('sh2-result', 'Nhập alias hoặc URL chứa /s/<code>.', true);
            setLoading('sh2-result');
            const [st, j] = await api('/shortener/info?code=' + encodeURIComponent(code));
            if (st !== 200 || !j.status) return setResult('sh2-result', j.message || 'Lỗi', true);
            setResult('sh2-result', kv('Code', j.code) + kv('Target', j.target) + kv('Clicks', fmtNum(j.clicks)) + kv('Tạo lúc', j.createdAt) + kv('Click cuối', j.lastClick || '—'));
        });

        // ─── Image tool ───────────────────────────────────────────
        $('img-go').addEventListener('click', () => {
            const url = $('img-url').value.trim();
            if (!url) return setResult('img-result', 'Nhập URL ảnh.', true);
            const params = new URLSearchParams({ url });
            ['format','w','q'].forEach(k => { const v = $('img-'+k).value.trim(); if (v) params.set(k, v); });
            const out = '/img-tool?' + params.toString();
            setResult('img-result', '<div class="kv"><div class="k">URL output</div><div class="v"><a href="' + out + '" target="_blank" style="color:#6cf">' + out + '</a></div></div><img src="' + out + '" style="max-width:100%;margin-top:10px;border-radius:8px;background:#fff">');
        });

        // ─── IP info ──────────────────────────────────────────────
        $('ip-go').addEventListener('click', async () => {
            const ip = $('ip-q').value.trim();
            setLoading('ip-result');
            const [st, j] = await api('/ip-info' + (ip ? '?ip=' + encodeURIComponent(ip) : ''));
            if (st !== 200 || !j.status) return setResult('ip-result', j.message || 'Lỗi', true);
            const flags = [];
            if (j.flags?.proxy) flags.push('proxy/VPN');
            if (j.flags?.hosting) flags.push('hosting/datacenter');
            if (j.flags?.mobile) flags.push('mobile');
            setResult('ip-result',
                kv('IP', j.ip) +
                kv('Quốc gia', j.country + ' (' + j.countryCode + ')') +
                kv('Vùng/TP', (j.region || '') + (j.city ? ' · ' + j.city : '')) +
                kv('Mã bưu', j.zip) +
                kv('Tọa độ', j.lat + ', ' + j.lon) +
                kv('Múi giờ', j.timezone) +
                kv('ISP', j.isp) +
                kv('Tổ chức', j.org) +
                kv('ASN', (j.asn || '') + (j.asnName ? ' — ' + j.asnName : '')) +
                kv('Cờ', flags.join(', ') || 'không') +
                kv('Nguồn', j.source)
            );
        });
    })();
    </script>`;
}

module.exports = { getToolsVnPageBody, getToolsVnPageStyles, getToolsVnPageScript };
