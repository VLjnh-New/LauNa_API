'use strict';

function getAiSupportHtml() {
    return `
    <button class="ai-fab" id="ai-fab" aria-label="Mở chat hỗ trợ" title="LauNa Assistant">
        <span class="ai-fab-icon" id="ai-fab-icon">✦</span>
    </button>
    <div class="ai-panel" id="ai-panel" role="dialog" aria-label="LauNa Assistant">
        <div class="ai-panel-head">
            <div class="ai-panel-mark"></div>
            <div class="ai-panel-title">
                <div class="ai-panel-name">LauNa Assistant</div>
                <div class="ai-panel-sub">● online · powered by Pollinations.ai</div>
            </div>
            <div class="ai-panel-act">
                <button class="ai-panel-btn" id="ai-reset" title="Xoá hội thoại">↻</button>
                <button class="ai-panel-btn" id="ai-close" title="Đóng">✕</button>
            </div>
        </div>
        <div class="ai-msgs" id="ai-msgs"></div>
        <div class="ai-suggest" id="ai-suggest">
            <button class="ai-chip" data-q="API nào tải video TikTok?">Tải TikTok</button>
            <button class="ai-chip" data-q="Cách dùng AI tạo ảnh?">Tạo ảnh</button>
            <button class="ai-chip" data-q="Có những API music nào?">Music API</button>
            <button class="ai-chip" data-q="Tech stack của server là gì?">Tech stack</button>
        </div>
        <div id="ai-ts-widget" style="display:none"></div>
        <form class="ai-form" id="ai-form">
            <textarea class="ai-input" id="ai-input" rows="1" placeholder="Hỏi mình về LauNa API..." maxlength="1000"></textarea>
            <button type="submit" class="ai-send" id="ai-send" title="Gửi">↑</button>
        </form>
    </div>`;
}

