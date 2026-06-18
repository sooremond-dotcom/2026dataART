# 이전 가이드 — 새 GitHub · 새 Firebase로 옮기기

이 폴더 전체가 사이트입니다(설치·서버 불필요, 정적 사이트). 새 **GitHub 계정**과 새 **Firebase 계정**으로 옮기는 순서를 정리했어요.

---

## A. 새 GitHub 계정에 올리고 웹으로 게시(GitHub Pages)

1. **새 저장소 만들기**: 새 GitHub 계정 로그인 → `New repository` → 이름 예: `data-art`(원하는 이름) → Public → Create.

2. **이 폴더를 올리기** (둘 중 편한 방법)
   - **(쉬움) 웹 업로드**: 압축을 푼 모든 파일을 저장소 페이지의 `Add file → Upload files`로 끌어다 올리고 Commit. (숨김 폴더 `.github/`도 함께 올려야 자동 게시가 됩니다.)
   - **(권장) Git 명령**:
     ```bash
     cd 압축푼폴더
     git init && git add -A && git commit -m "init"
     git branch -M main
     git remote add origin https://github.com/<새아이디>/<새저장소>.git
     git push -u origin main
     ```

3. **GitHub Pages 켜기** — 두 방법 중 하나
   - **(자동, 권장)** 이 프로젝트엔 `.github/workflows/pages.yml`이 들어 있어, `main`에 푸시하면 자동 배포됩니다. 저장소 `Settings → Pages → Build and deployment → Source = GitHub Actions` 로 두면 끝.
   - **(수동)** `Settings → Pages → Source = Deploy from a branch → main / (root)` 선택.

4. **게시 주소**: `https://<새아이디>.github.io/<새저장소>/index.html`
   - 모든 링크는 **상대 경로**라 주소가 바뀌어도 그대로 동작합니다(코드 수정 불필요).

> 참고: `pages.yml`은 `main` 브랜치 푸시에 반응하도록 되어 있어요. (옛 브랜치 이름이 남아 있으면 무시해도 되고, `main`만 있으면 됩니다.)

---

## B. 새 Firebase 계정에 연결(실시간 공유 — 선택)

실시간 공유(여러 학생 작품이 한 갤러리에 모임)를 쓰려면 Firebase가 필요합니다. **안 써도** 사이트는 ‘로컬 저장’으로 그대로 동작합니다(작품이 그 기기에만 저장).

1. **Firebase 프로젝트 생성**: https://console.firebase.google.com → `프로젝트 추가` → 이름 예: `data-art-2026-new`.

2. **웹 앱 추가**: 프로젝트 개요 → `</>`(웹) 아이콘 → 앱 등록 → 표시되는 **`firebaseConfig`** 객체를 복사.

3. **`config/cloud-config.js` 교체**: 파일 안의 `firebaseConfig = { ... }` 부분을 **방금 복사한 내 값으로** 통째로 교체.
   ```js
   const firebaseConfig = {
     apiKey: '...내값...',
     authDomain: '내프로젝트.firebaseapp.com',
     projectId: '내프로젝트',
     storageBucket: '내프로젝트.firebasestorage.app',
     messagingSenderId: '...',
     appId: '...'
   };
   ```
   - ⚠ 웹 `apiKey`는 **비밀이 아니라 공개 식별자**입니다(클라이언트에 노출되는 게 정상). 실제 보안은 4번의 **보안 규칙**으로 합니다.

4. **Firestore 만들고 보안 규칙 게시**:
   - 콘솔 → `Firestore Database` → `데이터베이스 만들기`(프로덕션 모드로 시작) → 지역 선택.
   - `규칙` 탭 → 이 폴더의 **`config/firestore.rules`** 내용을 붙여넣고 **게시**.
   - 규칙을 안 올리면 ‘잠금’ 상태라 읽기/쓰기가 거부되고 자동으로 로컬 폴백됩니다(수업은 안 멈춤).

5. **(선택) 표시 이름 정리**: `admin.html`과 `config/cloud-config.js` 주석의 `data-art-2026` 표기를 새 프로젝트 이름으로 바꾸면 깔끔합니다(기능엔 영향 없음).

> **로컬 전용으로 쓰려면**: `config/cloud-config.js`의 `firebaseConfig`를 비우거나, 주소 끝에 `?local=1`을 붙이세요.

---

## C. 기존 학생 데이터(작품·피드백) 옮기기

기존 작품 데이터는 **옛 Firebase 안**에 있어 폴더엔 들어 있지 않습니다. 옮기려면:

1. **옛 사이트**에서 교사 계정으로 로그인 → `admin.html`(교사 대시보드) → **‘데이터 내보내기’**로 JSON 저장.
2. **새 사이트**의 `admin.html` → **‘불러오기/가져오기’**로 그 JSON을 넣으면 병합됩니다.
   - 또는 Firebase 콘솔에서 Firestore를 직접 export/import 해도 됩니다.

⚠ **미성년자 정보**입니다 — 학교 개인정보 방침을 먼저 확인하고, 단원이 끝나면 옛 프로젝트의 데이터는 정리/삭제하세요.

---

## D. 옮긴 뒤 점검 체크리스트

- [ ] `index.html`이 새 주소에서 열리고 로그인/둘러보기가 된다
- [ ] 색·소리·데이터·객체 스튜디오가 모두 동작한다(상대 경로라 보통 그대로 됨)
- [ ] (Firebase 쓸 때) `admin.html`에 **“실시간 공유 연결됨”**이 뜬다 → 규칙 게시 완료
- [ ] 안 뜨면: `config/cloud-config.js`의 값 확인 + `firestore.rules` 게시 확인
- [ ] 자료 출처(명화 = 위키미디어 퍼블릭 도메인)·라이선스(LICENSE) 표기 유지

문의: 이 사이트는 외부 라이브러리도 **로컬 동봉**(`vendor/p5.min.js`)이라 인터넷이 약해도 핵심 기능은 동작합니다. 객체 감지(AI 모델)와 명화 원본·Firebase만 인터넷이 필요합니다.
