'use strict';

function getVoicePageStyles() {
    return `<style>
    .vc-wrap { max-width: 980px; margin: 0 auto; padding: 0 4px; }
    .vc-head { display:flex; flex-direction:column; gap:8px; margin-bottom:24px; }
    .vc-eyebrow { font-family:var(--mono); font-size:11px; letter-spacing:1.6px; color:var(--primary); text-transform:uppercase; }
    .vc-title { font-family:var(--display); font-size:30px; font-weight:700; letter-spacing:-.5px; line-height:1.15; }
    .vc-lead { color:var(--muted); max-width:740px; line-height:1.65; font-size:15px; }

    .vc-grid { display:grid; grid-template-columns:1.4fr 1fr; gap:16px; }
    @media (max-width:880px) { .vc-grid { grid-template-columns:1fr; } }

    .vc-panel { background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:22px; box-shadow:var(--shadow-card); }
    .vc-panel h3 { font-family:var(--display); font-size:17px; margin-bottom:6px; }
    .vc-panel .desc { color:var(--muted); font-size:13px; margin-bottom:16px; line-height:1.6; }

    .vc-field { display:flex; flex-direction:column; gap:6px; margin-bottom:14px; }
    .vc-field label { font-family:var(--mono); font-size:11px; font-weight:600; color:var(--muted-2); text-transform:uppercase; letter-spacing:1.2px; display:flex; justify-content:space-between; }
    .vc-field label small { color:var(--primary); font-weight:600; }
    .vc-field input, .vc-field textarea, .vc-field select {
        padding:11px 13px; background:var(--bg); border:1px solid var(--border); border-radius:9px;
        color:var(--text); font-family:var(--sans); font-size:14px;
        transition:border-color .2s var(--ease); width:100%;
    }
    .vc-field input:focus, .vc-field textarea:focus, .vc-field select:focus { border-color:var(--primary); outline:none; }
    .vc-field textarea { resize:vertical; min-height:120px; font-family:var(--sans); line-height:1.55; }
    .vc-field select { font-family:var(--mono); font-size:13px; cursor:pointer; }
    .vc-field input[type=range] { padding:0; height:6px; -webkit-appearance:none; appearance:none; background:var(--surface-2); border:none; border-radius:99px; cursor:pointer; }
    .vc-field input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; width:18px; height:18px; border-radius:50%; background:var(--primary); cursor:pointer; box-shadow:0 0 0 4px rgba(52,211,153,.15); }
    .vc-field input[type=range]::-moz-range-thumb { width:18px; height:18px; border-radius:50%; background:var(--primary); cursor:pointer; border:none; }

    .vc-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .vc-row-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; }

    .vc-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
    .vc-btn { padding:11px 18px; background:var(--primary); color:#06241a; border:none; border-radius:9px; font-family:var(--mono); font-size:12px; font-weight:700; letter-spacing:.5px; cursor:pointer; transition:filter .2s var(--ease); text-transform:uppercase; }
    .vc-btn:hover:not(:disabled) { filter:brightness(1.1); }
    .vc-btn:disabled { opacity:.55; cursor:not-allowed; }
    .vc-btn.secondary { background:var(--surface-2); color:var(--text); border:1px solid var(--border-2); }

    .vc-status { padding:11px 14px; border-radius:9px; font-family:var(--mono); font-size:12.5px; line-height:1.55; margin-top:14px; display:none; }
    .vc-status.is-show { display:block; }
    .vc-status.ok { background:rgba(52,211,153,.08); border:1px solid rgba(52,211,153,.3); color:var(--primary); }
    .vc-status.err { background:rgba(251,113,133,.08); border:1px solid rgba(251,113,133,.3); color:var(--rose); }
    .vc-status.info { background:rgba(34,211,238,.06); border:1px solid rgba(34,211,238,.25); color:var(--cyan); }

    .vc-player { margin-top:16px; padding:16px; border:1px dashed var(--border-2); border-radius:11px; background:var(--surface-2); display:none; }
    .vc-player.is-show { display:block; }
    .vc-player audio { width:100%; margin-top:8px; }
    .vc-player .meta { font-family:var(--mono); font-size:11.5px; color:var(--muted-2); display:flex; justify-content:space-between; flex-wrap:wrap; gap:6px; }

    .vc-quick { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:14px; }
    .vc-quick button { padding:6px 12px; background:var(--surface-2); border:1px solid var(--border); border-radius:99px; font-family:var(--mono); font-size:11px; color:var(--muted); cursor:pointer; transition:all .2s var(--ease); }
    .vc-quick button:hover { color:var(--primary); border-color:var(--primary); }

    .vc-voice-search { margin-bottom:8px; }
    .vc-voice-info { font-family:var(--mono); font-size:11px; color:var(--muted-2); margin-top:4px; }

    .vc-presets { display:grid; grid-template-columns:repeat(2, 1fr); gap:8px; margin-top:12px; }
    .vc-presets button { padding:10px 12px; background:var(--surface-2); border:1px solid var(--border); border-radius:8px; color:var(--text); font-family:var(--mono); font-size:11.5px; cursor:pointer; text-align:left; transition:all .2s var(--ease); }
    .vc-presets button:hover { border-color:var(--primary); color:var(--primary); }
    .vc-presets button b { display:block; font-size:13px; margin-bottom:2px; color:#fff; }

    .vc-counter { font-family:var(--mono); font-size:11px; color:var(--muted-2); text-align:right; margin-top:4px; }
    .vc-counter.over { color:var(--rose); }
    </style>`;
}