function getAiSupportScript() {
    return `
    <script>
    (function(){
        var fab = document.getElementById('ai-fab');
        var panel = document.getElementById('ai-panel');
        var icon = document.getElementById('ai-fab-icon');
        var msgs = document.getElementById('ai-msgs');
        var form = document.getElementById('ai-form');
        var input = document.getElementById('ai-input');
        var send = document.getElementById('ai-send');
        var resetBtn = document.getElementById('ai-reset');
        var closeBtn = document.getElementById('ai-close');
        var suggest = document.getElementById('ai-suggest');
        if (!fab || !panel) return;

        var _aiTsWidgetId = null;
        var _aiTsVerified = false;
        var _aiTsPending = null;
        function aiInitTurnstile() {
            if (!window.__TS_KEY || !window.turnstile) return;
            if (_aiTsWidgetId !== null) return;
            var el = document.getElementById('ai-ts-widget');
            if (!el) return;
            _aiTsWidgetId = window.turnstile.render(el, {
                sitekey: window.__TS_KEY,
                size: 'invisible',
                callback: function() {
                    _aiTsVerified = true;
                    if (_aiTsPending) { var t = _aiTsPending; _aiTsPending = null; sendMsg(t); }
                },
                'error-callback': function() {
                    _aiTsVerified = false;
                    addMsg('bot', '⚠ Xác minh captcha thất bại. Vui lòng thử lại.');
                    setSending(false);
                }
            });
        }
        setTimeout(aiInitTurnstile, 600);

        var STORE_KEY = 'launa_ai_support_v1';
        function loadState(){
            try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null') || {}; } catch(e){ return {}; }
        }
        function saveState(s){ try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch(e){} }
        var state = loadState();
        if (!state.session) state.session = 'web-' + Math.random().toString(36).slice(2,10);
        if (!Array.isArray(state.history)) state.history = [];

        function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
        function mdRender(text){
            var t = esc(text);
            t = t.replace(/\`\`\`([\\s\\S]*?)\`\`\`/g, function(_,c){ return '<pre>'+c.replace(/^\\n/,'')+'</pre>'; });
            t = t.replace(/\`([^\`\\n]+)\`/g, '<code>$1</code>');
            t = t.replace(/\\*\\*([^*\\n]+)\\*\\*/g, '<strong>$1</strong>');
            t = t.replace(/\\[([^\\]]+)\\]\\((https?:[^)\\s]+|\\/[^)\\s]*)\\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
            t = t.replace(/(^|[^"=>])(\\/[a-zA-Z][\\w\\-/]*)\\b/g, function(_,p,u){ return p+'<a href="'+u+'" target="_blank" rel="noopener">'+u+'</a>'; });
            t = t.replace(/\\n/g, '<br>');
            return t;
        }
        function addMsg(role, text, opts){
            opts = opts || {};
            var div = document.createElement('div');
            div.className = 'ai-msg ' + role + (opts.typing ? ' typing' : '');
            if (opts.typing) {
                div.innerHTML = '<span class="ai-typing-dots"><span></span><span></span><span></span></span>';
            } else {
                div.innerHTML = role === 'bot' ? mdRender(text) : esc(text);
            }
            msgs.appendChild(div);
            msgs.scrollTop = msgs.scrollHeight;
            return div;
        }
        function rerender(){
            msgs.innerHTML = '';
            if (!state.history.length) {
                addMsg('bot', 'Chào bạn! Mình là **LauNa Assistant**. Hỏi mình bất cứ gì về API nhé — tải video, tạo ảnh AI, list endpoint, cách dùng /docs...');
            } else {
                state.history.forEach(function(m){ addMsg(m.role, m.text); });
            }
        }
        rerender();

        function open(){ panel.classList.add('is-open'); fab.classList.add('is-open'); icon.textContent = '✕'; setTimeout(function(){ input.focus(); }, 250); }
        function close(){ panel.classList.remove('is-open'); fab.classList.remove('is-open'); icon.textContent = '✦'; }
        function toggle(){ panel.classList.contains('is-open') ? close() : open(); }
        fab.addEventListener('click', toggle);
        closeBtn.addEventListener('click', close);

        resetBtn.addEventListener('click', function(){
            if (!confirm('Xoá toàn bộ hội thoại?')) return;
            fetch('/ai/support?reset=1&session=' + encodeURIComponent(state.session)).catch(function(){});
            state.history = [];
            state.session = 'web-' + Math.random().toString(36).slice(2,10);
            saveState(state);
            rerender();
        });

        function setSending(b){ send.disabled = b; input.disabled = b; }

        async function sendMsg(text){
            text = (text || '').trim();
            if (!text) return;
            if (window.__TS_KEY && window.turnstile && _aiTsWidgetId !== null && !_aiTsVerified) {
                setSending(true);
                _aiTsPending = text;
                window.turnstile.execute(_aiTsWidgetId);
                return;
            }
            addMsg('user', text);
            state.history.push({ role:'user', text: text });
            saveState(state);
            input.value = '';
            input.style.height = 'auto';
            setSending(true);
            var typing = addMsg('bot', '', { typing: true });
            try {
                var url = '/ai/support?prompt=' + encodeURIComponent(text) + '&session=' + encodeURIComponent(state.session);
                var r = await fetch(url);
                var d = await r.json();
                typing.remove();
                if (!d.status) throw new Error(d.message || 'Lỗi không rõ');
                addMsg('bot', d.data.reply);
                state.history.push({ role:'bot', text: d.data.reply });
                if (state.history.length > 40) state.history.splice(0, state.history.length - 40);
                saveState(state);
            } catch(e){
                typing.remove();
                addMsg('bot', '⚠ Lỗi: ' + (e.message || 'không gửi được. Thử lại sau nhé.'));
            } finally {
                setSending(false);
                input.focus();
            }
        }

        form.addEventListener('submit', function(e){ e.preventDefault(); sendMsg(input.value); });
        input.addEventListener('keydown', function(e){
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(input.value); }
        });
        input.addEventListener('input', function(){
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 100) + 'px';
        });
        suggest.addEventListener('click', function(e){
            var btn = e.target.closest('.ai-chip');
            if (btn) sendMsg(btn.getAttribute('data-q'));
        });
    })();
    </script>`;
}

module.exports = { getAiSupportHtml, getAiSupportScript };
