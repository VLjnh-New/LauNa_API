'use strict';

function getHomePageBody(total, totalRoutes, totalCategories) {
    return `
    <main class="wrap">
        <header class="page-head">
            <div>
                <div class="page-eyebrow">▲ LauNa Platform</div>
                <h1 class="page-title">REST API Hub<br>cho cộng đồng ChatBot &amp; Dev Việt</h1>
                <p class="page-lead">Chào Mừng Bạn Đến Với LauNa-API Ở Đây Có: AI · Download · Music · Note · Share · FreeFire. vv.</p>
            </div>
            <div class="page-meta"><span>● <b>online</b></span><span>uptime <b id="uptime-badge">live</b></span></div>
        </header>
        <section class="stats">
            <div class="stat"><b id="total-req">${(total || 0).toLocaleString('vi-VN')}</b><span>Tổng Requests</span></div>
            <div class="stat"><b>${totalRoutes}</b><span>Endpoints</span></div>
            <div class="stat"><b>${totalCategories}</b><span>Danh Mục</span></div>
        </section>
        <section class="grid">
            <article class="card home-card">
                <div>
                    <div class="icon">↓</div>
                    <h2>LauNa Download</h2>
                    <p class="muted">Web tải full media : video, audio, ảnh, file/stream nếu API trả về. Chỉ cần dán link, hệ thống tự chuyển nguồn khi lỗi.</p>
                </div>
                <div class="btn-row"><a class="btn primary" href="/download">Mở Download</a></div>
            </article>
            <article class="card home-card">
                <div>
                    <div class="icon">✉</div>
                    <h2>Mail Ảo 10 phút</h2>
                    <p class="muted">Tạo email tạm thời sống 10 phút để nhận OTP, xác thực, đăng ký dịch vụ. Tự refresh hộp thư, xem HTML/Text, không cần đăng ký.</p>
                </div>
                <div class="btn-row"><a class="btn primary" href="/tempmail">Mở Mail Ảo</a></div>
            </article>
            <article class="card home-card">
                <div>
                    <div class="icon">ⓕ</div>
                    <h2>FB Login (Get Token)</h2>
                    <p class="muted">Đăng nhập Facebook qua FB4A để lấy access token + cookies, hỗ trợ 2FA TOTP và convert token sang Messenger / FB Lite / Ads / Pages Manager.</p>
                </div>
                <div class="btn-row"><a class="btn primary" href="/fb-login">Mở FB Login</a></div>
            </article>
            <article class="card home-card">
                <div>
                    <div class="icon">⚙</div>
                    <h2>Bộ Tool Việt Nam</h2>
                    <p class="muted">12 tool tích hợp: VietQR, tra cứu chủ STK, FB UID, vận đơn (GHTK/GHN/J&T), MST, lịch âm, giá vàng/USD/xăng, random profile VN, social stats, rút gọn link, xử lý ảnh, tra IP.</p>
                </div>
                <div class="btn-row"><a class="btn primary" href="/tools-vn">Mở Tool VN</a></div>
            </article>
            <article class="card home-card">
                <div>
                    <div class="icon">⌘</div>
                    <h2>Trang API</h2>
                    <p class="muted">Xem danh sách API theo danh mục, tham số cần truyền và nút test nhanh từng endpoint.</p>
                </div>
                <div class="btn-row"><a class="btn primary" href="/api">Xem API</a></div>
            </article>
            <article class="card home-card">
                <div>
                    <div class="icon">§</div>
                    <h2>Swagger Docs</h2>
                    <p class="muted">Spec OpenAPI 3.0 đầy đủ cho toàn bộ endpoint, có thể test ngay trong trình duyệt hoặc import vào Postman/Insomnia.</p>
                </div>
                <div class="btn-row"><a class="btn primary" href="/docs" target="_blank" rel="noopener">Mở /docs</a></div>
            </article>
        </section>
        <section class="bot-section">
            <h2 class="chart-section-title">Mua API Key qua Bot Telegram</h2>
            <article class="card bot-card">
                <div class="bot-info">
                    <div class="bot-badge">
                        <svg width="22" height="22" viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                            <circle cx="120" cy="120" r="120" fill="#229ED9"/>
                            <path d="M54.6 116.7l113.7-43.9c5.3-1.9 9.9 1.3 8.2 9.3l-19.4 91.3c-1.4 6.5-5.3 8.1-10.7 5l-29.6-21.8-14.3 13.7c-1.6 1.6-2.9 2.9-5.9 2.9l2.1-30.1 54.7-49.4c2.4-2.1-.5-3.3-3.7-1.2l-67.6 42.5-29.1-9.1c-6.3-2-6.4-6.3 1.6-9.2z" fill="#fff"/>
                        </svg>
                        <span>@launasystem_bot</span>
                    </div>
                    <p class="bot-lead">Mở bot trên Telegram để <b>mua API Key Premium</b> — thanh toán qua VietinBank hoặc MoMo, nhận key tự động sau khi admin duyệt. Hỗ trợ truy cập toàn bộ 80+ endpoint không giới hạn.</p>
                    <ul class="bot-plans">
                        <li><span class="bot-plan-name">30 ngày</span><b class="bot-plan-price">30.000đ</b></li>
                        <li class="popular"><span class="bot-plan-name">90 ngày <em>· phổ biến</em></span><b class="bot-plan-price">80.000đ</b></li>
                        <li><span class="bot-plan-name">365 ngày</span><b class="bot-plan-price">250.000đ</b></li>
                    </ul>
                    <div class="bot-cta-row">
                        <a class="btn primary bot-cta" href="https://t.me/launasystem_bot" target="_blank" rel="noopener noreferrer">Mở Bot Telegram</a>
                        <a class="btn ghost bot-cta-2" href="https://t.me/launasystem_bot?start=buy" target="_blank" rel="noopener noreferrer">Mua ngay /buy</a>
                    </div>
                </div>
                <div class="bot-visual">
                    <div class="bot-chat">
                        <div class="bot-chat-row left"><div class="bot-bubble">Chào bạn 👋<br>Bấm <b>/buy</b> để chọn gói.</div></div>
                        <div class="bot-chat-row right"><div class="bot-bubble user">/buy</div></div>
                        <div class="bot-chat-row left"><div class="bot-bubble">Chọn gói:<br>💎 30 ngày · 90 ngày · 365 ngày</div></div>
                        <div class="bot-chat-row right"><div class="bot-bubble user">90 ngày · MoMo</div></div>
                        <div class="bot-chat-row left"><div class="bot-bubble">📷 QR đã sẵn sàng — bấm <b>✅ Tôi đã CK</b> sau khi chuyển.</div></div>
                    </div>
                </div>
            </article>
        </section>
        <section class="donate-section">
            <h2 class="chart-section-title">Ủng hộ tác giả</h2>
            <article class="card donate-card">
                <div class="donate-info">
                    <p class="donate-lead">LauNa-API miễn phí cho cộng đồng. Nếu thấy hữu ích, bạn có thể ủng hộ tác giả qua MoMo / VietQR / Napas 247 — quét mã bên cạnh, mọi đóng góp đều giúp duy trì server <span class="donate-heart">♥</span></p>
                    <ul class="donate-meta">
                        <li><span>Chủ tài khoản</span><b>Đặng Văn Lịnh</b></li>
                        <li><span>STK</span><b>*******231</b></li>
                        <li><span>Hỗ trợ</span><b>MoMo · VietQR · Napas 247</b></li>
                    </ul>
                </div>
                <div class="donate-qr-wrap">
                    <img src="/qr-donate.jpg" alt="QR ủng hộ LauNa-API" class="donate-qr" loading="lazy">
                    <a class="btn primary donate-dl" href="/qr-donate.jpg" download>Tải ảnh QR</a>
                </div>
            </article>
        </section>
        <section class="stat-charts-section">
            <h2 class="chart-section-title">Thống kê</h2>
            <div class="chart-grid">
                <div class="chart-panel">
                    <div class="chart-panel-title">Requests theo giờ (48h gần nhất)</div>
                    <canvas id="hourlyChart" height="200"></canvas>
                    <div id="hourlyEmpty" class="chart-empty" style="display:none">Chưa có dữ liệu.</div>
                </div>
                <div class="chart-panel">
                    <div class="chart-panel-title">Theo danh mục</div>
                    <canvas id="catChart" height="200"></canvas>
                    <div id="catEmpty" class="chart-empty" style="display:none">Chưa có dữ liệu.</div>
                </div>
            </div>
        </section>
    </main>`;
}

