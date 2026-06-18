/*
 * studio-color-glue.js — 색 군집 스튜디오를 사이트(코치·전시·허브)와 연결
 * -----------------------------------------------------------------------------
 * 단일 파일(오프라인 백업) 동작을 해치지 않도록, 자체 토스트/모달을 쓰고
 * 공용 site.css/ui.js 에 의존하지 않는다. window.ColorStudio 훅을 통해 맥락을 읽는다.
 */
(function () {
  'use strict';
  if (!window.ColorStudio) return;

  // --- 미니 토스트 ---
  function toast(msg) {
    let t = document.getElementById('glue-toast');
    if (!t) { t = document.createElement('div'); t.id = 'glue-toast';
      t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#11151f;border:1px solid #ffb454;color:#e8ecf6;padding:11px 18px;border-radius:11px;font-size:13px;z-index:200;box-shadow:0 10px 30px rgba(0,0,0,.5);transition:.2s;opacity:0';
      document.body.appendChild(t); }
    t.textContent = msg; t.style.opacity = '1';
    clearTimeout(toast._t); toast._t = setTimeout(() => t.style.opacity = '0', 2400);
  }
  // --- 미니 모달 ---
  function modal(title, html) {
    let bg = document.getElementById('glue-modal');
    if (!bg) {
      bg = document.createElement('div'); bg.id = 'glue-modal';
      bg.style.cssText = 'position:fixed;inset:0;background:rgba(4,6,12,.72);display:flex;align-items:center;justify-content:center;z-index:210;padding:18px';
      bg.innerHTML = '<div style="background:#141826;border:1px solid #2a3145;border-radius:16px;max-width:560px;width:100%;max-height:86vh;overflow:auto;padding:22px 24px;position:relative"><button id="glue-x" style="position:absolute;right:12px;top:12px;background:#1b2030;border:1px solid #2a3145;color:#e8ecf6;border-radius:8px;width:30px;height:30px;cursor:pointer">✕</button><h2 id="glue-t" style="margin:0 0 12px;font-size:18px;color:#e8ecf6"></h2><div id="glue-b" style="font-size:13.6px;line-height:1.7;color:#e8ecf6"></div></div>';
      document.body.appendChild(bg);
      bg.addEventListener('click', e => { if (e.target === bg) bg.style.display = 'none'; });
      bg.querySelector('#glue-x').addEventListener('click', () => bg.style.display = 'none');
    }
    bg.querySelector('#glue-t').innerHTML = title;
    bg.querySelector('#glue-b').innerHTML = html;
    bg.style.display = 'flex';
    return bg.querySelector('#glue-b');
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const md = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/_(.+?)_/g, '<i>$1</i>').replace(/\n/g, '<br>');

  // --- 상단 버튼 주입 ---
  function injectButtons() {
    const bar = document.querySelector('.top-actions');
    if (!bar) return;
    const mk = (txt, title) => { const b = document.createElement('button'); b.className = 'btn'; b.textContent = txt; if (title) b.title = title; return b; };
    const home = document.createElement('a'); home.href = 'hub.html'; home.className = 'btn ghost'; home.textContent = '← 허브'; home.style.textDecoration = 'none';
    const bCoach = mk('🧭 코치', '감상 코치에게 질문받기');
    const bExhibit = mk('🖼 전시', '갤러리에 전시하기');
    bar.insertBefore(home, bar.firstChild);
    bar.appendChild(bCoach); bar.appendChild(bExhibit);
    bCoach.addEventListener('click', coach);
    bExhibit.addEventListener('click', exhibitForm);

    const bTheme = mk('🌗', '밝은/어두운 테마');
    bar.appendChild(bTheme);
    const setIcon = () => { bTheme.textContent = document.documentElement.getAttribute('data-theme') === 'light' ? '🌙' : '🌞'; };
    setIcon();
    bTheme.addEventListener('click', () => {
      const light = document.documentElement.getAttribute('data-theme') === 'light';
      if (light) { document.documentElement.removeAttribute('data-theme'); try { localStorage.setItem('dn_theme', 'dark'); } catch (e) {} }
      else { document.documentElement.setAttribute('data-theme', 'light'); try { localStorage.setItem('dn_theme', 'light'); } catch (e) {} }
      setIcon();
    });
  }

  async function coach() {
    if (!window.Coach) { toast('코치 모듈이 없습니다.'); return; }
    const b = modal('🧭 감상 코치', '<span style="opacity:.7">질문을 준비하는 중…</span>');
    const res = await Coach.ask(window.ColorStudio.context());
    const tag = res.source.indexOf('api') === 0 ? '실제 모델' : '오프라인 코치';
    modal('🧭 감상 코치 <span style="font-size:12px;color:#9aa3bd">(' + tag + ')</span>', md(res.text));
  }

  function exhibitForm() {
    if (!window.Store || !window.Auth) { toast('저장 모듈이 없습니다.'); return; }
    const u = Auth.current();
    if (!u) { toast('전시하려면 로그인하세요.'); setTimeout(() => location.href = 'index.html?next=studio-color.html', 900); return; }
    if (!window.ColorStudio.hasAnalysis()) { toast('먼저 이미지를 분석하세요.'); return; }
    const meta = window.ColorStudio.meta();
    const inp = 'width:100%;font:inherit;font-size:14px;background:#0a0c12;color:#e8ecf6;border:1px solid #2a3145;border-radius:8px;padding:9px 11px;margin-top:4px';
    const b = modal('🖼 갤러리에 전시', `
      <p style="color:#9aa3bd;font-size:12.5px;margin:0 0 10px">‘의도 한 문장 + 조형 근거 1개’를 채워야 전시할 수 있어요(근거가 먼저!).</p>
      <label style="font-size:12px;color:#9aa3bd">제목</label>
      <input id="g-title" style="${inp}" value="${esc(meta.title || '')}" placeholder="작품 제목">
      <label style="font-size:12px;color:#9aa3bd;display:block;margin-top:10px">의도(한 문장)</label>
      <input id="g-intent" style="${inp}" value="${esc(meta.intent || '')}" placeholder="예: 소리로 그림을 연주하는 경험">
      <label style="font-size:12px;color:#9aa3bd;display:block;margin-top:10px">조형 요소 근거(최소 1개)</label>
      <textarea id="g-evi" rows="2" style="${inp}" placeholder="예: 대표색을 8개로 줄여 분위기를 단순화"></textarea>
      <button id="g-go" class="btn primary" style="margin-top:12px">전시하기</button>`);
    b.querySelector('#g-go').addEventListener('click', async () => {
      const title = b.querySelector('#g-title').value.trim() || '색 군집 작품';
      const intent = b.querySelector('#g-intent').value.trim();
      const evidence = b.querySelector('#g-evi').value.trim();
      if (!intent || !evidence) { toast('의도와 근거를 모두 채워 주세요.'); return; }
      const cv = window.ColorStudio.canvas();
      let thumb = '';
      if (cv) { const w = 360, h = Math.round(w * cv.height / cv.width); const t = document.createElement('canvas'); t.width = w; t.height = h; t.getContext('2d').drawImage(cv, 0, 0, w, h); thumb = t.toDataURL('image/jpeg', 0.6); }
      await Store.saveWork({ userId: u.userId, by: u.display, klass: u.klass, kind: 'color', title, intent, evidence,
        settings: window.ColorStudio.settings(), meta, thumb, srcImg: window.ColorStudio.sourceURL(), exhibited: true });
      document.getElementById('glue-modal').style.display = 'none';
      toast('🎉 갤러리에 전시했습니다!');
    });
  }

  // 분석실에서 보낸 이미지(dataURL)가 있으면 스튜디오에 불러오기
  function checkIncomingImage() {
    const url = localStorage.getItem('dn_studio_image');
    if (!url) return;
    const title = localStorage.getItem('dn_studio_image_title') || '분석실에서 받은 이미지';
    localStorage.removeItem('dn_studio_image'); localStorage.removeItem('dn_studio_image_title');
    // 스튜디오 자체 데모 로드(약 120ms) 이후에 적용되도록 약간 지연
    setTimeout(() => {
      if (window.ColorStudio && ColorStudio.loadImageURL) {
        ColorStudio.loadImageURL(url, title);
        toast('분석실에서 보낸 ‘' + title + '’ 이미지를 불러왔어요.');
      }
    }, 700);
  }

  document.addEventListener('DOMContentLoaded', () => { injectButtons(); checkIncomingImage(); });
})();
