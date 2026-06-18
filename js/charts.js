/*
 * charts.js — 색 분석 차트 (캔버스 2D, 가벼움·의존성 없음)
 * -----------------------------------------------------------------------------
 * 비율 도넛 / 정렬 막대 / 색공간 산점도(군집 중심 표시) / RGB 채널 히스토그램
 * / 색상환 분포 / 명도 히스토그램. 각 차트는 캔버스 하나에 그린다.
 */
(function (global) {
  'use strict';

  function setup(cv, cssH) {
    const dpr = Math.min(global.devicePixelRatio || 1, 2);
    const w = cv.clientWidth || cv.parentElement.clientWidth || 320;
    const h = cssH || Math.round(w * 0.62);
    cv.width = w * dpr; cv.height = h * dpr;
    cv.style.height = h + 'px';
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }
  const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#fff';

  // 작은 캔버스에서 통계 계산
  function computeStats(src, maxDim) {
    maxDim = maxDim || 220;
    const s = Math.min(1, maxDim / Math.max(src.width, src.height));
    const w = Math.max(1, Math.round(src.width * s)), h = Math.max(1, Math.round(src.height * s));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(src, 0, 0, w, h);
    const d = cx.getImageData(0, 0, w, h).data, n = w * h;
    const rgbHist = [new Float64Array(256), new Float64Array(256), new Float64Array(256)];
    const valueHist = new Float64Array(256);
    const hueBins = new Float64Array(36);
    const samples = [];
    const step = Math.max(1, Math.floor(n / 1600));
    for (let i = 0; i < n; i++) {
      const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
      rgbHist[0][r]++; rgbHist[1][g]++; rgbHist[2][b]++;
      valueHist[Math.round(lum(r, g, b))]++;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dl = mx - mn;
      if (dl > 18) {
        let hh = 0;
        if (mx === r) hh = ((g - b) / dl) % 6; else if (mx === g) hh = (b - r) / dl + 2; else hh = (r - g) / dl + 4;
        hh = (hh * 60 + 360) % 360;
        hueBins[Math.floor(hh / 10) % 36] += dl / 255; // 채도가 큰 색일수록 강하게
      }
      if (i % step === 0) samples.push([r, g, b]);
    }
    return { w, h, rgbHist, valueHist, hueBins, samples };
  }

  const Charts = { computeStats };

  // 비율 도넛
  Charts.donut = function (cv, palette) {
    const { ctx, w, h } = setup(cv, cv.clientWidth * 0.6);
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.42, r = R * 0.56;
    let a0 = -Math.PI / 2;
    palette.forEach(p => {
      const a1 = a0 + p.ratio * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
      ctx.arc(cx, cy, R, a0, a1); ctx.closePath(); ctx.fill();
      a0 = a1;
    });
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = css('--muted'); ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('상위 ' + Math.round((palette[0] ? palette[0].ratio : 0) * 100) + '%', cx, cy + 4);
  };

  // 정렬 막대
  Charts.bars = function (cv, palette) {
    const { ctx, w, h } = setup(cv);
    const pad = 8, n = palette.length, bw = (w - pad * 2) / n;
    const max = Math.max(...palette.map(p => p.ratio), 0.001);
    palette.forEach((p, i) => {
      const bh = (p.ratio / max) * (h - 30);
      const x = pad + i * bw;
      ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
      ctx.fillRect(x + 1, h - 18 - bh, bw - 2, bh);
      ctx.fillStyle = css('--muted'); ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(Math.round(p.ratio * 100) + '%', x + bw / 2, h - 5);
    });
  };

  // 방사형 막대(rose) — 각 색이 막대, 길이=비율, 색상 순으로 둘러 배열
  Charts.rose = function (cv, palette) {
    const { ctx, w, h } = setup(cv, cv.clientWidth * 0.62);
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.44;
    const toHsl = (r, g, b) => {
      r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let hh, s, l = (mx + mn) / 2;
      if (mx === mn) { hh = s = 0; } else { const dd = mx - mn; s = l > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn); hh = mx === r ? (g - b) / dd + (g < b ? 6 : 0) : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4; hh /= 6; }
      return [hh * 360, s, l];
    };
    const arr = palette.map(p => { const c = toHsl(p.r, p.g, p.b); return { p, h: c[0], s: c[1], l: c[2] }; })
      .sort((a, b) => (a.s < 0.12 && b.s < 0.12) ? a.l - b.l : (a.s < 0.12 ? -1 : (b.s < 0.12 ? 1 : a.h - b.h)));
    const n = arr.length, maxR = Math.max(...palette.map(p => p.ratio), 0.001), aw = Math.PI * 2 / n;
    ctx.strokeStyle = 'rgba(127,127,127,0.18)'; ctx.lineWidth = 1;
    [1 / 3, 2 / 3, 1].forEach(f => { ctx.beginPath(); ctx.arc(cx, cy, R * f, 0, Math.PI * 2); ctx.stroke(); });
    arr.forEach((o, i) => {
      const a0 = -Math.PI / 2 + i * aw, a1 = a0 + aw * 0.9, rr = Math.max(R * 0.03, R * (o.p.ratio / maxR));
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, rr, a0, a1); ctx.closePath();
      ctx.fillStyle = `rgb(${o.p.r},${o.p.g},${o.p.b})`; ctx.fill();
    });
    ctx.fillStyle = css('--muted'); ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('길이 = 비율 · 색상 순', cx, h - 4);
  };

  // 색공간 산점도 + 군집 중심
  Charts.scatter = function (cv, samples, palette) {
    const { ctx, w, h } = setup(cv);
    const pad = 26;
    const px = (r, g, b) => pad + ((r - b + 255) / 510) * (w - pad * 2);
    const py = (r, g, b) => pad + (1 - lum(r, g, b) / 255) * (h - pad * 2);
    // 축
    ctx.strokeStyle = css('--line'); ctx.lineWidth = 1;
    ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
    ctx.fillStyle = css('--muted'); ctx.font = '10px sans-serif';
    ctx.textAlign = 'center'; ctx.fillText('← 파랑      빨강 →', w / 2, h - 8);
    ctx.save(); ctx.translate(11, h / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText('← 밝음     어두움 →', 0, 0); ctx.restore();
    // 표본 점
    samples.forEach(s => {
      ctx.fillStyle = `rgba(${s[0]},${s[1]},${s[2]},0.5)`;
      ctx.fillRect(px(s[0], s[1], s[2]) - 1.2, py(s[0], s[1], s[2]) - 1.2, 2.4, 2.4);
    });
    // 군집 중심
    (palette || []).forEach(p => {
      const x = px(p.r, p.g, p.b), y = py(p.r, p.g, p.b);
      ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5);
      ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1; ctx.stroke();
    });
  };

  // RGB 채널 히스토그램
  Charts.rgbHist = function (cv, rgbHist) {
    const { ctx, w, h } = setup(cv);
    const cols = ['rgba(255,90,106,.85)', 'rgba(81,216,138,.85)', 'rgba(78,195,255,.85)'];
    const max = Math.max(1, ...rgbHist.map(ch => Math.max(...ch)));
    for (let c = 0; c < 3; c++) {
      ctx.beginPath();
      for (let i = 0; i < 256; i++) {
        const x = (i / 255) * w, y = h - (rgbHist[c][i] / max) * (h - 6);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = cols[c]; ctx.lineWidth = 1.4; ctx.stroke();
    }
  };

  // 색상환 분포(폴라 막대)
  Charts.wheel = function (cv, hueBins) {
    const { ctx, w, h } = setup(cv, cv.clientWidth * 0.7);
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.44;
    const max = Math.max(1, ...hueBins);
    ctx.strokeStyle = css('--line'); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 36; i++) {
      const ang = (i * 10 - 90) * Math.PI / 180;
      const len = (hueBins[i] / max) * R;
      ctx.strokeStyle = `hsl(${i * 10}, 80%, 55%)`; ctx.lineWidth = (Math.PI * 2 * R / 36) * 0.7;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len); ctx.stroke();
    }
  };

  // 명도 히스토그램 + 톤커브(대비 반영)
  Charts.valueHist = function (cv, valueHist, contrast) {
    const { ctx, w, h } = setup(cv);
    const max = Math.max(1, ...valueHist);
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#000'); g.addColorStop(1, '#fff');
    ctx.fillStyle = 'rgba(160,170,200,.25)';
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let i = 0; i < 256; i++) ctx.lineTo((i / 255) * w, h - (valueHist[i] / max) * (h - 6));
    ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    // 하단 명도 띠
    ctx.fillStyle = g; ctx.fillRect(0, h - 5, w, 5);
    // 톤커브 (대비 contrast: -1~1, 0이면 항등선)
    const c = contrast || 0, cf = (259 * (c * 255 + 255)) / (255 * (259 - c * 255));
    ctx.strokeStyle = 'rgba(255,180,84,.85)'; ctx.lineWidth = 1.6;
    if (!c) ctx.setLineDash([4, 4]);
    ctx.beginPath();
    for (let x = 0; x <= w; x += 4) {
      const L = (x / w) * 255; let L2 = cf * (L - 128) + 128; L2 = L2 < 0 ? 0 : L2 > 255 ? 255 : L2;
      const y = h - (L2 / 255) * h; x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke(); ctx.setLineDash([]);
  };

  // 색 분포 히트맵: x=색상(빨강→보라), y=밝기(아래 어두움→위 밝음), 칸 색=그 색, 진하기=밀도
  Charts.heatmap = function (cv, samples) {
    const { ctx, w, h } = setup(cv);
    const HX = 36, HY = 16, grid = new Float64Array(HX * HY); let max = 0;
    (samples || []).forEach(s => {
      const r = s[0], g = s[1], b = s[2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      if (d < 14) return;
      let hue; if (mx === r) hue = ((g - b) / d) % 6; else if (mx === g) hue = (b - r) / d + 2; else hue = (r - g) / d + 4;
      hue = (hue * 60 + 360) % 360;
      const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const xx = Math.min(HX - 1, Math.floor(hue / 360 * HX)), yy = Math.min(HY - 1, Math.floor(L * HY));
      const i = yy * HX + xx; grid[i]++; if (grid[i] > max) max = grid[i];
    });
    const cw = w / HX, ch = h / HY;
    for (let y = 0; y < HY; y++) for (let x = 0; x < HX; x++) {
      const v = grid[y * HX + x]; if (v <= 0) continue;
      ctx.globalAlpha = Math.min(1, 0.16 + v / (max || 1) * 0.84);
      ctx.fillStyle = `hsl(${x / HX * 360},75%,${Math.max(28, Math.min(72, (y + 0.5) / HY * 100))}%)`;
      ctx.fillRect(x * cw, h - (y + 1) * ch, cw + 0.6, ch + 0.6);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = css('--muted'); ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('← 색상(빨강→보라) →', w / 2, h - 3);
  };

  global.Charts = Charts;
})(window);
