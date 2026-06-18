/*
 * kmeans.js — 색 군집화(K-means) 알고리즘
 * -----------------------------------------------------------------------------
 * 일반적인 벡터(숫자 배열)에 대해 동작하므로 RGB/LAB 어느 색공간이든 쓸 수 있다.
 * 수업 맥락: "픽셀 전체를 다 쓰지 않고 핵심 색상 K개로 요약" = 추상화의 실제 사례.
 *
 *  cluster(data, K, options) → { centroids, assignments, counts }
 *    data        : [[c0,c1,c2], ...]  (예: [r,g,b] 또는 [L,a,b])
 *    K           : 군집(대표색) 개수
 *    options.seed: 난수 시드(같은 시드 → 같은 결과, 재현성 보장)
 */
(function (global) {
  'use strict';

  // 시드 기반 난수(mulberry32). 같은 시드를 주면 항상 같은 수열이 나오므로
  // "같은 설정으로 다시 분석하면 같은 결과"가 되어 비교/기록(로그)에 유리하다.
  function makeRNG(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 두 벡터 사이 거리의 제곱(루트를 생략해 비교만 빠르게)
  function dist2(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
    return s;
  }

  // k-means++ 초기화: 멀리 떨어진 점을 우선 골라 초기 중심을 잘 퍼뜨린다.
  function kppInit(data, K, rng) {
    const n = data.length;
    const centroids = [data[Math.floor(rng() * n)].slice()];
    const best = new Float64Array(n).fill(Infinity);
    for (let c = 1; c < K; c++) {
      let sum = 0;
      const prev = centroids[c - 1];
      for (let i = 0; i < n; i++) {
        const dd = dist2(data[i], prev);
        if (dd < best[i]) best[i] = dd;
        sum += best[i];
      }
      let r = rng() * sum, idx = 0;
      for (; idx < n - 1; idx++) { r -= best[idx]; if (r <= 0) break; }
      centroids.push(data[idx].slice());
    }
    return centroids;
  }

  function cluster(data, K, options) {
    options = options || {};
    const maxIter = options.maxIter || 24;
    const n = data.length;
    const dim = data[0].length;
    K = Math.max(1, Math.min(K, n));
    const rng = makeRNG(options.seed != null ? options.seed : 12345);

    const centroids = kppInit(data, K, rng);
    const assign = new Int32Array(n);
    const counts = new Int32Array(K);

    for (let iter = 0; iter < maxIter; iter++) {
      let changed = false;

      // (1) 할당 단계: 각 점을 가장 가까운 중심으로 배정
      for (let i = 0; i < n; i++) {
        let best = 0, bestD = Infinity;
        for (let c = 0; c < K; c++) {
          const dd = dist2(data[i], centroids[c]);
          if (dd < bestD) { bestD = dd; best = c; }
        }
        if (assign[i] !== best) { assign[i] = best; changed = true; }
      }

      // (2) 갱신 단계: 각 군집의 평균으로 중심을 옮김
      const sums = [];
      for (let c = 0; c < K; c++) { sums.push(new Float64Array(dim)); counts[c] = 0; }
      for (let i = 0; i < n; i++) {
        const c = assign[i]; counts[c]++;
        const v = data[i], s = sums[c];
        for (let d = 0; d < dim; d++) s[d] += v[d];
      }
      for (let c = 0; c < K; c++) {
        if (counts[c] === 0) {
          // 빈 군집은 현재 중심에서 가장 먼 점으로 다시 시작시킨다.
          let far = 0, farD = -1;
          for (let i = 0; i < n; i++) {
            const dd = dist2(data[i], centroids[assign[i]]);
            if (dd > farD) { farD = dd; far = i; }
          }
          centroids[c] = data[far].slice();
        } else {
          const s = sums[c], cen = centroids[c];
          for (let d = 0; d < dim; d++) cen[d] = s[d] / counts[c];
        }
      }

      if (!changed && iter > 0) break; // 더 이상 변화가 없으면 수렴 → 종료
    }

    return { centroids, assignments: assign, counts: Array.from(counts) };
  }

  global.KMeans = { cluster, makeRNG };
})(window);
