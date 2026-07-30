// 오디오 juice — Web Audio 신스 비프. 에셋 불필요, 첫 사용자 입력 후 재생 가능.
// ponytail: 오실레이터 톤만. 헤드리스/오디오 불가 환경은 조용히 무시.
export class Sfx {
  private ctx: AudioContext | null = null;
  muted = false;        // 사용자 온/오프
  private ok = true;    // 오디오 지원 여부

  // 음소거 토글. 새 muted 상태 반환.
  toggleMute(): boolean { this.muted = !this.muted; if (!this.muted) this.ac(); return this.muted; }

  private ac(): AudioContext | null {
    if (this.muted || !this.ok) return null;
    if (!this.ctx) {
      const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) { this.ok = false; return null; }
      this.ctx = new Ctor();
    }
    if (this.ctx!.state === "suspended") this.ctx!.resume();
    return this.ctx;
  }

  private tone(freq: number, dur: number, type: OscillatorType = "square", gain = 0.07, delay = 0) {
    const ac = this.ac(); if (!ac) return;
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(ac.destination);
    osc.start(t0); osc.stop(t0 + dur);
  }

  toggle(on: boolean) { this.tone(on ? 520 : 320, 0.06, "square", 0.05); }
  role() { this.tone(680, 0.08, "triangle", 0.06); }
  spike() { this.tone(880, 0.05, "sawtooth", 0.06); this.tone(1200, 0.05, "sawtooth", 0.05, 0.05); }
  event() { this.tone(700, 0.1, "triangle", 0.06); this.tone(560, 0.12, "triangle", 0.06, 0.1); }
  warn() { this.tone(420, 0.08, "square", 0.05); }
  trip() { [400, 300, 200].forEach((f, i) => this.tone(f, 0.14, "sawtooth", 0.09, i * 0.09)); }
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.16, "triangle", 0.07, i * 0.09)); }
  lose() { [400, 320, 240].forEach((f, i) => this.tone(f, 0.22, "sine", 0.07, i * 0.12)); }

  // 리듬용
  tick() { this.tone(1000, 0.03, "square", 0.03); }
  hit(perfect: boolean) { this.tone(perfect ? 1320 : 880, 0.08, "triangle", 0.07); }
  missHit() { this.tone(160, 0.15, "sawtooth", 0.08); }
  note(freq: number, dur = 0.22) { this.tone(freq, dur, "triangle", 0.06); } // 멜로디 음표
}
