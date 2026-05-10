'use strict';

const { getShareFileScript } = require('./share-file');

function getDownloadPageBody() {
    return `
    <main class="wrap">
        <section class="hero">
            <div class="badge">Auto Fallback Downloader</div>
            <h1>LauNa Download</h1>
            <p class="lead">Dán link TikTok, Douyin, YouTube, Facebook, Mixcloud, SoundCloud hoặc link media được hỗ trợ. API tổng hợp sẽ lấy full media và tự đổi sang API khác khi nguồn trước bị lỗi.</p>
        </section>
        <section class="card download-box">
            <h2>Tải full media</h2>
            <div class="input-row">
                <input id="dl-url" type="url" placeholder="Dán link media vào đây..." autocomplete="off">
                <select id="dl-type">
                    <option value="auto">Auto</option>
                    <option value="video">Video</option>
                    <option value="audio">Audio</option>
                </select>
                <button type="button" class="btn primary" id="dl-btn">Download</button>
            </div>
            <div id="dl-ts-widget"></div>
            <div class="result" id="dl-result">Kết quả tải sẽ hiển thị ở đây.</div>
        </section>
        <section class="card share-card">
            <h2>Share File</h2>
            <p class="muted">Chia sẻ link file nhanh trong hệ thống LauNa.</p>
            <form class="sf-form" id="sf-form" onsubmit="sfSubmit(event)">
                <input id="sf-nick" type="text" placeholder="Biệt danh của bạn *" maxlength="50" required>
                <input id="sf-link" type="url" placeholder="Link file (https://...) *" required>
                <textarea id="sf-desc" placeholder="Mô tả file (tuỳ chọn)" maxlength="200"></textarea>
                <div id="sf-ts-widget"></div>
                <button type="submit" class="btn primary" id="sf-btn">Chia sẻ</button>
                <div class="sf-msg" id="sf-msg"></div>
            </form>
            <div class="sf-list" id="sf-list"><div class="sf-empty">Đang tải danh sách...</div></div>
        </section>
    </main>`;
}

