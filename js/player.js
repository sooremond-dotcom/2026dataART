/*
 * player.js — 전시 작품을 '다시 살아 움직이게' 재생 (의존성 없음, 캔버스 + rAF)
 * -----------------------------------------------------------------------------
 * 저장된 work(설정)로 애니메이션을 재구성한다.
 *   - data: settings.fields/rows/mapping 으로 '춤추는 점' 그대로 재생
 *   - color: settings.srcImg(또는 work.srcImg)에서 점을 샘플해 점묘가 숨쉬듯 움직임
 * 작품 페이지·갤러리·키오스크에서 정적 썸네일 대신 살아있는 화면을 보여준다.
 */
(function (global) {
  'use strict';

  /* ---------- 공통 헬퍼 ---------- */
  function hexToRgb(h) { h = String(h || '#888').replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function lerp(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' + Math.round(A[1] + (B[1] - A[1]) * t) + ',' + Math.round(A[2] + (B[2] - A[2]) * t) + ')'; }
  function drawShape(ctx, x, y, r, shape) {
    ctx.beginPath();
    if (shape === 'sq') ctx.rect(x - r, y - r, r * 2, r * 2);
    else if (shape === 'tri') { ctx.moveTo(x, y - r * 1.25); ctx.lineTo(x + r * 1.1, y + r * 0.9); ctx.lineTo(x - r * 1.1, y + r * 0.9); ctx.closePath(); }
    else if (shape === 'diamond') { ctx.moveTo(x, y - r * 1.2); ctx.lineTo(x + r * 1.1, y); ctx.lineTo(x, y + r * 1.2); ctx.lineTo(x - r * 1.1, y); ctx.closePath(); }
    else ctx.arc(x, y, r, 0, 6.283);
    ctx.fill();
  }

  /* ---------- 데이터 작품 ---------- */
  function statsOf(fields, rows) {
    const st = {};
    (fields || []).forEach(f => {
      if (f.type === 'num') { let mn = Infinity, mx = -Infinity; rows.forEach(r => { const v = +r[f.name]; if (!isNaN(v)) { if (v < mn) mn = v; if (v > mx) mx = v; } }); if (mn === Infinity) { mn = 0; mx = 1; } st[f.name] = { min: mn, max: mx, range: (mx - mn) || 1 }; }
      else { const cats = [], seen = {}; rows.forEach(r => { const v = String(r[f.name]); if (!seen[v]) { seen[v] = 1; cats.push(v); } }); st[f.name] = { cats }; }
    });
    return st;
  }
  function buildData(work, W, H) {
    const s = work.settings || {}, fields = s.fields || [], rows = s.rows || [], m = s.mapping || {};
    if (!rows.length) return null;
    const st = statsOf(fields, rows);
    const ftype = n => { const f = fields.find(x => x.name === n); return f ? f.type : 'num'; };
    const norm = (n, i) => { const c = st[n]; if (!c || c.cats) return 0; const v = +rows[i][n]; return isNaN(v) ? 0 : Math.max(0, Math.min(1, (v - c.min) / c.range)); };
    const delta = (n, i) => i <= 0 ? 0 : norm(n, i) - norm(n, i - 1);
    const catColor = (i) => { if (m.colorMode === 'solid') return m.solid || '#ffb454'; if (m.colorMode === 'category') return (m.catColors || {})[String(rows[i][m.colorField])] || '#888'; return lerp(m.gradLow || '#2e86de', m.gradHigh || '#ff5a5f', m.colorField ? norm(m.colorField, i) : 0.5); };
    const catShape = (i) => { const f = m.shape; if (!f) return 'circle'; if (ftype(f) === 'cat') return (m.catShapes || {})[String(rows[i][f])] || 'circle'; const v = norm(f, i); return v < 0.34 ? 'tri' : v < 0.67 ? 'circle' : 'sq'; };
    // per-row 미리계산
    const R = rows.map((_, i) => ({
      sv: m.size ? norm(m.size, i) : 0.5, dv: m.speed ? Math.abs(delta(m.speed, i)) : 0.25,
      dir: m.direction ? -Math.sign(delta(m.direction, i)) : 0, alpha: m.alpha ? (0.18 + norm(m.alpha, i) * 0.82) : 1,
      color: catColor(i), shape: catShape(i)
    }));
    const n = rows.length, marg = Math.min(50, W * 0.08), arr = [];
    for (let i = 0; i < n; i++) {
      const hx = marg + (n === 1 ? 0.5 : i / (n - 1)) * (W - marg * 2);
      const count = m.density ? Math.round(5 + norm(m.density, i) * 45) : 16;
      const band = 30 + R[i].sv * 90;
      for (let k = 0; k < count; k++) arr.push({ ri: i, hx: hx + (Math.random() - 0.5) * 16, hy: H / 2 + (Math.random() - 0.5) * band, px: hx, py: H / 2, vx: 0, vy: 0 });
    }
    return { kind: 'data', P: arr, R, base: s.baseSpeed || 1, vib: s.vib != null ? s.vib : 1, trail: s.trail || 200 };
  }
  function stepData(ctx, st, W, H, mouse) {
    ctx.fillStyle = st.trail >= 255 ? 'rgb(7,8,13)' : 'rgba(7,8,13,' + (st.trail / 255) + ')';
    ctx.fillRect(0, 0, W, H);
    for (const o of st.P) {
      const r = st.R[o.ri]; const speed = st.base * (0.35 + r.dv * 1.4);
      let ax = (o.hx - o.px) * 0.06, ay = (o.hy - o.py) * 0.03;
      ay += r.dir * speed * 0.55;
      ax += (Math.random() - 0.5) * st.vib * speed; ay += (Math.random() - 0.5) * st.vib * speed;
      if (mouse) { const dx = o.px - mouse.x, dy = o.py - mouse.y, d2 = dx * dx + dy * dy; if (d2 < 9000) { const d = Math.sqrt(d2) + .1, f = (1 - d / 95) * 4; ax += dx / d * f; ay += dy / d * f; } }
      o.vx = (o.vx + ax) * 0.9; o.vy = (o.vy + ay) * 0.9; o.px += o.vx; o.py += o.vy;
      const rad = 1.5 + r.sv * 7 * (st.settings_size || 1);
      ctx.globalAlpha = r.alpha; ctx.fillStyle = r.color; drawShape(ctx, o.px, o.py, rad, r.shape);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- 색 군집 작품 ---------- */
  // 다운스케일 그레이스케일에서 한 점의 소벨(윤곽) 세기 0~1
  function sobelAt(g, w, h, x, y) {
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) return 0.2;
    const i = y * w + x;
    const gx = -g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1] + g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1];
    const gy = -g[i - w - 1] - 2 * g[i - w] - g[i - w + 1] + g[i + w - 1] + 2 * g[i + w] + g[i + w + 1];
    return Math.min(1, Math.hypot(gx, gy));
  }
  // 구도 렌즈 오버레이(삼분할 격자 + 파워포인트 + 시선 무게중심) — 스튜디오와 동일
  function drawCompositionP(ctx, b, cx, cy) {
    const x1 = b.ox + b.w / 3, x2 = b.ox + b.w * 2 / 3, y1 = b.oy + b.h / 3, y2 = b.oy + b.h * 2 / 3;
    ctx.save();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.moveTo(x1, b.oy); ctx.lineTo(x1, b.oy + b.h);
    ctx.moveTo(x2, b.oy); ctx.lineTo(x2, b.oy + b.h);
    ctx.moveTo(b.ox, y1); ctx.lineTo(b.ox + b.w, y1);
    ctx.moveTo(b.ox, y2); ctx.lineTo(b.ox + b.w, y2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    [[x1, y1], [x2, y1], [x1, y2], [x2, y2]].forEach(p => { ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, 6.283); ctx.fill(); });
    ctx.strokeStyle = '#ff7a45'; ctx.fillStyle = 'rgba(255,122,69,0.18)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 12, 0, 6.283); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 18, cy); ctx.lineTo(cx + 18, cy); ctx.moveTo(cx, cy - 18); ctx.lineTo(cx, cy + 18); ctx.stroke();
    ctx.restore();
  }
  function buildColor(work, img, W, H) {
    const s = work.settings || {};
    const ar = img.width / img.height, pad = 14;
    let w = W - pad * 2, h = w / ar; if (h > H - pad * 2) { h = H - pad * 2; w = h * ar; }
    const ox = (W - w) / 2, oy = (H - h) / 2;
    const sc = document.createElement('canvas'), sw = 160, sh = Math.max(1, Math.round(sw / ar));
    sc.width = sw; sc.height = sh; const sctx = sc.getContext('2d'); sctx.drawImage(img, 0, 0, sw, sh);
    const d = sctx.getImageData(0, 0, sw, sh).data;
    const lens = s.lens || 'none';
    // 에지/구도 렌즈면 다운스케일 그레이스케일을 미리 만들어 점별 윤곽 세기를 잰다.
    let gray = null;
    if (lens === 'edge' || lens === 'composition') {
      gray = new Float32Array(sw * sh);
      for (let i = 0; i < sw * sh; i++) gray[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
    }
    const N = Math.max(600, Math.min(s.N || 3000, 4500)), arr = [];
    let csx = 0, csy = 0, csw = 0;          // 시선 무게중심 누적
    for (let k = 0; k < N; k++) {
      const sx = Math.floor(Math.random() * sw), sy = Math.floor(Math.random() * sh), idx = (sy * sw + sx) * 4;
      const hx = ox + (sx + Math.random()) / sw * w, hy = oy + (sy + Math.random()) / sh * h;
      const edge = gray ? sobelAt(gray, sw, sh, sx, sy) : 1;
      arr.push({ hx, hy, px: hx, py: hy, vx: 0, vy: 0, col: 'rgb(' + d[idx] + ',' + d[idx + 1] + ',' + d[idx + 2] + ')', edge });
      const wgt = gray ? (0.08 + edge) : (0.2 + (0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2]) / 255);
      csx += hx * wgt; csy += hy * wgt; csw += wgt;
    }
    return { kind: 'color', P: arr, size: s.size || 3, trail: 235, lens, box: { ox, oy, w, h }, cx: csw ? csx / csw : ox + w / 2, cy: csw ? csy / csw : oy + h / 2 };
  }
  function stepColor(ctx, st, W, H, mouse) {
    ctx.fillStyle = 'rgba(12,14,22,' + (st.trail / 255) + ')'; ctx.fillRect(0, 0, W, H);
    const r = st.size, edge = st.lens === 'edge';
    for (const o of st.P) {
      let ax = (o.hx - o.px) * 0.08, ay = (o.hy - o.py) * 0.08;
      ax += (Math.random() - 0.5) * 0.5; ay += (Math.random() - 0.5) * 0.5;
      if (mouse) { const dx = o.px - mouse.x, dy = o.py - mouse.y, d2 = dx * dx + dy * dy; if (d2 < 14000) { const d = Math.sqrt(d2) + .1, f = (1 - d / 118) * 5; ax += dx / d * f; ay += dy / d * f; } }
      o.vx = (o.vx + ax) * 0.88; o.vy = (o.vy + ay) * 0.88; o.px += o.vx; o.py += o.vy;
      let rr = r;
      if (edge) { rr = r * (0.3 + o.edge * 1.7); ctx.globalAlpha = 0.08 + o.edge * 0.92; if (rr < 0.4) continue; }
      ctx.fillStyle = o.col; ctx.fillRect(o.px - rr, o.py - rr, rr * 2, rr * 2);
    }
    ctx.globalAlpha = 1;
    if (st.lens === 'composition') drawCompositionP(ctx, st.box, st.cx, st.cy);
  }

  /* ---------- 마운트 ---------- */
  function mount(canvas, work, opts) {
    opts = opts || {};
    const ctx = canvas.getContext('2d');
    let st = null, raf = 0, stopped = false, mouse = null;
    const dpr = Math.min(global.devicePixelRatio || 1, 1.5);
    function size() { const r = canvas.getBoundingClientRect(); canvas.width = Math.max(2, Math.round((r.width || 320) * dpr)); canvas.height = Math.max(2, Math.round((r.height || 220) * dpr)); }
    function init() {
      size();
      if (work.kind === 'data') { st = buildData(work, canvas.width, canvas.height); st && (st.settings_size = 1); loop(); }
      else {
        const url = (work.settings && work.settings.srcImg) || work.srcImg;
        if (url) { const img = new Image(); img.onload = () => { if (stopped) return; st = buildColor(work, img, canvas.width, canvas.height); loop(); }; img.onerror = poster; img.src = url; }
        else poster();
      }
    }
    function poster() { const url = work.thumb || (work.settings && work.settings.srcImg); if (!url) return; const img = new Image(); img.onload = () => { ctx.drawImage(img, 0, 0, canvas.width, canvas.height); }; img.src = url; }
    function loop() {
      if (stopped || !st) return;
      const W = canvas.width, H = canvas.height;
      if (st.kind === 'data') stepData(ctx, st, W, H, mouse); else stepColor(ctx, st, W, H, mouse);
      raf = requestAnimationFrame(loop);
    }
    if (opts.interactive) {
      canvas.addEventListener('mousemove', e => { const r = canvas.getBoundingClientRect(); mouse = { x: (e.clientX - r.left) * dpr, y: (e.clientY - r.top) * dpr }; });
      canvas.addEventListener('mouseleave', () => mouse = null);
    }
    init();
    return { stop() { stopped = true; cancelAnimationFrame(raf); }, resize() { size(); init(); } };
  }

  global.Player = { mount };
})(window);
