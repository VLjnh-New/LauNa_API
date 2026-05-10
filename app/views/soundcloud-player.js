'use strict';

function getSoundCloudPlayerHtml() {
    return `
    <div class="mplayer hidden" id="mplayer">
        <div class="mplayer-cover" id="mplayer-cover">♪</div>
        <div class="mplayer-meta">
            <div class="mplayer-title" id="mplayer-title">Đang tải SoundCloud...</div>
            <div class="mplayer-artist" id="mplayer-artist">LauNa SCL Radio</div>
            <div class="mplayer-bar-wrap"><div class="mplayer-bar" id="mplayer-bar"></div></div>
        </div>
        <div class="mplayer-controls">
            <button class="mplayer-btn" id="mplayer-prev" title="Trước">⏮</button>
            <button class="mplayer-btn" id="mplayer-play" title="Phát/Dừng">▶</button>
            <button class="mplayer-btn" id="mplayer-next" title="Tiếp">⏭</button>
        </div>
    </div>
    <audio id="mplayer-audio" crossorigin="anonymous"></audio>`;
}


function getSoundCloudPlayerScript() {
    return `
    <script>
    (function () {
        var queries = ['tiktok remix 2026', 'tiktok hot remix', 'tiktok mashup 2026', 'douyin remix hot', 'phonk tiktok', 'sped up tiktok remix', 'viral tiktok remix', 'nhạc hot tiktok remix', 'edm tiktok remix', 'tiktok trend remix'];
        var stateKey = 'launa_scl_player_state_v2';
        var STREAM_TTL = 4 * 60 * 1000;
        var audio = document.getElementById('mplayer-audio');
        var player = document.getElementById('mplayer');
        var coverEl = document.getElementById('mplayer-cover');
        var titleEl = document.getElementById('mplayer-title');
        var artistEl = document.getElementById('mplayer-artist');
        var barEl = document.getElementById('mplayer-bar');
        var playBtn = document.getElementById('mplayer-play');
        var prevBtn = document.getElementById('mplayer-prev');
        var nextBtn = document.getElementById('mplayer-next');
        var playlist = [], idx = 0, autoplayBlocked = false, saveTimer = null;
        var loadToken = 0, isLoading = false, retryCount = 0;
        try { localStorage.removeItem('launa_scl_player_state_v1'); } catch (e) {}
        var collapseKey = 'launa_scl_player_collapsed';
        try { if (localStorage.getItem(collapseKey) === '1') player.classList.add('collapsed'); } catch (e) {}
        coverEl.addEventListener('click', function (e) {
            e.stopPropagation();
            player.classList.toggle('collapsed');
            try { localStorage.setItem(collapseKey, player.classList.contains('collapsed') ? '1' : '0'); } catch (e) {}
        });
        coverEl.title = 'Bấm để thu gọn / mở rộng';
        function readState() {
            try {
                var state = JSON.parse(localStorage.getItem(stateKey) || 'null');
                if (!state || !Array.isArray(state.playlist) || !state.playlist.length) return null;
                if (Date.now() - (state.updatedAt || 0) > 24 * 60 * 60 * 1000) return null;
                return state;
            } catch (e) { return null; }
        }
        function stripStream(t) {
            return { id: t.id, title: t.title, author: t.author, thumbnail: t.thumbnail, duration: t.duration, permalink_url: t.permalink_url };
        }
        function saveState() {
            if (!playlist.length) return;
            try {
                var lite = playlist.map(stripStream);
                localStorage.setItem(stateKey, JSON.stringify({ playlist: lite, idx: idx, paused: audio.paused, updatedAt: Date.now() }));
            } catch (e) {}
        }
        function scheduleSave() { if (saveTimer) return; saveTimer = setTimeout(function() { saveTimer = null; saveState(); }, 1500); }
        function showTip() {
            if (document.getElementById('mp-tip')) return;
            var tip = document.createElement('div');
            tip.id = 'mp-tip';
            tip.className = 'mplayer-autoplay-tip';
            tip.textContent = 'Nhấn để bật nhạc SCL';
            tip.onclick = function() { play(); tip.remove(); };
            document.body.appendChild(tip);
        }
        function setTrack(track) {
            audio.src = track.streamUrl;
            titleEl.textContent = track.title || 'SoundCloud Track';
            artistEl.textContent = track.author || 'SoundCloud';
            barEl.style.width = '0%';
            coverEl.innerHTML = track.thumbnail ? '<img src="' + track.thumbnail + '" alt="cover">' : '♪';
        }
        function play() {
            var p = audio.play();
            if (!p || !p.then) return;
            p.then(function() {
                playBtn.textContent = '⏸'; autoplayBlocked = false;
                var tip = document.getElementById('mp-tip'); if (tip) tip.remove();
                saveState();
            }).catch(function() { autoplayBlocked = true; playBtn.textContent = '▶'; saveState(); showTip(); });
        }
        function loadTrack(i, options) {
            options = options || {};
            if (!playlist.length || isLoading) return;
            idx = (i + playlist.length) % playlist.length;
            var token = ++loadToken;
            var track = playlist[idx];
            var fresh = track.streamUrl && track.fetchedAt && (Date.now() - track.fetchedAt < STREAM_TTL);
            if (fresh && !options.forceRefetch) {
                setTrack(track);
                player.classList.remove('hidden');
                if (options.autoplay === false) { playBtn.textContent = '▶'; saveState(); } else { play(); }
                return;
            }
            isLoading = true;
            titleEl.textContent = 'Đang lấy link SCL...';
            fetch('/music/soundcloud?url=' + encodeURIComponent(track.permalink_url))
                .then(function(r) { return r.json(); })
                .then(function(d) {
                    if (token !== loadToken) return;
                    if (!d.status || !d.data || !d.data.streamUrl) throw new Error(d.message || 'Không có stream');
                    playlist[idx] = Object.assign({}, track, d.data, { fetchedAt: Date.now() });
                    setTrack(playlist[idx]);
                    player.classList.remove('hidden');
                    isLoading = false;
                    retryCount = 0;
                    if (options.autoplay === false) { playBtn.textContent = '▶'; saveState(); } else { play(); }
                })
                .catch(function() {
                    if (token !== loadToken) return;
                    isLoading = false;
                    if (retryCount++ < playlist.length) loadTrack(idx + 1);
                    else { titleEl.textContent = 'Không tải được track'; retryCount = 0; }
                });
        }
        function boot() {
            var state = readState();
            if (state) {
                playlist = state.playlist;
                idx = state.idx || 0;
                loadTrack(idx, { autoplay: !state.paused });
                return;
            }
            var q = queries[Math.floor(Math.random() * queries.length)];
            fetch('/music/scl-search?q=' + encodeURIComponent(q) + '&limit=20')
                .then(function(r) { return r.json(); })
                .then(function(d) {
                    if (!d.status || !d.data || !d.data.length) return;
                    playlist = d.data.sort(function(){ return Math.random() - 0.5; });
                    loadTrack(0);
                }).catch(function(){});
        }
        playBtn.addEventListener('click', function() { if (audio.paused) play(); else { audio.pause(); playBtn.textContent = '▶'; saveState(); } });
        prevBtn.addEventListener('click', function() { retryCount = 0; loadTrack(idx - 1); });
        nextBtn.addEventListener('click', function() { retryCount = 0; loadTrack(idx + 1); });
        audio.addEventListener('timeupdate', function() {
            if (audio.duration > 0) barEl.style.width = (audio.currentTime / audio.duration * 100) + '%';
            scheduleSave();
        });
        audio.addEventListener('ended', function() { retryCount = 0; loadTrack(idx + 1); });
        audio.addEventListener('pause', function() { saveState(); });
        audio.addEventListener('error', function() {
            if (!playlist.length || isLoading) return;
            var cur = playlist[idx];
            if (cur) { cur.streamUrl = null; cur.fetchedAt = 0; }
            loadTrack(idx, { forceRefetch: true });
        });
        document.addEventListener('click', function onFirstClick() {
            if (autoplayBlocked) play();
            document.removeEventListener('click', onFirstClick);
        }, { once: true });
        boot();
    })();
    </script>`;
}

module.exports = { getSoundCloudPlayerHtml, getSoundCloudPlayerScript };
