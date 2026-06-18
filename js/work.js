/*
 * work.js — 작품 단독 페이지: 작가노트 + 감상·비평(펠드먼 4단계)
 * QR/갤러리에서 work.html?id=<workId> 로 진입.
 */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = (s) => UI.escapeHTML(s);
  const rubSel = id => '<select id="' + id + '"><option value="0">— 미평가 —</option><option value="3">상 ●●●</option><option value="2">중 ●●</option><option value="1">하 ●</option></select>';
  const KIND = { color: '색 군집', data: '데이터 점', lab: '분석' };
  const COLORLBL = { value: '값 그라데이션', warm: '난색', cool: '한색' };
  const id = new URLSearchParams(location.search).get('id');
  let work = null;

  function story(w) {
    const s = w.settings || {}, parts = [];
    if (w.kind === 'data') {
      parts.push('데이터: ' + (w.dataName || '—'));
      const m = (window.Docent && Docent.mapSummary) ? Docent.mapSummary(s.mapping) : [];
      if (m.length) parts.push('매핑: ' + m.join(' · '));
      const cm = s.mapping && s.mapping.colorMode;
      if (cm) parts.push('색: ' + ({ gradient: '그라데이션', category: '범주별', solid: '단색' }[cm] || cm));
      else if (s.color) parts.push('색: ' + (COLORLBL[s.color] || s.color));
    } else if (w.kind === 'color') {
      if (s.K) parts.push('대표색 K=' + s.K);
      if (s.space) parts.push('색공간 ' + String(s.space).toUpperCase());
      if (s.N) parts.push('점 N=' + s.N);
    }
    return parts;
  }

  function critiqueCard(f) {
    const stars = f.rating ? '★'.repeat(f.rating) + '☆'.repeat(5 - f.rating) : '';
    const steps = [];
    if (f.describe) steps.push(['① 기술', f.describe]);
    if (f.analyze) steps.push(['② 분석', f.analyze]);
    if (f.interpret) steps.push(['③ 해석', f.interpret]);
    if (f.judge) steps.push(['④ 평가', f.judge]);
    // 갤러리식 평점(있으면)
    const old = (f.intent || f.evidence || f.interaction || f.ethics) ?
      `<div class="muted" style="font-size:12px">의도 ${'★'.repeat(f.intent||0)} 근거 ${'★'.repeat(f.evidence||0)} 인터랙션 ${'★'.repeat(f.interaction||0)} 윤리 ${'★'.repeat(f.ethics||0)}</div>` : '';
    const rub = f.rubric ? `<div class="muted" style="font-size:12px">🎯 매핑의도 ${'●'.repeat(f.rubric.intent||0)} · 판단흔적 ${'●'.repeat(f.rubric.trace||0)} · 도구주체성 ${'●'.repeat(f.rubric.agency||0)} · 감각귀환 ${'●'.repeat(f.rubric.ret||0)}</div>` : '';
    return `<div class="lvl" style="margin:8px 0"><div class="lvl-b">
      <b>${esc(f.by || '관람객')}</b> <span style="color:var(--accent)">${stars}</span>
      ${f.comment ? `<div style="margin:4px 0">${esc(f.comment)}</div>` : ''}
      ${old}${rub}
      ${steps.map(([k, v]) => `<div style="margin:3px 0"><b style="color:var(--accent2)">${k}</b> ${esc(v)}</div>`).join('')}
    </div></div>`;
  }

  const NOTE_KIND = { reflection: '성찰', lab: '분석 메모', data: '데이터 작업', color: '색 작업' };
  function noteHTML(n) {
    const when = n.updatedAt ? new Date(n.updatedAt).toLocaleDateString('ko-KR') : '';
    let inner = '';
    if (n.memos && Object.keys(n.memos).length) inner = Object.entries(n.memos).map(([k, v]) => `<b>${esc(k)}</b>: ${esc(v)}`).join('<br>');
    else inner = [n.aiHelp && ('🤖 ' + esc(n.aiHelp)), n.myDecision && ('🙋 ' + esc(n.myDecision)), n.line && ('✍ ' + esc(n.line)), n.intent && ('의도: ' + esc(n.intent))].filter(Boolean).join('<br>');
    return `<div class="lvl" style="margin:8px 0"><div class="lvl-b"><span class="badge">${NOTE_KIND[n.kind] || n.kind}</span>
      <span class="muted" style="font-size:11px">${when}</span><div style="margin-top:4px">${inner || '<span class="muted">내용 없음</span>'}</div></div></div>`;
  }
  const hasContent = n => n.line || n.aiHelp || n.myDecision || (n.memos && Object.keys(n.memos).length) || n.intent;

  async function render() {
    work = await Store.getWork(id);
    if (!work) { $('#work-root').innerHTML = UI.callout('작품을 찾을 수 없어요. 클라우드 전시라면 같은 링크/네트워크인지 확인하세요.', 'warn'); return; }
    const fbs = await Store.listFeedback(id);
    const u = Auth.current();
    const st = story(work);
    const docentHTML = window.Docent ? `
      <div class="card" style="margin-top:16px">
        <h3>🎙 도슨트 해설 <span class="muted" style="font-size:12px">(자동 생성)</span></h3>
        <p style="line-height:1.75;margin:0">${esc(Docent.commentary(work))}</p>
      </div>` : '';
    const rec = (work.settings && work.settings.record) || {};
    const recItems = [['감각 먼저', rec.sense], ['무엇을 셌나', rec.count], ['뺀 것(생략)', rec.omit], ['척도·매핑 이유', rec.scale], ['놓친 진실(메타비평)', rec.miss]].filter(x => x[1]);
    const recordHTML = recItems.length ? `
      <div class="card" style="margin-top:16px">
        <h3 class="with-info">📝 데이터 선택 기록 <span class="info-ic" data-info="data-humanism">ⓘ</span></h3>
        ${recItems.map(([k, v]) => `<p style="margin:5px 0"><b>${k}</b> · ${esc(v)}</p>`).join('')}
      </div>` : '';
    const notes = (work.userId ? (await Store.listNotes(work.userId)) : []).filter(hasContent).slice(0, 8);
    const processHTML = notes.length ? `
      <div class="card" style="margin-top:16px">
        <h3>🧭 작가의 과정·성찰 <span class="muted" style="font-size:12px">— 학습 과정도 작품의 일부예요</span></h3>
        ${notes.map(noteHTML).join('')}
      </div>` : '';
    $('#work-root').innerHTML = `
      <div class="card">
        <canvas id="live-canvas" style="width:100%;aspect-ratio:4/3;background:#07080d;border-radius:12px;border:1px solid var(--line);display:block"></canvas>
        <p class="muted" style="font-size:11px;margin:6px 0 0">▶ 살아 움직이는 재생 · 마우스를 올려 반응을 느껴 보세요</p>
        <h1 style="margin:14px 0 4px;font-size:24px">${esc(work.title || '제목 없음')}</h1>
        <p class="muted" style="margin:0">${esc(work.by || '익명')} · <span class="badge">${KIND[work.kind] || work.kind}</span></p>
      </div>

      <div class="card" style="margin-top:16px">
        <h3>작가노트</h3>
        ${work.intent ? `<p><b>의도</b> · ${esc(work.intent)}</p>` : ''}
        ${work.evidence ? `<p><b>조형/데이터 근거</b> · ${esc(work.evidence)}</p>` : ''}
        ${st.length ? `<p class="muted" style="font-size:13px"><b>데이터·알고리즘</b> · ${st.map(esc).join(' · ')}</p>` : ''}
      </div>

      ${docentHTML}
      ${recordHTML}
      ${processHTML}

      <div class="card" style="margin-top:16px">
        <h3 class="with-info">감상·비평 <span class="info-ic" data-info="critique">ⓘ</span> <span class="muted" style="font-size:12px">(${fbs.length})</span></h3>
        <div id="crit-list">${fbs.length ? fbs.map(critiqueCard).join('') : '<p class="muted">첫 감상을 남겨 보세요.</p>'}</div>

        <hr class="sep">
        <h3 style="font-size:15px">비평 남기기</h3>
        <div class="grid c2">
          <div><label class="field">이름(관람객)</label><input id="c-name" type="text" value="${u ? esc(u.display) : ''}" placeholder="이름 또는 별명"></div>
          <div><label class="field">별점</label>
            <select id="c-rating"><option value="5">★★★★★</option><option value="4">★★★★</option><option value="3" selected>★★★</option><option value="2">★★</option><option value="1">★</option></select></div>
        </div>
        <label class="field">한마디 감상</label>
        <textarea id="c-comment" rows="2" placeholder="무엇이 마음에 남았나요? 근거와 함께"></textarea>

        <details style="margin-top:10px">
          <summary style="cursor:pointer;color:var(--accent2);font-weight:700;font-size:13.5px">＋ 펠드먼 4단계로 자세히 비평하기</summary>
          <label class="field">① 기술 — 무엇이 보이나(객관)</label><textarea id="c-describe" rows="2" placeholder="예: 파란색이 화면의 대부분, 중앙에 밝은 점들"></textarea>
          <label class="field">② 분석 — 색·명도·구도·리듬이 어떻게</label><textarea id="c-analyze" rows="2" placeholder="예: 보색 대비가 시선을 중앙으로 모음"></textarea>
          <label class="field">③ 해석 — 무엇을 말하나(의도·감정)</label><textarea id="c-interpret" rows="2" placeholder="예: 불안 속의 한 줄기 평온"></textarea>
          <label class="field">④ 평가 — 근거 있는 판단</label><textarea id="c-judge" rows="2" placeholder="예: 데이터를 절제해 의도가 분명, 설득력 있음"></textarea>
        </details>
        <details style="margin-top:6px">
          <summary style="cursor:pointer;color:var(--good);font-weight:700;font-size:13.5px">＋ 4영역 평가(자기·동료) <span class="info-ic" data-info="rubric">ⓘ</span></summary>
          <div class="grid c2">
            <div><label class="field">① 매핑의 의도성</label>${rubSel('rb-intent')}</div>
            <div><label class="field">② 판단의 흔적</label>${rubSel('rb-trace')}</div>
            <div><label class="field">③ 도구에 대한 주체성</label>${rubSel('rb-agency')}</div>
            <div><label class="field">④ 감각으로의 귀환</label>${rubSel('rb-return')}</div>
          </div>
        </details>
        <button id="c-submit" class="btn primary" style="margin-top:12px">비평 등록</button>
      </div>`;
    const lc = document.getElementById('live-canvas');
    if (lc && window.Player) { if (window._wPlayer) window._wPlayer.stop(); window._wPlayer = Player.mount(lc, work, { interactive: true }); }
    $('#c-submit').addEventListener('click', submit);
  }

  async function submit() {
    const v = id => ($('#' + id) ? $('#' + id).value.trim() : '');
    const name = v('c-name') || '관람객';
    const comment = v('c-comment'), d = v('c-describe'), a = v('c-analyze'), i = v('c-interpret'), j = v('c-judge');
    const rb = { intent: +v('rb-intent'), trace: +v('rb-trace'), agency: +v('rb-agency'), ret: +v('rb-return') };
    const hasRb = rb.intent || rb.trace || rb.agency || rb.ret;
    if (!comment && !d && !a && !i && !j && !hasRb) { UI.toast('한마디·4단계·4영역 중 하나는 남겨 주세요.'); return; }
    const u = Auth.current();
    await Store.addFeedback({
      workId: id, userId: u ? u.userId : undefined, by: name, kind: 'critique',
      rating: +$('#c-rating').value, comment, describe: d, analyze: a, interpret: i, judge: j,
      rubric: hasRb ? rb : null
    });
    UI.toast('비평을 등록했습니다. 고맙습니다!');
    render();
  }

  if (!id) { $('#work-root').innerHTML = UI.callout('작품 id가 없어요. 갤러리에서 작품을 선택하세요.', 'warn'); }
  else render();
})();
