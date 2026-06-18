/*
 * critique.js — 데이터 비평 읽기 (차트의 '수사'를 폭로하고 3층위로 비평)
 * 같은 데이터를 '축 0부터' vs '축 잘라서'로 그려, 척도 선택이 인상을 바꾸는 걸 보여준다.
 */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const DATA = {
    climate: { title: '한반도 평균기온', unit: '℃', source: '출처(예시): 기상청 연평균', labels: ['1980', '1990', '2000', '2010', '2015', '2020', '2023'], values: [12.2, 12.6, 13.1, 13.4, 13.6, 13.9, 14.2], color: '#ff7e5f' },
    finedust: { title: '월별 초미세먼지(PM2.5)', unit: '㎍/㎥', source: '출처(예시): 환경부 월평균', labels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'], values: [42, 55, 68, 60, 38, 28, 22, 20, 26, 34, 46, 50], color: '#9aa3bd' },
    inequality: { title: '소득 분위별 월소득', unit: '만원', source: '출처(예시): 분위별 평균', labels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], values: [90, 150, 210, 270, 340, 420, 520, 650, 850, 1300], color: '#4ec3ff' }
  };
  let cur = 'climate', axis = 'zero';

  function draw() {
    const d = DATA[cur], cv = $('#crit-canvas'), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cv.clientWidth || 800, h = 320;
    cv.width = w * dpr; cv.height = h * dpr; cv.style.height = h + 'px';
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const padL = 48, padB = 30, padT = 16, padR = 14;
    const max = Math.max.apply(null, d.values), min = Math.min.apply(null, d.values);
    // 축 시작값: 0부터(정직) vs 최소값 근처(잘라서 = 과장)
    const yMin = axis === 'zero' ? 0 : Math.max(0, min - (max - min) * 0.15);
    const yMax = max + (max - min) * 0.08 || max * 1.1;
    const plotH = h - padB - padT, plotW = w - padL - padR;
    const x = i => padL + (i + 0.5) / d.values.length * plotW;
    const y = v => padT + plotH - (v - yMin) / (yMax - yMin) * plotH;
    // 축
    ctx.strokeStyle = getCSS('--line'); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + plotH); ctx.lineTo(w - padR, padT + plotH); ctx.stroke();
    ctx.fillStyle = getCSS('--muted'); ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
    for (let g = 0; g <= 4; g++) { const v = yMin + (yMax - yMin) * g / 4; const yy = y(v); ctx.fillText(v.toFixed(0), padL - 5, yy + 3); ctx.strokeStyle = 'rgba(150,150,170,.12)'; ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(w - padR, yy); ctx.stroke(); }
    // 막대
    const bw = plotW / d.values.length * 0.6;
    d.values.forEach((v, i) => {
      ctx.fillStyle = d.color; ctx.fillRect(x(i) - bw / 2, y(v), bw, padT + plotH - y(v));
      ctx.fillStyle = getCSS('--muted'); ctx.textAlign = 'center'; ctx.font = '10px sans-serif';
      ctx.fillText(d.labels[i], x(i), padT + plotH + 14);
    });
    ctx.fillStyle = getCSS('--text'); ctx.textAlign = 'left'; ctx.font = '12px sans-serif';
    ctx.fillText(d.title + ' (' + d.unit + ')' + (axis === 'cut' ? '  · ⚠ 축 잘림' : ''), padL, 12);
    $('#crit-source').textContent = d.source + ' · y축 ' + (axis === 'zero' ? '0부터' : '잘림(' + yMin.toFixed(0) + '~)');
    $('#crit-rhetoric').innerHTML = axis === 'cut'
      ? '<span class="ic">⚠️</span><div><b>축을 자르니 변화가 훨씬 ‘극적’으로 보이죠?</b> 같은 숫자인데 인상이 달라져요 — 이게 차트의 ‘수사(rhetoric)’예요. 어떤 축이 더 ‘정직’할까요? 작가는 왜 이렇게 그렸을까요?</div>'
      : '<span class="ic">📏</span><div><b>0부터 그린 정직한 축이에요.</b> 위의 ‘축 잘라서’를 눌러 같은 데이터가 얼마나 달라 보이는지 비교해 보세요.</div>';
  }
  function getCSS(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#888'; }

  async function save() {
    const u = Auth.current();
    if (!u) { UI.toast('저장하려면 로그인하세요.'); setTimeout(() => location.href = 'index.html?next=critique.html', 900); return; }
    const v = id => ($('#' + id).value || '').trim();
    if (!v('q1') && !v('q2') && !v('q3')) { UI.toast('비평을 한 가지 이상 적어 주세요.'); return; }
    await Store.saveNote({ userId: u.userId, by: u.display, kind: 'reflection', title: '데이터 비평 · ' + DATA[cur].title,
      aiHelp: '사실: ' + v('q1'), myDecision: '해석: ' + v('q2'), line: '가치/응답: ' + v('q3') });
    UI.toast('비평을 작업노트에 저장했습니다.');
  }

  document.addEventListener('DOMContentLoaded', () => {
    UI.mountIdeaBar('idea', 'lab');
    $('#crit-data').addEventListener('change', e => { cur = e.target.value; draw(); });
    document.querySelectorAll('[data-ax]').forEach(b => b.addEventListener('click', () => {
      axis = b.dataset.ax; document.querySelectorAll('[data-ax]').forEach(x => x.classList.toggle('on', x === b)); draw();
    }));
    $('#crit-save').addEventListener('click', save);
    window.addEventListener('resize', draw);
    draw();
  });
})();
