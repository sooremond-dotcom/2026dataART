/*
 * studio-data.js — 「데이터가 춤추는 점」 · 다중 열 CSV + 매핑 설계
 * -----------------------------------------------------------------------------
 * 데이터의 '어떤 열'을 점의 '어떤 특성'(크기·속도·방향·밀도·투명도·형태·색)으로
 * 매핑할지 학생이 직접 설계한다. 색은 색상환(color picker)에서 고르고, 범주(라벨)별로
 * 색·형태를 상세 지정할 수 있다. 속도·방향은 데이터의 '변화량'(특성)으로 움직인다.
 */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => (window.UI ? UI.escapeHTML(s) : String(s));
  // 캔버스 배경 팔레트(작품의 '공기'). 색 스튜디오와 동일한 6종.
  const BGS = { night: [7, 8, 13], black: [0, 0, 0], ink: [18, 10, 26], slate: [22, 26, 34], paper: [244, 240, 230], white: [248, 249, 252] };
  const bgRGB = () => { const c = BGS[state.bg] || BGS.night; return c[0] + ',' + c[1] + ',' + c[2]; };

  // 예시 데이터를 '사회 문제'와 연결 — 의미 있는 시각화로(데이터=사회현상을 드러내는 시각자료).
  const SAMPLES = {
    climate: { name: '기후위기 · 한반도 평균기온', issue: '🌡 기후위기 — 점이 점점 위로·뜨겁게. 이 변화를 세상에 어떻게 ‘보여줄’까요?', csv: '연도,평균기온\n1980,12.2\n1990,12.6\n2000,13.1\n2010,13.4\n2015,13.6\n2020,13.9\n2023,14.2' },
    finedust: { name: '대기오염 · 월별 초미세먼지', issue: '😷 대기오염 — 봄철 농도가 치솟는 리듬. 보이지 않는 위협을 점으로.', csv: '월,초미세먼지\n1월,42\n2월,55\n3월,68\n4월,60\n5월,38\n6월,28\n7월,22\n8월,20\n9월,26\n10월,34\n11월,46\n12월,50' },
    inequality: { name: '소득 불평등 · 분위별 월소득', issue: '⚖ 불평등 — 1분위와 10분위의 간극을 점의 크기·거리로.', csv: '소득분위,월소득\n1분위,90\n2분위,150\n3분위,210\n4분위,270\n5분위,340\n6분위,420\n7분위,520\n8분위,650\n9분위,850\n10분위,1300' },
    extinction: { name: '지역소멸 · 지역별 인구·청년', issue: '🏚 지역소멸 — 농촌일수록 인구는 줄고 청년은 적게. 사라지는 것을 어떻게 기억할까?', csv: '지역,인구변화율,청년비율\n수도권,5,28\n광역시,-2,22\n중소도시,-8,16\n농촌,-15,9' },
    animal: { name: '동물권 · 연도별 유기동물', issue: '🐾 동물권 — 늘어나는 유기동물 수. 숫자 뒤의 생명을 점으로.', csv: '연도,유기동물수\n2016,89000\n2017,102000\n2018,121000\n2019,135000\n2020,128000\n2021,118000\n2022,113000' },
    emotion: { name: '(개인) 우리 반 하루 감정', issue: '🙂 내 삶의 데이터 — 숫자로는 평온해 보여도 사실은? (데이터 휴머니즘)', csv: '시간,감정온도,활동\n9시,3,수업\n10시,4,발표\n11시,3,토론\n12시,2,점심\n13시,2,휴식\n14시,1,체육\n15시,2,실습\n16시,4,정리\n17시,5,하교' }
  };

  const state = {
    dataset: null, dataName: '',
    mapping: {
      size: null, speed: null, direction: null, density: null, alpha: null, shape: null,
      colorMode: 'gradient', colorField: null,
      gradLow: '#2e86de', gradHigh: '#ff5a5f', solid: '#ffb454',
      catColors: {}, catShapes: {}
    },
    baseSpeed: 1, vib: 1, trail: 200, layout: 'timeline', motionStyle: 'vibrate',
    pointScale: 1, cohesion: 1, bg: 'night'
  };
  let ruleA = null, ruleB = null, abFlag = false, P = null, p5i = null;

  /* ----------------------------- CSV 파싱 ----------------------------- */
  function parseData(text) {
    text = (text || '').trim(); if (!text) return null;
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return null;
    if (lines.length === 1 && !/[^\d.,;\s-]/.test(lines[0])) {       // 한 줄 숫자 목록
      const vals = lines[0].split(/[,\s;]+/).map(Number).filter(v => !isNaN(v));
      if (vals.length < 1) return null;
      return makeDataset([{ name: '값', type: 'num' }], vals.map(v => ({ '값': v })));
    }
    const delim = lines[0].indexOf(',') >= 0 ? ',' : /\t/.test(lines[0]) ? '\t' : /\s{2,}/.test(lines[0]) ? /\s+/ : ',';
    const cells = lines.map(l => (typeof delim === 'string' ? l.split(delim) : l.split(delim)).map(c => c.trim()));
    const firstNonNum = cells[0].some(c => c !== '' && isNaN(Number(c)));
    let header, body;
    if (firstNonNum && cells.length > 1) { header = cells[0]; body = cells.slice(1); }
    else { header = cells[0].map((_, i) => '열' + (i + 1)); body = cells; }
    const cols = header.length;
    const rows = body.filter(r => r.some(c => c !== '')).map(r => { const o = {}; for (let c = 0; c < cols; c++) o[header[c]] = r[c] != null ? r[c] : ''; return o; });
    const fields = header.map(name => {
      const someVal = rows.some(o => o[name] !== '' && o[name] != null);
      const allNum = rows.every(o => o[name] === '' || o[name] == null || !isNaN(Number(o[name])));
      return { name, type: (allNum && someVal) ? 'num' : 'cat' };
    });
    fields.forEach(f => { if (f.type === 'num') rows.forEach(o => { o[f.name] = (o[f.name] === '' || o[f.name] == null) ? null : Number(o[f.name]); }); });
    return makeDataset(fields, rows);
  }
  function makeDataset(fields, rows) {
    const stats = {};
    fields.forEach(f => {
      if (f.type === 'num') {
        let mn = Infinity, mx = -Infinity;
        rows.forEach(r => { const v = r[f.name]; if (v != null && !isNaN(v)) { if (v < mn) mn = v; if (v > mx) mx = v; } });
        if (mn === Infinity) { mn = 0; mx = 1; }
        stats[f.name] = { min: mn, max: mx, range: (mx - mn) || 1 };
      } else {
        const cats = [], seen = {};
        rows.forEach(r => { const v = String(r[f.name]); if (!seen[v]) { seen[v] = 1; cats.push(v); } });
        stats[f.name] = { cats };
      }
    });
    return { fields, rows, n: rows.length, stats };
  }
  const numFields = () => state.dataset ? state.dataset.fields.filter(f => f.type === 'num') : [];
  const catFields = () => state.dataset ? state.dataset.fields.filter(f => f.type === 'cat') : [];
  const fieldType = (name) => { const f = state.dataset.fields.find(x => x.name === name); return f ? f.type : 'num'; };
  function norm(field, i) { const st = state.dataset.stats[field]; if (!st || st.cats) return 0; const v = state.dataset.rows[i][field]; if (v == null || isNaN(v)) return 0; return Math.max(0, Math.min(1, (v - st.min) / st.range)); }
  function delta(field, i) { return i <= 0 ? 0 : norm(field, i) - norm(field, i - 1); }
  function fieldCats(field) { const st = state.dataset.stats[field]; if (st && st.cats) return st.cats; const seen = {}, cats = []; state.dataset.rows.forEach(r => { const v = String(r[field]); if (!seen[v]) { seen[v] = 1; cats.push(v); } }); return cats; }

  /* ----------------------------- 데이터 적용 ----------------------------- */
  function applyDataset(ds, name) {
    if (!ds || !ds.n) { UI.toast('데이터를 읽지 못했어요. 형식을 확인하세요.'); return; }
    state.dataset = ds; if (name != null) state.dataName = name;
    autoMapping(); populateFieldSelects(); renderFieldChips(); renderColorUI(); build();
    $('#data-info').textContent = (state.dataName || '데이터') + ' · ' + ds.n + '행 · 열 ' + ds.fields.length + '개';
  }
  function autoMapping() {
    const nums = numFields().map(f => f.name), cats = catFields().map(f => f.name), m = state.mapping;
    m.size = nums[0] || null; m.speed = nums[0] || null; m.direction = nums[0] || null;
    m.density = nums[1] || nums[0] || null; m.alpha = null; m.shape = cats[cats.length - 1] || null;
    m.colorMode = cats.length ? 'category' : 'gradient';
    m.colorField = m.colorMode === 'category' ? cats[0] : (nums[0] || null);
    m.catColors = {}; m.catShapes = {}; assignCatColors();
  }
  const PAL = ['#ff5a5f', '#ffb454', '#51d88a', '#4ec3ff', '#c08bff', '#f6e58d', '#ff8e53', '#2e86de', '#e056fd', '#00b3a4'];
  function assignCatColors() {
    if (state.mapping.colorMode !== 'category' || !state.mapping.colorField || !state.dataset) return;
    fieldCats(state.mapping.colorField).forEach((c, i) => { if (!state.mapping.catColors[c]) state.mapping.catColors[c] = PAL[i % PAL.length]; });
  }

  /* ----------------------------- 매핑 UI ----------------------------- */
  function fieldOptions(sel, kind, includeNone, selected) {
    if (!sel) return;
    const fields = kind === 'num' ? numFields() : state.dataset.fields;
    let html = includeNone ? '<option value="">— 없음 —</option>' : '';
    fields.forEach(f => { html += '<option value="' + esc(f.name) + '"' + (f.name === selected ? ' selected' : '') + '>' + esc(f.name) + (f.type === 'cat' ? '(범주)' : '') + '</option>'; });
    sel.innerHTML = html;
  }
  function populateFieldSelects() {
    if (!state.dataset) return;
    fieldOptions($('#map-size'), 'num', true, state.mapping.size);
    fieldOptions($('#map-speed'), 'num', true, state.mapping.speed);
    fieldOptions($('#map-dir'), 'num', true, state.mapping.direction);
    fieldOptions($('#map-density'), 'num', true, state.mapping.density);
    fieldOptions($('#map-alpha'), 'num', true, state.mapping.alpha);
    fieldOptions($('#map-shape'), 'any', true, state.mapping.shape);
    fieldOptions($('#map-colorfield'), state.mapping.colorMode === 'category' ? 'any' : 'num', false, state.mapping.colorField);
    $('#map-colormode').value = state.mapping.colorMode;
    $('#map-gradlow').value = state.mapping.gradLow; $('#map-gradhigh').value = state.mapping.gradHigh; $('#map-solid').value = state.mapping.solid;
  }
  function renderFieldChips() {
    const host = $('#field-list'); if (!host) return;
    host.innerHTML = state.dataset.fields.map(f => '<span class="chip ' + f.type + '">' + esc(f.name) + ' · ' + (f.type === 'num' ? '수치' : '범주') + '</span>').join('');
  }
  function renderColorUI() {
    const mode = state.mapping.colorMode;
    $('#color-field-row').style.display = mode === 'solid' ? 'none' : 'flex';
    $('#color-grad').style.display = mode === 'gradient' ? 'flex' : 'none';
    $('#color-solid').style.display = mode === 'solid' ? 'block' : 'none';
    const host = $('#label-config'); host.innerHTML = '';
    if (mode === 'category' && state.mapping.colorField) {
      assignCatColors();
      host.innerHTML += '<div class="muted" style="font-size:11.5px;margin:8px 0 4px">라벨별 색 (색상환에서 선택)</div>' +
        fieldCats(state.mapping.colorField).map(c => '<div class="label-item"><input type="color" data-catcolor="' + esc(c) + '" value="' + (state.mapping.catColors[c] || '#888888') + '"><span>' + esc(c) + '</span></div>').join('');
    }
    if (state.mapping.shape && fieldType(state.mapping.shape) === 'cat') {
      const cats = fieldCats(state.mapping.shape), names = { circle: '●원', tri: '▲삼각', sq: '■사각', diamond: '◆마름모' }, order = ['circle', 'tri', 'sq', 'diamond'];
      cats.forEach((c, i) => { if (!state.mapping.catShapes[c]) state.mapping.catShapes[c] = order[i % 4]; });
      host.innerHTML += '<div class="muted" style="font-size:11.5px;margin:10px 0 4px">라벨별 형태</div>' +
        cats.map(c => '<div class="label-item"><select data-catshape="' + esc(c) + '">' + order.map(s => '<option value="' + s + '"' + (s === state.mapping.catShapes[c] ? ' selected' : '') + '>' + names[s] + '</option>').join('') + '</select><span>' + esc(c) + '</span></div>').join('');
    }
    host.querySelectorAll('[data-catcolor]').forEach(inp => inp.addEventListener('input', e => { state.mapping.catColors[inp.dataset.catcolor] = e.target.value; }));
    host.querySelectorAll('[data-catshape]').forEach(sel => sel.addEventListener('change', e => { state.mapping.catShapes[sel.dataset.catshape] = e.target.value; }));
  }

  /* ----------------------------- 입자 생성 ----------------------------- */
  // 배치(레이아웃): 점이 '어디에서' 살지 — 시간축/원형/격자/값 산포
  function homeOf(i, n, W, H, marg, sizeNorm) {
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.42;
    if (state.layout === 'radial') {
      const a = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2, rr = R * (0.45 + sizeNorm * 0.5);
      return { hx: cx + Math.cos(a) * rr, hy: cy + Math.sin(a) * rr, band: 14 + sizeNorm * 30 };
    }
    if (state.layout === 'grid') {
      const cols = Math.ceil(Math.sqrt(n)), rowsN = Math.ceil(n / cols), gx = i % cols, gy = (i / cols) | 0;
      return { hx: marg + (cols === 1 ? 0.5 : gx / (cols - 1)) * (W - marg * 2), hy: marg + (rowsN === 1 ? 0.5 : gy / (rowsN - 1)) * (H - marg * 2), band: 12 + sizeNorm * 24 };
    }
    if (state.layout === 'flowField') {
      return { hx: marg + (n === 1 ? 0.5 : i / (n - 1)) * (W - marg * 2), hy: H - marg - sizeNorm * (H - marg * 2), band: 14 + sizeNorm * 24 };
    }
    return { hx: marg + (n === 1 ? 0.5 : i / (n - 1)) * (W - marg * 2), hy: H / 2, band: 30 + sizeNorm * 90 }; // timeline
  }
  function build() {
    if (!p5i || !state.dataset) return;
    const W = p5i.width, H = p5i.height, n = state.dataset.n, marg = 50, arr = [];
    for (let i = 0; i < n; i++) {
      const sizeNorm = state.mapping.size ? norm(state.mapping.size, i) : 0.5;
      const dv = state.mapping.density ? norm(state.mapping.density, i) : 0.5;
      const count = state.mapping.density ? Math.round(5 + dv * 45) : 16;
      const hm = homeOf(i, n, W, H, marg, sizeNorm);
      for (let k = 0; k < count; k++) {
        arr.push({ ri: i, hx: hm.hx + (Math.random() - 0.5) * 16, hy: hm.hy + (Math.random() - 0.5) * hm.band, px: hm.hx, py: hm.hy, vx: 0, vy: 0, ph: Math.random() * 6.28 });
      }
    }
    P = arr;
  }

  /* ----------------------------- 색/형태 ----------------------------- */
  function hexToRgb(h) { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function lerpColor(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' + Math.round(A[1] + (B[1] - A[1]) * t) + ',' + Math.round(A[2] + (B[2] - A[2]) * t) + ')'; }
  function colorAt(i) {
    const m = state.mapping;
    if (m.colorMode === 'solid') return m.solid;
    if (m.colorMode === 'category') { if (!m.colorField) return m.solid; return m.catColors[String(state.dataset.rows[i][m.colorField])] || '#888'; }
    return lerpColor(m.gradLow, m.gradHigh, m.colorField ? norm(m.colorField, i) : 0.5);
  }
  function shapeAt(i) {
    const f = state.mapping.shape; if (!f) return 'circle';
    if (fieldType(f) === 'cat') return state.mapping.catShapes[String(state.dataset.rows[i][f])] || 'circle';
    const v = norm(f, i); return v < 0.34 ? 'tri' : v < 0.67 ? 'circle' : 'sq';
  }
  function drawShape(ctx, x, y, r, shape) {
    ctx.beginPath();
    if (shape === 'sq') ctx.rect(x - r, y - r, r * 2, r * 2);
    else if (shape === 'tri') { ctx.moveTo(x, y - r * 1.25); ctx.lineTo(x + r * 1.1, y + r * 0.9); ctx.lineTo(x - r * 1.1, y + r * 0.9); ctx.closePath(); }
    else if (shape === 'diamond') { ctx.moveTo(x, y - r * 1.2); ctx.lineTo(x + r * 1.1, y); ctx.lineTo(x, y + r * 1.2); ctx.lineTo(x - r * 1.1, y); ctx.closePath(); }
    else ctx.arc(x, y, r, 0, 6.283);
    ctx.fill();
  }

  /* ----------------------------- 다른 스튜디오에서 온 데이터 ----------------------------- */
  // 소리·사진·객체감지 스튜디오에서 보낸 데이터를 (있으면) 우선 로드한다.
  // p5 setup 타이밍과 무관하게 결정적으로 동작하도록 setup 안에서 '먼저' 호출한다.
  function loadIncoming() {
    let inc; try { inc = localStorage.getItem('dn_data_incoming'); } catch (e) { return false; }
    if (!inc) return false;
    let d; try { d = JSON.parse(inc); } catch (e) { try { localStorage.removeItem('dn_data_incoming'); } catch (_) {} return false; }
    try { localStorage.removeItem('dn_data_incoming'); } catch (e) {}
    const ds = parseData(d.csv); if (!ds || !ds.n) return false;
    const ta = $('#ta-data'); if (ta) ta.value = d.csv;
    const nm = $('#in-dataname'); if (nm) nm.value = d.name || '가져온 데이터';
    const it = $('#in-intent'); if (it && d.intent) it.value = d.intent;
    const ro = $('#rec-omit'); if (ro && d.omit) ro.value = d.omit;
    const ss = $('#sel-sample'); if (ss) ss.value = '';           // 샘플 드롭다운이 오해를 주지 않게
    applyDataset(ds, d.name || '가져온 데이터');
    const di = $('#data-issue'); if (di) di.textContent = d.issue || '🔗 다른 스튜디오에서 온 데이터예요 — 어떤 열을 점의 무엇으로 바꿀지 설계해 보세요.';
    if (window.UI) UI.toast('다른 스튜디오에서 온 데이터를 불러왔어요.');
    return true;
  }

  /* ----------------------------- p5 스케치 ----------------------------- */
  const sketch = p => {
    p.setup = () => {
      const st = $('#dstage'); const c = p.createCanvas(st.clientWidth, st.clientHeight); c.parent(st); p.pixelDensity(1);
      // 보낸 데이터가 있으면 그것을, 없으면 기본 샘플(기후위기)을 로드
      if (!loadIncoming()) {
        applyDataset(parseData(SAMPLES.climate.csv), SAMPLES.climate.name);
        $('#in-dataname').value = state.dataName; $('#ta-data').value = SAMPLES.climate.csv;
        const di = $('#data-issue'); if (di) di.textContent = SAMPLES.climate.issue;
      }
    };
    p.windowResized = () => { const st = $('#dstage'); p.resizeCanvas(st.clientWidth, st.clientHeight); build(); };
    p.draw = () => {
      const ctx = p.drawingContext, bg = bgRGB();
      ctx.fillStyle = state.trail >= 255 ? 'rgb(' + bg + ')' : 'rgba(' + bg + ',' + (state.trail / 255) + ')';
      ctx.fillRect(0, 0, p.width, p.height);
      if (!P || !state.dataset) return;
      const m = state.mapping, mAct = p.mouseX > 0 && p.mouseY > 0 && p.mouseX < p.width && p.mouseY < p.height;
      const style = state.motionStyle, t = p.frameCount * 0.05, coh = state.cohesion;
      for (const o of P) {
        const i = o.ri;
        const sv = m.size ? norm(m.size, i) : 0.5;
        const dv = m.speed ? Math.abs(delta(m.speed, i)) : 0.25;
        const speed = state.baseSpeed * (0.35 + dv * 1.4);
        const dir = m.direction ? -Math.sign(delta(m.direction, i)) : 0;
        // 움직임 방식: 어떤 ‘식’으로 움직일지
        let ax, ay;
        if (style === 'orbit') {                         // home 주위를 도는 궤도
          ax = (o.hx - o.px) * 0.06 * coh; ay = (o.hy - o.py) * 0.06 * coh;
          const dx = o.px - o.hx, dy = o.py - o.hy;
          ax += -dy * 0.05 * (0.5 + speed); ay += dx * 0.05 * (0.5 + speed);
          ax += (Math.random() - 0.5) * state.vib * speed * 0.5; ay += (Math.random() - 0.5) * state.vib * speed * 0.5;
        } else if (style === 'wave') {                   // 시간에 따라 출렁이는 파동
          ax = (o.hx - o.px) * 0.06 * coh; ay = (o.hy - o.py) * 0.05 * coh;
          ay += Math.sin(t + o.ph + i * 0.25) * speed * 1.3;
          ax += (Math.random() - 0.5) * state.vib * speed * 0.4;
        } else if (style === 'burst') {                  // 방향대로 분출(약한 복귀)
          ax = (o.hx - o.px) * 0.02 * coh; ay = (o.hy - o.py) * 0.02 * coh;
          ay += dir * speed * 0.9; ax += (Math.random() - 0.5) * state.vib * speed; ay += (Math.random() - 0.5) * state.vib * speed;
        } else {                                         // vibrate(기본): 제자리 진동 + 방향 드리프트
          ax = (o.hx - o.px) * 0.06 * coh; ay = (o.hy - o.py) * 0.03 * coh;
          ay += dir * speed * 0.55;
          ax += (Math.random() - 0.5) * state.vib * speed; ay += (Math.random() - 0.5) * state.vib * speed;
        }
        if (mAct) { const dx = o.px - p.mouseX, dy = o.py - p.mouseY, d2 = dx * dx + dy * dy; if (d2 < 9000) { const d = Math.sqrt(d2) + .1, f = (1 - d / 95) * 4; ax += dx / d * f; ay += dy / d * f; } }
        o.vx = (o.vx + ax) * 0.9; o.vy = (o.vy + ay) * 0.9; o.px += o.vx; o.py += o.vy;
        const r = (1.5 + sv * 7 * (m.size ? 1 : 0.45)) * state.pointScale;
        ctx.globalAlpha = m.alpha ? (0.18 + norm(m.alpha, i) * 0.82) : 1;
        ctx.fillStyle = colorAt(i);
        drawShape(ctx, o.px, o.py, r, shapeAt(i));
      }
      ctx.globalAlpha = 1;
    };
  };

  /* ----------------------------- 규칙 A/B ----------------------------- */
  function snapRule() { return JSON.parse(JSON.stringify({ mapping: state.mapping, baseSpeed: state.baseSpeed, vib: state.vib, trail: state.trail, layout: state.layout, motionStyle: state.motionStyle, pointScale: state.pointScale, cohesion: state.cohesion, bg: state.bg })); }
  function applyRule(r) { if (!r) return; state.mapping = JSON.parse(JSON.stringify(r.mapping)); state.baseSpeed = r.baseSpeed; state.vib = r.vib; state.trail = r.trail; state.layout = r.layout || 'timeline'; state.motionStyle = r.motionStyle || 'vibrate'; state.pointScale = r.pointScale != null ? r.pointScale : 1; state.cohesion = r.cohesion != null ? r.cohesion : 1; state.bg = r.bg || 'night'; syncMotion(); populateFieldSelects(); renderColorUI(); build(); }
  function syncMotion() { $('#r-speed').value = state.baseSpeed; $('#o-speed').textContent = state.baseSpeed; $('#r-vib').value = state.vib; $('#o-vib').textContent = state.vib; $('#r-trail').value = state.trail; $('#o-trail').textContent = state.trail; const sl = $('#sel-layout'); if (sl) sl.value = state.layout; const sm = $('#sel-motionstyle'); if (sm) sm.value = state.motionStyle; const ps = $('#r-pscale'); if (ps) { ps.value = state.pointScale; $('#o-pscale').textContent = state.pointScale; } const co = $('#r-coh'); if (co) { co.value = state.cohesion; $('#o-coh').textContent = state.cohesion; } const sb = $('#sel-data-bg'); if (sb) sb.value = state.bg; }
  const MLBL = { size: '크기', speed: '속도', direction: '방향', density: '밀도', alpha: '투명도', shape: '형태' };
  function describeRule(r) {
    const m = r.mapping, parts = [];
    Object.keys(MLBL).forEach(k => { if (m[k]) parts.push(MLBL[k] + '←' + m[k]); });
    parts.push('색:' + ({ gradient: '그라데이션', category: '범주별', solid: '단색' }[m.colorMode] || m.colorMode));
    return parts.join(' · ') || '매핑 없음';
  }
  function diffRules(a, b) {
    const d = [];
    Object.keys(MLBL).forEach(k => { if ((a.mapping[k] || '') !== (b.mapping[k] || '')) d.push(MLBL[k]); });
    if (a.mapping.colorMode !== b.mapping.colorMode || a.mapping.colorField !== b.mapping.colorField) d.push('색');
    if (a.baseSpeed !== b.baseSpeed) d.push('속도'); if (a.vib !== b.vib) d.push('진동');
    return d.join(', ');
  }
  function renderAB() {
    const el = $('#ab-summary'); if (!el) return;
    if (!ruleA && !ruleB) { el.innerHTML = ''; return; }
    const s = [];
    if (ruleA) s.push('<b style="color:var(--good)">A</b> = ' + esc(describeRule(ruleA)));
    if (ruleB) s.push('<b style="color:var(--accent2)">B</b> = ' + esc(describeRule(ruleB)));
    if (ruleA && ruleB) s.push('<b style="color:var(--accent)">차이</b>: ' + (esc(diffRules(ruleA, ruleB)) || '없음') + ' — ‘A/B 전환’으로 비교해 보세요.');
    el.innerHTML = s.join('<br>');
  }

  /* ----------------------------- 코치 ----------------------------- */
  function rulesText() { return describeRule({ mapping: state.mapping }); }
  function mdToHtml(t) { return esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/_(.+?)_/g, '<i>$1</i>').replace(/\n/g, '<br>'); }
  async function coach() {
    UI.modal('🧭 감상 코치', '<div class="spinner"></div> 질문을 준비하는 중…', '답이 아니라 질문이에요');
    const res = await Coach.ask({ kind: 'data', intent: $('#in-intent').value, dataName: $('#in-dataname').value || state.dataName, rules: rulesText() });
    const note = res.source.indexOf('api') === 0 ? '실제 모델' : '오프라인 코치';
    UI.modal('🧭 감상 코치 <span class="badge">' + note + '</span>', '<div class="lvl-b">' + mdToHtml(res.text) + '</div>', '답이 아니라 질문이에요');
  }

  /* ----------------------------- 저장/전시 ----------------------------- */
  function thumb() {
    const w = 360, h = Math.round(w * p5i.height / p5i.width);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(p5i.canvas, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.6);
  }
  function settings() {
    const v = id => { const el = $('#' + id); return el ? el.value.trim() : ''; };
    return { mapping: state.mapping, baseSpeed: state.baseSpeed, vib: state.vib, trail: state.trail, layout: state.layout, motionStyle: state.motionStyle, pointScale: state.pointScale, cohesion: state.cohesion, bg: state.bg,
      dataName: $('#in-dataname').value || state.dataName,
      record: { sense: v('rec-sense'), count: v('rec-count'), omit: v('rec-omit'), scale: v('rec-scale'), miss: v('rec-miss') },
      fields: state.dataset ? state.dataset.fields : [], rows: state.dataset ? state.dataset.rows : [] };
  }
  function requireUser() { const u = Auth.current(); if (!u) { UI.toast('로그인이 필요합니다.'); setTimeout(() => location.href = 'index.html?next=studio-data.html', 900); return null; } return u; }
  async function saveNote() {
    const u = requireUser(); if (!u) return;
    await Store.saveNote({ userId: u.userId, by: u.display, kind: 'data', title: ($('#in-dataname').value || state.dataName), intent: $('#in-intent').value, evidence: $('#in-evidence').value, settings: settings() });
    UI.toast('작업노트에 저장했습니다.');
  }
  async function exhibit() {
    const u = requireUser(); if (!u) return;
    const intent = $('#in-intent').value.trim(), evidence = $('#in-evidence').value.trim();
    if (!intent || !evidence) { UI.toast('전시 전에 ‘의도 한 문장 + 근거 1개 이상’을 채워 주세요.'); return; }
    await Store.saveWork({ userId: u.userId, by: u.display, klass: u.klass, kind: 'data', title: ($('#in-dataname').value || state.dataName), intent, evidence, dataName: $('#in-dataname').value || state.dataName, settings: settings(), thumb: thumb(), exhibited: true });
    UI.toast('🎉 갤러리에 전시했습니다!');
  }
  function saveImage() { const a = document.createElement('a'); a.download = 'data_art_' + Date.now() + '.png'; a.href = p5i.canvas.toDataURL('image/png'); a.click(); UI.toast('이미지를 저장했습니다.'); }

  function downloadTemplate() {
    const csv = '시간,감정온도,활동량,활동\n9시,3,200,수업\n10시,4,800,발표\n11시,3,1500,토론\n12시,2,400,점심\n13시,2,300,휴식\n14시,1,3000,체육\n15시,2,1800,실습\n16시,4,900,정리\n17시,5,300,하교\n';
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.download = 'data_template.csv'; a.href = URL.createObjectURL(blob); a.click();
    UI.toast('CSV 양식을 받았어요. 열을 채워 ‘CSV 열기’로 올리면 자동 인식됩니다.');
  }

  /* ----------------------------- 이벤트 ----------------------------- */
  function rng(id, out, key) { const el = $('#' + id); el.addEventListener('input', () => { state[key] = +el.value; $('#' + out).textContent = el.value; }); }

  document.addEventListener('DOMContentLoaded', () => {
    UI.mountIdeaBar('idea', 'data');
    p5i = new p5(sketch);

    // 요소별 안내(마우스 오버) — 학생이 무엇을 할지/왜 흥미로운지
    (function () {
      const tips = [
        '먼저 데이터를 골라요 — 사회문제 샘플 또는 직접 입력/CSV. 작성 양식도 받을 수 있어요.',
        '어떤 열을 점의 어떤 특성(크기·속도·방향·밀도·색·형태)으로 바꿀지 직접 설계해요.',
        '기본 속도·진동·잔상으로 움직임의 결을 정해요.',
        '‘객관적 데이터’ 뒤의 내 선택을 적어요 — 무엇을 셌고 무엇을 일부러 뺐는지.',
        '저장·전시 전에 의도 한 문장 + 근거 1개를 채워요(근거가 먼저).',
        '코치에게 질문받고, 이미지·작업노트·전시로 내보내요.'
      ];
      document.querySelectorAll('.dpanel > details > summary').forEach((s, i) => { if (tips[i]) s.title = tips[i]; });
      const tip = (sel, t) => { const el = $(sel); if (el) el.title = t; };
      tip('#r-speed', '전체 속도 — 작으면 잔잔, 크면 활발해요.');
      tip('#r-vib', '떨림 — 0이면 고요, 크면 들썩여요.');
      tip('#r-trail', '낮출수록 자취(궤적)가 남아 ‘흐름’이 보여요.');
      tip('#map-colormode', '수치는 그라데이션, 범주는 라벨별 색 — 색상환에서 직접 골라요.');
      tip('#sel-sample', '사회문제와 연결된 예시 — 의미 있는 시각화로.');
    })();

    $('#sel-sample').addEventListener('change', e => { const s = SAMPLES[e.target.value]; if (!s) return; $('#ta-data').value = s.csv; $('#in-dataname').value = s.name; applyDataset(parseData(s.csv), s.name); const di = $('#data-issue'); if (di) di.textContent = s.issue || ''; });
    $('#btn-apply-data').addEventListener('click', () => { const ds = parseData($('#ta-data').value); if (!ds) { UI.toast('데이터 형식을 확인하세요.'); return; } applyDataset(ds, $('#in-dataname').value || '내 데이터'); UI.toast('데이터를 적용했습니다.'); });
    $('#btn-upload-csv').addEventListener('click', () => $('#csv').click());
    $('#csv').addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { $('#ta-data').value = r.result; if (!$('#in-dataname').value) $('#in-dataname').value = f.name.replace(/\.[^.]+$/, ''); applyDataset(parseData(r.result), $('#in-dataname').value); }; r.readAsText(f); });
    $('#btn-template').addEventListener('click', downloadTemplate);

    // 매핑 선택
    document.querySelectorAll('[data-map]').forEach(sel => sel.addEventListener('change', () => {
      const prop = sel.dataset.map; state.mapping[prop] = sel.value || null;
      if (prop === 'shape') renderColorUI();
      if (prop === 'density' || prop === 'size') build();
    }));
    $('#map-colormode').addEventListener('change', e => { state.mapping.colorMode = e.target.value; if (state.dataset) { fieldOptions($('#map-colorfield'), state.mapping.colorMode === 'category' ? 'any' : 'num', false, state.mapping.colorField); state.mapping.colorField = $('#map-colorfield').value || state.mapping.colorField; assignCatColors(); renderColorUI(); } });
    $('#map-colorfield').addEventListener('change', e => { state.mapping.colorField = e.target.value || null; assignCatColors(); renderColorUI(); });
    $('#map-gradlow').addEventListener('input', e => state.mapping.gradLow = e.target.value);
    $('#map-gradhigh').addEventListener('input', e => state.mapping.gradHigh = e.target.value);
    $('#map-solid').addEventListener('input', e => state.mapping.solid = e.target.value);

    rng('r-speed', 'o-speed', 'baseSpeed'); rng('r-vib', 'o-vib', 'vib'); rng('r-trail', 'o-trail', 'trail');
    rng('r-pscale', 'o-pscale', 'pointScale'); rng('r-coh', 'o-coh', 'cohesion');
    $('#sel-layout').addEventListener('change', e => { state.layout = e.target.value; build(); });
    $('#sel-motionstyle').addEventListener('change', e => { state.motionStyle = e.target.value; });
    $('#sel-data-bg').addEventListener('change', e => { state.bg = e.target.value; });

    $('#btn-ruleA').addEventListener('click', () => { ruleA = snapRule(); renderAB(); UI.toast('규칙 A 저장됨 — 매핑을 바꿔 규칙 B도 저장해 비교하세요.'); });
    $('#btn-ruleB').addEventListener('click', () => { ruleB = snapRule(); renderAB(); UI.toast('규칙 B 저장됨 — ‘A/B 전환’으로 비교하세요.'); });
    $('#btn-ab').addEventListener('click', () => { if (!ruleA || !ruleB) { UI.toast('먼저 규칙 A·B를 저장하세요.'); return; } abFlag = !abFlag; applyRule(abFlag ? ruleB : ruleA); renderAB(); UI.toast('적용: 규칙 ' + (abFlag ? 'B' : 'A')); });

    $('#btn-coach').addEventListener('click', coach);
    $('#btn-img').addEventListener('click', saveImage);
    $('#btn-note').addEventListener('click', saveNote);
    $('#btn-exhibit').addEventListener('click', exhibit);
    // (보낸 데이터 수신은 p5 setup의 loadIncoming()에서 결정적으로 처리)
  });
})();
