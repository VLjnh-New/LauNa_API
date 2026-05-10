'use strict';

const rawHTML = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<title>Mini Shield · Dashboard</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root{
    --bg:#0a0d14;--card:#121723;--border:#1f2738;--text:#e7eaf3;
    --muted:#7d869c;--accent:#5dd2ff;--good:#4ade80;--bad:#f87171;
    --warn:#fbbf24;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:var(--bg);color:var(--text);
    font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,sans-serif;}
  .wrap{max-width:1200px;margin:0 auto;padding:24px}
  .topbar{display:flex;justify-content:space-between;align-items:center;
    margin-bottom:24px}
  .brand{display:flex;align-items:center;gap:12px}
  .brand .logo{font-size:28px}
  .brand h1{font-size:18px;font-weight:600;letter-spacing:.2px}
  .brand small{color:var(--muted);font-size:11px;display:block;margin-top:2px}
  .pill{display:inline-flex;align-items:center;gap:8px;padding:6px 14px;
    background:rgba(74,222,128,.08);color:var(--good);border-radius:999px;
    font-size:12px;border:1px solid rgba(74,222,128,.2)}
  .pill.bad{background:rgba(248,113,113,.08);color:var(--bad);
    border-color:rgba(248,113,113,.2)}
  .dot{width:8px;height:8px;border-radius:50%;background:currentColor;
    box-shadow:0 0 8px currentColor}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
    gap:14px;margin-bottom:24px}
  .stat{background:var(--card);border:1px solid var(--border);
    padding:18px;border-radius:12px}
  .stat .label{font-size:10px;color:var(--muted);text-transform:uppercase;
    letter-spacing:1.2px}
  .stat .val{font-size:26px;font-weight:700;margin-top:8px;
    font-variant-numeric:tabular-nums}
  .stat .sub{font-size:11px;color:var(--muted);margin-top:4px}
  .stat.green .val{color:var(--good)}
  .stat.red .val{color:var(--bad)}
  .stat.blue .val{color:var(--accent)}
  .stat.yellow .val{color:var(--warn)}
  .row{display:grid;grid-template-columns:2fr 1fr;gap:14px;margin-bottom:14px}
  @media(max-width:900px){.row{grid-template-columns:1fr}}
  .panel{background:var(--card);border:1px solid var(--border);
    padding:20px;border-radius:12px}
  .panel h2{font-size:13px;color:var(--muted);text-transform:uppercase;
    letter-spacing:1.2px;margin-bottom:14px;font-weight:600}
  #chart{width:100%;height:220px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{padding:9px 10px;text-align:left;border-bottom:1px solid var(--border)}
  th{color:var(--muted);font-weight:500;font-size:11px;text-transform:uppercase;
    letter-spacing:.8px}
  tr:last-child td{border-bottom:none}
  tr:hover td{background:rgba(255,255,255,.02)}
  .tag{display:inline-block;padding:2px 8px;border-radius:6px;
    font-size:11px;font-weight:600}
  .tag.waf{background:rgba(248,113,113,.15);color:var(--bad)}
  .tag.rate_limit{background:rgba(251,191,36,.15);color:var(--warn)}
  .tag.bot{background:rgba(167,139,250,.15);color:#a78bfa}
  .tag.ban,.tag.blacklist{background:rgba(248,113,113,.15);color:var(--bad)}
  .tag.challenge{background:rgba(93,210,255,.15);color:var(--accent)}
  button{background:var(--accent);color:#000;border:none;padding:5px 12px;
    border-radius:6px;font-size:11px;font-weight:700;cursor:pointer}
  button.ghost{background:transparent;color:var(--muted);border:1px solid var(--border)}
  button:hover{filter:brightness(1.1)}
  .input{background:#0e131e;border:1px solid var(--border);color:var(--text);
    padding:6px 10px;border-radius:6px;font-size:13px;width:140px}
  .empty{color:var(--muted);text-align:center;padding:30px;font-size:13px}
  .ip-mono{font-family:ui-monospace,SFMono-Regular,monospace;font-size:12px}
  .controls{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
  .footer{margin-top:30px;text-align:center;color:var(--muted);font-size:11px;opacity:.6}
</style>
</head>
<body>
<div class="wrap">

  <div class="topbar">
    <div class="brand">
      <div class="logo">🛡️</div>
      <div>
        <h1>Mini Shield</h1>
        <small>Lightweight Anti-DDoS · WAF · Reverse Proxy</small>
      </div>
    </div>
    <div id="status" class="pill"><span class="dot"></span>Đang kết nối...</div>
  </div>

  <div class="grid">
    <div class="stat blue">
      <div class="label">Yêu cầu / giây</div>
      <div class="val" id="rps">0</div>
      <div class="sub">Đỉnh: <span id="peak">0</span></div>
    </div>
    <div class="stat green">
      <div class="label">Tổng cho qua</div>
      <div class="val" id="passed">0</div>
      <div class="sub">Hợp lệ</div>
    </div>
    <div class="stat red">
      <div class="label">Đã chặn</div>
      <div class="val" id="blocked">0</div>
      <div class="sub">Mối đe doạ</div>
    </div>
    <div class="stat yellow">
      <div class="label">IP đang ban</div>
      <div class="val" id="banned">0</div>
      <div class="sub">Tự khoá / thủ công</div>
    </div>
    <div class="stat blue">
      <div class="label">PoW Challenge</div>
      <div class="val" id="chissued">0</div>
      <div class="sub">Giải đúng: <span id="chsolved">0</span></div>
    </div>
    <div class="stat">
      <div class="label">Uptime</div>
      <div class="val" id="uptime">0s</div>
      <div class="sub">Tổng req: <span id="total">0</span></div>
    </div>
  </div>

  <div class="row">
    <div class="panel">
      <h2>Lưu lượng 60 giây qua</h2>
      <canvas id="chart"></canvas>
    </div>
    <div class="panel">
      <h2>Khoá IP thủ công</h2>
      <div class="controls">
        <input id="banIp" class="input" placeholder="123.45.67.89">
        <input id="banMin" class="input" type="number" value="10" style="width:60px">
        <button onclick="manualBan()">Ban</button>
      </div>
      <p style="font-size:11px;color:var(--muted);margin-top:10px">
        IP sẽ bị khoá trong số phút bạn chọn.
      </p>
    </div>
  </div>

  <div class="panel" style="margin-bottom:14px">
    <h2>Tấn công gần đây</h2>
    <table>
      <thead><tr>
        <th style="width:80px">Lúc</th><th style="width:140px">IP</th>
        <th style="width:100px">Loại</th><th>Chi tiết</th><th>Path</th>
      </tr></thead>
      <tbody id="recentTbl"><tr><td class="empty" colspan="5">Chưa có sự kiện</td></tr></tbody>
    </table>
  </div>

  <div class="panel">
    <h2>IP đang bị khoá</h2>
    <table>
      <thead><tr>
        <th style="width:160px">IP</th><th>Lý do</th>
        <th style="width:120px">Còn lại</th><th style="width:80px"></th>
      </tr></thead>
      <tbody id="banTbl"><tr><td class="empty" colspan="4">Không có IP nào bị khoá</td></tr></tbody>
    </table>
  </div>

  <div class="footer">Mini Shield v1.0 · Realtime via WebSocket</div>
</div>

<script>
const $ = (id) => document.getElementById(id);

// ── Chart (vanilla canvas) ──
const cvs = $("chart");
const ctx = cvs.getContext("2d");
function resize(){
  const dpr = devicePixelRatio || 1;
  cvs.width = cvs.clientWidth * dpr;
  cvs.height = cvs.clientHeight * dpr;
  ctx.scale(dpr, dpr);
}
window.addEventListener("resize", resize);
setTimeout(resize, 30);

function drawChart(passed, blocked){
  const W = cvs.clientWidth, H = cvs.clientHeight;
  ctx.clearRect(0,0,W,H);
  const pad = 28;
  const max = Math.max(1, ...passed, ...blocked);
  ctx.strokeStyle = "rgba(255,255,255,.04)";
  ctx.lineWidth = 1;
  for(let i=0;i<=4;i++){
    const y = pad + (H - pad*2) * i/4;
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W-10, y); ctx.stroke();
  }
  ctx.fillStyle = "#7d869c";
  ctx.font = "10px ui-monospace,monospace";
  ctx.fillText(max + "", 4, pad+4);
  ctx.fillText("0", 4, H-pad+4);

  function plot(arr, color, fill){
    ctx.beginPath();
    arr.forEach((v,i)=>{
      const x = pad + (W-pad-10) * (i/(arr.length-1));
      const y = H - pad - (H-pad*2) * (v/max);
      i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    if(fill){
      ctx.lineTo(W-10, H-pad);
      ctx.lineTo(pad, H-pad);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    }
  }
  plot(passed, "#4ade80", "rgba(74,222,128,.08)");
  plot(blocked, "#f87171", "rgba(248,113,113,.08)");
}

function fmtUptime(s){
  if(s<60) return s+"s";
  if(s<3600) return Math.floor(s/60)+"m "+(s%60)+"s";
  return Math.floor(s/3600)+"h "+Math.floor((s%3600)/60)+"m";
}
function fmtTime(ts){
  const d = new Date(ts);
  return d.toTimeString().slice(0,8);
}

function applyStats(d){
  $("rps").textContent = d.rps.toLocaleString();
  $("peak").textContent = d.peakRps.toLocaleString();
  $("passed").textContent = d.passedRequests.toLocaleString();
  $("blocked").textContent = d.blockedRequests.toLocaleString();
  $("banned").textContent = d.bannedCount.toLocaleString();
  $("chissued").textContent = d.challengeIssued.toLocaleString();
  $("chsolved").textContent = d.challengeSolved.toLocaleString();
  $("uptime").textContent = fmtUptime(d.uptimeSec);
  $("total").textContent = d.totalRequests.toLocaleString();
  if(d.history) drawChart(d.history.passed, d.history.blocked);
}

async function refreshRecent(){
  try{
    const r = await fetch("__BASE__/api/recent");
    const list = await r.json();
    const tbl = $("recentTbl");
    if(list.length === 0){
      tbl.innerHTML = '<tr><td class="empty" colspan="5">Chưa có sự kiện</td></tr>';
      return;
    }
    tbl.innerHTML = list.slice(0,30).map(e =>
      '<tr><td>'+fmtTime(e.ts)+'</td>'+
      '<td class="ip-mono">'+e.ip+'</td>'+
      '<td><span class="tag '+e.type+'">'+e.type+'</span></td>'+
      '<td>'+escapeHtml(e.detail)+'</td>'+
      '<td class="ip-mono" style="opacity:.7">'+escapeHtml(e.path||"")+'</td></tr>'
    ).join("");
  }catch(e){}
}

async function refreshBans(){
  try{
    const r = await fetch("__BASE__/api/banned");
    const list = await r.json();
    const tbl = $("banTbl");
    if(list.length === 0){
      tbl.innerHTML = '<tr><td class="empty" colspan="4">Không có IP nào bị khoá</td></tr>';
      return;
    }
    tbl.innerHTML = list.map(b =>
      '<tr><td class="ip-mono">'+b.ip+'</td>'+
      '<td>'+escapeHtml(b.reason||"")+'</td>'+
      '<td>'+fmtUptime(b.remainingSec)+'</td>'+
      '<td><button class="ghost" onclick="unban(\\''+b.ip+'\\')">Gỡ</button></td></tr>'
    ).join("");
  }catch(e){}
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function unban(ip){
  await fetch("__BASE__/api/unban", {method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ip})});
  refreshBans();
}

async function manualBan(){
  const ip = $("banIp").value.trim();
  const min = parseInt($("banMin").value) || 10;
  if(!ip) return;
  await fetch("__BASE__/api/ban",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ip,minutes:min})});
  $("banIp").value = "";
  refreshBans();
}

function connect(){
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(proto+"//"+location.host+"__BASE__/ws");
  ws.onopen = () => {
    $("status").className = "pill";
    $("status").innerHTML = '<span class="dot"></span>Đang hoạt động';
  };
  ws.onclose = () => {
    $("status").className = "pill bad";
    $("status").innerHTML = '<span class="dot"></span>Mất kết nối · Thử lại...';
    setTimeout(connect, 2000);
  };
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if(msg.type === "stats") applyStats(msg.data);
    else if(msg.type === "attack") refreshRecent();
  };
}

fetch("__BASE__/api/stats").then(r => r.json()).then(applyStats);
refreshRecent();
refreshBans();
setInterval(refreshBans, 5000);
connect();
</script>
</body>
</html>`;

function dashboardHTML(basePath = '') {
    return rawHTML.replace(/__BASE__/g, basePath);
}

module.exports = { dashboardHTML };