function getVoicePageBody() {
    return `<main class="wrap"><div class="vc-wrap">
    <header class="vc-head">
        <div class="vc-eyebrow">▲ Text-to-Speech · Microsoft Edge Neural</div>
        <h1 class="vc-title">Voice Studio<br>setup voice, rate, pitch, volume</h1>
        <p class="vc-lead">Sinh audio MP3 từ văn bản với 400+ voice Neural, miễn phí, chất lượng cao. Tuỳ chỉnh tốc độ, cao độ, âm lượng theo ý bạn.</p>
    </header>

    <div class="vc-grid">
        <section class="vc-panel">
            <h3>Văn bản &amp; phát</h3>
            <p class="desc">Nhập text rồi bấm <b>Tạo audio</b>. Hệ thống stream MP3 ngay xuống trình phát bên dưới.</p>

            <div class="vc-quick">
                <button type="button" data-text="Xin chào, đây là bản dùng thử Voice Studio của LauNa-API.">VI · Chào</button>
                <button type="button" data-text="Hôm nay trời đẹp, rất phù hợp để uống một ly cà phê và viết code.">VI · Tự nhiên</button>
                <button type="button" data-text="Hello, this is a quick voice demo from LauNa-API. Hope you like it!">EN · Hello</button>
                <button type="button" data-text="The quick brown fox jumps over the lazy dog.">EN · Pangram</button>
            </div>

            <div class="vc-field">
                <label>Văn bản (≤5000 ký tự) <small id="vc-counter" class="vc-counter">0 / 5000</small></label>
                <textarea id="vc-text" placeholder="Nhập nội dung muốn đọc..." maxlength="5000">Xin chào, đây là bản dùng thử Voice Studio của LauNa-API.</textarea>
            </div>

            <div class="vc-actions">
                <button class="vc-btn" id="vc-play-btn" type="button">▶ Tạo audio</button>
                <button class="vc-btn secondary" id="vc-dl-btn" type="button">⬇ Tải MP3</button>
                <button class="vc-btn secondary" id="vc-copy-btn" type="button">⧉ Copy URL</button>
            </div>

            <div class="vc-status" id="vc-status"></div>

            <div class="vc-player" id="vc-player">
                <div class="meta">
                    <span id="vc-meta-voice">—</span>
                    <span id="vc-meta-size">—</span>
                </div>
                <audio id="vc-audio" controls preload="auto"></audio>
            </div>
        </section>

        <aside class="vc-panel">
            <h3>Tuỳ chỉnh voice</h3>
            <p class="desc">Chọn voice + chỉnh rate/pitch/volume. Mặc định là <code>vi-VN-HoaiMyNeural</code>.</p>

            <div class="vc-field vc-voice-search">
                <label>Lọc voice <small id="vc-voice-count">…</small></label>
                <div class="vc-row">
                    <select id="vc-lang">
                        <option value="vi">Tiếng Việt (vi)</option>
                        <option value="en">English (en)</option>
                        <option value="ja">日本語 (ja)</option>
                        <option value="ko">한국어 (ko)</option>
                        <option value="zh">中文 (zh)</option>
                        <option value="fr">Français (fr)</option>
                        <option value="de">Deutsch (de)</option>
                        <option value="es">Español (es)</option>
                        <option value="">— Tất cả —</option>
                    </select>
                    <select id="vc-gender">
                        <option value="">Mọi giới tính</option>
                        <option value="Female">♀ Female</option>
                        <option value="Male">♂ Male</option>
                    </select>
                </div>
            </div>

            <div class="vc-field">
                <label>Voice</label>
                <select id="vc-voice"><option>Đang tải...</option></select>
                <div class="vc-voice-info" id="vc-voice-info">—</div>
            </div>

            <div class="vc-field">
                <label>Tốc độ (rate) <small id="vc-rate-val">+0%</small></label>
                <input type="range" id="vc-rate" min="-50" max="100" step="5" value="0">
            </div>

            <div class="vc-field">
                <label>Cao độ (pitch) <small id="vc-pitch-val">+0Hz</small></label>
                <input type="range" id="vc-pitch" min="-50" max="50" step="5" value="0">
            </div>

            <div class="vc-field">
                <label>Âm lượng (volume) <small id="vc-volume-val">+0%</small></label>
                <input type="range" id="vc-volume" min="-50" max="50" step="5" value="0">
            </div>

            <div class="vc-field">
                <label>Format</label>
                <select id="vc-format">
                    <option value="mp3">MP3 96kbps (mặc định)</option>
                    <option value="mp3-low">MP3 48kbps (nhẹ)</option>
                    <option value="webm">WebM Opus</option>
                </select>
            </div>

            <div class="vc-presets">
                <button type="button" data-rate="-30" data-pitch="0" data-volume="0"><b>🐢 Chậm rãi</b>kể chuyện · đọc bài</button>
                <button type="button" data-rate="0" data-pitch="0" data-volume="0"><b>👤 Mặc định</b>tự nhiên</button>
                <button type="button" data-rate="20" data-pitch="0" data-volume="0"><b>⚡ Nhanh</b>tin tức · podcast</button>
                <button type="button" data-rate="0" data-pitch="20" data-volume="20"><b>🤖 Cao + to</b>bot · trẻ em</button>
                <button type="button" data-rate="-10" data-pitch="-30" data-volume="0"><b>🎙️ Trầm ấm</b>quảng cáo</button>
                <button type="button" data-rate="50" data-pitch="40" data-volume="30"><b>🎉 Hoạt náo</b>quảng cáo vui</button>
            </div>
        </aside>
    </div>
    </div></main>`;
}

