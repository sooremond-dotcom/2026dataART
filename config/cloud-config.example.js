/*
 * cloud-config.example.js — 실시간 클라우드(Firebase) 연동 템플릿
 * =============================================================================
 * 켜는 방법 (교사용, 1회 설정):
 *   1) https://console.firebase.google.com 에서 무료 프로젝트 생성 →
 *      "웹 앱 추가" → firebaseConfig 값 복사.
 *   2) Firestore Database 생성(프로덕션/테스트 모드). 아래 보안 규칙 예시 참고.
 *   3) 이 파일을 같은 폴더에 cloud-config.js 로 복사하고 firebaseConfig 를 채움.
 *   4) 각 HTML 의 <script src="js/store.js"> "앞"에
 *        <script src="config/cloud-config.js"></script>
 *      를 추가. (없으면 자동으로 로컬 저장으로 동작)
 *
 *   → 이러면 한 링크에서 학급 전체가 실시간으로 작품·피드백·노트를 공유합니다.
 *   설정 전/네트워크 불가 시에는 store.js 가 자동으로 로컬 저장으로 폴백합니다.
 *
 * 보안 규칙 예시(테스트용, 학교 정책에 맞게 강화 필요):
 *   rules_version = '2';
 *   service cloud.firestore {
 *     match /databases/{db}/documents {
 *       match /{col}/{doc} { allow read, write: if true; }  // ⚠ 공개. 수업 기간만 사용 권장
 *     }
 *   }
 *   ※ PIN은 진짜 보안이 아닙니다. 미성년자 정보이므로 학교 개인정보 방침을 우선하세요.
 */
(function (global) {
  'use strict';

  // ▼▼▼ 여기에 Firebase 콘솔의 값을 붙여넣으세요 ▼▼▼
  const firebaseConfig = {
    apiKey: 'YOUR_API_KEY',
    authDomain: 'YOUR_PROJECT.firebaseapp.com',
    projectId: 'YOUR_PROJECT',
    storageBucket: 'YOUR_PROJECT.appspot.com',
    messagingSenderId: 'YOUR_SENDER_ID',
    appId: 'YOUR_APP_ID'
  };
  // ▲▲▲ 채우지 않으면(YOUR_ 그대로면) 클라우드를 켜지 않고 로컬을 사용합니다 ▲▲▲
  if (String(firebaseConfig.apiKey).indexOf('YOUR_') === 0) return;

  // Firebase v10 모듈 SDK 를 동적 import (추가 설치 불필요)
  const ready = (async () => {
    const appMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
    const fs = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    const app = appMod.initializeApp(firebaseConfig);
    const db = fs.getFirestore(app);
    return { fs, db };
  })().catch(e => { console.warn('[cloud] 초기화 실패 → 로컬 사용', e); return null; });

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  async function add(col, obj, id) {
    const r = await ready; if (!r) throw new Error('cloud not ready');
    const { fs, db } = r; id = id || obj.id || uid(); obj.id = id;
    await fs.setDoc(fs.doc(db, col, id), obj, { merge: true }); return id;
  }
  async function all(col) {
    const r = await ready; if (!r) return [];
    const { fs, db } = r; const snap = await fs.getDocs(fs.collection(db, col));
    return snap.docs.map(d => d.data());
  }

  // store.js 와 동일한 비동기 API
  global.DN_CLOUD = {
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
    async listNotes(userId) { return (await all('notes')).filter(n => !userId || n.userId === userId).sort((a, b) => b.updatedAt - a.updatedAt); }
  };
  console.info('[cloud] 실시간 공유 활성화됨');
})(window);
