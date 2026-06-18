/*
 * particles.js — 점(입자) 시스템: 움직임 규칙 + 렌더링
 * -----------------------------------------------------------------------------
 * 분석 결과(점 리스트)를 받아 "살아 있는" 입자로 만든다.
 * 학생이 설계하는 규칙(수업 3.5)을 코드로 구현한 부분:
 *   - 마우스 근접 → 크기↑/밀어내기/끌어당기기/흩뿌리기
 *   - 마이크 볼륨 → 진동/확산/크기/폭발
 *   - 주파수 대역(저·중·고음) → 밝기에 따라 특정 색 군집만 반응
 *   - 복귀력(집중) ↔ 확산, 진동, 잔상, 발광, 3D 조각(밝기→깊이)
 *
 * 성능을 위해 값들을 Typed Array(SoA)로 보관하고, 색은 군집 단위로 묶어 그린다.
 */
(function (global) {
  'use strict';

  const TAU = Math.PI * 2;

  // 점 색의 색상(hue) 0~360 (무채색은 -1) — '색 기반 방향' 힘에 사용
  function hueOf(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d < 16) return -1;
    let h;
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  }

  function System(analysis, rect, opts) {
    this.a = analysis;
    this.n = analysis.count;
    this.opts = opts || {};
    this.angle = 0;                  // 3D Y축 회전 각
    this.angleX = 0;                 // 3D X축 회전 각
    this.K = analysis.K;
    this.visible = new Array(this.K).fill(true);

    const n = this.n;
    this.hx = new Float32Array(n);   // 제자리(home) 위치
    this.hy = new Float32Array(n);
    this.px = new Float32Array(n);   // 현재 위치
    this.py = new Float32Array(n);
    this.vx = new Float32Array(n);   // 속도
    this.vy = new Float32Array(n);
    this.ds = new Float32Array(n);   // 이번 프레임에 그릴 크기
    this.cluster = analysis.cluster;
    this.br = analysis.br;
    this.ed = analysis.ed;                 // 점별 윤곽(에지) 세기 0~1 (있으면)
    this.lens = this.opts.lens || 'none';  // 구조 렌즈: none / edge / composition

    // 점별 색상(hue) 미리 계산 — '색 기반 방향(색 나침반)' 힘에 사용
    this.hue = new Float32Array(n);
    for (let i = 0; i < n; i++) this.hue[i] = hueOf(analysis.or[i], analysis.og[i], analysis.ob[i]);

    // 점 색(문자열) 미리 계산: 대표색 / 원본색
    this.colStr = new Array(n);
    this.setColorMode(this.opts.colorMode || 'cluster');

    // 렌더 순서: 군집별로 묶으면 fillStyle 변경이 줄어 빨라진다.
    this.order = Array.from({ length: n }, (_, i) => i)
      .sort((i, j) => this.cluster[i] - this.cluster[j]);

    this.remap(rect, true);
  }

  // 점 색 모드 전환 (분석을 다시 하지 않고 색만 바꿈)
  System.prototype.setColorMode = function (mode) {
    const a = this.a, n = this.n;
    for (let i = 0; i < n; i++) {
      let r, g, b;
      if (mode === 'original') { r = a.or[i]; g = a.og[i]; b = a.ob[i]; }
      else if (mode === 'mono') { r = g = b = Math.max(0, Math.min(255, Math.round(a.br[i] * 255))); } // 명암(흑백) 렌즈
      else { const p = a.palette[a.cluster[i]]; r = p.r; g = p.g; b = p.b; }
      this.colStr[i] = 'rgb(' + r + ',' + g + ',' + b + ')';
    }
    this.colorMode = mode;
  };

  System.prototype.setVisibility = function (clusterIndex, on) {
    this.visible[clusterIndex] = on;
  };

  // 구조 렌즈 전환(분석을 다시 하지 않고 표현만 바꿈)
  System.prototype.setLens = function (mode) { this.lens = mode || 'none'; };

  // 캔버스 크기에 맞춰 home 좌표 재계산(정규화 좌표 → 화면 좌표)
  System.prototype.remap = function (rect, resetPos) {
    this.rect = rect;
    const a = this.a, n = this.n, cell = this.opts.mosaicCell || 0;
    let sx = 0, sy = 0, sw = 0;                 // 구도 렌즈용 '시선 무게중심' 누적
    for (let i = 0; i < n; i++) {
      let hx = rect.x + a.nx[i] * rect.w;
      let hy = rect.y + a.ny[i] * rect.h;
      if (cell > 0) { hx = Math.floor(hx / cell) * cell + cell / 2; hy = Math.floor(hy / cell) * cell + cell / 2; } // 모자이크 격자에 스냅
      this.hx[i] = hx; this.hy[i] = hy;
      if (resetPos) { this.px[i] = hx; this.py[i] = hy; }
      // 윤곽이 강하거나(시선이 머무는 곳) 밝은 점에 더 큰 무게 → 시각적 무게중심
      const wgt = this.ed ? (0.08 + this.ed[i]) : (0.12 + (this.br ? this.br[i] : 0.5));
      sx += hx * wgt; sy += hy * wgt; sw += wgt;
    }
    this.cwx = sw ? sx / sw : rect.x + rect.w / 2;
    this.cwy = sw ? sy / sw : rect.y + rect.h / 2;
  };

  // 폭발: (cx,cy)에서 바깥으로 한 번 강하게 밀어냄
  System.prototype.explode = function (cx, cy, power, radius) {
    const n = this.n, r2 = radius ? radius * radius : Infinity;
    for (let i = 0; i < n; i++) {
      let dx = this.px[i] - cx, dy = this.py[i] - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const d = Math.sqrt(d2) + 0.001;
      const f = power * (radius ? (1 - Math.sqrt(d2) / radius) : 1);
      this.vx[i] += (dx / d) * f * (3 + Math.random() * 2);
      this.vy[i] += (dy / d) * f * (3 + Math.random() * 2);
    }
  };

  // 밝기 b 가 대역(0=저,0.5=중,1=고)에 얼마나 가까운지 가중치(삼각형)
  function bandWeight(b, center) {
    return Math.max(0, 1 - Math.abs(b - center) * 2.2);
  }

  // 매 프레임 물리 갱신
  System.prototype.update = function (env) {
    const n = this.n;
    const m = env.motion, mo = env.mouse, mic = env.mic;
    const ret = m.returnForce, damp = m.damping, vib = m.vibration;
    const cx = this.rect.x + this.rect.w / 2, cy = this.rect.y + this.rect.h / 2;

    const mActive = mo.mode !== 'none';
    const mr = mo.radius, mr2 = mr * mr, mstr = mo.strength;
    const baseSize = this.opts.baseSize;

    // 마이크에서 오는 전역 효과
    const micOn = mic && mic.enabled;
    const vol = micOn ? mic.volume : 0;
    const volVib = (micOn && mic.target === 'vibration') ? vol * 8 : 0;
    const volSpread = (micOn && mic.target === 'spread') ? vol : 0;
    const volSize = (micOn && mic.target === 'size') ? vol : 0;
    const freqOn = micOn && mic.freqOn;

    // 3D 자동 회전: 축 설정(y / x / xy)에 따라 각을 증가
    const rs = m.rotateSpeed || 0, axis = m.rotAxis || 'y';
    if (axis === 'x') this.angleX += rs;
    else if (axis === 'xy') { this.angle += rs; this.angleX += rs * 0.6; }
    else this.angle += rs;

    const free = !!m.free, wander = m.wander || 0;
    const pull = (m.pull != null ? m.pull : 0.004), swirl = (m.swirl || 0) * 0.012;
    // 전역 '장(場)' 힘: 중력(아래+)·좌우 흐름·값 기반 방향·색 기반 방향(색 나침반)
    const grav = m.gravity || 0, flow = m.flow || 0;
    const valF = m.valForce || 0, valField = m.valField || 'bright', valDir = m.valDir || 'ud';
    const colF = m.colorForce || 0, hasField = grav || flow || valF || colF;
    for (let i = 0; i < n; i++) {
      let ax, ay;
      if (free) {
        // 자유(마구잡이): 원본 위치로 복귀하지 않고 떠돈다. 학생이 떠돎·소용돌이·중심인력을 직접 조절.
        const dx = this.px[i] - cx, dy = this.py[i] - cy;
        ax = -dx * pull + (Math.random() - 0.5) * wander - dy * swirl;   // 중심 인력 + 떠돎 + 소용돌이(접선)
        ay = -dy * pull + (Math.random() - 0.5) * wander + dx * swirl;
      } else {
        // 원위치 유지: 원본 그림의 점 위치로 돌아가며 그림을 유지한다.
        ax = (this.hx[i] - this.px[i]) * ret;
        ay = (this.hy[i] - this.py[i]) * ret;
      }

      // 전역 장 힘: 중력 · 좌우 흐름 · 값 기반 방향 · 색 기반 방향
      if (hasField) {
        if (grav) ay += grav;
        if (flow) ax += flow;
        if (valF) {
          const vv = ((valField === 'edge' && this.ed) ? this.ed[i] : this.br[i]) - 0.5;
          if (valDir === 'lr') ax += vv * valF * 2.4;                 // 값 클수록 오른쪽
          else if (valDir === 'out') { const dx = this.px[i] - cx, dy = this.py[i] - cy, d = Math.sqrt(dx * dx + dy * dy) + 0.001; ax += dx / d * vv * valF * 2.4; ay += dy / d * vv * valF * 2.4; }
          else ay -= vv * valF * 2.4;                                 // 기본: 값 클수록 위로
        }
        if (colF) { const hu = this.hue[i]; if (hu >= 0) { const hr = hu * Math.PI / 180; ax += Math.cos(hr) * colF; ay += Math.sin(hr) * colF; } }
      }

      // 기본 진동 + 마이크 볼륨 진동
      const totalVib = vib + volVib;
      if (totalVib > 0) {
        ax += (Math.random() - 0.5) * totalVib;
        ay += (Math.random() - 0.5) * totalVib;
      }

      // 마우스 상호작용
      let swell = 0;
      if (mActive) {
        const dx = this.px[i] - mo.x, dy = this.py[i] - mo.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < mr2) {
          const d = Math.sqrt(d2) + 0.001;
          const f = (1 - d / mr) * mstr;
          if (mo.mode === 'repel') { ax += (dx / d) * f * 6; ay += (dy / d) * f * 6; }
          else if (mo.mode === 'attract') { ax -= (dx / d) * f * 5; ay -= (dy / d) * f * 5; }
          else if (mo.mode === 'scatter') {
            ax += (Math.random() - 0.5) * f * 14; ay += (Math.random() - 0.5) * f * 14;
          } else if (mo.mode === 'swell') { swell = f * 2.4; }
        }
      }

      // 마이크 볼륨 확산(중심에서 바깥으로)
      if (volSpread > 0) {
        const dx = this.px[i] - cx, dy = this.py[i] - cy;
        const d = Math.sqrt(dx * dx + dy * dy) + 0.001;
        ax += (dx / d) * volSpread * 2.2;
        ay += (dy / d) * volSpread * 2.2;
      }

      // 주파수 → 색 군집 반응 (밝기로 대역 가르기)
      let act = 0;
      if (freqOn) {
        const b = this.br[i];
        act = mic.low * bandWeight(b, 0.15) +
              mic.mid * bandWeight(b, 0.5) +
              mic.high * bandWeight(b, 0.9);
        if (act > 0) {
          ax += (Math.random() - 0.5) * act * 10;
          ay += (Math.random() - 0.5) * act * 10;
        }
      }

      // 적분(속도·위치 갱신)
      let nvx = (this.vx[i] + ax) * damp;
      let nvy = (this.vy[i] + ay) * damp;
      // 폭주 방지
      const sp2 = nvx * nvx + nvy * nvy, MAX = 900;
      if (sp2 > MAX) { const s = Math.sqrt(MAX / sp2); nvx *= s; nvy *= s; }
      this.vx[i] = nvx; this.vy[i] = nvy;
      this.px[i] += nvx; this.py[i] += nvy;

      // 이번 프레임 크기(기본 + 부풀리기 + 볼륨/주파수 펄스)
      let s = baseSize * (1 + swell + volSize * 1.6 + act * 1.8);
      this.ds[i] = s;
    }
  };

  // 렌더링: ctx 는 캔버스 2D 컨텍스트
  System.prototype.render = function (ctx, view) {
    const n = this.n;
    ctx.globalCompositeOperation = view.additive ? 'lighter' : 'source-over';

    // 선 모드: 제자리에서 얼마나 벗어났는지 가는 선으로 표시
    if (view.lines) {
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(180,200,255,0.5)';
      ctx.beginPath();
      for (let k = 0; k < n; k += 1) {
        const i = this.order[k];
        if (!this.visible[this.cluster[i]]) continue;
        ctx.moveTo(this.hx[i], this.hy[i]);
        ctx.lineTo(this.px[i], this.py[i]);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    const is3D = view.mode === '3d';
    const focal = 900, depth = view.depth;
    const cx = this.rect.x + this.rect.w / 2, cy = this.rect.y + this.rect.h / 2;
    const cay = Math.cos(this.angle), say = Math.sin(this.angle);          // Y축
    const cax = Math.cos(this.angleX || 0), sax = Math.sin(this.angleX || 0); // X축
    const edgeLens = this.lens === 'edge' && this.ed;   // 에지 렌즈: 윤곽이 강한 점만 또렷하게
    const shape = view.shape || 'circle';
    const baseAlpha = view.pointAlpha != null ? view.pointAlpha : 1;   // 점 불투명도(겹침 농담)
    ctx.globalAlpha = baseAlpha;

    let lastStyle = null;
    for (let k = 0; k < n; k++) {
      const i = this.order[k];
      if (!this.visible[this.cluster[i]]) continue;

      let sx = this.px[i], sy = this.py[i], size = this.ds[i];
      if (is3D) {
        // 밝기 → 깊이(z). Y축·X축 회전 후 원근 투영 → "데이터가 3D 조각이 되다"
        const x0 = this.px[i] - cx, y0 = this.py[i] - cy, z0 = (this.br[i] - 0.5) * depth;
        const x1 = x0 * cay + z0 * say, z1 = -x0 * say + z0 * cay;   // Y축 회전
        const y2 = y0 * cax - z1 * sax, z2 = y0 * sax + z1 * cax;     // X축 회전
        const scale = focal / (focal + z2);
        sx = cx + x1 * scale;
        sy = cy + y2 * scale;
        size = this.ds[i] * scale;
      }
      if (edgeLens) {
        // 윤곽 세기에 따라 크기·투명도를 조절 → 평평한 면은 사라지고 '선묘'만 남음
        const e = this.ed[i];
        size *= 0.3 + e * 1.7;
        ctx.globalAlpha = baseAlpha * (0.08 + e * 0.92);
      }
      if (size < 0.4) continue;

      const style = this.colStr[i];
      if (style !== lastStyle) { ctx.fillStyle = style; lastStyle = style; }

      if (shape === 'circle') {
        if (size <= 1.6) ctx.fillRect(sx - size, sy - size, size * 2, size * 2); // 작은 점은 사각형(빠름)
        else { ctx.beginPath(); ctx.arc(sx, sy, size, 0, TAU); ctx.fill(); }
      } else {
        drawShape(ctx, shape, sx, sy, size);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (this.lens === 'composition') drawComposition(ctx, this.rect, this.cwx, this.cwy); // 삼분할·무게중심 오버레이
  };

  // 구도 렌즈: 삼분할 격자 + 파워포인트(교차점) + 시선 무게중심을 겹쳐 그린다.
  function drawComposition(ctx, rect, cx, cy) {
    const x1 = rect.x + rect.w / 3, x2 = rect.x + rect.w * 2 / 3;
    const y1 = rect.y + rect.h / 3, y2 = rect.y + rect.h * 2 / 3;
    ctx.save();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.beginPath();
    ctx.moveTo(x1, rect.y); ctx.lineTo(x1, rect.y + rect.h);
    ctx.moveTo(x2, rect.y); ctx.lineTo(x2, rect.y + rect.h);
    ctx.moveTo(rect.x, y1); ctx.lineTo(rect.x + rect.w, y1);
    ctx.moveTo(rect.x, y2); ctx.lineTo(rect.x + rect.w, y2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    [[x1, y1], [x2, y1], [x1, y2], [x2, y2]].forEach(p => { ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, TAU); ctx.fill(); });
    // 시선 무게중심(주황 ◎ + 십자선): 삼분할 교차점에 가까울수록 '안정된 구도'
    ctx.strokeStyle = '#ff7a45'; ctx.fillStyle = 'rgba(255,122,69,0.18)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 13, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 20, cy); ctx.lineTo(cx + 20, cy);
    ctx.moveTo(cx, cy - 20); ctx.lineTo(cx, cy + 20);
    ctx.stroke();
    ctx.restore();
  }

  // 점 하나를 고른 모양으로 그린다(원이 기본). 작은 원은 호출 측에서 빠른 경로 사용.
  function drawShape(ctx, shape, x, y, s) {
    if (shape === 'square') { ctx.fillRect(x - s, y - s, s * 2, s * 2); return; }
    if (shape === 'triangle') {
      ctx.beginPath(); ctx.moveTo(x, y - s * 1.2); ctx.lineTo(x + s * 1.05, y + s * 0.85); ctx.lineTo(x - s * 1.05, y + s * 0.85); ctx.closePath(); ctx.fill(); return;
    }
    if (shape === 'diamond') {
      ctx.beginPath(); ctx.moveTo(x, y - s * 1.25); ctx.lineTo(x + s * 1.1, y); ctx.lineTo(x, y + s * 1.25); ctx.lineTo(x - s * 1.1, y); ctx.closePath(); ctx.fill(); return;
    }
    if (shape === 'cross') {
      const t = s * 0.4; ctx.fillRect(x - t, y - s, t * 2, s * 2); ctx.fillRect(x - s, y - t, s * 2, t * 2); return;
    }
    if (shape === 'star') {
      const spikes = 5, outer = s * 1.25, inner = s * 0.52; let rot = -Math.PI / 2;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(rot) * outer, y + Math.sin(rot) * outer);
      for (let q = 0; q < spikes; q++) {
        rot += Math.PI / spikes; ctx.lineTo(x + Math.cos(rot) * inner, y + Math.sin(rot) * inner);
        rot += Math.PI / spikes; ctx.lineTo(x + Math.cos(rot) * outer, y + Math.sin(rot) * outer);
      }
      ctx.closePath(); ctx.fill(); return;
    }
    ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill();   // circle
  }

  function create(analysis, rect, opts) { return new System(analysis, rect, opts); }

  global.Particles = { create, System };
})(window);
