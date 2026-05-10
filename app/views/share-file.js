'use strict';

function getShareFileScript() {
    return `
    <script>
    function sfEsc(str) { return String(str == null ? '' : str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function sfRenderList(items) {
        var list = document.getElementById('sf-list');
        if (!list) return;
        if (!items || !items.length) { list.innerHTML = '<div class="sf-empty">Chưa có file nào được chia sẻ.</div>'; return; }
        list.innerHTML = items.map(function(f) {
            var initial = (f.nickname || '?')[0].toUpperCase();
            var date = new Date(f.createdAt).toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
            return '<div class="sf-item"><div class="sf-avatar">' + initial + '</div><div class="sf-body">' +
                '<div class="sf-nick">' + sfEsc(f.nickname) + ' <span style="font-weight:400;color:var(--muted-2);font-size:11px;font-family:var(--mono);">#' + f.id + '</span></div>' +
                (f.description ? '<div class="sf-desc">' + sfEsc(f.description) + '</div>' : '') +
                '<a href="' + sfEsc(f.link) + '" target="_blank" rel="noopener" class="sf-link">' + sfEsc(f.link.length > 70 ? f.link.slice(0,70)+'…' : f.link) + '</a>' +
                '<div class="sf-date">' + date + '</div></div></div>';
        }).join('');
    }
    function sfLoad() {
        fetch('/api/Note/sharefile').then(function(r) { return r.json(); }).then(function(d) { if (d.status) sfRenderList(d.data); }).catch(function() {
            var list = document.getElementById('sf-list');
            if (list) list.innerHTML = '<div class="sf-empty">Không thể tải danh sách.</div>';
        });
    }
    var _sfTsWidgetId = null;
    var _sfPendingSubmit = false;
    function sfInitTurnstile() {
        if (!window.__TS_KEY || !window.turnstile) return;
        if (_sfTsWidgetId !== null) return;
        var el = document.getElementById('sf-ts-widget');
        if (!el) return;
        _sfTsWidgetId = window.turnstile.render(el, {
            sitekey: window.__TS_KEY,
            size: 'invisible',
            callback: function(token) {
                if (_sfPendingSubmit) { _sfDoSubmit(token); _sfPendingSubmit = false; }
            },
            'error-callback': function() {
                var msg = document.getElementById('sf-msg');
                if (msg) { msg.textContent = 'Captcha thất bại, thử lại.'; msg.className = 'sf-msg err'; }
                var btn = document.getElementById('sf-btn');
                if (btn) { btn.disabled = false; btn.textContent = 'Chia sẻ'; }
                _sfPendingSubmit = false;
            }
        });
    }
    function _sfDoSubmit(token) {
        var btn = document.getElementById('sf-btn');
        var msg = document.getElementById('sf-msg');
        var nick = document.getElementById('sf-nick').value.trim();
        var link = document.getElementById('sf-link').value.trim();
        var desc = document.getElementById('sf-desc').value.trim();
        var body = { nickname: nick, link: link, description: desc };
        if (token) body['cf-turnstile-response'] = token;
        fetch('/api/Note/sharefile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
            .then(function(r) { return r.json(); }).then(function(d) {
                if (d.status) { msg.textContent = 'Chia sẻ thành công!'; msg.className = 'sf-msg ok'; document.getElementById('sf-form').reset(); sfLoad(); }
                else { msg.textContent = d.message || 'Lỗi không xác định'; msg.className = 'sf-msg err'; }
            }).catch(function() { msg.textContent = 'Lỗi kết nối server'; msg.className = 'sf-msg err'; })
            .finally(function() {
                btn.disabled = false; btn.textContent = 'Chia sẻ';
                if (_sfTsWidgetId !== null && window.turnstile) window.turnstile.reset(_sfTsWidgetId);
            });
    }
    function sfSubmit(e) {
        e.preventDefault();
        var btn = document.getElementById('sf-btn');
        var msg = document.getElementById('sf-msg');
        var nick = document.getElementById('sf-nick').value.trim();
        var link = document.getElementById('sf-link').value.trim();
        if (!nick || !link) { msg.textContent = 'Vui lòng điền đầy đủ thông tin.'; msg.className = 'sf-msg err'; return; }
        btn.disabled = true; btn.textContent = 'Đang gửi...';
        msg.textContent = ''; msg.className = 'sf-msg';
        if (window.__TS_KEY && window.turnstile && _sfTsWidgetId !== null) {
            _sfPendingSubmit = true;
            window.turnstile.execute(_sfTsWidgetId);
        } else {
            _sfDoSubmit(null);
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { setTimeout(sfInitTurnstile, 500); });
    } else {
        setTimeout(sfInitTurnstile, 500);
    }
    sfLoad();
    </script>`;
}

module.exports = { getShareFileScript };
