// Lesa — canlı oda sahnesi: gündüz/gece resmi saate göre geçiş yapar; kedi nefes alır, kuyruğunu oynatır,
// kahveden buhar çıkar, gece yıldızlar parlar, lamba ve ekran titreşir. Koordinatlar resmin kendi boyutundadır (1452×811).
(function () {
    const W = 1452, H = 811;
    const STORE = 'lesa_scene';
    const MODES = ['auto', 'day', 'night'];
    const MODE_UI = { auto: ['fa-circle-half-stroke', 'Saate göre'], day: ['fa-sun', 'Gündüz'], night: ['fa-moon', 'Gece'] };

    // Gece resmindeki mevcut yıldızlar (parlak noktalar) — üzerlerine parıltı bindiriyoruz
    const STARS = [[849,82],[752,87],[694,89],[951,94],[749,108],[846,108],[679,111],[700,111],[664,123],[708,127],[623,134],[647,135],[654,154],[949,154],[882,161],[967,168],[688,175],[698,176],[951,179],[968,179],[943,185],[627,195],[605,203],[583,212],[677,213],[519,227],[600,228],[543,231],[611,259],[932,85],[1002,199],[1019,155]];
    const FIREFLIES = [[612,352],[668,338],[735,372],[802,330],[858,360],[640,388],[760,345],[880,385]];
    const MOTES = [[520,260],[610,420],[700,300],[790,520],[880,280],[960,450],[560,560],[1000,330],[740,610],[650,180]];

    // Kuyruk iki eklemli oynar (orta parça + uç); kalkınca açılan boşluğu altındaki halının bir kopyası doldurur
    const TAIL_MID = 'M576 745.5 L572 746.5 L558 750.3 L549 750.5 L549 771.5 L563 770 L576 765.5 Z';
    const TAIL_TIP = 'M551 749 L541 749.6 L526 750.2 L520.3 755 L521.8 762.8 L526.5 767.5 L544 771.5 L551 771.5 Z';
    const TAIL_GAP = 'M576 745.5 L572 746.5 L558 750.3 L541 750.8 L526 751.4 L521 756 L521.8 762.8 L526.5 767.5 L544 771.5 L563 770 L576 765.5 Z';

    const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

    let uid = 0;
    function svgFor(id) {
        const p = 'sc' + id + '-';
        const stars = STARS.map(([x, y], i) => `<circle class="sc-star" cx="${x}" cy="${y}" r="${i % 3 ? 1.6 : 2.2}" style="animation-delay:${(i * 0.73 % 5).toFixed(2)}s;animation-duration:${(2.6 + i % 4 * 0.7).toFixed(1)}s"/>`).join('');
        const flies = FIREFLIES.map(([x, y], i) => `<circle class="sc-fly" cx="${x}" cy="${y}" r="2.4" style="animation-delay:-${(i * 1.9).toFixed(1)}s;animation-duration:${(7 + i % 3 * 2)}s"/>`).join('');
        const motes = MOTES.map(([x, y], i) => `<circle class="sc-mote" cx="${x}" cy="${y}" r="${1.4 + i % 3 * 0.6}" style="animation-delay:-${(i * 2.3).toFixed(1)}s;animation-duration:${14 + i % 4 * 3}s"/>`).join('');
        const steam = [0, 1, 2].map(i => `<path class="sc-steam" d="M${843 + i * 6} 446 c -9 -10, 9 -20, 0 -32 s -9 -20, 0 -32" style="animation-delay:-${i * 1.3}s"/>`).join('');
        return `
<svg class="scene-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
    <g id="${p}img"><image href="scene/day.webp" width="${W}" height="${H}"/><image class="sc-night-img" href="scene/night.webp" width="${W}" height="${H}"/></g>
    <clipPath id="${p}cat"><ellipse cx="519" cy="727" rx="84" ry="46"/></clipPath>
    <clipPath id="${p}tmid"><path d="${TAIL_MID}"/></clipPath><clipPath id="${p}ttip"><path d="${TAIL_TIP}"/></clipPath><clipPath id="${p}tgap"><path d="${TAIL_GAP}"/></clipPath>
    <clipPath id="${p}pane"><rect x="572" y="78" width="318" height="320"/></clipPath>
    <radialGradient id="${p}lamp"><stop offset="0" stop-color="#ffd59a" stop-opacity=".55"/><stop offset=".45" stop-color="#ffb35c" stop-opacity=".18"/><stop offset="1" stop-color="#ffb35c" stop-opacity="0"/></radialGradient>
    <radialGradient id="${p}glow"><stop offset="0" stop-color="#fff6dd" stop-opacity=".5"/><stop offset="1" stop-color="#fff6dd" stop-opacity="0"/></radialGradient>
    <filter id="${p}soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2"/></filter>
  </defs>
  <use href="#${p}img"/>

  <g class="sc-night-only" clip-path="url(#${p}pane)">
    <path class="sc-shoot" d="M640 92 l 70 34"/>
  </g>
  <g class="sc-night-only">${stars}</g>
  <g class="sc-night-only" clip-path="url(#${p}pane)">${flies}</g>
  <g class="sc-day-only" clip-path="url(#${p}pane)">
    <g class="sc-bird"><path d="M0 0 q 6 -6 12 0 q 6 -6 12 0"/></g>
    <g class="sc-bird b2"><path d="M0 0 q 5 -5 10 0 q 5 -5 10 0"/></g>
  </g>

  <g clip-path="url(#${p}cat)"><use class="sc-breathe" href="#${p}img"/></g>
  <g clip-path="url(#${p}tgap)"><use href="#${p}img" transform="translate(0 -12)"/></g>
  <g class="sc-tail"><g clip-path="url(#${p}tmid)"><use href="#${p}img"/></g>
    <g class="sc-tail-tip"><g clip-path="url(#${p}ttip)"><use href="#${p}img"/></g></g></g>

  <g filter="url(#${p}soft)">${steam}</g>

  <g class="sc-night-only">
    <circle class="sc-lamp" cx="532" cy="392" r="135" fill="url(#${p}lamp)"/>
    <rect class="sc-screen" x="679" y="393" width="104" height="69" rx="3" fill="#fff8e6"/>
    <ellipse class="sc-screen-spill" cx="731" cy="470" rx="120" ry="40" fill="url(#${p}glow)"/>
    <circle class="sc-window" cx="651" cy="397" r="5" fill="url(#${p}glow)"/>
    <circle class="sc-window w2" cx="777" cy="377" r="5" fill="url(#${p}glow)"/>
    <circle class="sc-moon" cx="885" cy="109" r="26" fill="url(#${p}glow)"/>
  </g>
  <g class="sc-day-only">${motes}</g>
</svg>
<button type="button" class="scene-mode" title="Gündüz / gece"><i class="fas"></i></button>`;
    }

    // 0 = gündüz, 1 = gece; şafakta (05:30–07:00) ve akşamüstü (18:30–20:00) yumuşak geçiş
    function nightLevel(d) {
        const m = d.getHours() * 60 + d.getMinutes();
        if (m < 330 || m >= 1200) return 1;
        if (m < 420) return 1 - (m - 330) / 90;
        if (m < 1110) return 0;
        return (m - 1110) / 90;
    }

    const scenes = [];
    let mode = MODES.includes(lsGet(STORE)) ? lsGet(STORE) : 'auto';

    function apply() {
        const n = mode === 'day' ? 0 : mode === 'night' ? 1 : nightLevel(new Date());
        const [icon, label] = MODE_UI[mode];
        scenes.forEach(el => {
            el.style.setProperty('--night', n.toFixed(3));
            el.classList.toggle('is-night', n >= 0.5);
            const b = el.querySelector('.scene-mode');
            b.querySelector('i').className = 'fas ' + icon;
            b.title = 'Sahne: ' + label + ' (değiştirmek için tıkla)';
        });
    }

    function mount(el) {
        el.classList.add('scene');
        el.innerHTML = svgFor(++uid);
        el.querySelector('.scene-mode').addEventListener('click', (e) => {
            e.stopPropagation();
            mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
            lsSet(STORE, mode);
            apply();
            if (window.toast) window.toast('Sahne: ' + MODE_UI[mode][1]);
        });
        scenes.push(el);
        apply();
    }

    document.querySelectorAll('[data-scene]').forEach(mount);
    setInterval(apply, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) apply(); });
    window.LesaScene = { mount, apply };
})();
