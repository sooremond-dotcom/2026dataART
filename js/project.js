/*
 * project.js — 사회문제 프로젝트 파이프라인 (학습 4단계)
 * 주제 → 공공데이터 → 정제·선택기록 → 작품(데이터 점 스튜디오) → 사회적 발언.
 */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  function topic() { const t = $('#pj-topic').value; return t === '기타' ? ($('#pj-topic-custom').value.trim() || '사회문제') : t; }

  function send() {
    const csv = $('#pj-data').value.trim();
    if (!csv) { UI.toast('먼저 데이터를 붙여넣거나 CSV를 여세요(2단계).'); return; }
    const payload = { name: topic() + ' 프로젝트', csv, intent: $('#pj-statement').value.trim() || $('#pj-why').value.trim(),
      issue: '📣 사회문제 프로젝트 — ' + topic() + ': 이 문제를 어떻게 보여줄까?' };
    try { localStorage.setItem('dn_data_incoming', JSON.stringify(payload)); } catch (e) { UI.toast('전송 실패(용량).'); return; }
    UI.toast('데이터 점 스튜디오로 보냅니다…'); setTimeout(() => location.href = 'studio-data.html', 600);
  }
  async function save() {
    const u = Auth.current();
    if (!u) { UI.toast('저장하려면 로그인하세요.'); setTimeout(() => location.href = 'index.html?next=project.html', 900); return; }
    const v = id => ($('#' + id) ? $('#' + id).value.trim() : '');
    await Store.saveNote({
      userId: u.userId, by: u.display, kind: 'project', title: '사회문제 프로젝트 · ' + topic(),
      aiHelp: '주제: ' + topic() + ' / 이유: ' + v('pj-why'),
      myDecision: '정제·선택: ' + v('pj-omit') + ' / 점검 ' + [$('#pj-c1').checked, $('#pj-c2').checked, $('#pj-c3').checked].filter(Boolean).length + '/3',
      line: '사회적 발언: ' + v('pj-statement')
    });
    UI.toast('프로젝트를 작업노트에 저장했습니다.');
  }

  document.addEventListener('DOMContentLoaded', () => {
    UI.mountIdeaBar('idea', 'data');
    $('#pj-topic').addEventListener('change', e => { $('#pj-topic-custom').style.display = e.target.value === '기타' ? '' : 'none'; });
    $('#pj-upload').addEventListener('click', () => $('#pj-file').click());
    $('#pj-file').addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { $('#pj-data').value = r.result; const n = (r.result.split(/\r?\n/).filter(Boolean).length - 1); $('#pj-data-info').textContent = '약 ' + Math.max(0, n) + '행 불러옴'; }; r.readAsText(f); });
    $('#pj-data').addEventListener('input', () => { const n = ($('#pj-data').value.split(/\r?\n/).filter(Boolean).length - 1); $('#pj-data-info').textContent = $('#pj-data').value.trim() ? '약 ' + Math.max(0, n) + '행' : ''; });
    $('#pj-send').addEventListener('click', send);
    $('#pj-save').addEventListener('click', save);
  });
})();
