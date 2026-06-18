/*
 * algos/algorithms.js — 7가지 분석 알고리즘 + "재창조" 결과
 * -----------------------------------------------------------------------------
 * 각 함수는 원본 캔버스를 받아 분석하고, 결과 이미지를 작은 캔버스로 돌려준다.
 *   핵심: kmeansArt · posterize(히스토그램) · notan(명도) · edges(에지)
 *   심화: medianCut · mosaic · composition
 * (KMeans, ImageAnalysis 모듈을 일부 재사용)
 */
(function (global) {
  'use strict';

  function small(src, maxDim) {
    maxDim = maxDim || 300;
    const s = Math.min(1, maxDim / Math.max(src.width, src.height));
    const w = Math.max(1, Math.round(src.width * s)), h = Math.max(1, Math.round(src.height * s));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0, w, h);
    return { c, ctx, w, h, data: ctx.getImageData(0, 0, w, h) };
  }
  function blank(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
  const clamp = v => v < 0 ? 0 : v > 255 ? 255 : v | 0;

  // 팔레트로 양자화한 이미지(가장 가까운 대표색으로 치환)
  function quantizeTo(img, palette) {
    const out = new ImageData(img.width, img.height);
    const d = img.data, o = out.data, P = palette;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      let bi = 0, bd = Infinity;
      for (let k = 0; k < P.length; k++) {
        const dr = r - P[k].r, dg = g - P[k].g, db = b - P[k].b, dd = dr * dr + dg * dg + db * db;
        if (dd < bd) { bd = dd; bi = k; }
      }
      o[i] = P[bi].r; o[i + 1] = P[bi].g; o[i + 2] = P[bi].b; o[i + 3] = 255;
    }
    return out;
  }
  function toCanvas(img) { const c = blank(img.width, img.height); c.getContext('2d').putImageData(img, 0, 0); return c; }

  const Algos = {};

  /* ---------- ① K-means 색 군집화(재창조: 대표색 치환) ---------- */
  Algos.kmeansArt = function (src, opts) {
    opts = opts || {}; const K = opts.K || 8, space = opts.space || 'rgb';
    const a = ImageAnalysis.analyze(src, { K, space, sampling: 'uniform', N: 1, seed: opts.seed || 12345, maxDim: 240 });
    const sm = small(src, 300);
    return { palette: a.palette, recreate: toCanvas(quantizeTo(sm.data, a.palette)) };
  };

  /* ---------- ② 색 히스토그램(재창조: 포스터화) ---------- */
  Algos.posterize = function (src, opts) {
    const levels = (opts && opts.levels) || 4;
    const sm = small(src, 300), d = sm.data.data;
    const stepv = 255 / (levels - 1);
    for (let i = 0; i < d.length; i += 4) {
      d[i] = clamp(Math.round(d[i] / stepv) * stepv);
      d[i + 1] = clamp(Math.round(d[i + 1] / stepv) * stepv);
      d[i + 2] = clamp(Math.round(d[i + 2] / stepv) * stepv);
    }
    return { recreate: toCanvas(sm.data) };
  };

  /* ---------- ③ 명도·노탄(재창조: 임계값 흑백/다단) ---------- */
  Algos.notan = function (src, opts) {
    const th = (opts && opts.threshold != null) ? opts.threshold : 128;
    const levels = (opts && opts.levels) || 2;
    const contrast = (opts && opts.contrast) || 0; // -1 ~ 1 (톤커브)
    const cf = (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255));
    const sm = small(src, 300), d = sm.data.data;
    for (let i = 0; i < d.length; i += 4) {
      let L = lum(d[i], d[i + 1], d[i + 2]);
      if (contrast) L = clamp(cf * (L - 128) + 128);
      let v;
      if (levels <= 2) v = L >= th ? 255 : 0;
      else { const stepv = 255 / (levels - 1); v = clamp(Math.round((L / 255 * (levels - 1))) * stepv); }
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    return { recreate: toCanvas(sm.data) };
  };

  /* ---------- ④ 에지(Sobel)(재창조: 선 드로잉) ---------- */
  Algos.edges = function (src, opts) {
    const invert = !(opts && opts.invert === false); // 기본: 흰 바탕에 검은 선
    const sm = small(src, 300), w = sm.w, h = sm.h, d = sm.data.data;
    const gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) gray[i] = lum(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
    const out = new ImageData(w, h), o = out.data;
    for (let i = 0; i < o.length; i += 4) { o[i] = o[i + 1] = o[i + 2] = invert ? 255 : 0; o[i + 3] = 255; }
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = -gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1] + gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1];
      const gy = -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] + gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
      let m = Math.min(255, Math.hypot(gx, gy));
      const v = invert ? 255 - m : m;
      const j = i * 4; o[j] = o[j + 1] = o[j + 2] = v;
    }
    return { recreate: toCanvas(out) };
  };

  /* ---------- ⑤ 중앙값 분할 Median Cut(심화) ---------- */
  Algos.medianCut = function (src, opts) {
    const K = (opts && opts.K) || 8;
    const sm = small(src, 200), d = sm.data.data;
    const px = [];
    for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
    // 박스: 가장 넓게 퍼진 채널을 중앙값에서 분할, K개까지
    let boxes = [px];
    while (boxes.length < K) {
      // 범위가 가장 큰 박스 선택
      let bi = 0, brange = -1, bch = 0;
      boxes.forEach((box, idx) => {
        for (let c = 0; c < 3; c++) {
          let mn = 255, mx = 0;
          for (const p of box) { if (p[c] < mn) mn = p[c]; if (p[c] > mx) mx = p[c]; }
          if (mx - mn > brange) { brange = mx - mn; bi = idx; bch = c; }
        }
      });
      const box = boxes[bi]; if (box.length < 2) break;
      box.sort((a, b) => a[bch] - b[bch]);
      const mid = box.length >> 1;
      boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid));
    }
    const palette = boxes.map(box => {
      let r = 0, g = 0, b = 0; for (const p of box) { r += p[0]; g += p[1]; b += p[2]; }
      const n = Math.max(1, box.length);
      return { r: clamp(r / n), g: clamp(g / n), b: clamp(b / n), ratio: box.length / px.length };
    }).sort((a, b) => b.ratio - a.ratio);
    const big = small(src, 300);
    return { palette, recreate: toCanvas(quantizeTo(big.data, palette)) };
  };

  /* ---------- ⑥ 격자 평균·모자이크(심화) ---------- */
  Algos.mosaic = function (src, opts) {
    const cell = (opts && opts.cell) || 16;
    const sm = small(src, 360), w = sm.w, h = sm.h, d = sm.data.data;
    const out = blank(w, h), octx = out.getContext('2d');
    for (let by = 0; by < h; by += cell) for (let bx = 0; bx < w; bx += cell) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = by; y < Math.min(by + cell, h); y++) for (let x = bx; x < Math.min(bx + cell, w); x++) {
        const i = (y * w + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
      }
      octx.fillStyle = `rgb(${clamp(r / n)},${clamp(g / n)},${clamp(b / n)})`;
      octx.fillRect(bx, by, cell, cell);
    }
    return { recreate: out };
  };

  /* ---------- ⑦ 구도 분석(심화): 밝기 무게중심 + 삼분할 ---------- */
  Algos.composition = function (src) {
    const sm = small(src, 260), w = sm.w, h = sm.h, d = sm.data.data;
    let sx = 0, sy = 0, sw = 0, leftL = 0, rightL = 0, topL = 0, botL = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, L = lum(d[i], d[i + 1], d[i + 2]) + 1;
      sx += x * L; sy += y * L; sw += L;
      (x < w / 2 ? leftL += L : rightL += L);
      (y < h / 2 ? topL += L : botL += L);
    }
    const cxN = sx / sw / w, cyN = sy / sw / h;
    // 재창조: 원본 위에 삼분할선 + 무게중심
    const out = blank(w, h), o = out.getContext('2d');
    o.drawImage(sm.c, 0, 0);
    o.strokeStyle = 'rgba(255,255,255,.7)'; o.lineWidth = 1;
    [1, 2].forEach(k => {
      o.beginPath(); o.moveTo(w * k / 3, 0); o.lineTo(w * k / 3, h); o.stroke();
      o.beginPath(); o.moveTo(0, h * k / 3); o.lineTo(w, h * k / 3); o.stroke();
    });
    o.beginPath(); o.arc(cxN * w, cyN * h, 7, 0, Math.PI * 2);
    o.fillStyle = 'rgba(255,180,84,.95)'; o.fill(); o.strokeStyle = '#000'; o.stroke();
    return {
      centroid: { x: +cxN.toFixed(2), y: +cyN.toFixed(2) },
      balanceLR: +(leftL / (leftL + rightL)).toFixed(2),
      balanceTB: +(topL / (topL + botL)).toFixed(2),
      recreate: out
    };
  };

  /* ---------- 임의 팔레트로 재채색(색채 조화 적용 등) ---------- */
  Algos.recolor = function (src, palette) {
    const sm = small(src, 300);
    return toCanvas(quantizeTo(sm.data, palette));
  };

  /* ---------- 색각 다양성(색맹) 시뮬레이션 ---------- */
  const CVD = {
    normal: null,
    protan: [0.567, 0.433, 0, 0.558, 0.442, 0, 0, 0.242, 0.758],   // 적색맹
    deutan: [0.625, 0.375, 0, 0.70, 0.30, 0, 0, 0.30, 0.70],       // 녹색맹(가장 흔함)
    tritan: [0.95, 0.05, 0, 0, 0.433, 0.567, 0, 0.475, 0.525]      // 청색맹
  };
  Algos.cvd = function (src, type) {
    const sm = small(src, 300), d = sm.data.data, m = CVD[type];
    if (m) for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      d[i] = clamp(r * m[0] + g * m[1] + b * m[2]);
      d[i + 1] = clamp(r * m[3] + g * m[4] + b * m[5]);
      d[i + 2] = clamp(r * m[6] + g * m[7] + b * m[8]);
    }
    return { recreate: toCanvas(sm.data) };
  };

  global.Algos = Algos;
})(window);
