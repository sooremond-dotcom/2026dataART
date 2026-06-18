/*
 * coach.js — AI 감상 코치 (답이 아니라 '질문'을 주는 코치)
 * -----------------------------------------------------------------------------
 * 기본: 완전 오프라인. 분석 결과·설정·학생 의도를 읽어 '근거를 캐묻는' 질문을 생성.
 * 선택: 교사가 API 키(또는 프록시 주소)를 넣으면 실제 모델 호출(프리 티어 한도는
 *       ratelimit.js 가 보호, 실패 시 자동으로 오프라인 질문으로 폴백).
 * 설계 가치: "AI를 맹신하지 않는다" → 코치는 정답을 주지 않고 생각을 되묻는다.
 */
(function (global) {
  'use strict';

  const K_CFG = 'dn_coach_cfg';
  const limiter = new global.RateLimiter({ req: 5, inTok: 10000, outTok: 4000, concurrency: 1 });
  const cache = new Map();

  function loadCfg() { try { return JSON.parse(localStorage.getItem(K_CFG) || '{}'); } catch (e) { return {}; } }
  function pick(arr, n) {
    const a = arr.slice(); const out = [];
    while (a.length && out.length < n) out.push(a.splice(Math.floor(Math.random() * a.length), 1)[0]);
    return out;
  }
  function pct(x) { return Math.round((x || 0) * 100) + '%'; }
  function colorName(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), L = (0.299 * r + 0.587 * g + 0.114 * b);
    if (mx - mn < 22) return L > 180 ? '밝은 회색/흰색' : L < 70 ? '어두운 회색/검정' : '중간 회색';
    let h = 0; const d = mx - mn;
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    const names = [[15, '빨강'], [45, '주황'], [70, '노랑'], [160, '초록'], [200, '청록'], [255, '파랑'], [290, '보라'], [330, '자홍'], [360, '빨강']];
    for (const [t, nm] of names) if (h < t) return (L < 80 ? '어두운 ' : L > 190 ? '밝은 ' : '') + nm;
    return '빨강';
  }

  /* ----------------------------- 오프라인 질문 생성 ----------------------------- */
  function offlineQuestions(ctx) {
    ctx = ctx || {};
    const qs = [];
    const intent = (ctx.intent || '').trim();

    if (intent) qs.push(`의도를 "${intent}" 라고 적었네요. 지금의 색·점·움직임 중 그 의도를 가장 잘 받쳐 주는 요소와, 오히려 방해하는 요소는 각각 무엇인가요?`);
    else qs.push('이 작품으로 관람자에게 전하고 싶은 한 문장(의도)은 무엇인가요? 그것을 먼저 정하면 다음 선택의 기준이 생겨요.');

    if (ctx.kind === 'color' || ctx.kind === 'lab') {
      if (ctx.palette && ctx.palette.length) {
        const top = ctx.palette[0];
        qs.push(`가장 비율이 큰 색은 ${colorName(top.r, top.g, top.b)} (${pct(top.ratio)})예요. 이 색이 작품의 분위기를 어떻게 이끌고 있나요? 만약 이 색을 빼면 무엇이 사라질까요?`);
      }
      if (ctx.K) qs.push(`K=${ctx.K}로 정한 근거는 무엇인가요? K를 절반으로 줄이면 무엇이 단순해지고, 무엇을 잃게 될까요? (탐구문제 1·2)`);
      if (ctx.space) qs.push(`색공간을 ${String(ctx.space).toUpperCase()}로 골랐네요. RGB와 LAB로 각각 군집화하면 팔레트가 왜 달라질까요?`);
      if (ctx.N) qs.push(`점 개수 N=${ctx.N}는 '해상도'이자 '표현 전략'이에요. 더 적게/많게 했을 때 정보량과 감정 전달은 어떻게 달라지나요?`);
      qs.push('이 색 분석(K-means)이 "놓친 것"은 무엇일까요? (힌트: 알고리즘은 색이 화면 어디에 있는지를 모릅니다)');
    } else if (ctx.kind === 'data') {
      qs.push(`무엇을 데이터로 골랐나요(${ctx.dataName || '예: 감정·걸음·소음·기온'})? 그 선택이 '우리'를 어떻게 드러내나요?`);
      qs.push('값→크기, 변화량→속도, 증가/감소→방향(벡터), 빈도→밀도 중 주제에 가장 중요한 매핑은 무엇이고, 왜 그렇게 생각하나요?');
      qs.push('변화가 가장 큰 구간은 왜 그렇게 나타났을까요? 그 격함을 데이터(맥락)로 설명할 수 있나요?');
      qs.push('개인 데이터를 익명·집계로 다뤘나요? "낮은 점수=문제"처럼 낙인찍지 않도록 설명을 상황·맥락 중심으로 바꿀 수 있을까요?');
    } else {
      qs.push('이 분석 렌즈(색/명암/윤곽/구도) 중 작가의 의도를 가장 잘 드러내는 것은 무엇이고, 그 이유는 무엇인가요?');
    }

    // 인터랙션 규칙이 있으면
    if (ctx.rules) qs.push(`관람자가 ${ctx.rules} 할 때 변화가 일어나죠. 그 반응이 단순한 '효과'를 넘어 '해석'이 되려면 무엇과 더 연결되어야 할까요?`);

    qs.push('재창조로 "강해진 것" 한 가지와 "사라진 것" 한 가지를 말해 볼까요? 그 손실은 의도에 도움이 되나요, 방해가 되나요?');

    return pick(qs, 4);
  }

  function formatOffline(qs) {
    return '🧭 **감상 코치 — 답이 아니라 질문이에요.**\n\n' +
      qs.map((q, i) => `**${i + 1}.** ${q}`).join('\n\n') +
      '\n\n_정답을 찾기보다, 당신의 선택에 근거를 붙여 보세요. 메모/노트에 적으면 그대로 리포트가 됩니다._';
  }

  /* ----------------------------- 모델 호출(선택) ----------------------------- */
  function buildPrompt(ctx) {
    const lines = [];
    lines.push('학생이 만든 데이터 기반 미술 작품의 맥락이다. 아래를 보고 한국어로 "질문 3개"만 해라.');
    lines.push('규칙: (1) 절대 답·평가·칭찬을 하지 말고 오직 질문만. (2) 조형 요소(색·명도·대비·구도·리듬) 용어 사용. (3) 학생이 근거를 말하도록 캐묻기. (4) 각 질문 1~2문장.');
    lines.push('맥락: ' + JSON.stringify(slimCtx(ctx)));
    return lines.join('\n');
  }
  function slimCtx(ctx) {
    const c = { kind: ctx.kind, intent: ctx.intent, K: ctx.K, N: ctx.N, space: ctx.space, rules: ctx.rules };
    if (ctx.palette) c.topColors = ctx.palette.slice(0, 4).map(p => ({ rgb: [p.r, p.g, p.b], ratio: Math.round((p.ratio || 0) * 100) }));
    return c;
  }
  async function callModel(ctx, cfg) {
    const prompt = buildPrompt(ctx);
    const estIn = global.estimateTokens(prompt) + 120, estOut = 320;
    return limiter.schedule({
      estIn, estOut,
      onWait: (ms) => { if (ctx.onWait) ctx.onWait(ms); },
      fn: async () => {
        if (cfg.mode === 'proxy' && cfg.endpoint) {
          const r = await fetch(cfg.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ context: slimCtx(ctx), prompt }) });
          if (!r.ok) { const e = new Error('proxy ' + r.status); e.status = r.status; throw e; }
          const j = await r.json();
          return j.text || j.completion || '';
        }
        // 직접 Anthropic 호출(브라우저). 키가 사용자에게 노출되므로 신뢰된 환경에서만.
        const r = await fetch(cfg.endpoint || 'https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': cfg.apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify({
            model: cfg.model || 'claude-haiku-4-5-20251001',
            max_tokens: 320,
            system: '너는 미술 감상 코치다. 정답·평가·칭찬 없이, 학생이 근거를 떠올리도록 한국어 질문만 한다.',
            messages: [{ role: 'user', content: prompt }]
          })
        });
        if (!r.ok) { const e = new Error('api ' + r.status); e.status = r.status; throw e; }
        const j = await r.json();
        return (j.content && j.content.map(b => b.text || '').join('\n')) || '';
      }
    });
  }

  /* ----------------------------- 공개 API ----------------------------- */
  const Coach = {
    limiter,
    getConfig() { return loadCfg(); },
    setConfig(cfg) { localStorage.setItem(K_CFG, JSON.stringify(cfg || {})); },
    clearConfig() { localStorage.removeItem(K_CFG); },
    status() { return limiter.status(); },

    // 항상 성공한다(모델 실패 시 오프라인 질문으로 폴백). → {text, source}
    async ask(ctx) {
      const cfg = loadCfg();
      const useApi = cfg && cfg.enabled && (cfg.apiKey || (cfg.mode === 'proxy' && cfg.endpoint));
      if (useApi) {
        const key = JSON.stringify(slimCtx(ctx));
        if (cache.has(key)) return { text: cache.get(key), source: 'api(cache)' };
        try {
          const text = await callModel(ctx, cfg);
          if (text && text.trim()) {
            const out = '🤖 **감상 코치 (AI)**\n\n' + text.trim() +
              '\n\n_AI의 질문도 정답이 아니에요. 동의/반박하며 당신의 근거를 세워 보세요._';
            cache.set(key, out);
            return { text: out, source: 'api' };
          }
        } catch (e) { /* 한도 초과/네트워크 → 폴백 */ }
      }
      return { text: formatOffline(offlineQuestions(ctx)), source: 'offline' };
    },
    // 모델 없이 즉시 오프라인 질문만
    offline(ctx) { return formatOffline(offlineQuestions(ctx)); }
  };

  global.Coach = Coach;
})(window);
