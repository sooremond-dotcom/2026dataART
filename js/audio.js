/*
 * audio.js — 마이크(소리) 입력
 * -----------------------------------------------------------------------------
 * 웹 표준 Web Audio API만 사용(추가 라이브러리 없음).
 * 윤리 원칙(수업 2.4): 음성 "파일은 절대 저장하지 않고" 실시간 분석값만 사용한다.
 *   - volume : 전체 음량(0~1)
 *   - low / mid / high : 저·중·고음 대역 에너지(0~1)  → 색 군집 반응에 사용
 */
(function (global) {
  'use strict';

  const AudioInput = {
    enabled: false,
    ctx: null, analyser: null, stream: null,
    freq: null, time: null,
    // 부드럽게 보정된 출력값
    values: { volume: 0, low: 0, mid: 0, high: 0 },
    sensitivity: 1.2,

    async start() {
      if (this.enabled) return true;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('이 브라우저는 마이크 입력을 지원하지 않습니다.');
      }
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const AC = global.AudioContext || global.webkitAudioContext;
      this.ctx = new AC();
      const src = this.ctx.createMediaStreamSource(this.stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.8;
      src.connect(this.analyser);               // 스피커로는 내보내지 않음(하울링 방지)
      this.freq = new Uint8Array(this.analyser.frequencyBinCount);
      this.time = new Uint8Array(this.analyser.fftSize);
      this.enabled = true;
      return true;
    },

    stop() {
      if (this.stream) this.stream.getTracks().forEach(t => t.stop());
      if (this.ctx) this.ctx.close();
      this.ctx = this.analyser = this.stream = null;
      this.enabled = false;
      this.values = { volume: 0, low: 0, mid: 0, high: 0 };
    },

    // 주파수 빈 범위 [fromHz, toHz)의 평균 에너지(0~1)
    _band(fromHz, toHz) {
      const nyq = this.ctx.sampleRate / 2;
      const bins = this.analyser.frequencyBinCount;
      let i0 = Math.floor((fromHz / nyq) * bins);
      let i1 = Math.ceil((toHz / nyq) * bins);
      i0 = Math.max(0, i0); i1 = Math.min(bins, Math.max(i0 + 1, i1));
      let sum = 0;
      for (let i = i0; i < i1; i++) sum += this.freq[i];
      return sum / (i1 - i0) / 255;
    },

    // 매 프레임 호출 → 최신 분석값 반환
    getValues() {
      if (!this.enabled || !this.analyser) return this.values;
      this.analyser.getByteFrequencyData(this.freq);
      this.analyser.getByteTimeDomainData(this.time);

      // 음량: 시간영역 RMS
      let sum = 0;
      for (let i = 0; i < this.time.length; i++) {
        const v = (this.time[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / this.time.length);
      const s = this.sensitivity;
      const vol = Math.min(1, rms * 3.2 * s);

      const low = Math.min(1, this._band(20, 250) * 1.4 * s);
      const mid = Math.min(1, this._band(250, 2000) * 1.6 * s);
      const high = Math.min(1, this._band(2000, 9000) * 2.2 * s);

      // 살짝 평활화(떨림 줄이기)
      const a = 0.5, v = this.values;
      v.volume += (vol - v.volume) * a;
      v.low += (low - v.low) * a;
      v.mid += (mid - v.mid) * a;
      v.high += (high - v.high) * a;
      return v;
    }
  };

  global.AudioInput = AudioInput;
})(window);