function getHomePageScript(hourlyJson, byCategoryJson) {
    return `
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
    <style>
        .stat-charts-section { margin-top: 48px; }
        .chart-section-title { font-family: var(--display); font-size: 22px; font-weight: 700; letter-spacing: -.5px; margin-bottom: 18px; color: #fff; }
        .chart-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; }
        @media (max-width: 680px) { .chart-grid { grid-template-columns: 1fr; } }
        .chart-panel { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 22px; box-shadow: var(--shadow-card); transition: border-color .25s var(--ease); }
        .chart-panel:hover { border-color: var(--border-2); }
        .chart-panel-title { font-family: var(--mono); font-size: 11px; font-weight: 600; color: var(--muted-2); margin-bottom: 16px; text-transform: uppercase; letter-spacing: 1.4px; }
        .chart-empty { color: var(--muted-2); font-family: var(--mono); font-size: 13px; text-align: center; padding: 28px 0; }

        /* ── Bot Telegram CTA ─────────────────────── */
        .bot-section { margin-top: 48px; }
        .bot-card { display: grid; grid-template-columns: 1.4fr 1fr; gap: 28px; align-items: center; padding: 26px; border: 1px solid var(--border); background: linear-gradient(135deg, rgba(34,158,217,.08), rgba(52,211,153,.05) 70%, transparent); position: relative; overflow: hidden; }
        .bot-card::before { content: ''; position: absolute; top: -60px; right: -60px; width: 220px; height: 220px; background: radial-gradient(circle, rgba(34,158,217,.18), transparent 70%); pointer-events: none; }
        .bot-info { min-width: 0; position: relative; z-index: 1; }
        .bot-badge { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px 6px 6px; border-radius: 999px; background: rgba(34,158,217,.12); border: 1px solid rgba(34,158,217,.35); font-family: var(--mono); font-size: 12.5px; font-weight: 600; color: #62c2eb; margin-bottom: 14px; }
        .bot-lead { color: var(--muted); line-height: 1.7; font-size: 15px; margin: 0 0 16px; }
        .bot-lead b { color: #fff; font-weight: 600; }
        .bot-plans { list-style: none; padding: 0; margin: 0 0 18px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .bot-plans li { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-2); font-family: var(--mono); transition: border-color .25s var(--ease), transform .25s var(--ease); }
        .bot-plans li:hover { border-color: var(--border-2); transform: translateY(-2px); }
        .bot-plans li.popular { border-color: rgba(52,211,153,.55); background: linear-gradient(135deg, rgba(52,211,153,.1), var(--surface-2)); }
        .bot-plan-name { font-size: 11px; color: var(--muted-2); text-transform: uppercase; letter-spacing: 1.2px; }
        .bot-plan-name em { color: #34d399; font-style: normal; font-weight: 600; text-transform: none; letter-spacing: 0; }
        .bot-plan-price { color: #fff; font-size: 15px; font-weight: 700; letter-spacing: -.3px; }
        .bot-cta-row { display: flex; gap: 10px; flex-wrap: wrap; }
        .bot-cta { background: linear-gradient(135deg, #229ED9, #1d8cc4); border-color: #1d8cc4; color: #fff; box-shadow: 0 8px 22px -10px rgba(34,158,217,.6); }
        .bot-cta:hover { background: linear-gradient(135deg, #2bb1ee, #229ED9); transform: translateY(-1px); }
        .bot-cta-2 { background: var(--surface-2); border: 1px solid var(--border-2); color: var(--muted); }
        .bot-cta-2:hover { color: #fff; border-color: rgba(34,158,217,.45); }
        .bot-visual { display: flex; align-items: center; justify-content: center; min-width: 0; position: relative; z-index: 1; }
        .bot-chat { width: 100%; max-width: 280px; display: flex; flex-direction: column; gap: 8px; padding: 18px 14px; border: 1px solid var(--border); background: rgba(7,10,19,.6); border-radius: 16px; backdrop-filter: blur(6px); }
        .bot-chat-row { display: flex; }
        .bot-chat-row.left { justify-content: flex-start; }
        .bot-chat-row.right { justify-content: flex-end; }
        .bot-bubble { max-width: 80%; padding: 8px 12px; border-radius: 14px; font-size: 12.5px; line-height: 1.45; color: #e7ecf7; background: var(--surface-2); border: 1px solid var(--border); }
        .bot-bubble.user { background: linear-gradient(135deg, #229ED9, #1d8cc4); border-color: #1d8cc4; color: #fff; }
        @media (max-width: 760px) { .bot-card { grid-template-columns: 1fr; gap: 22px; } .bot-plans { grid-template-columns: 1fr; } .bot-visual { order: -1; } .bot-chat { max-width: 100%; } }

        /* ── Donate / QR ─────────────────────────── */
        .donate-section { margin-top: 48px; }
        .donate-card { display: grid; grid-template-columns: 1.4fr 1fr; gap: 28px; align-items: center; padding: 26px; border: 1px solid var(--border); background: linear-gradient(135deg, rgba(52,211,153,.05), rgba(167,139,250,.05) 70%, transparent); }
        .donate-info { min-width: 0; }
        .donate-lead { color: var(--muted); line-height: 1.7; font-size: 15px; margin-bottom: 18px; }
        .donate-heart { color: var(--rose); font-size: 16px; }
        .donate-meta { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
        .donate-meta li { display: flex; justify-content: space-between; align-items: center; gap: 14px; padding: 10px 14px; border: 1px solid var(--border); border-radius: 9px; background: var(--surface-2); font-family: var(--mono); font-size: 13px; }
        .donate-meta li span { color: var(--muted-2); text-transform: uppercase; font-size: 11px; letter-spacing: 1.2px; }
        .donate-meta li b { color: #fff; font-weight: 600; letter-spacing: .3px; }
        .donate-qr-wrap { display: flex; flex-direction: column; align-items: center; gap: 12px; }
        .donate-qr { width: 100%; max-width: 260px; height: auto; border-radius: 14px; background: #fff; padding: 8px; box-shadow: 0 14px 40px -16px rgba(52,211,153,.4), 0 0 0 1px var(--border-2); transition: transform .25s var(--ease), box-shadow .25s var(--ease); }
        .donate-qr:hover { transform: translateY(-3px) scale(1.015); box-shadow: 0 22px 56px -18px rgba(52,211,153,.55), 0 0 0 1px var(--primary); }
        .donate-dl { width: 100%; max-width: 260px; }
        @media (max-width: 760px) { .donate-card { grid-template-columns: 1fr; gap: 22px; text-align: center; } .donate-meta li { justify-content: center; flex-wrap: wrap; } }
    </style>
    <script>
    (function(){
        var hourly = ${hourlyJson};
        var byCategory = ${byCategoryJson};
        var palette = ['#34d399','#22d3ee','#a78bfa','#fbbf24','#fb7185','#60a5fa','#f472b6'];
        var gridColor = 'rgba(255,255,255,.04)';
        var tickColor = 'rgba(231,236,247,.45)';
        var tooltipStyle = { backgroundColor: '#0e1422', borderColor: '#1d2840', borderWidth: 1, titleColor: '#e7ecf7', bodyColor: '#7d8aaa', padding: 10, cornerRadius: 8, titleFont: { family: 'JetBrains Mono', size: 11 }, bodyFont: { family: 'JetBrains Mono', size: 11 } };
        if (!hourly || hourly.length === 0) {
            document.getElementById('hourlyChart').style.display = 'none';
            document.getElementById('hourlyEmpty').style.display = 'block';
        } else {
            var labels = hourly.map(function(e){ var d = new Date(e.h + ':00:00Z'); return (d.getUTCHours() < 10 ? '0' : '') + d.getUTCHours() + 'h'; });
            var canvas = document.getElementById('hourlyChart');
            var ctx = canvas.getContext('2d');
            var grad = ctx.createLinearGradient(0, 0, 0, 220);
            grad.addColorStop(0, 'rgba(52,211,153,.7)');
            grad.addColorStop(1, 'rgba(52,211,153,.08)');
            new Chart(canvas, {
                type: 'bar',
                data: { labels: labels, datasets: [{ label: 'Requests', data: hourly.map(function(e){ return e.n; }), backgroundColor: grad, borderColor: '#34d399', borderWidth: 1, borderRadius: 4, hoverBackgroundColor: '#34d399' }] },
                options: { responsive: true, animation: { duration: 600 }, plugins: { legend: { display: false }, tooltip: tooltipStyle }, scales: { x: { ticks: { color: tickColor, font: { family: 'JetBrains Mono', size: 10 }, maxTicksLimit: 12 }, grid: { color: gridColor, drawBorder: false } }, y: { ticks: { color: tickColor, font: { family: 'JetBrains Mono', size: 10 }, precision: 0 }, grid: { color: gridColor, drawBorder: false }, beginAtZero: true } } }
            });
        }
        var catKeys = Object.keys(byCategory).filter(function(k){ return byCategory[k] > 0; });
        if (catKeys.length === 0) {
            document.getElementById('catChart').style.display = 'none';
            document.getElementById('catEmpty').style.display = 'block';
        } else {
            new Chart(document.getElementById('catChart'), {
                type: 'doughnut',
                data: { labels: catKeys, datasets: [{ data: catKeys.map(function(k){ return byCategory[k]; }), backgroundColor: catKeys.map(function(_,i){ return palette[i % palette.length]; }), borderColor: '#0e1422', borderWidth: 3, hoverOffset: 10, hoverBorderColor: '#070a13' }] },
                options: { responsive: true, animation: { animateRotate: true, duration: 700 }, plugins: { legend: { position: 'bottom', labels: { color: '#7d8aaa', boxWidth: 10, padding: 12, font: { family: 'JetBrains Mono', size: 10.5 } } }, tooltip: tooltipStyle }, cutout: '64%' }
            });
        }
    })();
    </script>`;
}

module.exports = { getHomePageBody, getHomePageScript };
