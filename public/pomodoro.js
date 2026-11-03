// --- POMODORO SAYACI ---
// Ekranda sürüklenebilir, yarı saydam bir saat. Video oynatıcısına hiç dokunmaz.
// Durum zaman damgasıyla tutulur (endAt), böylece sekme arka plandayken veya sayfa yenilenince de doğru kalır.
(() => {
    const RHYTHMS = [
        { id: 'pomodoro', name: 'Pomodoro', focus: 25, short: 5, long: 15, rounds: 4 },
        { id: 'odak', name: 'Odaklanma', focus: 30, short: 5, long: 15, rounds: 4 },
        { id: 'zen', name: 'Zen Çalışma', focus: 45, short: 15, long: 30, rounds: 3 },
        { id: 'derin', name: 'Derin Çalışma', focus: 50, short: 10, long: 30, rounds: 3 },
        { id: 'sinav', name: 'Sınav Temposu', focus: 90, short: 20, long: 30, rounds: 2 },
    ];
    const SINGLES = [25, 45, 60, 90, 120, 180, 240];
    const MODES = {
        focus: { label: 'ODAK', icon: 'fa-fire', color: '#00ced1' },
        short: { label: 'KISA MOLA', icon: 'fa-mug-hot', color: '#5aa9ff' },
        long: { label: 'UZUN MOLA', icon: 'fa-couch', color: '#b388ff' },
        free: { label: 'SERBEST', icon: 'fa-infinity', color: '#ffb703' },
    };
    const STORE = 'lesa_pomo';
    const DEFAULTS = {
        plan: { type: 'rhythm', id: 'pomodoro' }, mode: 'focus', round: 0,
        running: false, endAt: null, remaining: null, freeStart: null, freeElapsed: 0,
        settings: { autoBreak: true, autoFocus: false, sounds: true, wake: true },
        open: false, compact: false, pos: null, today: { date: '', focusMs: 0, sessions: 0 },
    };

    let S = load();
    function load() {
        let saved = {};
        try { saved = JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) {}
        return { ...DEFAULTS, ...saved, settings: { ...DEFAULTS.settings, ...(saved.settings || {}) }, today: { ...DEFAULTS.today, ...(saved.today || {}) } };
    }
    function save() { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) {} }

    const $ = (id) => document.getElementById(id);
    const widget = $('pomo-widget'), toggleBtn = $('pomo-toggle-btn'), toggleTime = $('pomo-toggle-time');
    const timeEl = $('pomo-time'), statusEl = $('pomo-status'), ring = $('pomo-ring'), modeEl = $('pomo-mode');
    const playBtn = $('pomo-play-btn'), dotsEl = $('pomo-dots'), metaEl = $('pomo-meta'), panel = $('pomo-panel');
    const RING_LEN = 2 * Math.PI * 54;
    ring.style.strokeDasharray = RING_LEN;

    // ---- Plan & süreler ----
    function plan() {
        if (S.plan.type === 'single') return { name: `${S.plan.minutes} dk oturum`, focus: S.plan.minutes, short: 5, long: 15, rounds: 1, single: true };
        return RHYTHMS.find(r => r.id === S.plan.id) || RHYTHMS[0];
    }
    const durationMs = (mode = S.mode) => (mode === 'free' ? 0 : plan()[mode] * 60000);
    function remainingMs() {
        if (S.running && S.endAt) return Math.max(0, S.endAt - Date.now());
        return S.remaining != null ? S.remaining : durationMs();
    }
    const freeElapsed = () => (S.running && S.freeStart ? Date.now() - S.freeStart : S.freeElapsed);
    function rollToday() {
        const d = new Date().toDateString();
        if (S.today.date !== d) S.today = { date: d, focusMs: 0, sessions: 0 };
    }

    function fmt(ms) {
        const total = Math.round(ms / 1000);
        const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
        const pad = (n) => String(n).padStart(2, '0');
        if (h > 0 && total >= 6000) return `${h}:${pad(m)}:${pad(s)}`; // 100 dk üstü saat:dk:sn
        return `${pad(h * 60 + m)}:${pad(s)}`;
    }
    function fmtDuration(ms) {
        const min = Math.round(ms / 60000);
        return min >= 60 ? `${Math.floor(min / 60)} sa ${min % 60} dk` : `${min} dk`;
    }

    // ---- Ses (WebAudio; dosya gerekmez) ----
    let audioCtx = null;
    function tone(freq, dur, delay = 0, vol = 0.18) {
        if (!S.settings.sounds) return;
        try {
            audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
            const t = audioCtx.currentTime + delay;
            const o = audioCtx.createOscillator(), g = audioCtx.createGain();
            o.type = 'sine'; o.frequency.value = freq;
            g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + dur + 0.05);
        } catch (e) {}
    }
    const bell = () => { tone(880, 1.2); tone(1320, 1.0, 0.15, 0.1); tone(660, 1.4, 0.5, 0.12); };

    // ---- Ekranı açık tut ----
    let wakeLock = null;
    async function updateWakeLock() {
        const want = S.running && S.settings.wake && !document.hidden;
        try {
            if (want && !wakeLock && navigator.wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
            else if (!want && wakeLock) { await wakeLock.release(); wakeLock = null; }
        } catch (e) { wakeLock = null; }
    }
    document.addEventListener('visibilitychange', updateWakeLock);

    // ---- Kontroller ----
    function start() {
        if (S.running) return;
        if (S.mode === 'free') S.freeStart = Date.now() - S.freeElapsed;
        else S.endAt = Date.now() + remainingMs();
        S.running = true; lastBeep = null;
        if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
        tone(660, 0.15);
        save(); updateWakeLock(); render();
    }
    function pause() {
        if (!S.running) return;
        if (S.mode === 'free') { S.freeElapsed = freeElapsed(); S.freeStart = null; }
        else { S.remaining = remainingMs(); S.endAt = null; }
        S.running = false; save(); updateWakeLock(); render();
    }
    function resetPhase() {
        // Zaten sıfırdaysa turları da sıfırla
        const pristine = !S.running && S.remaining == null && !S.freeElapsed;
        S.running = false; S.endAt = null; S.remaining = null; S.freeStart = null; S.freeElapsed = 0;
        if (pristine) { S.round = 0; if (S.mode !== 'free') S.mode = 'focus'; toast('Turlar sıfırlandı.'); }
        save(); updateWakeLock(); render();
    }
    function setMode(mode) {
        S.mode = mode; S.running = false; S.endAt = null; S.remaining = null; S.freeStart = null; S.freeElapsed = 0;
        save(); updateWakeLock(); render();
    }
    function nextPhase(completed) {
        const p = plan(); const was = S.mode;
        if (was === 'focus' && completed) {
            rollToday(); S.today.focusMs += durationMs('focus'); S.today.sessions++; S.round++;
        }
        let next;
        if (p.single) next = 'focus';
        else if (was === 'focus') next = (S.round > 0 && S.round % p.rounds === 0) ? 'long' : 'short';
        else { next = 'focus'; if (was === 'long') S.round = 0; }
        S.mode = next; S.running = false; S.endAt = null; S.remaining = null;
        const auto = completed && (next === 'focus' ? S.settings.autoFocus && !p.single : S.settings.autoBreak);
        save();
        if (auto) start(); else { updateWakeLock(); render(); }
        return next;
    }
    function complete() {
        const was = S.mode; bell();
        const next = nextPhase(true);
        const msg = was === 'focus'
            ? (plan().single ? 'Oturum tamamlandı! 🎉' : (next === 'long' ? 'Set tamamlandı! Uzun mola zamanı 🌿' : 'Odak turu bitti, kısa mola ☕'))
            : 'Mola bitti, odaklanma zamanı 💪';
        toast(msg);
        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
            try { new Notification('Lesa · Pomodoro', { body: msg, icon: 'logo.png' }); } catch (e) {}
        }
    }

    playBtn.addEventListener('click', () => (S.running ? pause() : start()));
    $('pomo-reset-btn').addEventListener('click', resetPhase);
    $('pomo-skip-btn').addEventListener('click', () => { if (S.mode === 'free') return resetPhase(); nextPhase(false); });

    // ---- Görünüm ----
    function render() {
        const info = MODES[S.mode]; const p = plan();
        widget.style.setProperty('--pomo-color', info.color);
        widget.classList.toggle('running', S.running);
        modeEl.innerHTML = `<i class="fas ${info.icon}"></i><span>${info.label}</span>`;

        let shown, progress;
        if (S.mode === 'free') { const e = freeElapsed(); shown = fmt(e); progress = (e % 3600000) / 3600000; }
        else { const r = remainingMs(), d = durationMs(); shown = fmt(r); progress = d ? 1 - r / d : 0; }
        timeEl.textContent = shown;
        timeEl.classList.toggle('long', shown.length > 5);
        ring.style.strokeDashoffset = RING_LEN * (1 - Math.min(1, Math.max(0, progress)));

        const fresh = !S.running && S.remaining == null && !S.freeElapsed;
        statusEl.textContent = S.running
            ? ({ focus: 'Odaklan, sen yaparsın 💪', short: 'Dinlen, gözlerini dinlendir', long: 'Uzun mola: biraz yürü, su iç', free: 'Süre yukarı sayıyor' })[S.mode]
            : fresh ? ({ focus: 'Hazırsan başlayalım!', short: 'Kısa bir mola zamanı ☕', long: 'Uzun mola hak edildi 🌿', free: 'Serbest mod: süre yukarı sayar' })[S.mode]
            : 'Duraklatıldı';

        playBtn.innerHTML = S.running ? '<i class="fas fa-pause"></i><span>Duraklat</span>' : `<i class="fas fa-play"></i><span>${fresh ? 'Başlat' : 'Devam'}</span>`;
        playBtn.title = S.running ? 'Duraklat' : 'Başlat';

        // Tur noktaları
        if (S.mode === 'free' || p.single) dotsEl.innerHTML = '';
        else {
            const done = S.mode === 'long' ? p.rounds : S.round % p.rounds;
            dotsEl.innerHTML = Array.from({ length: p.rounds }, (_, i) => `<span class="${i < done ? 'on' : ''}${i === done && S.mode === 'focus' ? ' now' : ''}"></span>`).join('') + `<em>${done}/${p.rounds}</em>`;
        }
        rollToday();
        metaEl.textContent = S.mode === 'free'
            ? `Bugün ${fmtDuration(S.today.focusMs + freeElapsed())}`
            : `${plan()[S.mode]} dk · %${Math.round(progress * 100)}`;

        // Header düğmesi: çalışırken kalan süreyi gösterir
        toggleBtn.classList.toggle('active', S.open);
        toggleBtn.classList.toggle('running', S.running);
        toggleTime.classList.toggle('hidden', !S.running);
        toggleTime.textContent = shown;
        document.title = S.running ? `${shown} · ${info.label.toLocaleLowerCase('tr-TR')} · Lesa` : 'Lesa — Birlikte İzle';
        if (!panel.classList.contains('hidden')) renderPanelState();
    }

    // ---- Tik ----
    let lastBeep = null;
    setInterval(() => {
        if (S.running && S.mode !== 'free') {
            const r = remainingMs(); const sec = Math.ceil(r / 1000);
            if (sec <= 3 && sec > 0 && sec !== lastBeep) { lastBeep = sec; tone(990, 0.12, 0, 0.12); } // son 3 saniye bip
            if (r <= 0) { complete(); return; }
        }
        if (S.running || !widget.classList.contains('hidden')) render();
    }, 250);

    // ---- Ayarlar paneli ----
    function buildPanel() {
        const seg = (r) => {
            const parts = [];
            for (let i = 0; i < r.rounds; i++) { parts.push(`<i class="f" style="flex:${r.focus}"></i>`); parts.push(`<i class="${i === r.rounds - 1 ? 'l' : 's'}" style="flex:${i === r.rounds - 1 ? r.long : r.short}"></i>`); }
            return parts.join('');
        };
        const total = (r) => fmtDuration((r.focus * r.rounds + r.short * (r.rounds - 1) + r.long) * 60000);
        panel.innerHTML = `
            <div class="pomo-sec">Mod</div>
            <div class="pomo-tabs">${[['focus', 'Odak'], ['short', 'Kısa mola'], ['long', 'Uzun mola'], ['free', 'Serbest']].map(([k, t]) => `<button data-mode="${k}">${t}</button>`).join('')}</div>
            <div class="pomo-sec">Tek oturum <small>tek odak bloğu, tekrar yok</small></div>
            <div class="pomo-chips">${SINGLES.map(m => `<button data-single="${m}"><b>${m}</b> dk</button>`).join('')}</div>
            <div class="pomo-sec">Hazır ritimler</div>
            <div class="pomo-rhythms">${RHYTHMS.map(r => `<button class="pomo-rhythm" data-rhythm="${r.id}"><span class="r-head"><b>${r.name}</b><small>${r.focus}/${r.short} · ×${r.rounds}</small></span><span class="r-bar">${seg(r)}</span><small>Bir set ≈ ${total(r)}</small></button>`).join('')}</div>
            <div class="pomo-sec">Seans</div>
            ${[['autoBreak', 'Otomatik mola başlat', 'Odak bitince mola kendiliğinden başlar'],
               ['autoFocus', 'Molalardan sonra devam et', 'Mola bitince yeni odak turu başlar'],
               ['sounds', 'Sayaç sesleri', 'Son 3 saniyede bip, bitişte zil'],
               ['wake', 'Ekranı açık tut', 'Sayaç çalışırken ekran kararmaz']]
                .map(([k, t, d]) => `<label class="pomo-switch"><span><b>${t}</b><small>${d}</small></span><input type="checkbox" data-setting="${k}"><i></i></label>`).join('')}
            <div class="pomo-today" id="pomo-today"></div>`;
        panel.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
        panel.querySelectorAll('[data-single]').forEach(b => b.addEventListener('click', () => { S.plan = { type: 'single', minutes: +b.dataset.single }; S.round = 0; setMode('focus'); }));
        panel.querySelectorAll('[data-rhythm]').forEach(b => b.addEventListener('click', () => { S.plan = { type: 'rhythm', id: b.dataset.rhythm }; S.round = 0; setMode('focus'); }));
        panel.querySelectorAll('[data-setting]').forEach(inp => inp.addEventListener('change', () => { S.settings[inp.dataset.setting] = inp.checked; save(); updateWakeLock(); }));
        renderPanelState();
    }
    function renderPanelState() {
        panel.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === S.mode));
        panel.querySelectorAll('[data-single]').forEach(b => b.classList.toggle('active', S.plan.type === 'single' && S.plan.minutes === +b.dataset.single));
        panel.querySelectorAll('[data-rhythm]').forEach(b => b.classList.toggle('active', S.plan.type === 'rhythm' && S.plan.id === b.dataset.rhythm));
        panel.querySelectorAll('[data-setting]').forEach(inp => { inp.checked = !!S.settings[inp.dataset.setting]; });
        const t = $('pomo-today'); rollToday();
        if (t) t.innerHTML = `<i class="fas fa-chart-simple"></i> Bugün: <b>${fmtDuration(S.today.focusMs)}</b> odak · <b>${S.today.sessions}</b> tur`;
    }
    $('pomo-settings-btn').addEventListener('click', () => {
        const opening = panel.classList.contains('hidden');
        if (opening) { buildPanel(); if (S.compact) setCompact(false); positionPanel(); }
        panel.classList.toggle('hidden', !opening);
        $('pomo-settings-btn').classList.toggle('active', opening);
    });

    // ---- Aç / kapat / küçült ----
    function setOpen(open) {
        S.open = open; widget.classList.toggle('hidden', !open); save();
        if (open) { placeWidget(); render(); }
        toggleBtn.classList.toggle('active', open);
    }
    function setCompact(c) {
        S.compact = c; widget.classList.toggle('compact', c);
        $('pomo-compact-btn').innerHTML = `<i class="fas ${c ? 'fa-expand' : 'fa-compress'}"></i>`;
        $('pomo-compact-btn').title = c ? 'Büyüt' : 'Küçült';
        if (c) { panel.classList.add('hidden'); $('pomo-settings-btn').classList.remove('active'); }
        save(); clampToViewport();
    }
    toggleBtn.addEventListener('click', () => setOpen(!S.open));
    $('pomo-close-btn').addEventListener('click', () => { setOpen(false); if (S.running) toast('Sayaç arka planda çalışmaya devam ediyor; üstteki saatten geri açabilirsin.'); });
    $('pomo-compact-btn').addEventListener('click', () => setCompact(!S.compact));
    widget.addEventListener('dblclick', (e) => { if (!e.target.closest('button, input, label, .pomo-panel')) setCompact(!S.compact); });

    // ---- Sürükleme ----
    const MARGIN = 12;
    function headerBottom() { const h = document.getElementById('main-header'); const r = h && h.getBoundingClientRect(); return r && r.height > 1 ? r.bottom : 0; }
    function clampToViewport() {
        const w = widget.offsetWidth, h = widget.offsetHeight; if (!w) return;
        const minY = Math.max(MARGIN, headerBottom() + 8); // header'ın altına girmesin
        let x = parseFloat(widget.style.left), y = parseFloat(widget.style.top);
        x = Math.min(Math.max(MARGIN, x), window.innerWidth - w - MARGIN);
        y = Math.min(Math.max(minY, y), Math.max(minY, window.innerHeight - h - MARGIN));
        widget.style.left = x + 'px'; widget.style.top = y + 'px';
        positionPanel();
    }
    function positionPanel() {
        if (panel.classList.contains('hidden') && !panel.innerHTML) return;
        const vw = window.innerWidth, vh = window.innerHeight, GAP = 10;
        const x = parseFloat(widget.style.left) || 0, y = parseFloat(widget.style.top) || 0;
        const w = widget.offsetWidth, h = widget.offsetHeight;
        const pw = Math.min(300, vw - 2 * MARGIN), minY = Math.max(MARGIN, headerBottom() + 8);
        const st = { width: pw + 'px', top: '0px', bottom: 'auto' };
        if (x - pw - GAP >= MARGIN) { st.left = -(pw + GAP) + 'px'; st.maxHeight = (vh - y - MARGIN) + 'px'; }              // solunda
        else if (x + w + GAP + pw <= vw - MARGIN) { st.left = (w + GAP) + 'px'; st.maxHeight = (vh - y - MARGIN) + 'px'; } // sağında
        else {                                                                                                               // dar ekran: altında veya üstünde
            st.left = ((vw - pw) / 2 - x) + 'px';
            const below = vh - (y + h) - GAP - MARGIN, above = y - GAP - minY;
            if (below >= Math.min(320, above)) { st.top = (h + GAP) + 'px'; st.maxHeight = below + 'px'; }
            else { st.top = 'auto'; st.bottom = (h + GAP) + 'px'; st.maxHeight = above + 'px'; }
        }
        Object.assign(panel.style, st);
    }
    function placeWidget() {
        const w = widget.offsetWidth || 280;
        let x, y;
        if (S.pos) { x = S.pos.xr * (window.innerWidth - w); y = S.pos.yr * window.innerHeight; }
        else { x = window.innerWidth - w - 16; y = headerBottom() + 16; } // varsayılan: video alanının sağ üstü
        widget.style.left = x + 'px'; widget.style.top = y + 'px';
        clampToViewport();
    }
    let drag = null;
    widget.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.target.closest('button, input, label, .pomo-panel')) return;
        drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: parseFloat(widget.style.left), oy: parseFloat(widget.style.top), moved: false };
        widget.setPointerCapture(e.pointerId);
    });
    widget.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
        if (!drag.moved && Math.hypot(dx, dy) < 5) return;
        drag.moved = true; widget.classList.add('dragging');
        widget.style.left = (drag.ox + dx) + 'px'; widget.style.top = (drag.oy + dy) + 'px';
        clampToViewport();
    });
    const endDrag = (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const moved = drag.moved; drag = null; widget.classList.remove('dragging');
        if (moved) { S.pos = { xr: parseFloat(widget.style.left) / Math.max(1, window.innerWidth - widget.offsetWidth), yr: parseFloat(widget.style.top) / window.innerHeight }; save(); }
    };
    widget.addEventListener('pointerup', endDrag);
    widget.addEventListener('pointercancel', endDrag);
    window.addEventListener('resize', () => { if (S.open) placeWidget(); });

    // ---- Başlangıç ----
    if (S.running && S.mode !== 'free' && remainingMs() <= 0) nextPhase(true); // sayfa kapalıyken süre dolduysa turu say, sonraki aşamaya geç
    setCompact(!!S.compact);
    // Ana ekran görünür olunca (odaya girince) yerleştir
    new MutationObserver(() => { if (S.open && !document.getElementById('main-screen').classList.contains('hidden')) setOpen(true); })
        .observe(document.getElementById('main-screen'), { attributes: true, attributeFilter: ['class'] });
    widget.classList.toggle('hidden', !S.open);
    updateWakeLock(); render();
})();
