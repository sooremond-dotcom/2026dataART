/*
 * quiz.js — 분석 퀴즈 대시보드 (출제 · 풀기 · 순위)
 * -----------------------------------------------------------------------------
 * 학생이 그림을 분석해 '지배색/색채 조화/색 온도/구도' 문제를 자동 출제하거나
 * 직접 만든다. 다른 학생이 풀어 점수를 얻고 순위를 겨룬다. 미술 감상·분석을 게임으로.
 */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => UI.escapeHTML(s);
  const rgb = p => 'rgb(' + p.r + ',' + p.g + ',' + p.b + ')';
  const TAGS = ['색', '명도', '채도', '구도', '균형', '리듬', '강조', '대비', '질감', '공간', '통일', '변화'];

  let qSrc = null, qAn = null, qStats = null, qGen = null;
  const qTags = new Set();
  const done = loadDone();
  function loadDone() { try { return new Set(JSON.parse(localStorage.getItem('dn_quiz_done') || '[]')); } catch (e) { return new Set(); } }
  function markDone(id) { done.add(id); localStorage.setItem('dn_quiz_done', JSON.stringify(Array.from(done))); }

  /* ----------------------------- 분석 ----------------------------- */
  function hueOf(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d < 18) return -1;
    let h; if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  }
  function temperature(pal) {
    let warm = 0, cool = 0;
    pal.forEach(p => { const h = hueOf(p.r, p.g, p.b); if (h < 0) return; if (h < 70 || h > 320) warm += p.ratio; else if (h >= 160 && h <= 260) cool += p.ratio; });
    return { label: warm > cool + 0.08 ? '난색 우세' : cool > warm + 0.08 ? '한색 우세' : '중성/균형', warm, cool };
  }
  function colorDist(a, b) { return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b); }
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }
  const rand255 = () => Math.floor(Math.random() * 255);

  function analyzeImage(src) {
    qSrc = src; $('#q-busy').classList.remove('hide');
    setTimeout(() => {
      try {
        const a = ImageAnalysis.analyze(src, { K: 8, space: 'rgb', N: 1, sampling: 'uniform', maxDim: 240 });
        qAn = { palette: a.palette, harmony: window.Harmony ? Harmony.analyze(a.palette) : null, comp: window.Algos ? Algos.composition(src) : null, temp: temperature(a.palette) };
        qStats = Charts.computeStats(src);
        drawThumb(src); drawQuizChart(); onTypeChange();
      } catch (e) { console.error(e); UI.toast('분석 오류: ' + e.message); }
      finally { $('#q-busy').classList.add('hide'); }
    }, 16);
  }
  function drawThumb(src) { const c = $('#q-thumb'), ar = src.width / src.height; c.width = 92; c.height = Math.round(92 / ar); c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); }
  function drawQuizChart() {
    if (!qAn) return; const cv = $('#q-chart-canvas'), t = $('#q-chart').value;
    if (t === 'bars') Charts.bars(cv, qAn.palette); else if (t === 'wheel') Charts.wheel(cv, qStats.hueBins); else if (t === 'heatmap') Charts.heatmap(cv, qStats.samples); else Charts.donut(cv, qAn.palette);
  }

  /* ----------------------------- 문제 생성 ----------------------------- */
  function generateQuestion(qtype) {
    const pal = qAn.palette;
    if (qtype === 'dominant') {
      const correct = pal[0];
      const others = pal.slice(1).filter(p => colorDist(p, correct) > 40).slice(0, 3);
      let opts = [{ color: rgb(correct), _c: true }].concat(others.map(p => ({ color: rgb(p) })));
      while (opts.length < 4) opts.push({ color: 'rgb(' + rand255() + ',' + rand255() + ',' + rand255() + ')' });
      opts = shuffle(opts);
      return { question: '이 작품에서 가장 많이 쓰인 ‘지배색’은?', options: opts.map(o => ({ label: '', color: o.color })), answer: opts.findIndex(o => o._c) };
    }
    if (qtype === 'harmony') {
      const rel = qAn.harmony ? qAn.harmony.relations : {};
      const correct = rel.complementary ? '보색' : rel.triadic ? '삼각' : rel.analogous ? '유사(이웃색)' : '단색조/복합';
      const labels = ['보색', '유사(이웃색)', '삼각', '단색조/복합'];
      return { question: '이 작품의 색채 조화에 가장 가까운 것은?', options: labels.map(l => ({ label: l })), answer: labels.indexOf(correct) };
    }
    if (qtype === 'temp') {
      const labels = ['난색 우세', '한색 우세', '중성/균형'];
      return { question: '이 작품의 색 온도는?', options: labels.map(l => ({ label: l })), answer: labels.indexOf(qAn.temp.label) };
    }
    if (qtype === 'composition') {
      const x = qAn.comp ? qAn.comp.centroid.x : 0.5;
      const correct = x < 0.42 ? '왼쪽' : x > 0.58 ? '오른쪽' : '가운데';
      const labels = ['왼쪽', '가운데', '오른쪽'];
      return { question: '밝기 무게중심(시선이 모이는 곳)이 어디에 가깝나요?', options: labels.map(l => ({ label: l })), answer: labels.indexOf(correct) };
    }
    if (qtype === 'free') return { question: '', free: true, answers: [] };
    return { question: '', options: [{ label: '' }, { label: '' }, { label: '' }, { label: '' }], answer: 0, custom: true };
  }
  function onTypeChange() {
    if (!qAn) { UI.toast('먼저 이미지를 분석하세요(데모 선택 또는 업로드).'); return; }
    const type = $('#q-type').value;
    qGen = generateQuestion(type);
    if (!qGen.custom && !qGen.free) $('#q-question').value = qGen.question;
    renderOptionsEdit();
  }
  function renderOptionsEdit() {
    const host = $('#q-options-edit'); host.innerHTML = '';
    if (qGen.free) {
      host.innerHTML = '<label class="field">정답 (여러 표현 허용: 쉼표로 구분)</label><input id="q-free-answer" type="text" placeholder="예: 빨강, 빨간색, red"><p class="muted" style="font-size:11px;margin-top:4px">문제는 위 칸에 자유롭게 — 점 개수·매핑·느낌 무엇이든 물어보세요!</p>';
      return;
    }
    if (qGen.custom) {
      host.innerHTML = '<label class="field">보기(정답을 ◉로 선택)</label>' +
        qGen.options.map((o, i) => '<div style="display:flex;gap:8px;align-items:center;margin:4px 0"><input type="radio" name="q-correct" value="' + i + '"' + (i === 0 ? ' checked' : '') + '><input type="text" class="q-optin" data-i="' + i + '" placeholder="보기 ' + (i + 1) + '"></div>').join('');
    } else {
      host.innerHTML = '<label class="field">자동 생성된 보기 (✅ = 정답)</label>' +
        qGen.options.map((o, i) => '<div class="qopt" style="cursor:default">' + (o.color ? '<span class="sw" style="background:' + o.color + '"></span>' : '') + esc(o.label || (o.color ? '이 색' : '')) + (i === qGen.answer ? ' <b style="color:var(--good)">✅ 정답</b>' : '') + '</div>').join('');
    }
  }

  /* ----------------------------- 태그 ----------------------------- */
  function renderTags() {
    $('#q-tags').innerHTML = TAGS.map(t => '<span class="tag-chip" data-tag="' + t + '">' + t + '</span>').join('');
    $('#q-tags').querySelectorAll('[data-tag]').forEach(c => c.addEventListener('click', () => { const t = c.dataset.tag; if (qTags.has(t)) { qTags.delete(t); c.classList.remove('on'); } else { qTags.add(t); c.classList.add('on'); } }));
  }

  /* ----------------------------- 출제 ----------------------------- */
  function thumbURL(src, w) { w = w || 220; const ar = src.width / src.height; const c = document.createElement('canvas'); c.width = w; c.height = Math.round(w / ar); c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.62); }
  async function submitQuiz() {
    const u = Auth.current();
    if (!u) { UI.toast('출제하려면 로그인하세요.'); setTimeout(() => location.href = 'index.html?next=quiz.html', 900); return; }
    if (!qAn || !qGen) { UI.toast('먼저 이미지를 분석하세요.'); return; }
    const type = $('#q-type').value;
    let question = $('#q-question').value.trim(), options = qGen.options, answer = qGen.answer, answers = null;
    if (qGen.free) {
      if (!question) { UI.toast('문제를 입력하세요.'); return; }
      answers = ($('#q-free-answer') ? $('#q-free-answer').value : '').split(',').map(x => x.trim()).filter(Boolean);
      if (!answers.length) { UI.toast('정답을 1개 이상 입력하세요(쉼표로 여러 개).'); return; }
      options = [];
    } else if (qGen.custom) {
      options = Array.from(document.querySelectorAll('.q-optin')).map(inp => ({ label: inp.value.trim() }));
      if (options.some(o => !o.label)) { UI.toast('보기 4개를 모두 채워 주세요.'); return; }
      const sel = document.querySelector('input[name="q-correct"]:checked'); answer = sel ? +sel.value : 0;
      if (!question) { UI.toast('문제를 입력하세요.'); return; }
    }
    if (!question) question = qGen.question;
    const cv = $('#q-chart-canvas');
    const quiz = {
      userId: u.userId, by: u.display, klass: u.klass, title: $('#q-title').value.trim() || question || '분석 퀴즈',
      qtype: type, question, options, answer, answers, explanation: $('#q-explain').value.trim(),
      hint: ($('#q-hint') ? $('#q-hint').value.trim() : ''), story: ($('#q-story') ? $('#q-story').value.trim() : ''),
      tags: Array.from(qTags), difficulty: $('#q-diff').value,
      thumb: thumbURL(qSrc), chartImg: cv ? cv.toDataURL('image/png') : '', chartType: $('#q-chart').value
    };
    await Store.saveQuiz(quiz);
    UI.toast('🎉 퀴즈를 출제했습니다!');
    qTags.clear(); $('#q-title').value = ''; $('#q-explain').value = '';
    if ($('#q-hint')) $('#q-hint').value = ''; if ($('#q-story')) $('#q-story').value = '';
    document.querySelectorAll('.tag-chip.on').forEach(c => c.classList.remove('on'));
    switchTab('play'); renderPlay();
  }

  /* ----------------------------- 풀기 ----------------------------- */
  async function renderPlay() {
    const quizzes = await Store.listQuizzes();
    $('#play-empty').classList.toggle('hide', quizzes.length > 0);
    $('#quiz-list').innerHTML = quizzes.map(q => {
      const did = done.has(q.id);
      return '<div class="item" data-qid="' + q.id + '" style="cursor:pointer">' +
        (q.thumb ? '<img src="' + q.thumb + '" alt="">' : '<canvas></canvas>') +
        '<div class="meta"><h4>' + esc(q.title || '퀴즈') + '</h4>' +
        '<p>' + esc(q.by || '익명') + ' · ' + esc(q.difficulty || '보통') + (did ? ' · <span style="color:var(--good)">완료</span>' : '') + '</p></div></div>';
    }).join('');
    $('#quiz-list').querySelectorAll('.item').forEach(el => el.addEventListener('click', () => playQuiz(el.dataset.qid)));
  }
  async function playQuiz(id) {
    const q = await Store.getQuiz(id); if (!q) return;
    const u = Auth.current();
    const isFree = q.qtype === 'free';
    const head =
      '<div class="qimg">' + (q.thumb ? '<img src="' + q.thumb + '">' : '') + (q.chartImg ? '<img src="' + q.chartImg + '">' : '') + '</div>' +
      (q.story ? '<p class="muted" style="font-size:12.5px;margin:8px 0 0">🧑 ' + esc(q.story) + '</p>' : '') +
      '<h3 style="margin:12px 0 4px">' + esc(q.question) + '</h3>' +
      '<div class="muted" style="font-size:12px;margin-bottom:8px">' + esc(q.by || '') + ' · ' + esc(q.difficulty || '') + (q.tags && q.tags.length ? ' · ' + q.tags.map(esc).join('·') : '') + '</div>' +
      (q.hint ? '<button id="qa-hint-btn" class="btn sm ghost" style="margin-bottom:8px">💡 힌트 보기</button><div id="qa-hint" class="hide" style="font-size:12.5px;color:var(--accent2);margin-bottom:8px"></div>' : '');
    const interact = isFree
      ? '<div style="display:flex;gap:8px"><input id="qa-input" type="text" placeholder="정답을 입력하세요" style="flex:1"><button id="qa-go" class="btn primary">제출</button></div>'
      : '<div id="qa-options">' + (q.options || []).map((o, i) => '<button class="qopt" data-i="' + i + '">' + (o.color ? '<span class="sw" style="background:' + o.color + '"></span>' : '') + esc(o.label || '이 색') + '</button>').join('') + '</div>';
    UI.modal(esc(q.title || '퀴즈'), head + interact + '<div id="qa-result"></div>', '맞혀 보세요!');
    const already = done.has(id);
    if (q.hint) { const hb = $('#qa-hint-btn'); if (hb) hb.addEventListener('click', () => { const hv = $('#qa-hint'); hv.textContent = '💡 ' + q.hint; hv.classList.remove('hide'); hb.classList.add('hide'); }); }
    const reveal = async (correct) => {
      $('#qa-result').innerHTML = '<div class="callout ' + (correct ? '' : 'warn') + '" style="margin-top:12px"><span class="ic">' + (correct ? '🎉' : '🤔') + '</span><div><b>' + (correct ? '정답!' : '아쉬워요') + '</b>' +
        (isFree && q.answers ? '<br>정답: ' + q.answers.map(esc).join(' / ') : '') +
        (q.explanation ? '<br><b>출제자 해설</b>: ' + esc(q.explanation) : '') + '</div></div>';
      if (!already) { markDone(id); await Store.addQuizAnswer({ quizId: id, userId: u ? u.userId : undefined, by: u ? u.display : '익명', correct: correct }); }
      renderPlay();
    };
    if (isFree) {
      const go = $('#qa-go'), inp = $('#qa-input');
      const submit = () => { const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ''); const ok = (q.answers || []).some(a => norm(a) === norm(inp.value)); go.disabled = true; inp.disabled = true; reveal(ok); };
      if (go) go.addEventListener('click', submit);
      if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    } else {
      document.querySelectorAll('#qa-options .qopt').forEach(btn => btn.addEventListener('click', () => {
        const choice = +btn.dataset.i, correct = choice === q.answer;
        document.querySelectorAll('#qa-options .qopt').forEach((b, i) => { b.disabled = true; if (i === q.answer) b.classList.add('correct'); else if (i === choice) b.classList.add('wrong'); });
        reveal(correct);
      }));
    }
    if (already) $('#qa-result').innerHTML = '<p class="muted" style="margin-top:10px">이미 푼 퀴즈예요(점수는 한 번만 반영).</p>';
  }

  /* ----------------------------- 순위 ----------------------------- */
  async function renderRank() {
    const ans = await Store.listQuizAnswers(), quizzes = await Store.listQuizzes();
    const by = {};
    ans.forEach(a => { const k = a.userId || a.by || '익명'; if (!by[k]) by[k] = { name: a.by || '익명', correct: 0, total: 0 }; by[k].total++; if (a.correct) by[k].correct++; });
    const rows = Object.values(by).sort((a, b) => b.correct - a.correct || b.total - a.total);
    const medal = i => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
    $('#rank-table').querySelector('tbody').innerHTML = rows.length ? rows.map((r, i) =>
      '<tr><td class="rank-medal">' + medal(i) + '</td><td>' + esc(r.name) + '</td><td>' + r.correct + '</td><td>' + r.total + '</td><td>' + Math.round(r.correct / r.total * 100) + '%</td></tr>').join('')
      : '<tr><td colspan="5" class="muted">아직 푼 기록이 없어요.</td></tr>';
    const auth = {};
    quizzes.forEach(q => { const k = q.userId || q.by; if (!auth[k]) auth[k] = { name: q.by, made: 0 }; auth[k].made++; });
    const solvedByAuthor = {};
    ans.forEach(a => { const q = quizzes.find(x => x.id === a.quizId); if (q) { const k = q.userId || q.by; solvedByAuthor[k] = (solvedByAuthor[k] || 0) + 1; } });
    const arows = Object.entries(auth).sort((a, b) => b[1].made - a[1].made);
    $('#author-table').querySelector('tbody').innerHTML = arows.length ? arows.map(([k, v]) =>
      '<tr><td>' + esc(v.name) + '</td><td>' + v.made + '</td><td>' + (solvedByAuthor[k] || 0) + '</td></tr>').join('')
      : '<tr><td colspan="3" class="muted">아직 출제가 없어요.</td></tr>';
  }

  /* ----------------------------- 탭 ----------------------------- */
  function switchTab(name) {
    document.querySelectorAll('[data-qtab]').forEach(b => b.classList.toggle('on', b.dataset.qtab === name));
    document.querySelectorAll('.qsec').forEach(s => s.classList.toggle('on', s.id === 'qsec-' + name));
    if (name === 'play') renderPlay(); else if (name === 'rank') renderRank();
  }

  /* ----------------------------- 시작 ----------------------------- */
  document.addEventListener('DOMContentLoaded', () => {
    UI.mountIdeaBar('idea', 'gallery');
    renderTags();
    document.querySelectorAll('[data-qtab]').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.qtab)));
    $('#q-upload').addEventListener('click', () => $('#q-file').click());
    $('#q-file').addEventListener('change', e => { const f = e.target.files[0]; if (!f || !f.type.startsWith('image/')) return; const img = new Image(), url = URL.createObjectURL(f); img.onload = () => { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); URL.revokeObjectURL(url); analyzeImage(c); }; img.src = url; });
    $('#q-demo').addEventListener('change', e => analyzeImage(ImageAnalysis.generateDemo(e.target.value, 640, 480)));
    $('#q-type').addEventListener('change', onTypeChange);
    $('#q-chart').addEventListener('change', drawQuizChart);
    $('#q-submit').addEventListener('click', submitQuiz);
    // 시작: 데모 분석 + 풀기 목록
    analyzeImage(ImageAnalysis.generateDemo('starrynight', 640, 480));
    renderPlay();
  });
})();
