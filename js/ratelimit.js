/*
 * ratelimit.js — 프리 티어 보호용 요청 큐 (토큰 버킷)
 * -----------------------------------------------------------------------------
 * 무료 한도(분당): 요청 5회 · 입력 10,000토큰 · 출력 4,000토큰.
 * 8명이 동시에 눌러도 한도를 넘지 않도록, 모든 모델 호출을 이 큐로 직렬화하고
 * 분당 사용량을 추적한다. 한도가 차면 대기시키고(429면 지수 백오프), 호출부는
 * 끝내 실패해도 오프라인 코치로 폴백하므로 학생 화면엔 오류가 안 뜬다.
 */
(function (global) {
  'use strict';

  const estimateTokens = (s) => Math.ceil((s ? s.length : 0) / 3); // 한국어 보수적 추정

  function Limiter(limits) {
    this.L = Object.assign({ req: 5, inTok: 10000, outTok: 4000, concurrency: 1 }, limits || {});
    this.events = []; // {t, i, o}
    this.q = [];
    this.running = 0;
  }
  Limiter.prototype._usage = function (now) {
    this.events = this.events.filter(e => now - e.t < 60000);
    let r = 0, i = 0, o = 0;
    for (const e of this.events) { r++; i += e.i; o += e.o; }
    return { r, i, o };
  };
  Limiter.prototype.status = function () {
    const u = this._usage(Date.now());
    return { reqLeft: Math.max(0, this.L.req - u.r), inLeft: Math.max(0, this.L.inTok - u.i),
      outLeft: Math.max(0, this.L.outTok - u.o), queued: this.q.length };
  };
  Limiter.prototype._canRun = function (job, now) {
    const u = this._usage(now);
    return this.running < this.L.concurrency &&
      u.r < this.L.req &&
      u.i + job.estIn <= this.L.inTok &&
      u.o + job.estOut <= this.L.outTok;
  };
  // job: { estIn, estOut, fn:()=>Promise, onWait?:(ms)=>void }
  Limiter.prototype.schedule = function (job) {
    return new Promise((resolve, reject) => {
      this.q.push(Object.assign({ estIn: 0, estOut: 0 }, job, { resolve, reject, tries: 0 }));
      this._tick();
    });
  };
  Limiter.prototype._tick = function () {
    if (this.running >= this.L.concurrency) return;
    const job = this.q[0];
    if (!job) return;
    const now = Date.now();
    if (!this._canRun(job, now)) {
      const wait = 1500 + job.tries * 500;
      if (job.onWait) try { job.onWait(wait); } catch (e) {}
      setTimeout(() => this._tick(), wait);
      return;
    }
    this.q.shift();
    this.running++;
    this.events.push({ t: now, i: job.estIn, o: job.estOut });
    Promise.resolve()
      .then(job.fn)
      .then(out => { this.running--; job.resolve(out); setTimeout(() => this._tick(), 60); })
      .catch(err => {
        this.running--;
        if (err && err.status === 429 && job.tries < 4) {
          job.tries++;
          const back = Math.min(16000, 1000 * Math.pow(2, job.tries));
          if (job.onWait) try { job.onWait(back); } catch (e) {}
          this.q.unshift(job);
          setTimeout(() => this._tick(), back);
        } else {
          job.reject(err);
          setTimeout(() => this._tick(), 60);
        }
      });
  };

  global.RateLimiter = Limiter;
  global.estimateTokens = estimateTokens;
})(window);
