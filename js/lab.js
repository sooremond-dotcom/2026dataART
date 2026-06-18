/*
 * lab.js — 알고리즘 분석실 로직
 */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const state = { K: 8, space: 'rgb', levels: 4, th: 128, notan: 2, contrast: 0, cell: 16, seed: 12345 };
  let src = null, lastPalette = [], lastComp = null, lastStats = null, lastHarmony = null;
  const MEMO_KEY = 'dn_lab_memos';

  function setBusy(on) { $('#busy').classList.toggle('hide', !on); }
  function blit(id, c) { const cv = document.getElementById(id); cv.width = c.width; cv.height = c.height; cv.getContext('2d').drawImage(c, 0, 0); }
  function swatches(id, pal) {
    document.getElementById(id).innerHTML = pal.map(p =>
      `<div class="sw" style="background:rgb(${p.r},${p.g},${p.b})"><small>${Math.round(p.ratio * 100)}%</small></div>`).join('');
  }
  const hex = p => '#' + [p.r, p.g, p.b].map(v => v.toString(16).padStart(2, '0')).join('');

  function loadDemo(name) { src = ImageAnalysis.generateDemo(name, 640, 480); afterLoad(); }
  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) { UI.toast('이미지 파일을 넣어 주세요.'); return; }
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); src = c; URL.revokeObjectURL(url); afterLoad(); };
    img.onerror = () => UI.toast('이미지를 불러오지 못했습니다.');
    img.src = url;
  }
  function afterLoad() {
    const t = $('#thumb'), ctx = t.getContext('2d');
    const ar = src.width / src.height; t.width = 120; t.height = Math.round(120 / ar);
    ctx.drawImage(src, 0, 0, t.width, t.height);
    runAll();
  }

  function runAll() {
    if (!src) return;
    setBusy(true);
    requestAnimationFrame(() => setTimeout(() => {
      try {
        const km = Algos.kmeansArt(src, { K: state.K, space: state.space, seed: state.seed });
        lastPalette = km.palette;
        blit('rc-kmeans', km.recreate); swatches('pal-kmeans', km.palette);

        lastStats = Charts.computeStats(src);
        drawCharts();
        renderHarmony(lastPalette);

        blit('rc-poster', Algos.posterize(src, { levels: state.levels }).recreate);
        blit('rc-notan', Algos.notan(src, { threshold: state.th, levels: state.notan, contrast: state.contrast / 100 }).recreate);
        blit('rc-edge', Algos.edges(src, {}).recreate);
        const mc = Algos.medianCut(src, { K: state.K }); blit('rc-median', mc.recreate); swatches('pal-median', mc.palette);
        blit('rc-mosaic', Algos.mosaic(src, { cell: state.cell }).recreate);
        const comp = Algos.composition(src); lastComp = comp; blit('rc-comp', comp.recreate);
        const lr = Math.round(comp.balanceLR * 100), tb = Math.round(comp.balanceTB * 100);
        $('#comp-info').innerHTML = `무게중심 (${comp.centroid.x}, ${comp.centroid.y}) · 좌우 ${lr}:${100 - lr} · 상하 ${tb}:${100 - tb}`;
        applyCVD('normal');
      } catch (e) { console.error(e); UI.toast('분석 오류: ' + e.message); }
      finally { setBusy(false); }
    }, 10));
  }
  function drawCharts() {
    if (!lastStats || !lastPalette.length) return;
    Charts.donut($('#cv-donut'), lastPalette);
    if ($('#cv-rose')) Charts.rose($('#cv-rose'), lastPalette);
    Charts.bars($('#cv-bars'), lastPalette);
    Charts.scatter($('#cv-scatter'), lastStats.samples, lastPalette);
    Charts.rgbHist($('#cv-rgbhist'), lastStats.rgbHist);
    Charts.wheel($('#cv-wheel'), lastStats.hueBins);
    Charts.valueHist($('#cv-value'), lastStats.valueHist, state.contrast / 100);
    Charts.heatmap($('#cv-heatmap'), lastStats.samples);
  }
  function renderHarmony(pal) {
    if (!pal || !pal.length || !window.Harmony) return;
    const h = window.Harmony.analyze(pal); lastHarmony = h;
    const rel = [];
    if (h.relations.complementary) rel.push('보색 대비');
    if (h.relations.triadic) rel.push('삼각 조화');
    if (h.relations.analogous) rel.push('유사색 조화');
    $('#harmony-relations').innerHTML = `지배색 <b>${h.dominantName}</b> (${h.dominantHue}°) · ` +
      (rel.length ? '발견된 관계: <b style="color:var(--accent)">' + rel.join(', ') + '</b>' : '뚜렷한 조화 관계는 약해요(중성·복합 팔레트).');
    const row = (name, arr) => `<div style="margin:7px 0"><div class="muted" style="font-size:11px;margin-bottom:3px">${name}</div><div class="swatches">${arr.map(c => `<div class="sw" style="background:rgb(${c.r},${c.g},${c.b})"></div>`).join('')}</div></div>`;
    $('#harmony-suggest').innerHTML = row('보색 Complementary', h.suggestions.complementary) +
      row('유사 Analogous', h.suggestions.analogous) + row('삼각 Triadic', h.suggestions.triadic) + row('분할보색 Split', h.suggestions.split);
    applyHarmony('triadic'); // 기본 미리보기
  }
  const HARM_LBL = { complementary: '보색', analogous: '유사', triadic: '삼각', split: '분할보색' };
  function applyHarmony(type) {
    if (!src || !lastHarmony || !window.Algos) return;
    const pal = lastHarmony.suggestions[type]; if (!pal) return;
    blit('rc-harmony', Algos.recolor(src, pal));
    const tag = $('#harm-tag'); if (tag) tag.textContent = (HARM_LBL[type] || '') + ' 조화';
  }
  const CVD_LBL = { normal: '정상', deutan: '녹색맹', protan: '적색맹', tritan: '청색맹' };
  function applyCVD(type) {
    if (!src || !window.Algos) return;
    blit('rc-cvd', Algos.cvd(src, type).recreate);
    const tag = $('#cvd-tag'); if (tag) tag.textContent = CVD_LBL[type] || '정상';
  }

  /* 메모 저장/복원 */
  function loadMemos() {
    let m = {}; try { m = JSON.parse(localStorage.getItem(MEMO_KEY) || '{}'); } catch (e) {}
    document.querySelectorAll('[data-memo]').forEach(t => { if (m[t.dataset.memo]) t.value = m[t.dataset.memo]; });
  }
  function getMemos() {
    const m = {}; document.querySelectorAll('[data-memo]').forEach(t => { if (t.value.trim()) m[t.dataset.memo] = t.value.trim(); });
    return m;
  }
  function saveMemos() { localStorage.setItem(MEMO_KEY, JSON.stringify(getMemos())); }

  /* 리포트 */
  function report() {
    const m = getMemos();
    const labels = { donut: '비율 도넛', bars: '정렬 막대', scatter: '색공간 산점도', rgbhist: 'RGB 히스토그램', wheel: '색상환', value: '명도/톤', heatmap: '색 분포 히트맵',
      kmeans: 'K-means', histogram: '색 히스토그램(포스터화)', notan: '명도·노탄', edge: '에지(Sobel)', mediancut: '중앙값 분할', mosaic: '모자이크', composition: '구도', harmony: '색채 조화' };
    let md = `# 알고리즘 분석 리포트 (부록 A)\n\n## 전처리\n- 색공간 ${state.space.toUpperCase()} · K=${state.K} · 포스터 ${state.levels}단 · 노탄 임계값 ${state.th} · 모자이크 ${state.cell}px\n\n`;
    md += `## 팔레트 (K-means, 비율 내림차순)\n| # | HEX | RGB | 비율 |\n|---|---|---|---|\n`;
    md += lastPalette.map((p, i) => `| ${i + 1} | ${hex(p)} | ${p.r},${p.g},${p.b} | ${Math.round(p.ratio * 100)}% |`).join('\n');
    if (lastComp) md += `\n\n## 구도\n- 밝기 무게중심 (${lastComp.centroid.x}, ${lastComp.centroid.y}) · 좌우균형 ${Math.round(lastComp.balanceLR * 100)}% · 상하균형 ${Math.round(lastComp.balanceTB * 100)}%\n`;
    if (lastHarmony) { const rel = [lastHarmony.relations.complementary && '보색', lastHarmony.relations.triadic && '삼각', lastHarmony.relations.analogous && '유사'].filter(Boolean).join(', '); md += `\n## 색채 조화\n- 지배색 ${lastHarmony.dominantName}(${lastHarmony.dominantHue}°) · 관계: ${rel || '약함'}\n`; }
    md += `\n## 해석 메모\n`;
    const keys = Object.keys(labels).filter(k => m[k]);
    md += keys.length ? keys.map(k => `### ${labels[k]}\n${m[k]}`).join('\n\n') : '_(메모가 비어 있습니다. 각 카드 아래에 근거를 적어 보세요.)_';
    md += `\n\n## 한계(공통)\nK-means·히스토그램은 위치를, 에지는 색의 의미를 모릅니다. 모든 결과는 손실 있는 근사이며 '정답'이 아닙니다.\n\n_생성: ${new Date().toLocaleString('ko-KR')}_\n`;
    const blob = new Blob([md], { type: 'text/markdown' });
    const a = document.createElement('a'); a.download = 'lab_report_' + Date.now() + '.md'; a.href = URL.createObjectURL(blob); a.click();
    UI.toast('리포트(.md)를 저장했습니다.');
  }

  async function saveNote() {
    const u = Auth.current();
    if (!u) { UI.toast('저장하려면 로그인하세요.'); setTimeout(() => location.href = 'index.html?next=lab.html', 900); return; }
    await Store.saveNote({ userId: u.userId, by: u.display, kind: 'lab', title: '분석실 해석 메모',
      memos: getMemos(), palette: lastPalette.map(hex), composition: lastComp ? lastComp.centroid : null });
    UI.toast('작업노트에 저장했습니다.');
  }

  function bindRange(id, out, key, fmt) {
    const el = $('#' + id);
    el.addEventListener('input', () => { state[key] = +el.value; $('#' + out).textContent = fmt ? fmt(+el.value) : el.value; });
    el.addEventListener('change', runAll);
  }

  document.addEventListener('DOMContentLoaded', () => {
    UI.mountIdeaBar('idea', 'lab');
    loadMemos();
    $('#btn-upload').addEventListener('click', () => $('#file').click());
    $('#file').addEventListener('change', e => { if (e.target.files[0]) loadFile(e.target.files[0]); });
    $('#sel-demo').addEventListener('change', e => loadDemo(e.target.value));
    $('#sel-space').addEventListener('change', e => { state.space = e.target.value; runAll(); });
    bindRange('rng-k', 'out-k', 'K');
    bindRange('rng-levels', 'out-levels', 'levels');
    bindRange('rng-th', 'out-th', 'th');
    bindRange('rng-notan', 'out-notan', 'notan');
    bindRange('rng-contrast', 'out-contrast', 'contrast');
    bindRange('rng-cell', 'out-cell', 'cell');
    $('#btn-run').addEventListener('click', runAll);
    $('#btn-report').addEventListener('click', report);
    $('#btn-save-note').addEventListener('click', saveNote);
    document.querySelectorAll('[data-memo]').forEach(t => t.addEventListener('input', saveMemos));
    document.querySelectorAll('[data-harm]').forEach(b => b.addEventListener('click', () => applyHarmony(b.dataset.harm)));
    document.querySelectorAll('[data-cvd]').forEach(b => b.addEventListener('click', () => applyCVD(b.dataset.cvd)));
    const send = $('#btn-send-studio');
    if (send) send.addEventListener('click', () => {
      const cv = document.getElementById('rc-harmony');
      if (!cv || !cv.width) { UI.toast('먼저 분석하세요.'); return; }
      try {
        localStorage.setItem('dn_studio_image', cv.toDataURL('image/png'));
        localStorage.setItem('dn_studio_image_title', ($('#harm-tag') ? $('#harm-tag').textContent : '조화') + ' 재창조');
      } catch (e) { UI.toast('이미지 전달 실패(용량).'); return; }
      UI.toast('색 군집 스튜디오로 보냅니다…');
      setTimeout(() => location.href = 'studio-color.html', 500);
    });

    // 드래그&드롭
    const drop = document.body;
    ['dragover', 'drop'].forEach(ev => drop.addEventListener(ev, e => e.preventDefault()));
    drop.addEventListener('drop', e => { if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });

    let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(drawCharts, 200); });
    loadDemo('starrynight');
  });
})();