function getVoicePageScript() {
    return `<script>
    (function(){
        var VOICES = [];
        var $ = function(id){ return document.getElementById(id); };

        function buildUrl(forDownload){
            var p = new URLSearchParams();
            p.set('text', $('vc-text').value);
            p.set('voice', $('vc-voice').value || 'vi-VN-HoaiMyNeural');
            var rate = parseInt($('vc-rate').value, 10);
            var pitch = parseInt($('vc-pitch').value, 10);
            var volume = parseInt($('vc-volume').value, 10);
            if (rate !== 0)   p.set('rate',   (rate   > 0 ? '+' : '') + rate   + '%');
            if (pitch !== 0)  p.set('pitch',  (pitch  > 0 ? '+' : '') + pitch  + 'Hz');
            if (volume !== 0) p.set('volume', (volume > 0 ? '+' : '') + volume + '%');
            p.set('format', $('vc-format').value);
            if (forDownload) p.set('download', '1');
            return '/ai/voice?' + p.toString();
        }

        function showStatus(msg, type){
            var s = $('vc-status');
            s.textContent = msg;
            s.className = 'vc-status is-show ' + (type || 'info');
        }

        async function loadVoices(){
            var lang = $('vc-lang').value;
            var gender = $('vc-gender').value;
            var sel = $('vc-voice');
            $('vc-voice-count').textContent = 'đang tải...';
            sel.innerHTML = '<option>Đang tải...</option>';
            try {
                var url = '/ai/voices' + (lang || gender ? '?' : '');
                var qs = [];
                if (lang)   qs.push('lang=' + encodeURIComponent(lang));
                if (gender) qs.push('gender=' + encodeURIComponent(gender));
                url = '/ai/voices' + (qs.length ? '?' + qs.join('&') : '');
                var r = await fetch(url);
                var d = await r.json();
                if (!d.status || !d.voices.length) {
                    sel.innerHTML = '<option value="">(không có)</option>';
                    $('vc-voice-count').textContent = '0 voice';
                    $('vc-voice-info').textContent = 'Không tìm thấy voice nào';
                    return;
                }
                VOICES = d.voices;
                sel.innerHTML = d.voices.map(function(v){
                    var label = v.name + ' · ' + (v.gender || '?');
                    return '<option value="' + v.name + '">' + label + '</option>';
                }).join('');
                $('vc-voice-count').textContent = d.voices.length + ' voice';
                if (lang === 'vi') {
                    sel.value = 'vi-VN-HoaiMyNeural';
                }
                updateVoiceInfo();
            } catch(e){
                sel.innerHTML = '<option value="">(lỗi)</option>';
                $('vc-voice-count').textContent = 'lỗi';
            }
        }

        function updateVoiceInfo(){
            var name = $('vc-voice').value;
            var v = VOICES.find(function(x){ return x.name === name; });
            if (!v) { $('vc-voice-info').textContent = '—'; return; }
            $('vc-voice-info').textContent = (v.displayName || v.name) + ' · ' + (v.localeName || v.locale);
        }

        function fmtSigned(v, suffix){ return (v > 0 ? '+' : '') + v + suffix; }

        function bindRange(id, valId, suffix){
            var input = $(id), out = $(valId);
            input.addEventListener('input', function(){ out.textContent = fmtSigned(parseInt(input.value, 10), suffix); });
        }
        bindRange('vc-rate',   'vc-rate-val',   '%');
        bindRange('vc-pitch',  'vc-pitch-val',  'Hz');
        bindRange('vc-volume', 'vc-volume-val', '%');

        // Counter
        var ta = $('vc-text'), counter = $('vc-counter');
        function updateCounter(){
            var n = ta.value.length;
            counter.textContent = n + ' / 5000';
            counter.classList.toggle('over', n > 5000);
        }
        ta.addEventListener('input', updateCounter);
        updateCounter();

        // Quick text
        document.querySelectorAll('.vc-quick button').forEach(function(b){
            b.addEventListener('click', function(){ ta.value = b.dataset.text; updateCounter(); });
        });

        // Presets
        document.querySelectorAll('.vc-presets button').forEach(function(b){
            b.addEventListener('click', function(){
                $('vc-rate').value = b.dataset.rate;
                $('vc-pitch').value = b.dataset.pitch;
                $('vc-volume').value = b.dataset.volume;
                $('vc-rate-val').textContent   = fmtSigned(parseInt(b.dataset.rate, 10), '%');
                $('vc-pitch-val').textContent  = fmtSigned(parseInt(b.dataset.pitch, 10), 'Hz');
                $('vc-volume-val').textContent = fmtSigned(parseInt(b.dataset.volume, 10), '%');
            });
        });

        $('vc-lang').addEventListener('change', loadVoices);
        $('vc-gender').addEventListener('change', loadVoices);
        $('vc-voice').addEventListener('change', updateVoiceInfo);

        // Play
        $('vc-play-btn').addEventListener('click', async function(){
            var text = ta.value.trim();
            if (!text) { showStatus('Vui lòng nhập văn bản', 'err'); return; }
            var btn = $('vc-play-btn');
            btn.disabled = true; btn.textContent = '⏳ Đang sinh audio...';
            showStatus('Đang gọi TTS...', 'info');
            try {
                var url = buildUrl(false);
                var r = await fetch(url);
                if (!r.ok) {
                    var err = '';
                    try { err = (await r.json()).message || ''; } catch(_){}
                    showStatus('❌ HTTP ' + r.status + (err ? ' · ' + err : ''), 'err');
                    return;
                }
                var blob = await r.blob();
                var blobUrl = URL.createObjectURL(blob);
                var audio = $('vc-audio');
                audio.src = blobUrl;
                audio.play().catch(function(){});
                $('vc-player').classList.add('is-show');
                $('vc-meta-voice').textContent = $('vc-voice').value;
                $('vc-meta-size').textContent = (blob.size / 1024).toFixed(1) + ' KB · ' + blob.type;
                showStatus('✅ Đã sinh ' + (blob.size / 1024).toFixed(1) + ' KB audio', 'ok');
            } catch(e){
                showStatus('❌ ' + e.message, 'err');
            } finally {
                btn.disabled = false; btn.textContent = '▶ Tạo audio';
            }
        });

        // Download
        $('vc-dl-btn').addEventListener('click', function(){
            var text = ta.value.trim();
            if (!text) { showStatus('Vui lòng nhập văn bản', 'err'); return; }
            window.open(buildUrl(true), '_blank');
        });

        // Copy URL
        $('vc-copy-btn').addEventListener('click', async function(){
            var url = location.origin + buildUrl(false);
            try {
                await navigator.clipboard.writeText(url);
                showStatus('📋 Đã copy: ' + url, 'ok');
            } catch(_){ showStatus(url, 'info'); }
        });

        loadVoices();
    })();
    </script>`;
}

module.exports = { getVoicePageStyles, getVoicePageBody, getVoicePageScript };
