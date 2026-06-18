/*
 * store.js — 데이터 저장 계층 (로컬 기본 · 클라우드 선택)
 * -----------------------------------------------------------------------------
 * 모든 메서드는 Promise 를 돌려준다(클라우드와 동일한 비동기 형태).
 *   - 기본: 브라우저 localStorage 에 저장(서버 불필요, 오프라인 동작).
 *   - 클라우드: config/cloud-config.js 가 window.DN_CLOUD(같은 API) 를 제공하면
 *     자동으로 그쪽을 사용 → 한 링크에서 학급 전체 실시간 공유.
 *   - 어떤 경우든 exportAll()/importJSON() 으로 교사가 취합할 수 있다.
 *
 * 데이터: works(작품) · feedback(또래 피드백) · notes(작업노트/버전로그)
 */
(function (global) {
  'use strict';

  const K_WORKS = 'dn_works', K_FB = 'dn_feedback', K_NOTES = 'dn_notes', K_QUIZ = 'dn_quizzes', K_QA = 'dn_quizans';
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { return []; } };
  const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // -------- 로컬 백엔드 --------
  const Local = {
    async saveWork(w) {
      const list = read(K_WORKS);
      w.id = w.id || uid();
      w.updatedAt = Date.now();
      const i = list.findIndex(x => x.id === w.id);
      if (i >= 0) list[i] = w; else { w.createdAt = Date.now(); list.push(w); }
      write(K_WORKS, list); return w.id;
    },
    async listWorks(filter) {
      let list = read(K_WORKS).sort((a, b) => b.updatedAt - a.updatedAt);
      if (filter && filter.userId) list = list.filter(w => w.userId === filter.userId);
      if (filter && filter.exhibited) list = list.filter(w => w.exhibited);
      return list;
    },
    async getWork(id) { return read(K_WORKS).find(w => w.id === id) || null; },
    async deleteWork(id) { write(K_WORKS, read(K_WORKS).filter(w => w.id !== id)); },
    async addFeedback(fb) {
      const list = read(K_FB); fb.id = uid(); fb.createdAt = Date.now(); list.push(fb); write(K_FB, list); return fb.id;
    },
    async listFeedback(workId) {
      return read(K_FB).filter(f => f.workId === workId).sort((a, b) => a.createdAt - b.createdAt);
    },
    async saveNote(n) {
      const list = read(K_NOTES); n.id = n.id || uid(); n.updatedAt = Date.now();
      const i = list.findIndex(x => x.id === n.id);
      if (i >= 0) list[i] = n; else { n.createdAt = Date.now(); list.push(n); }
      write(K_NOTES, list); return n.id;
    },
    async listNotes(userId) {
      return read(K_NOTES).filter(n => !userId || n.userId === userId).sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async saveQuiz(q) {
      const list = read(K_QUIZ); q.id = q.id || uid(); q.createdAt = q.createdAt || Date.now();
      const i = list.findIndex(x => x.id === q.id); if (i >= 0) list[i] = q; else list.push(q);
      write(K_QUIZ, list); return q.id;
    },
    async listQuizzes() { return read(K_QUIZ).sort((a, b) => b.createdAt - a.createdAt); },
    async getQuiz(id) { return read(K_QUIZ).find(q => q.id === id) || null; },
    async deleteQuiz(id) { write(K_QUIZ, read(K_QUIZ).filter(q => q.id !== id)); },
    async addQuizAnswer(a) { const list = read(K_QA); a.id = uid(); a.createdAt = Date.now(); list.push(a); write(K_QA, list); return a.id; },
    async listQuizAnswers(quizId) { return read(K_QA).filter(a => !quizId || a.quizId === quizId); }
  };

  // 클라우드가 있으면 우선 사용하되, 실패 시 로컬로 폴백(네트워크가 끊겨도 수업이 멈추지 않도록)
  async function call(method, ...args) {
    const cloud = global.DN_CLOUD;
    if (cloud && typeof cloud[method] === 'function') {
      try { return await cloud[method](...args); }
      catch (e) { console.warn('[store] 클라우드 ' + method + ' 실패 → 로컬 폴백', e && e.message); }
    }
    return Local[method](...args);
  }

  const Store = {
    get mode() { return global.DN_CLOUD ? 'cloud' : 'local'; },
    saveWork: (w) => call('saveWork', w),
    listWorks: (f) => call('listWorks', f),
    getWork: (id) => call('getWork', id),
    deleteWork: (id) => call('deleteWork', id),
    addFeedback: (fb) => call('addFeedback', fb),
    listFeedback: (id) => call('listFeedback', id),
    saveNote: (n) => call('saveNote', n),
    listNotes: (u) => call('listNotes', u),
    saveQuiz: (q) => call('saveQuiz', q),
    listQuizzes: () => call('listQuizzes'),
    getQuiz: (id) => call('getQuiz', id),
    deleteQuiz: (id) => call('deleteQuiz', id),
    addQuizAnswer: (a) => call('addQuizAnswer', a),
    listQuizAnswers: (id) => call('listQuizAnswers', id),

    // 교사 취합용: 로컬 데이터 전체 내보내기/불러오기(병합)
    exportAll() {
      return { app: 'DATA2026SEOULART', exportedAt: new Date().toISOString(),
        works: read(K_WORKS), feedback: read(K_FB), notes: read(K_NOTES), quizzes: read(K_QUIZ), quizAnswers: read(K_QA) };
    },
    importJSON(data) {
      const merge = (k, items) => {
        if (!Array.isArray(items)) return 0;
        const cur = read(k); const byId = new Map(cur.map(x => [x.id, x]));
        items.forEach(x => { if (x && x.id) byId.set(x.id, x); });
        write(k, Array.from(byId.values())); return items.length;
      };
      const a = merge(K_WORKS, data.works), b = merge(K_FB, data.feedback), c = merge(K_NOTES, data.notes);
      const d = merge(K_QUIZ, data.quizzes), e = merge(K_QA, data.quizAnswers);
      return { works: a, feedback: b, notes: c, quizzes: d, quizAnswers: e };
    }
  };

  global.Store = Store;
})(window);
