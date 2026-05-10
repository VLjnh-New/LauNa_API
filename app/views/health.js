'use strict';

function getHealthPageBody() {
    return `
    <main class="wrap">
        <header class="page-head">
            <div>
                <div class="page-eyebrow">● Live Status · /healthz</div>
                <h1 class="page-title">Tình trạng máy chủ<br>thời gian thực</h1>
                <p class="page-lead">Trang này hiển thị dữ liệu lấy từ endpoint <a href="/healthz" target="_blank" style="color:var(--primary)">/healthz</a> và <a href="/readyz" target="_blank" style="color:var(--primary)">/readyz</a>. Tự cập nhật mỗi 5 giây.</p>
            </div>
            <div class="page-meta"><span id="hz-dot">● <b id="hz-state">đang kiểm tra…</b></span></div>
        </header>
        <section class="stats">
            <div class="stat"><b id="hz-uptime">—</b><span>Uptime</span></div>
            <div class="stat"><b id="hz-mem">—</b><span>RAM dùng (RSS)</span></div>
            <div class="stat"><b id="hz-node">—</b><span>Node.js</span></div>
        </section>
        <section class="grid" style="grid-template-columns:1fr 1fr;gap:14px;">
            <article class="card">
                <h2 style="margin:0 0 10px;font-size:15px;">Bộ nhớ chi tiết</h2>
                <div id="hz-mem-detail" class="result" style="font-family:var(--mono);font-size:12.5px;line-height:1.7;">—</div>
            </article>
            <article class="card">
                <h2 style="margin:0 0 10px;font-size:15px;">Thông tin process</h2>
                <div id="hz-proc" class="result" style="font-family:var(--mono);font-size:12.5px;line-height:1.7;">—</div>
            </article>
        </section>
        <section class="card" style="margin-top:14px;">
            <h2 style="margin:0 0 10px;font-size:15px;">Phản hồi JSON gốc</h2>
            <pre id="hz-raw" style="margin:0;font-family:var(--mono);font-size:12px;color:var(--muted);white-space:pre-wrap;word-break:break-all;max-height:280px;overflow:auto;">—</pre>
        </section>
    </main>`;
}

function getHealthPageScript() {
    return `
    <style>
        #hz-dot.ok b { color:#34d399; } #hz-dot.ok { color:#34d399; }
        #hz-dot.bad b { color:#fb7185; } #hz-dot.bad { color:#fb7185; }
        #hz-dot.warn b { color:#fbbf24; } #hz-dot.warn { color:#fbbf24; }
    </style>
    <script>
    (function(){
        function fmtBytes(n){ if(!n&&n!==0) return '—'; var u=['B','KB','MB','GB']; var i=0; while(n>=1024&&i<u.length-1){n/=1024;i++;} return n.toFixed(n<10?2:1)+' '+u[i]; }
        function fmtUptime(s){ s=Math.max(0,Math.floor(s||0)); var d=Math.floor(s/86400); s%=86400; var h=Math.floor(s/3600); s%=3600; var m=Math.floor(s/60); var ss=s%60; var p=[]; if(d)p.push(d+'d'); if(h||d)p.push(h+'h'); if(m||h||d)p.push(m+'m'); p.push(ss+'s'); return p.join(' '); }
        function setDot(state, label){ var el=document.getElementById('hz-dot'); el.className=state; el.querySelector('b').textContent=label; document.getElementById('hz-state').textContent=label; }
        async function tick(){
            try {
                var [hz, rz] = await Promise.all([
                    fetch('/healthz', {cache:'no-store'}).then(function(r){return r.json();}),
                    fetch('/readyz',  {cache:'no-store'}).then(function(r){return r.json();}).catch(function(){return null;})
                ]);
                document.getElementById('hz-uptime').textContent = fmtUptime(hz.uptime);
                document.getElementById('hz-mem').textContent    = fmtBytes(hz.memory && hz.memory.rss);
                document.getElementById('hz-node').textContent   = hz.node || '—';
                var mem = hz.memory || {};
                document.getElementById('hz-mem-detail').innerHTML =
                    'RSS:        '+fmtBytes(mem.rss)+'<br>'+
                    'Heap Total: '+fmtBytes(mem.heapTotal)+'<br>'+
                    'Heap Used:  '+fmtBytes(mem.heapUsed)+'<br>'+
                    'External:   '+fmtBytes(mem.external)+'<br>'+
                    'Array Bufs: '+fmtBytes(mem.arrayBuffers);
                document.getElementById('hz-proc').innerHTML =
                    'Status:    '+(hz.status||'?')+'<br>'+
                    'Ready:     '+((rz&&rz.status)||'?')+'<br>'+
                    'PID:       '+(hz.pid||'?')+'<br>'+
                    'Timestamp: '+(hz.ts||'?');
                document.getElementById('hz-raw').textContent = JSON.stringify(hz, null, 2);
                var ready = rz && rz.status === 'ready';
                setDot(hz.status==='ok' && ready ? 'ok' : 'warn', hz.status==='ok' && ready ? 'online' : 'degraded');
            } catch(e){
                setDot('bad', 'offline');
                document.getElementById('hz-raw').textContent = 'Error: ' + (e && e.message || e);
            }
        }
        tick(); setInterval(tick, 5000);
    })();
    </script>`;
}

module.exports = { getHealthPageBody, getHealthPageScript };
