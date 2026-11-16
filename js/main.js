/* Ariel Yuan portfolio. No dependencies.
   One animation loop drives everything; each piece reads scroll, velocity and pointer from `S`. */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;

  const S = {
    w: innerWidth, h: innerHeight,
    y: scrollY, ySmooth: scrollY, last: scrollY,
    v: 0, speed: 0,
    mx: innerWidth * .5, my: innerHeight * .46,
    vx: innerWidth * .5, vy: innerHeight * .46,
    pointer: false, time: 0,
    mobile: innerWidth <= 860,
  };

  /* ---------- Themes: each section sets colors and the tunnel's shape ---------- */
  const THEMES = {
    paper:     { bg: '#e6e4ea', fg: '#141018', muted: '#56505f', accent: '#d02c44', tunnel: .85, c: 1, p: 0, h: 0, wob: .012, sc: 1 },
    about:     { bg: '#e6e4ea', fg: '#141018', muted: '#56505f', accent: '#d02c44', tunnel: .2,  c: 1, p: 0, h: 0, wob: .03, sc: 1 },
    hoagie:    { bg: '#eceef2', fg: '#141a26', muted: '#545c6b', accent: '#c8501a', tunnel: .1, c: 1, p: 0, h: 0, wob: .012, sc: 1 },
    seamless:  { bg: '#08060b', fg: '#f4f1f7', muted: '#cfc9d8', accent: '#ff5ec4', tunnel: .35, c: 0, p: 1, h: 0, wob: .02, sc: 1 },
    glitch:    { bg: '#050308', fg: '#f5effa', muted: '#b4adc2', accent: '#ea5dff', tunnel: .2,  c: 0, p: 1, h: 0, wob: .025, sc: 1 },
    hub:       { bg: '#e6e4ea', fg: '#141018', muted: '#56505f', accent: '#2a35d6', tunnel: .13, c: 0, p: 1, h: 0, wob: .012, sc: 1 },
    elsewhere: { bg: '#e6e4ea', fg: '#141018', muted: '#56505f', accent: '#17744a', tunnel: .08, c: 1, p: 0, h: 0, wob: .02, sc: 1 },
    contact:   { bg: '#0e0a12', fg: '#f4f0f7', muted: '#b4adc2', accent: '#ff5a6b', tunnel: .85, c: 0, p: 0, h: 1, wob: .012, sc: .6 },
  };
  const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  for (const t of Object.values(THEMES)) for (const k of ['bg', 'fg', 'muted', 'accent']) t[k + 'Rgb'] = hex(t[k]);
  const css = (a) => `rgb(${a.map((v) => Math.round(v)).join(' ')})`;
  const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

  const sections = $$('[data-theme]').map((el) => ({ el, theme: THEMES[el.dataset.theme], top: 0, bottom: 0 }));
  const measure = () => {
    S.w = innerWidth; S.h = innerHeight; S.mobile = S.w <= 860;
    for (const s of sections) {
      const r = s.el.getBoundingClientRect();
      s.top = r.top + scrollY; s.bottom = r.bottom + scrollY;
    }
  };

  const cur = { ...THEMES.paper };
  let lastThemeKey = '';
  function updateTheme() {
    const mid = S.y + S.h * .5;
    const band = S.h * .14;   // how far around a section boundary colors cross-fade
    let i = sections.findIndex((s) => mid < s.bottom);
    if (i < 0) i = sections.length - 1;
    const a = sections[i];
    let b = a, t = 0;
    const next = sections[i + 1], prev = sections[i - 1];
    if (next && mid > a.bottom - band) { b = next; t = (mid - (a.bottom - band)) / (band * 2); }
    else if (prev && mid < a.top + band) { b = prev; t = ((a.top + band) - mid) / (band * 2); }
    t = smooth(clamp(t));
    const A = a.theme, B = b.theme;
    cur.bgRgb = mix3(A.bgRgb, B.bgRgb, t);
    cur.fgRgb = mix3(A.fgRgb, B.fgRgb, t);
    cur.mutedRgb = mix3(A.mutedRgb, B.mutedRgb, t);
    cur.accentRgb = mix3(A.accentRgb, B.accentRgb, t);
    for (const k of ['tunnel', 'c', 'p', 'h', 'wob', 'sc']) {
      // Shape morphs slowly; it trails the color change so you can see it happen.
      const target = lerp(A[k], B[k], t);
      cur[k] = reduced ? target : lerp(cur[k], target, .06);
    }
    const key = `${A === B ? 0 : t.toFixed(3)}|${sections.indexOf(a)}|${sections.indexOf(b)}`;
    if (key !== lastThemeKey) {
      lastThemeKey = key;
      root.style.setProperty('--bg', css(cur.bgRgb));
      root.style.setProperty('--fg', css(cur.fgRgb));
      root.style.setProperty('--muted', css(cur.mutedRgb));
      root.style.setProperty('--accent', css(cur.accentRgb));
    }
  }

  /* ---------- Tunnel: rings and lanes you fall through as you scroll ---------- */
  const tunnel = (() => {
    const cv = $('#tunnel'), ctx = cv.getContext('2d');
    const LANES = 16, RINGS = 15, NEAR = .62;
    let dpr = 1, boil = 0;
    const pulses = [];

    // Unit shapes, sampled per lane, then blended so the tunnel can morph.
    const shapes = { c: [], p: [], h: [] };
    for (let i = 0; i < LANES; i++) {
      const a = (i / LANES) * Math.PI * 2 - Math.PI / 2;
      shapes.c.push([Math.cos(a), Math.sin(a)]);
      const seg = Math.PI / 4;
      const m = ((a % seg) + seg) % seg;
      const r = Math.cos(seg / 2) / Math.cos(m - seg / 2);
      shapes.p.push([Math.cos(a) * r, Math.sin(a) * r * .86]);
      const t = (i / LANES) * Math.PI * 2;
      const x = 16 * Math.sin(t) ** 3;
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      shapes.h.push([x / 16, -(y + 2) / 16]);
    }
    const hash = (a, b) => {
      const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
      return (s - Math.floor(s)) * 2 - 1;
    };

    function resize() {
      dpr = Math.min(devicePixelRatio || 1, S.mobile ? 1.25 : 1.5);
      cv.width = Math.round(S.w * dpr); cv.height = Math.round(S.h * dpr);
    }

    const rings = Array.from({ length: RINGS }, () => ({ pts: new Float32Array(LANES * 2), z: 1, i: 0, t: 1 }));

    function draw() {
      const { w, h } = S;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const alpha = cur.tunnel;
      if (alpha < .01) return;

      const cx = w * .5, cy = h * .5;
      const R = Math.max(w, h) * .62 * cur.sc;
      const off = S.ySmooth * .0052 + (reduced ? 0 : S.time * .07);
      if (!reduced && Math.floor(S.time * 8) !== boil) boil = Math.floor(S.time * 8); // hand-drawn "line boil"
      const wobble = cur.wob + S.speed * .05;

      for (let k = 0; k < RINGS; k++) {
        const ring = rings[k];
        const idx = Math.floor(off) + k;
        const z = NEAR + (k + 1 - (off % 1));
        const t = 1 / z;
        ring.z = z; ring.t = t; ring.i = idx;
        const ox = lerp(S.vx, cx, t), oy = lerp(S.vy, cy, t);
        for (let l = 0; l < LANES; l++) {
          const c = shapes.c[l], p = shapes.p[l], he = shapes.h[l];
          const sum = (cur.c + cur.p + cur.h) || 1;
          let x = (c[0] * cur.c + p[0] * cur.p + he[0] * cur.h) / sum;
          let y = (c[1] * cur.c + p[1] * cur.p + he[1] * cur.h) / sum;
          const n = 1 + wobble * hash(l + boil * .37, idx);
          x *= n; y *= n * (1 + wobble * .4 * hash(idx, l));
          ring.pts[l * 2] = ox + x * R * t;
          ring.pts[l * 2 + 1] = oy + y * R * t;
        }
      }

      const fg = cur.fgRgb.map(Math.round).join(' ');
      const ac = cur.accentRgb.map(Math.round).join(' ');
      const fade = (t) => clamp(t * 2.2) * clamp((1.5 - t) * 1.2 + .4);

      // Colored lanes: the one under the cursor, plus bands scattered through the depth.
      const ang = Math.atan2(S.my - cy, S.mx - cx) + Math.PI / 2;
      const hot = S.pointer
        ? ((Math.round((ang / (Math.PI * 2)) * LANES) % LANES) + LANES) % LANES
        : ((Math.floor(S.ySmooth * .004) % LANES) + LANES) % LANES;
      for (let k = 0; k < RINGS - 1; k++) {
        const a = rings[k], b = rings[k + 1];
        for (let l = 0; l < LANES; l++) {
          const m = (l + 1) % LANES;
          const band = a.i % 6 === 0 && (l + a.i) % 4 === 0;
          if (l !== hot && !band) continue;
          ctx.fillStyle = `rgb(${ac} / ${alpha * fade(b.t) * (l === hot ? .85 : .55)})`;
          ctx.beginPath();
          ctx.moveTo(a.pts[l * 2], a.pts[l * 2 + 1]);
          ctx.lineTo(a.pts[m * 2], a.pts[m * 2 + 1]);
          ctx.lineTo(b.pts[m * 2], b.pts[m * 2 + 1]);
          ctx.lineTo(b.pts[l * 2], b.pts[l * 2 + 1]);
          ctx.closePath();
          ctx.fill();
        }
      }

      const strokeAll = (color, dx, widthScale) => {
        ctx.lineJoin = 'round';
        for (let k = 0; k < RINGS; k++) {
          const r = rings[k];
          ctx.strokeStyle = `rgb(${color} / ${alpha * fade(r.t) * (dx ? .5 : 1)})`;
          ctx.lineWidth = Math.max(.5, r.t * 2.1 * widthScale);
          ctx.beginPath();
          for (let l = 0; l <= LANES; l++) {
            const m = l % LANES;
            const X = r.pts[m * 2] + dx * r.t, Y = r.pts[m * 2 + 1];
            l ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
          }
          ctx.stroke();
        }
        ctx.lineWidth = Math.max(.5, widthScale);
        for (let l = 0; l < LANES; l++) {
          for (let k = 0; k < RINGS - 1; k++) {
            const a = rings[k], b = rings[k + 1];
            ctx.strokeStyle = `rgb(${color} / ${alpha * fade(b.t) * (dx ? .4 : .75)})`;
            ctx.beginPath();
            ctx.moveTo(a.pts[l * 2] + dx * a.t, a.pts[l * 2 + 1]);
            ctx.lineTo(b.pts[l * 2] + dx * b.t, b.pts[l * 2 + 1]);
            ctx.stroke();
          }
        }
      };
      if (S.speed > .04) {
        const d = S.speed * 26;
        strokeAll('255 0 110', d, 1);
        strokeAll('0 190 255', -d, 1);
      }
      strokeAll(fg, 0, 1);

      // Click pulses travel away down the tunnel, following its current shape.
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        p.z += .045 + p.z * .025;
        if (p.z > 14) { pulses.splice(i, 1); continue; }
        const t = 1 / p.z;
        const ox = lerp(S.vx, cx, t), oy = lerp(S.vy, cy, t);
        ctx.strokeStyle = `rgb(${ac} / ${clamp(t * 2.4)})`;
        ctx.lineWidth = 1 + t * 6;
        ctx.beginPath();
        for (let l = 0; l <= LANES; l++) {
          const m = l % LANES;
          const sum = (cur.c + cur.p + cur.h) || 1;
          const x = (shapes.c[m][0] * cur.c + shapes.p[m][0] * cur.p + shapes.h[m][0] * cur.h) / sum;
          const y = (shapes.c[m][1] * cur.c + shapes.p[m][1] * cur.p + shapes.h[m][1] * cur.h) / sum;
          const X = ox + x * R * t, Y = oy + y * R * t;
          l ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
        }
        ctx.stroke();
      }
    }
    return { resize, draw, pulse: () => pulses.push({ z: .7 }) };
  })();

  /* ---------- Heartbeat: an ECG in the corner that races when you scroll fast ---------- */
  const ecg = (() => {
    const cv = $('#ecg'), ctx = cv.getContext('2d'), label = $('#bpm');
    const W = cv.width, H = cv.height;
    const buf = new Float32Array(120);
    let phase = 0, bpm = 64, tick = 0, kick = 0;
    const g = (x, m, s, a) => a * Math.exp(-((x - m) ** 2) / (2 * s * s));
    const wave = (p) => g(p, .18, .025, .12) - g(p, .28, .012, .18) + g(p, .31, .014, 1) - g(p, .345, .014, .32) + g(p, .55, .045, .22);
    return {
      kick() { kick = 1; },
      draw(dt) {
        const target = 64 + S.speed * 118 + kick * 40;
        kick *= .96;
        bpm = lerp(bpm, target, .05);
        phase = (phase + dt * bpm / 60) % 1;
        buf.copyWithin(0, 1);
        buf[buf.length - 1] = wave(phase) * (1 + S.speed * .35);
        ctx.clearRect(0, 0, W, H);
        ctx.lineWidth = 2.4;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = css(cur.fgRgb);
        ctx.beginPath();
        for (let i = 0; i < buf.length; i++) {
          const x = (i / (buf.length - 1)) * (W - 8), y = H * .68 - buf[i] * H * .56;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
        ctx.fillStyle = css(cur.accentRgb);
        ctx.beginPath();
        ctx.arc(W - 8, H * .68 - buf[buf.length - 1] * H * .56, 5, 0, 7);
        ctx.fill();
        if (++tick % 12 === 0) label.textContent = Math.round(bpm);
      },
    };
  })();

  /* ---------- Fluid type: letters thicken near the pointer ---------- */
  const letters = [];
  $$('[data-fluid]').forEach((el) => {
    const text = el.textContent;
    if (!el.hasAttribute('aria-hidden')) el.setAttribute('aria-label', text);
    el.textContent = '';
    text.split(' ').forEach((word, wi, arr) => {
      const w = document.createElement('span');
      w.className = 'w'; w.setAttribute('aria-hidden', 'true');
      for (const ch of word) {
        const l = document.createElement('span');
        l.className = 'l'; l.textContent = ch;
        w.append(l);
        letters.push({ el: l, host: el, wght: 0, wdth: 0, hero: el.classList.contains('hero-line') });
      }
      el.append(w);
      if (wi < arr.length - 1) el.append(' ');
    });
  });
  const visibleHosts = new Set();
  const hostIO = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting ? visibleHosts.add(e.target) : visibleHosts.delete(e.target)));
  $$('[data-fluid]').forEach((h) => hostIO.observe(h));

  function fluid() {
    if (reduced || !S.pointer) return;
    for (const L of letters) {
      if (!visibleHosts.has(L.host)) continue;
      const r = L.el.getBoundingClientRect();
      const dist = Math.hypot(r.left + r.width / 2 - S.mx, r.top + r.height / 2 - S.my);
      const reach = Math.max(180, r.height * 1.1);
      const f = smooth(clamp(1 - dist / reach));
      const base = L.hero ? 500 : 600;
      const wght = Math.round(lerp(base, 800, f) / 8) * 8;
      const wdth = Math.round(lerp(85, 100, f));
      if (wght !== L.wght || wdth !== L.wdth) {
        L.wght = wght; L.wdth = wdth;
        L.el.style.fontVariationSettings = `"opsz" 96, "wdth" ${wdth}, "wght" ${wght}`;
      }
    }
  }

  /* ---------- Hero: the name splits and you pass through it ---------- */
  const hero = $('#hero'), lineA = $('#line-a'), lineB = $('#line-b'), heroFoot = $('.hero-foot'), heroTop = $('.hero-top');
  function updateHero() {
    const p = clamp(S.ySmooth / (hero.offsetHeight - S.h));
    if (p >= 1 && hero.dataset.done) return;
    hero.dataset.done = p >= 1 ? '1' : '';
    const e = p * p;
    lineA.style.setProperty('--x', `${-e * 34}vw`);
    lineA.style.setProperty('--s', 1 + e * 1.7);
    lineB.style.setProperty('--x', `${e * 34}vw`);
    lineB.style.setProperty('--s', 1 + e * 1.7);
    const fade = 1 - clamp(p * 2.4);
    heroFoot.style.opacity = fade; heroTop.style.opacity = fade;
    const nameFade = 1 - clamp((p - .55) / .4);
    lineA.style.opacity = nameFade; lineB.style.opacity = nameFade;
  }

  /* ---------- Statement: words light up as they pass ---------- */
  const statement = $('#statement');
  statement.setAttribute('aria-label', statement.textContent);
  const words = statement.textContent.split(' ').map((t) => {
    const s = document.createElement('span');
    s.className = 'word'; s.textContent = t; s.setAttribute('aria-hidden', 'true');
    return s;
  });
  statement.textContent = '';
  words.forEach((w, i) => { statement.append(w); if (i < words.length - 1) statement.append(' '); });
  function updateStatement() {
    const r = statement.getBoundingClientRect();
    const p = reduced ? 1 : clamp((S.h * .86 - r.top) / (r.height + S.h * .34));
    const n = Math.ceil(p * words.length);
    words.forEach((w, i) => w.classList.toggle('on', i < n));
  }

  /* ---------- Seamless: frames advance with scroll ---------- */
  const scrub = (() => {
    const section = $('#seamless'), stage = $('.scrub-stage'), cv = $('#scrub'), ctx = cv.getContext('2d');
    const bar = $('#scrub-bar').parentElement;
    const caps = $$('#captions p');
    const TOTAL = 112;
    const frames = new Array(TOTAL);
    let started = false, drawn = -1, dirty = true, W = 0, H = 0, smoothP = 0;

    const stride = () => (S.mobile ? 2 : 1);
    function load() {
      if (started) return;
      started = true;
      const st = stride();
      // Load a coarse pass first so any scroll position shows something quickly.
      const order = [];
      for (let g = 8; g >= 1; g = g === 1 ? 0 : Math.ceil(g / 2)) {
        for (let i = 0; i < TOTAL; i += Math.max(g, st)) if (!order.includes(i)) order.push(i);
        if (g === 1) break;
      }
      let at = 0, active = 0;
      const pump = () => {
        while (active < 6 && at < order.length) {
          const i = order[at++], img = new Image();
          active++;
          img.onload = () => { frames[i] = img; active--; dirty = true; pump(); };
          img.onerror = () => { active--; pump(); };
          img.src = `assets/seamless/f${String(i).padStart(3, '0')}.jpg`;
        }
      };
      pump();
    }
    function nearest(i) {
      for (let d = 0; d < TOTAL; d++) {
        if (frames[i - d]) return frames[i - d];
        if (frames[i + d]) return frames[i + d];
      }
      return null;
    }
    function resize() {
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      W = cv.clientWidth; H = cv.clientHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      dirty = true;
    }
    function update() {
      const r = section.getBoundingClientRect();
      if (r.top < S.h * 2.2 && r.bottom > -S.h) load();
      if (r.bottom < 0 || r.top > S.h) return;
      const raw = clamp(-r.top / (r.height - S.h));
      smoothP = reduced ? raw : lerp(smoothP, raw, .22);
      const openEnd = .1;
      const open = smooth(clamp(raw / openEnd));
      // The footage opens out of a lane-shaped trapezoid until it fills the screen.
      const st = cv.style;
      st.setProperty('--c1', `${lerp(44, 0, open)}%`);
      st.setProperty('--c3', `${lerp(56, 100, open)}%`);
      st.setProperty('--c2', `${lerp(38, 0, open)}%`);
      st.setProperty('--c4', `${lerp(70, 100, open)}%`);
      st.setProperty('--c6', `${lerp(30, 0, open)}%`);
      st.setProperty('--c5', `${lerp(66, 100, open)}%`);
      bar.style.setProperty('--p', raw);
      const fp = clamp((smoothP - openEnd * .5) / (1 - openEnd * .5));
      const idx = Math.min(TOTAL - 1, Math.round(fp * (TOTAL - 1)));
      caps.forEach((c) => c.classList.toggle('on', idx >= +c.dataset.from && idx <= +c.dataset.to));
      stage.style.setProperty('--head', idx >= 100 ? 0 : 1);
      if (idx === drawn && !dirty) return;
      const img = nearest(idx);
      if (!img) return;
      drawn = idx; dirty = false;
      const dpr = cv.width / (W || 1);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const ir = img.naturalWidth / img.naturalHeight, cr = W / H;
      // Cover on landscape screens; on tall phones, fit the width so no gameplay is cropped.
      const portrait = cr < 1;
      let dw, dh;
      if (portrait) { dw = W; dh = W / ir; }
      else if (cr > ir) { dw = W; dh = W / ir; }
      else { dh = H; dw = H * ir; }
      ctx.fillStyle = '#08060b';
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(img, (W - dw) / 2, portrait ? H * .4 - dh / 2 : (H - dh) / 2, dw, dh);
    }
    return { resize, update };
  })();

  /* ---------- GlitchWave: the screenshots slide past sideways ---------- */
  const gwSection = $('#glitchwave'), gwTrack = $('#gw-track');
  function updateGlitch() {
    if (S.mobile) return;
    const r = gwSection.getBoundingClientRect();
    if (r.bottom < 0 || r.top > S.h) return;
    const p = smooth(clamp((-r.top / (r.height - S.h) - .1) / .86));
    const dist = Math.max(0, gwTrack.scrollWidth - S.w);
    gwTrack.style.setProperty('--gx', `${-p * dist}px`);
    gwTrack.style.setProperty('--gs', reduced ? '0deg' : `${clamp(S.v * .05, -5, 5)}deg`);
  }

  /* ---------- HoagiePlan: a working miniature of the real planner ---------- */
  (() => {
    const semsEl = $('#hp-sems'), resultsEl = $('#hp-results'), reqsEl = $('#hp-reqs'), q = $('#hp-q');
    const catalog = {
      'COS 217': 'Intro to Programming Systems', 'COS 240': 'Reasoning About Computation',
      'COS 333': 'Advanced Programming Techniques', 'COS 316': 'Principles of Computer System Design',
      'COS 324': 'Intro to Machine Learning', 'COS 397': 'Junior Independent Work',
      'COS 426': 'Computer Graphics', 'COS 398': 'Junior Independent Work (Spring)',
      'COS 445': 'Economics and Computation', 'COS 423': 'Theory of Algorithms',
      'COS 318': 'Operating Systems', 'COS 435': 'Reinforcement Learning',
      'CHI 451': 'Readings in Modern Chinese', 'CHI 418': 'Advanced Chinese', 'CHI 413': 'Chinese Film and Media',
      'SML 201': 'Intro to Data Science', 'SML 301': 'Data Intelligence',
      'ANT 344': 'Anthropology of Technology', 'SOC 228': 'Social Networks',
      'CWR 205': 'Creative Writing (Fiction)', 'CWR 206': 'Creative Writing (Poetry)',
      'MAT 202': 'Linear Algebra with Applications', 'EGR 154': 'Foundations of Engineering',
    };
    const sems = ['Fall 2025', 'Spring 2026', 'Fall 2026', 'Spring 2027'];
    const plan = [
      ['CHI 451', 'COS 217', 'SML 201', 'COS 240'],
      ['ANT 344', 'SML 301', 'COS 333', 'SOC 228', 'CHI 418'],
      ['COS 324', 'COS 316', 'CHI 413', 'CWR 205', 'COS 397'],
      ['COS 426'],
    ];
    const reqs = [
      { n: 'Introductory', all: ['COS 217', 'COS 240'] },
      { n: 'Systems', any: ['COS 316', 'COS 318', 'COS 333'] },
      { n: 'Theory', any: ['COS 423', 'COS 445'] },
      { n: 'Applications', any: ['COS 324', 'COS 426', 'COS 435'] },
      { n: 'Independent Work', all: ['COS 397', 'COS 398'] },
    ];
    const open = new Set();
    let fresh = null;   // only the course just added animates in
    const dept = (id) => id.slice(0, 3);
    const placed = () => new Set(plan.flat());
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const check = (ok) => {
      const i = el('span', 'hp-mark ' + (ok ? 'is-ok' : 'is-no'));
      i.setAttribute('aria-hidden', 'true');
      i.innerHTML = ok
        ? '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8.2"/><path d="M6.3 10.2l2.4 2.4 5-5"/></svg>'
        : '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8.2"/><path d="M7.2 7.2l5.6 5.6M12.8 7.2l-5.6 5.6"/></svg>';
      return i;
    };
    function add(id, si) {
      if (placed().has(id)) return;
      plan[si].push(id);
      fresh = id;
      ecg.kick();
      render();
    }
    function remove(id) {
      plan.forEach((list) => { const k = list.indexOf(id); if (k >= 0) list.splice(k, 1); });
      render();
    }
    function pill(id) {
      const li = el('li', `hp-pill d-${dept(id)}` + (id === fresh ? ' is-new' : ''));
      li.draggable = true;
      li.title = catalog[id] || id;
      li.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; });
      const x = el('button', 'hp-x', '×');
      x.type = 'button';
      x.setAttribute('aria-label', `Remove ${id}`);
      x.addEventListener('click', (e) => { e.stopPropagation(); remove(id); });
      li.append(el('span', 'hp-code', id), el('span', 'hp-grip', '⠿'), x);
      return li;
    }
    function render() {
      const have = placed();
      semsEl.replaceChildren(...sems.map((name, si) => {
        const card = el('div', 'hp-sem');
        card.append(el('h4', null, name));
        const list = el('ul', 'hp-grid');
        plan[si].forEach((id) => list.append(pill(id)));
        card.append(list);
        card.addEventListener('dragover', (e) => { e.preventDefault(); card.classList.add('is-over'); });
        card.addEventListener('dragleave', () => card.classList.remove('is-over'));
        card.addEventListener('drop', (e) => {
          e.preventDefault(); card.classList.remove('is-over');
          const id = e.dataTransfer.getData('text/plain');
          if (!catalog[id]) return;
          plan.forEach((l) => { const k = l.indexOf(id); if (k >= 0) l.splice(k, 1); });
          plan[si].push(id); fresh = id; ecg.kick(); render();
        });
        return card;
      }));

      const term = q.value.trim().toLowerCase().replace(/\s+/g, ' ');
      const hits = Object.keys(catalog).filter((id) => !have.has(id)
        && (!term || id.toLowerCase().includes(term) || id.toLowerCase().replace(' ', '').includes(term) || catalog[id].toLowerCase().includes(term)));
      resultsEl.replaceChildren(...hits.map((id) => {
        const li = el('li');
        const b = el('button', `hp-result d-${dept(id)}`);
        b.type = 'button'; b.draggable = true;
        b.setAttribute('aria-label', `Add ${id}, ${catalog[id]}, to ${sems[sems.length - 1]}`);
        b.append(el('b', null, id), el('span', null, catalog[id]));
        b.addEventListener('click', () => add(id, sems.length - 1));
        b.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'copy'; });
        li.append(b);
        return li;
      }));
      if (!hits.length) resultsEl.append(el('li', 'hp-none', 'No courses found.'));

      const rows = reqs.map((r) => {
        const list = r.all || r.any;
        const got = list.filter((id) => have.has(id));
        const ok = r.all ? got.length === list.length : got.length > 0;
        return { r, list, got, ok };
      });
      const done = rows.filter((x) => x.ok).length;
      const head = el('li', 'hp-req hp-req-top');
      head.append(el('span', 'hp-req-n', 'Degree Progress'));
      const score = el('span', 'hp-score ' + (done === rows.length ? 'is-ok' : 'is-no'), `${done}/${rows.length}`);
      head.append(score, check(done === rows.length));
      const items = rows.map(({ r, list, got, ok }) => {
        const li = el('li', 'hp-req' + (open.has(r.n) ? ' is-open' : ''));
        const btn = el('button', 'hp-req-btn');
        btn.type = 'button';
        btn.setAttribute('aria-expanded', open.has(r.n));
        btn.append(el('span', 'hp-req-n', r.n), check(ok), el('span', 'hp-chev', '⌄'));
        btn.addEventListener('click', () => { open.has(r.n) ? open.delete(r.n) : open.add(r.n); render(); });
        li.append(btn);
        if (open.has(r.n)) {
          const d = el('p', 'hp-req-d');
          d.textContent = (r.all ? 'All of: ' : 'One of: ') + list.map((id) => (got.includes(id) ? `${id} ✓` : id)).join(', ');
          li.append(d);
        }
        return li;
      });
      reqsEl.replaceChildren(head, ...items);
      fresh = null;
    }
    q.addEventListener('input', render);
    render();
  })();

  /* ---------- Hub: a small, real filter/search/favorite sketch ---------- */
  (() => {
    const list = $('#events'), empty = $('#empty'), q = $('#sketch-q'), savedN = $('#saved-n');
    const chips = $$('.chip');
    const data = [
      { d: 'Thu 7pm', n: 'Thesis writing night', t: 'academic' },
      { d: 'Fri 5pm', n: 'Grad student mixer', t: 'social' },
      { d: 'Sat 11am', n: 'Farmers market walk', t: 'social' },
      { d: 'Mon 4pm', n: 'Teaching workshop', t: 'academic' },
    ];
    const saved = new Set([]);
    let filter = 'all';
    function render() {
      const term = q.value.trim().toLowerCase();
      const rows = data.filter((e) => (filter === 'all' || (filter === 'saved' ? saved.has(e.n) : e.t === filter)) && e.n.toLowerCase().includes(term));
      list.replaceChildren(...rows.map((e) => {
        const li = document.createElement('li'); li.className = 'event';
        const time = document.createElement('time'); time.textContent = e.d;
        const b = document.createElement('b'); b.textContent = e.n;
        const fav = document.createElement('button');
        fav.type = 'button'; fav.className = 'fav';
        const on = saved.has(e.n);
        fav.textContent = on ? '♥' : '♡';
        fav.setAttribute('aria-pressed', on);
        fav.setAttribute('aria-label', `Save ${e.n}`);
        fav.addEventListener('click', (ev) => {
          ev.stopPropagation();
          saved.has(e.n) ? saved.delete(e.n) : saved.add(e.n);
          ecg.kick();
          render();
        });
        li.append(time, b, fav);
        return li;
      }));
      empty.hidden = rows.length > 0;
      savedN.textContent = saved.size;
    }
    chips.forEach((c) => c.addEventListener('click', () => {
      filter = c.dataset.f;
      chips.forEach((o) => { const on = o === c; o.classList.toggle('is-on', on); o.setAttribute('aria-pressed', on); });
      render();
    }));
    q.addEventListener('input', render);
    render();
  })();

  /* ---------- Video dialog ---------- */
  const dlg = $('#player'), vid = $('#player-video');
  $('#watch').addEventListener('click', () => { dlg.showModal(); vid.play().catch(() => {}); });
  $('#player-close').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => vid.pause());

  /* ---------- Entrance reveals ---------- */
  const revealIO = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); }
  }), { rootMargin: '0px 0px -8% 0px' });
  $$('.hub-copy, .sketch, .hp, .rows li, .skills, .shot').forEach((el) => { el.classList.add('reveal'); revealIO.observe(el); });

  /* ---------- Input ---------- */
  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    S.mx = e.clientX; S.my = e.clientY; S.pointer = true;
  }, { passive: true });
  addEventListener('pointerdown', (e) => {
    if (e.target.closest('a, button, input, dialog')) return;
    tunnel.pulse(); ecg.kick();
  }, { passive: true });

  function resizeAll() {
    measure();
    tunnel.resize(); scrub.resize();
  }
  let rt;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resizeAll, 120); }, { passive: true });
  addEventListener('load', measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);

  /* ---------- Main loop ---------- */
  let prev = performance.now(), lastSplit = -1;
  function frame(now) {
    const dt = Math.min(.05, (now - prev) / 1000);
    prev = now;
    S.time += dt;
    S.y = scrollY;
    S.ySmooth = reduced ? S.y : lerp(S.ySmooth, S.y, .12);
    const d = S.y - S.last;
    S.last = S.y;
    S.v = lerp(S.v, d, .14);
    S.speed = reduced ? 0 : clamp(Math.abs(S.v) / 70);

    const tx = S.pointer ? lerp(S.w * .5, S.mx, .5) : S.w * .5 + Math.sin(S.time * .35) * S.w * .05;
    const ty = S.pointer ? lerp(S.h * .5, S.my, .5) : S.h * .46 + Math.cos(S.time * .28) * S.h * .04;
    S.vx = lerp(S.vx, tx, .05);
    S.vy = lerp(S.vy, ty, .05);

    const split = Math.round(S.speed * 22 * 4) / 4;
    if (split !== lastSplit) { lastSplit = split; root.style.setProperty('--split', `${split}px`); }

    updateTheme();
    tunnel.draw();
    ecg.draw(dt);
    updateHero();
    updateStatement();
    scrub.update();
    updateGlitch();
    fluid();
    requestAnimationFrame(frame);
  }
  resizeAll();
  requestAnimationFrame(frame);
})();
