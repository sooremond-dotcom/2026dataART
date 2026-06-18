/*
 * harmony.js — 색채 조화 분석 · 추천 (순수 함수, 의존성 없음)
 * -----------------------------------------------------------------------------
 * K-means 팔레트(대표색)를 HSL 색상환으로 옮겨, 그림에 들어 있는 조화 관계
 * (보색·삼각·유사)를 탐지하고, 지배색을 기준으로 보색/유사/삼각/분할보색
 * 팔레트를 제안한다. 미술 색채 이론과 데이터 분석을 잇는 다리.
 */
(function (global) {
  'use strict';

  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0; const l = (mx + mn) / 2;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    if (d !== 0) {
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
    }
    return [h, s, l];
  }
  function hsl2rgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x]; else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
    return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
  }
  const hueDist = (a, b) => { let d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

  function analyze(palette) {
    const cols = (palette || []).slice(0, 8).map(p => ({ r: p.r, g: p.g, b: p.b, hsl: rgb2hsl(p.r, p.g, p.b) }));
    const chromatic = cols.filter(c => c.hsl[1] > 0.12); // 채도 있는 색만
    const hues = chromatic.map(c => c.hsl[0]);
    const dom = chromatic[0] || cols[0] || { r: 128, g: 128, b: 128, hsl: [0, 0, 0.5] };
    const domH = dom.hsl[0];

    function hasPair(target, tol) {
      for (let i = 0; i < hues.length; i++) for (let j = i + 1; j < hues.length; j++)
        if (Math.abs(hueDist(hues[i], hues[j]) - target) <= tol) return true;
      return false;
    }
    // 유사색: 세 색 이상이 60° 창 안에 모이면 true
    let analogous = false;
    for (let i = 0; i < hues.length; i++) {
      let cnt = 0; for (const h of hues) if (hueDist(hues[i], h) <= 30) cnt++;
      if (cnt >= 3) { analogous = true; break; }
    }
    const relations = { complementary: hasPair(180, 22), triadic: hasPair(120, 20), analogous };

    const S = Math.max(0.5, dom.hsl[1]), L = Math.min(0.62, Math.max(0.4, dom.hsl[2]));
    const mk = h => hsl2rgb(h, S, L);
    const suggestions = {
      complementary: [mk(domH), mk(domH + 180)],
      analogous: [mk(domH - 30), mk(domH), mk(domH + 30)],
      triadic: [mk(domH), mk(domH + 120), mk(domH + 240)],
      split: [mk(domH), mk(domH + 150), mk(domH + 210)]
    };
    const NAMES = [[15, '빨강'], [45, '주황'], [70, '노랑'], [160, '초록'], [200, '청록'], [255, '파랑'], [290, '보라'], [330, '자홍'], [360, '빨강']];
    let domName = '빨강'; for (const [t, nm] of NAMES) if (domH < t) { domName = nm; break; }

    return { dominantHue: Math.round(domH), dominantName: domName, dominantRgb: { r: dom.r, g: dom.g, b: dom.b }, relations, suggestions };
  }

  global.Harmony = { analyze, rgb2hsl, hsl2rgb };
})(window);
