// Common kernel (문서 10.1). 게임 상태 전환·타이머·점수·라운드·입력·루프·플레이 로그.
// 특정 게임 규칙은 여기 없음 — Scene 하나를 갈아끼워 어떤 주제든 얹는다.

export type Phase = "menu" | "play" | "win" | "lose" | "paused";

export interface Scene {
  enter?(): void;
  // dt 초 단위. 렌더는 같은 프레임에서 draw로 분리.
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
  // 포인터/키는 하네스가 위임. 좌표는 캔버스 로컬 픽셀.
  pointer?(p: PointerState): void;
  key?(code: string, down: boolean): void;
  // HUD 텍스트(주제별). main이 폴링해 표시 — Scene을 갈아끼우면 HUD도 따라감.
  hud?(): string;
}

export interface PointerState {
  x: number;
  y: number;
  down: boolean;
  justDown: boolean;
  justUp: boolean;
}

// AI/사람 판단 근거 축적용 (Evidence Harness, 문서 11). 메모리에만 쌓고 export.
export interface LogEntry { t: number; tag: string; data?: unknown; }

export class Harness {
  readonly ctx: CanvasRenderingContext2D;
  phase: Phase = "menu";
  score = 0;
  round = 1;
  clock = 0; // play 상태에서 흐른 초
  readonly log: LogEntry[] = [];

  private scene: Scene | null = null;
  private last = 0;
  private raf = 0;
  private pointer: PointerState = { x: 0, y: 0, down: false, justDown: false, justUp: false };
  private keys = new Set<string>();

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;
    this.bindInput();
  }

  record(tag: string, data?: unknown) {
    this.log.push({ t: this.clock, tag, data });
  }

  setScene(scene: Scene) {
    this.scene = scene;
    scene.enter?.();
    this.record("scene:enter");
  }

  get current() { return this.scene; } // main HUD 폴링·씬 교체용

  to(phase: Phase) {
    if (phase === this.phase) return;
    this.record("phase", { from: this.phase, to: phase });
    this.phase = phase;
  }

  start() {
    const tick = (now: number) => {
      const dt = this.last ? Math.min((now - this.last) / 1000, 0.1) : 0; // ponytail: dt 0.1s 캡, 탭 복귀 폭주 방지
      this.last = now;
      if (this.phase === "play") this.clock += dt;

      const s = this.scene;
      if (s) {
        s.pointer?.(this.pointer);
        if (this.phase === "play") s.update(dt);
        s.draw(this.ctx);
      }
      // justDown/justUp은 한 프레임만 참
      this.pointer.justDown = false;
      this.pointer.justUp = false;
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() { cancelAnimationFrame(this.raf); }

  isDown(code: string) { return this.keys.has(code); }

  private bindInput() {
    const rect = () => this.canvas.getBoundingClientRect();
    const move = (e: PointerEvent) => {
      const r = rect();
      this.pointer.x = e.clientX - r.left;
      this.pointer.y = e.clientY - r.top;
    };
    this.canvas.addEventListener("pointermove", move);
    this.canvas.addEventListener("pointerdown", (e) => {
      move(e);
      this.pointer.down = true;
      this.pointer.justDown = true;
    });
    window.addEventListener("pointerup", (e) => {
      move(e);
      this.pointer.down = false;
      this.pointer.justUp = true;
    });
    window.addEventListener("keydown", (e) => {
      if (!this.keys.has(e.code)) this.scene?.key?.(e.code, true);
      this.keys.add(e.code);
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
      this.scene?.key?.(e.code, false);
    });
  }
}
