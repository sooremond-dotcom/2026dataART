/*
 * cloud-config.js — 실시간 클라우드(Firebase) 연동 [활성]
 * =============================================================================
 * 프로젝트: data-art-2026 (Firestore)
 * 이 파일이 js/store.js "앞"에서 로드되면 학급 전체가 한 링크에서 실시간 공유됩니다.
 *
 *  • Firebase 웹 apiKey 는 '비밀'이 아니라 공개용 식별자입니다(클라이언트에 그대로 노출됨).
 *    실제 보안은 아래 Firestore 보안 규칙으로 합니다 → config/firestore.rules 참고.
 *  • 강제 로컬 전환: 주소 끝에 ?local=1 을 붙이거나(예: gallery.html?local=1),
 *    콘솔에서 localStorage.setItem('dn_cloud_off','1') 후 새로고침.
 *  • SDK·네트워크 실패 시 store.js 가 자동으로 로컬 저장으로 폴백합니다(수업 안 멈춤).
 */
(function (global) {
  'use strict';

  // 강제 로컬 모드(테스트/오프라인/점검용)
  if (location.search.indexOf('local=1') >= 0 || (global.localStorage && localStorage.getItem('dn_cloud_off') === '1')) {
    console.info('[cloud] 강제 로컬 모드 — 클라우드 비활성'); return;
  }

  const firebaseConfig = {
    apiKey: 'AIzaSyB-xLiRM9HapiDdL5Eo1d6fPoivfXrhL5o',
    authDomain: 'data-art-2026.firebaseapp.com',
    projectId: 'data-art-2026',
    storageBucket: 'data-art-2026.firebasestorage.app',
    messagingSenderId: '7529480993',
    appId: '1:7529480993:web:e18576ac928f8217ac7460'
  };

  // Firebase v10 모듈 SDK 동적 import (추가 설치 불필요)
  const ready = (async () => {
    const appMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
    const fs = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    const app = appMod.initializeApp(firebaseConfig);
    const db = fs.getFirestore(app);
    console.info('[cloud] 실시간 공유 활성화됨 · project', firebaseConfig.projectId);
    return { fs, db };
  })().catch(e => { console.warn('[cloud] 초기화 실패 → 로컬 폴백', e); return null; });

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  async function add(col, obj, id) {
    const r = await ready; if (!r) throw new Error('cloud-not-ready');
    id = id || obj.id || uid(); obj.id = id;
    await r.fs.setDoc(r.fs.doc(r.db, col, id), obj, { merge: true }); return id;
  }
  async function all(col) {
    const r = await ready; if (!r) throw new Error('cloud-not-ready');
    const snap = await r.fs.getDocs(r.fs.collection(r.db, col));
    return snap.docs.map(d => d.data());
  }

  global.DN_CLOUD = {
    _ready: ready,
    async saveWork(w) { w.updatedAt = Date.now(); if (!w.createdAt) w.createdAt = Date.now(); return add('works', w, w.id); },
    async listWorks(f) {
      let list = (await all('works')).sort((a, b) => b.updatedAt - a.updatedAt);
      if (f && f.userId) list = list.filter(w => w.userId === f.userId);
      if (f && f.exhibited) list = list.filter(w => w.exhibited);
      return list;
    },
    async getWork(id) { return (await all('works')).find(w => w.id === id) || null; },
    async deleteWork(id) { const r = await ready; if (r) await r.fs.deleteDoc(r.fs.doc(r.db, 'works', id)); },
    async addFeedback(fb) { fb.createdAt = Date.now(); return add('feedback', fb); },
    async listFeedback(workId) { return (await all('feedback')).filter(f => f.workId === workId).sort((a, b) => a.createdAt - b.createdAt); },
    async saveNote(n) { n.updatedAt = Date.now(); if (!n.createdAt) n.createdAt = Date.now(); return add('notes', n, n.id); },
    async listNotes(userId) { return (await all('notes')).filter(n => !userId || n.userId === userId).sort((a, b) => b.updatedAt - a.updatedAt); },
    async saveQuiz(q) { if (!q.createdAt) q.createdAt = Date.now(); return add('quizzes', q, q.id); },
    async listQuizzes() { return (await all('quizzes')).sort((a, b) => b.createdAt - a.createdAt); },
    async getQuiz(id) { return (await all('quizzes')).find(q => q.id === id) || null; },
    async deleteQuiz(id) { const r = await ready; if (r) await r.fs.deleteDoc(r.fs.doc(r.db, 'quizzes', id)); },
    async addQuizAnswer(a) { a.createdAt = Date.now(); return add('quizAnswers', a); },
    async listQuizAnswers(quizId) { return (await all('quizAnswers')).filter(a => !quizId || a.quizId === quizId); }
  };
})(window);