function getDownloadPageScript() {
    return `
    <script>
    var _dlTsWidgetId = null;
    var _dlPendingUrl = null;
    var _dlPendingType = null;
    function dlInitTurnstile() {
        if (!window.__TS_KEY || !window.turnstile) return;
        if (_dlTsWidgetId !== null) return;
        var el = document.getElementById('dl-ts-widget');
        if (!el) return;
        _dlTsWidgetId = window.turnstile.render(el, {
            sitekey: window.__TS_KEY,
            size: 'invisible',
            callback: function(token) {
                if (_dlPendingUrl !== null) {
                    _dlDoFetch(_dlPendingUrl, _dlPendingType, token);
                    _dlPendingUrl = null; _dlPendingType = null;
                }
            },
            'error-callback': function() {
                var box = document.getElementById('dl-result');
                if (box) { box.className = 'result err'; box.textContent = 'Captcha thất bại, thử lại.'; }
                var btn = document.getElementById('dl-btn');
                if (btn) { btn.textContent = 'Download'; btn.disabled = false; }
            }
        });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { setTimeout(dlInitTurnstile, 500); });
    } else {
        setTimeout(dlInitTurnstile, 500);
    }
    function escHtml(str) { return String(str==null?'':str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function pickMedias(data) {
        var medias = [];
        if (!data) return medias;
        if (Array.isArray(data.medias)) medias = medias.concat(data.medias.map(function(m) {
            return { type: m.type||m.extension||m.ext||m.format||'media', quality: m.quality||m.format||m.ext||m.filename||'', url: m.url||m.download_url||m.fileUrl||m.streamUrl||m.hlsUrl };
        }));
        if (data.videoUrl) medias.push({ type:'video', quality:'video', url:data.videoUrl });
        if (data.audioUrl) medias.push({ type:'audio', quality:'audio', url:data.audioUrl });
        if (data.fileUrl) medias.push({ type:data.type||'file', quality:data.filename||'', url:data.fileUrl });
        if (data.streamUrl) medias.push({ type:'audio', quality:'stream', url:data.streamUrl });
        if (data.hlsUrl) medias.push({ type:'stream', quality:'hls', url:data.hlsUrl });
        if (data.thumbnail) medias.push({ type:'image', quality:'thumbnail', url:data.thumbnail });
        if (data.cover) medias.push({ type:'image', quality:'cover', url:data.cover });
        if (Array.isArray(data.images)) data.images.forEach(function(url,i){ medias.push({ type:'image', quality:'image '+(i+1), url:url }); });
        function scan(obj,path){ if(!obj||typeof obj!=='object') return; if(Array.isArray(obj)) return obj.forEach(function(v,i){ scan(v,path+'['+i+']'); }); Object.keys(obj).forEach(function(k){ var v=obj[k]; if(typeof v==='string'&&(v.startsWith('http://')||v.startsWith('https://'))&&/(url|link|media|stream|download|thumbnail|cover|image|audio|video|file|hls)/i.test(k)) medias.push({type:k,quality:path,url:v}); else if(v&&typeof v==='object') scan(v,path?path+'.'+k:k); }); }
        scan(data,'');
        var seen={};
        return medias.filter(function(m){ if(!m||!m.url||seen[m.url]) return false; seen[m.url]=true; return true; });
    }
    function renderResult(payload) {
        var box = document.getElementById('dl-result');
        if (!payload.status) { box.className='result err'; box.textContent=payload.message||'Không thể tải link này.'; return; }
        var data = payload.data || {};
        var medias = pickMedias(data);
        if ((!medias||!medias.length) && Array.isArray(payload.links)) medias = payload.links.map(function(url,i){ return {type:'link',quality:'media '+(i+1),url:url}; });
        var html = '<b>Nguồn thành công:</b> '+escHtml(payload.provider||data.source||'auto')+'<br><b>Tiêu đề:</b> '+escHtml(data.title||data.name||'Không có tiêu đề')+(data.author?'<br><b>Tác giả:</b> '+escHtml(data.author):'')+'<br><b>Đã thử:</b> '+escHtml((payload.tried||[]).join(' → '));
        if (medias.length) html+='<div class="media-grid">'+medias.map(function(m){ return '<div class="media"><b>'+escHtml(m.type)+'</b> <span class="muted">'+escHtml(m.quality)+'</span><br><a href="'+escHtml(m.url)+'" target="_blank" rel="noopener">Mở / tải link</a></div>'; }).join('')+'</div>';
        else html+='<br><span class="muted">API có trả dữ liệu nhưng chưa thấy link media trực tiếp.</span>';
        box.className='result ok'; box.innerHTML=html;
    }
    function _dlDoFetch(url, type, token) {
        var btn = document.getElementById('dl-btn');
        var box = document.getElementById('dl-result');
        var qs = '/download/all?url='+encodeURIComponent(url)+'&type='+encodeURIComponent(type);
        if (token) qs += '&cf-turnstile-response='+encodeURIComponent(token);
        var controller = new AbortController();
        var timer = setTimeout(function(){ controller.abort(); }, 45000);
        fetch(qs, { signal: controller.signal })
            .then(function(r){ return r.json(); }).then(renderResult)
            .catch(function(e){ box.className='result err'; box.textContent = e.name==='AbortError' ? 'Hết thời gian chờ (45 giây).' : 'Lỗi kết nối server: '+e.message; })
            .finally(function(){
                clearTimeout(timer); btn.textContent='Download'; btn.disabled=false;
                if (_dlTsWidgetId !== null && window.turnstile) window.turnstile.reset(_dlTsWidgetId);
            });
    }
    function downloadNow() {
        var url = document.getElementById('dl-url').value.trim();
        var type = document.getElementById('dl-type').value;
        var btn = document.getElementById('dl-btn');
        var box = document.getElementById('dl-result');
        if (!url) { box.className='result err'; box.textContent='Vui lòng dán link cần tải.'; return; }
        btn.textContent='Đang tải...'; btn.disabled=true; box.className='result'; box.textContent='Đang thử các API download...';
        if (window.__TS_KEY && window.turnstile && _dlTsWidgetId !== null) {
            _dlPendingUrl = url; _dlPendingType = type;
            window.turnstile.execute(_dlTsWidgetId);
        } else {
            _dlDoFetch(url, type, null);
        }
    }
    document.getElementById('dl-url').addEventListener('keydown', function(e){ if(e.key==='Enter') downloadNow(); });
    document.getElementById('dl-btn').addEventListener('click', downloadNow);
    </script>` + getShareFileScript();
}

module.exports = { getDownloadPageBody, getDownloadPageScript };
