/*
 * analysis.js — 이미지 "여러 방법으로" 분석하기
 * -----------------------------------------------------------------------------
 * 수업의 파이프라인을 그대로 코드로 옮긴 모듈:
 *   이미지 → (전처리: 리사이즈/색공간) → 픽셀 색 데이터 추출
 *        → K-means 군집화(대표색 K개 + 비율)
 *        → 점 샘플링(무작위 / 밝은영역 / 어두운영역 / 윤곽=에지 가중)
 *        → 점 리스트(N개: 위치·대표색·밝기) "JSON 같은 구조"로 출력
 *
 * 즉 ImageAnalysis.analyze(...) 의 반환값이 곧 "점 데이터(JSON)"에 해당한다.
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* 색공간 변환 (RGB ↔ LAB)                                             */
  /*   RGB: 화면 색 그대로. LAB: 사람 눈에 가까운 거리 → 군집이 더 자연스러움 */
  /* ------------------------------------------------------------------ */
  function srgbToLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function rgb2lab(r, g, b) {
    const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
    // 선형 RGB → XYZ (D65)
    let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
    let y = (R * 0.2126 + G * 0.7152 + B * 0.0722) / 1.0;
    let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    x = f(x); y = f(y); z = f(z);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }
  // 픽셀(r,g,b)을 선택한 색공간 벡터로
  function toSpace(r, g, b, space) {
    return space === 'lab' ? rgb2lab(r, g, b) : [r, g, b];
  }
  // 표준 휘도(밝기) 0~1
  function luminance(r, g, b) {
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }
  function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }

  /* ------------------------------------------------------------------ */
  /* 소스(업로드/데모) → 작은 분석용 캔버스로 리사이즈                    */
  /* ------------------------------------------------------------------ */
  function fitCanvas(src, maxDim) {
    const sw = src.width, sh = src.height;
    const scale = Math.min(1, maxDim / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0, w, h);
    return { canvas: cv, ctx, w, h };
  }

  // Sobel 윤곽(에지) 세기 맵 — 명암이 급변하는 곳(윤곽선)에서 값이 커진다.
  function edgeMap(gray, w, h) {
    const out = new Float32Array(w * h);
    let max = 1e-6;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const gx =
          -gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1] +
          gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1];
        const gy =
          -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] +
          gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
        const m = Math.hypot(gx, gy);
        out[i] = m;
        if (m > max) max = m;
      }
    }
    for (let i = 0; i < out.length; i++) out[i] /= max; // 0~1 정규화
    return out;
  }

  // 가중치 맵에서 N개의 픽셀 인덱스를 뽑는다(누적분포 + 이분 탐색).
  function sampleIndices(weights, n, rng) {
    const len = weights.length;
    const cdf = new Float64Array(len);
    let acc = 0;
    for (let i = 0; i < len; i++) { acc += weights[i]; cdf[i] = acc; }
    if (acc <= 0) { // 전부 0이면 균등으로
      const out = new Int32Array(n);
      for (let k = 0; k < n; k++) out[k] = (rng() * len) | 0;
      return out;
    }
    const out = new Int32Array(n);
    for (let k = 0; k < n; k++) {
      const t = rng() * acc;
      let lo = 0, hi = len - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cdf[mid] < t) lo = mid + 1; else hi = mid;
      }
      out[k] = lo;
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* 메인: analyze(source, opts)                                         */
  /* ------------------------------------------------------------------ */
  function analyze(source, opts) {
    opts = opts || {};
    const reqK = Math.max(1, Math.floor(opts.K || 8));   // 학생이 입력한 K(클램프 전)
    const space = opts.space === 'lab' ? 'lab' : 'rgb';
    const sampling = opts.sampling || 'uniform';
    const reqN = Math.max(100, Math.min(opts.N || 4000, 50000));   // 사용자가 정한 점 개수(클램프 전 기준)
    // K가 매우 크면 더 많은 픽셀이 필요(색 수 확보) — 입력 K에 맞춰 분석 해상도를 키운다.
    const maxDim = opts.maxDim || (reqK > 6000 ? 600 : reqK > 1500 ? 460 : 320);
    const seed = opts.seed != null ? opts.seed : 12345;
    const rng = KMeans.makeRNG(seed);

    // (1) 전처리: 리사이즈 + 픽셀 읽기
    const { ctx, w, h } = fitCanvas(source, maxDim);
    const px = ctx.getImageData(0, 0, w, h).data; // RGBA
    const total = w * h;

    // 밝기/회색조 미리 계산(샘플링·3D 깊이·주파수 매핑에 사용)
    const gray = new Float32Array(total);
    const bright = new Float32Array(total);
    for (let i = 0; i < total; i++) {
      const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
      const L = luminance(r, g, b);
      gray[i] = L * 255;
      bright[i] = L;
    }

    // (2) K-means 입력: 픽셀을 골고루 표본추출해서 학습.
    //   K가 크면 군집당 표본이 부족하지 않도록 표본 수를 K에 맞춰 늘린다(성능 위해 상한).
    const sampleTarget = Math.max(6000, Math.min(reqK * 6, 60000));
    const sampleStep = Math.max(1, Math.floor(total / sampleTarget));
    const data = [];
    for (let i = 0; i < total; i += sampleStep) {
      data.push(toSpace(px[i * 4], px[i * 4 + 1], px[i * 4 + 2], space));
    }
    // 실제 K: 입력값을 (표본 색 수, 성능 상한)로 제한.
    //   → 수만 개까지 입력할 수 있지만, 이미지의 실제 색 수와 k-means 비용(K에 비례)이 한계라
    //      그 한도 안에서만 쓴다(정직한 근사). 큰 K일수록 반복 횟수를 줄여 멈춤을 막는다.
    const PERF_CAP = 50000;
    const K = Math.max(1, Math.min(reqK, data.length, PERF_CAP));
    // 점 개수 N: 사용자 설정(reqN)을 기본으로, 실제 K가 더 크면 점도 K만큼 자동 확보한다.
    //  - K색을 다 보여주려면 점이 최소 그만큼 필요(점<K면 일부 색은 점으로 나타나지 못함).
    //  - 그래서 N을 K보다 작게 두면 K가 점 개수를 '직접' 정한다(K를 키우면 점이 늘어남).
    const N = Math.min(50000, Math.max(reqN, K));
    const maxIter = K <= 64 ? 24 : K <= 256 ? 14 : K <= 1024 ? 10 : K <= 4096 ? 6 : K <= 12000 ? 4 : 2;
    const km = KMeans.cluster(data, K, { seed, maxIter });

    // 군집 중심을 RGB 팔레트로 환산 + 비율(%) 계산
    // (LAB 중심은 직접 역변환 대신, 그 군집에 속한 원본 RGB들의 평균색을 쓴다.)
    const sumR = new Float64Array(K), sumG = new Float64Array(K), sumB = new Float64Array(K);
    const cnt = new Int32Array(K);
    for (let s = 0; s < data.length; s++) {
      const c = km.assignments[s];
      const src = s * sampleStep;
      sumR[c] += px[src * 4]; sumG[c] += px[src * 4 + 1]; sumB[c] += px[src * 4 + 2];
      cnt[c]++;
    }
    let palette = [];
    for (let c = 0; c < K; c++) {
      const n = Math.max(1, cnt[c]);
      palette.push({
        r: clamp255(sumR[c] / n), g: clamp255(sumG[c] / n), b: clamp255(sumB[c] / n),
        ratio: cnt[c] / data.length,
        _cen: km.centroids[c]            // 점 배정을 위해 색공간 중심 보관
      });
    }
    // 비율 높은 색 순으로 정렬(리포트 가독성)
    palette.sort((a, b) => b.ratio - a.ratio);
    const centroidsSpace = palette.map(p => p._cen);
    palette.forEach(p => { delete p._cen; });

    // 에지(윤곽) 세기 맵: 항상 한 번 계산(샘플링 가중치 + '에지 렌즈'의 점별 세기 양쪽에 사용).
    const emap = edgeMap(gray, w, h);

    // (3) 점 샘플링: 방식별 가중치 맵 만들기
    const weights = new Float32Array(total);
    if (sampling === 'edge') {
      for (let i = 0; i < total; i++) weights[i] = 0.05 + emap[i]; // 윤곽 강조
    } else if (sampling === 'bright') {
      for (let i = 0; i < total; i++) weights[i] = 0.05 + bright[i];      // 밝은 곳 ↑
    } else if (sampling === 'dark') {
      for (let i = 0; i < total; i++) weights[i] = 0.05 + (1 - bright[i]); // 어두운 곳 ↑
    } else {
      for (let i = 0; i < total; i++) weights[i] = 1;                      // 무작위(균등)
    }
    const idx = sampleIndices(weights, N, rng);

    // (4) 점 리스트(JSON 같은 구조, 성능 위해 Typed Array로)
    const nx = new Float32Array(N), ny = new Float32Array(N);
    const clusterArr = new Int16Array(N), brArr = new Float32Array(N), edArr = new Float32Array(N);
    const orr = new Uint8Array(N), ogg = new Uint8Array(N), obb = new Uint8Array(N);
    for (let k = 0; k < N; k++) {
      const i = idx[k];
      const x = i % w, y = (i / w) | 0;
      // 픽셀 안에서 살짝 흔들어 격자 느낌 제거
      nx[k] = (x + rng()) / w;
      ny[k] = (y + rng()) / h;
      const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
      orr[k] = r; ogg[k] = g; obb[k] = b;
      brArr[k] = bright[i];
      edArr[k] = emap[i];          // 점이 놓인 곳의 윤곽(에지) 세기 0~1 — '에지 렌즈'용
      // 가장 가까운 대표색(군집)에 배정 = "대표색 점으로 치환"
      const v = toSpace(r, g, b, space);
      let best = 0, bestD = Infinity;
      for (let c = 0; c < centroidsSpace.length; c++) {
        const cc = centroidsSpace[c];
        let dd = 0;
        for (let d = 0; d < cc.length; d++) { const df = v[d] - cc[d]; dd += df * df; }
        if (dd < bestD) { bestD = dd; best = c; }
      }
      clusterArr[k] = best;
    }

    return {
      width: w, height: h, count: N, K, requestedK: reqK, maxK: Math.min(data.length, PERF_CAP), space, sampling, seed,
      palette,                       // [{r,g,b,ratio}] 비율 내림차순
      nx, ny, cluster: clusterArr, br: brArr, ed: edArr,
      or: orr, og: ogg, ob: obb
    };
  }

  /* ------------------------------------------------------------------ */
  /* 데모 이미지: 네트워크/저작권 걱정 없이 즉시 쓸 수 있는 절차적 그림     */
  /* ------------------------------------------------------------------ */
  function generateDemo(name, w, h) {
    w = w || 640; h = h || 480;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');

    // 미술사조 대표작을 절차적으로 재현(저작권 안전). 색·구도·점묘 분석에 어울리게.
    const rnd = (a, b) => a + Math.random() * (b - a);
    if (name === 'starrynight') {
      // 후기인상주의 · 고흐 〈별이 빛나는 밤〉
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#0a1a4f'); g.addColorStop(0.6, '#143a86'); g.addColorStop(1, '#1b2a4a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.lineWidth = 3; ctx.globalAlpha = 0.5;
      for (let i = 0; i < 60; i++) { ctx.strokeStyle = i % 2 ? '#9bbdf0' : '#e8c84a'; const cx = rnd(0, w), cy = rnd(0, h * 0.8), r = rnd(10, 60), a0 = rnd(0, 7); ctx.beginPath(); ctx.arc(cx, cy, r, a0, a0 + 3.6); ctx.stroke(); }
      ctx.globalAlpha = 1;
      for (let i = 0; i < 11; i++) { const sx = rnd(40, w - 40), sy = rnd(30, h * 0.55), rr = rnd(14, 30); const sg = ctx.createRadialGradient(sx, sy, 2, sx, sy, rr); sg.addColorStop(0, '#fff7c0'); sg.addColorStop(1, 'rgba(255,210,80,0)'); ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, rr, 0, 7); ctx.fill(); }
      const moon = ctx.createRadialGradient(w * 0.82, h * 0.18, 4, w * 0.82, h * 0.18, 46); moon.addColorStop(0, '#ffe9a8'); moon.addColorStop(1, 'rgba(255,180,60,0)'); ctx.fillStyle = moon; ctx.beginPath(); ctx.arc(w * 0.82, h * 0.18, 46, 0, 7); ctx.fill();
      ctx.fillStyle = '#0c1a14'; ctx.beginPath(); ctx.moveTo(w * 0.13, h); ctx.quadraticCurveTo(w * 0.04, h * 0.4, w * 0.12, h * 0.05); ctx.quadraticCurveTo(w * 0.2, h * 0.4, w * 0.18, h); ctx.fill();
      ctx.fillStyle = 'rgba(8,12,30,0.92)'; ctx.fillRect(0, h * 0.82, w, h * 0.18);
    } else if (name === 'rothko') {
      // 추상표현주의 · 로스코 색면
      ctx.fillStyle = '#7a1f12'; ctx.fillRect(0, 0, w, h);
      const band = (y, hh, col) => { ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 40; ctx.fillStyle = col; ctx.fillRect(w * 0.12, y, w * 0.76, hh); ctx.restore(); };
      band(h * 0.10, h * 0.34, '#e2541d'); band(h * 0.52, h * 0.36, '#f0a93b');
    } else if (name === 'seurat') {
      // 신인상주의 · 쇠라 점묘 (점묘 = 색 군집화)
      ctx.fillStyle = '#e8e0c8'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) {
        const x = Math.random() * w, y = Math.random() * h, t = y / h;
        const base = t < 0.55 ? (Math.random() < 0.5 ? [120, 170, 220] : [210, 190, 120]) : (Math.random() < 0.5 ? [110, 160, 70] : [200, 140, 90]);
        ctx.fillStyle = `rgb(${base[0]+(Math.random()*40-20)|0},${base[1]+(Math.random()*40-20)|0},${base[2]+(Math.random()*40-20)|0})`;
        ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 7); ctx.fill();
      }
    } else if (name === 'monet') {
      // 인상주의 · 모네 〈수련〉
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#3f6f8e'); g.addColorStop(0.5, '#5b8f86'); g.addColorStop(1, '#2f5d6e');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 0.5;
      const cols = ['#cfe3d4', '#9cc0d8', '#e9b9cf', '#b7d39a', '#f3e2a0', '#7fa9c9'];
      for (let i = 0; i < 420; i++) { ctx.fillStyle = cols[i % cols.length]; ctx.beginPath(); ctx.ellipse(rnd(0, w), rnd(0, h), rnd(8, 26), rnd(4, 12), rnd(0, 3), 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1; for (let i = 0; i < 14; i++) { ctx.fillStyle = '#d96fa0'; ctx.beginPath(); ctx.arc(rnd(40, w - 40), rnd(40, h - 40), rnd(5, 11), 0, 7); ctx.fill(); }
    } else if (name === 'hokusai') {
      // 우키요에 · 호쿠사이 〈가나가와 해변의 높은 파도〉
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#dfe7ec'); g.addColorStop(1, '#9fb6c2'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#3a4a63'; ctx.beginPath(); ctx.moveTo(w * 0.5, h * 0.42); ctx.lineTo(w * 0.66, h * 0.62); ctx.lineTo(w * 0.34, h * 0.62); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#eef2f5'; ctx.beginPath(); ctx.moveTo(w * 0.5, h * 0.42); ctx.lineTo(w * 0.56, h * 0.5); ctx.lineTo(w * 0.44, h * 0.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1c3f6e'; ctx.beginPath(); ctx.moveTo(0, h); ctx.bezierCurveTo(w * 0.2, h * 0.5, w * 0.4, h * 0.5, w * 0.55, h * 0.7); ctx.bezierCurveTo(w * 0.7, h * 0.98, w * 0.3, h, 0, h); ctx.fill();
      ctx.fillStyle = '#2e6aa6'; ctx.beginPath(); ctx.arc(w * 0.42, h * 0.66, w * 0.22, Math.PI, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f3f7fa'; for (let i = 0; i < 240; i++) ctx.fillRect(rnd(0, w * 0.72), rnd(h * 0.5, h), rnd(1, 4), rnd(1, 4));
    } else if (name === 'kandinsky') {
      // 추상 · 칸딘스키
      ctx.fillStyle = '#1d2540'; ctx.fillRect(0, 0, w, h);
      const cols = ['#ff5a5f', '#ffb400', '#00b3a4', '#2e86de', '#e056fd', '#f6e58d'];
      for (let i = 0; i < 26; i++) { ctx.globalAlpha = 0.6; ctx.fillStyle = cols[i % cols.length]; const x = rnd(0, w), y = rnd(0, h), r = rnd(30, 160); ctx.beginPath(); if (i % 3 === 0) ctx.rect(x - r / 2, y - r / 2, r, r); else ctx.arc(x, y, r / 2, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1; ctx.lineWidth = 2; ctx.strokeStyle = '#fff';
      for (let i = 0; i < 14; i++) { ctx.beginPath(); ctx.moveTo(rnd(0, w), rnd(0, h)); ctx.lineTo(rnd(0, w), rnd(0, h)); ctx.stroke(); }
    } else if (name === 'malevich') {
      // 절대주의 · 말레비치
      ctx.fillStyle = '#efe9da'; ctx.fillRect(0, 0, w, h);
      ctx.save(); ctx.translate(w * 0.48, h * 0.46); ctx.rotate(0.06); ctx.fillStyle = '#16161a'; ctx.fillRect(-w * 0.2, -w * 0.2, w * 0.4, w * 0.4); ctx.restore();
      ctx.save(); ctx.translate(w * 0.76, h * 0.76); ctx.rotate(-0.15); ctx.fillStyle = '#d4202a'; ctx.fillRect(-w * 0.08, -w * 0.08, w * 0.16, w * 0.16); ctx.restore();
    } else {
      // 신조형주의 · 몬드리안 (기본)
      ctx.fillStyle = '#f4f1e6'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#c41e25'; ctx.fillRect(0, 0, w * 0.42, h * 0.46);
      ctx.fillStyle = '#1d4e9c'; ctx.fillRect(0, h * 0.74, w * 0.30, h * 0.26);
      ctx.fillStyle = '#f5cf2e'; ctx.fillRect(w * 0.80, h * 0.52, w * 0.20, h * 0.48);
      ctx.fillStyle = '#111'; const L = 12;
      ctx.fillRect(w * 0.42 - L / 2, 0, L, h); ctx.fillRect(w * 0.80 - L / 2, 0, L, h);
      ctx.fillRect(0, h * 0.46 - L / 2, w * 0.42, L); ctx.fillRect(0, h * 0.74 - L / 2, w * 0.42, L); ctx.fillRect(w * 0.80, h * 0.52 - L / 2, w * 0.20, L);
    }
    return cv;
  }

  /* ------------------------------------------------------------------ */
  /* 실제 명화(퍼블릭 도메인 · 위키미디어 공용) — 공교육용. 오프라인이면 절차적 데모로 대체. */
  /* ------------------------------------------------------------------ */
  const UP = 'https://upload.wikimedia.org/wikipedia/commons/thumb/';
  const PAINTINGS = {
    starrynight: { title: '고흐 · 별이 빛나는 밤 (1889)', demo: 'starrynight', url: UP + 'e/ea/Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg/960px-Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg' },
    seurat: { title: '쇠라 · 그랑드자트섬의 일요일 오후 (1884)', demo: 'seurat', url: UP + '7/7d/A_Sunday_on_La_Grande_Jatte%2C_Georges_Seurat%2C_1884.jpg/960px-A_Sunday_on_La_Grande_Jatte%2C_Georges_Seurat%2C_1884.jpg' },
    monet: { title: '모네 · 인상, 해돋이 (1872)', demo: 'monet', url: UP + '5/54/Claude_Monet%2C_Impression%2C_soleil_levant.jpg/960px-Claude_Monet%2C_Impression%2C_soleil_levant.jpg' },
    hokusai: { title: '호쿠사이 · 가나가와 해변의 높은 파도 (1831)', demo: 'hokusai', url: UP + 'a/a5/Tsunami_by_hokusai_19th_century.jpg/960px-Tsunami_by_hokusai_19th_century.jpg' },
    mondrian: { title: '몬드리안 · 빨강·파랑·노랑의 구성 (1930)', demo: 'mondrian', url: UP + 'a/a4/Piet_Mondriaan%2C_1930_-_Mondrian_Composition_II_in_Red%2C_Blue%2C_and_Yellow.jpg/960px-Piet_Mondriaan%2C_1930_-_Mondrian_Composition_II_in_Red%2C_Blue%2C_and_Yellow.jpg' },
    kandinsky: { title: '칸딘스키 · 구성 7 (1913)', demo: 'kandinsky', url: UP + 'b/b4/Vassily_Kandinsky%2C_1913_-_Composition_7.jpg/960px-Vassily_Kandinsky%2C_1913_-_Composition_7.jpg' },
    monalisa: { title: '다 빈치 · 모나리자 (1503)', demo: 'monet', url: UP + 'e/ec/Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg/960px-Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg' },
    pearl: { title: '베르메르 · 진주 귀고리를 한 소녀 (1665)', demo: 'monet', url: UP + '0/0f/1665_Girl_with_a_Pearl_Earring.jpg/960px-1665_Girl_with_a_Pearl_Earring.jpg' },
    klimt: { title: '클림트 · 키스 (1908)', demo: 'kandinsky', url: UP + '8/84/Gustav_Klimt_046.jpg/960px-Gustav_Klimt_046.jpg' },
    scream: { title: '뭉크 · 절규 (1893)', demo: 'starrynight', url: UP + 'c/c5/Edvard_Munch%2C_1893%2C_The_Scream%2C_oil%2C_tempera_and_pastel_on_cardboard%2C_91_x_73_cm%2C_National_Gallery_of_Norway.jpg/960px-Edvard_Munch%2C_1893%2C_The_Scream%2C_oil%2C_tempera_and_pastel_on_cardboard%2C_91_x_73_cm%2C_National_Gallery_of_Norway.jpg' }
  };
  // 명화 1점을 실제 이미지로 불러온다. onReady(canvas, title). 실패(오프라인/차단/타이팅)면
  // 같은 사조의 절차적 데모로 부드럽게 대체해 수업이 멈추지 않게 한다.
  function loadPainting(name, onReady, onFail) {
    const p = PAINTINGS[name];
    const fallback = (title) => { onReady(generateDemo((p && p.demo) || name || 'mondrian', 640, 480), title || (p && p.title) || '', true); onFail && onFail(); };
    if (!p) { fallback(); return; }
    const img = new Image(); img.crossOrigin = 'anonymous';
    let done = false; const to = setTimeout(() => { if (!done) { done = true; fallback(p.title); } }, 9000);
    img.onload = () => {
      if (done) return; done = true; clearTimeout(to);
      const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
      try { ctx.getImageData(0, 0, 1, 1); } catch (e) { fallback(p.title); return; }  // CORS 타이팅 시 대체
      onReady(cv, p.title, false);
    };
    img.onerror = () => { if (done) return; done = true; clearTimeout(to); fallback(p.title); };
    img.src = p.url;
  }

  global.ImageAnalysis = { analyze, generateDemo, rgb2lab, luminance, PAINTINGS, loadPainting };
})(window);
