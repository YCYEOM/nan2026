// 리허설9-3D "총알피하기" — 기울인 판 · 부서지는 발판 · 우주복 작업자 (CON-007, DGE-003).
//
// **엔진은 한 줄도 안 바뀐다.** 세계 좌표가 그대로라 렌더만 갈아끼운 것이고,
// 조각·게이지 API(`plates`·`plateEvents`·`intact`·`gauge`)를 읽기만 한다.
//
// 이 저장소의 첫 3D 다. 새로 생긴 개념은 둘 —
//   1) 원근투영(`project`) — 세계 좌표를 화면으로 옮긴다
//   2) 깊이 정렬(`Layer`) — 먼 것부터 그린다. 2D 씬에는 없던 개념이다
//
// 3D 는 **거리 오판**을 만들고 요격은 거리를 재는 동사라 정면으로 부딪힌다.
// 셋으로 갚는다: 바닥 예고선 · 총알 발밑 그림자 · 사람 발밑 판정 링.
// 그리고 **몸통 폭 = 판정 지름**을 눈대중이 아니라 `bodyScale()` 이 강제한다.
import { Harness, Scene, PointerState } from "../core/harness";
import { Sfx } from "../systems/sfx";
import {
  Dodge, K, ARENA, NEUTRAL, PLATES, PLATE_LV, TOP_LV, MAX_R, fateText,
  type Pt, type Event,
} from "../systems/dodge";
import { C, F, font, withAlpha, sigGradient } from "../ui/tokens";

const COLORS = C.player;

// ── 정적 배치 ──────────────────────────────────────────────────────────────
// 2D 씬의 레이아웃 상수를 그대로 물려받는다 — 오버레이는 3D 가 아니라서 검사가 본다.
export const TITLE = { x: 16, y: 32, right: 96 };
export const TURN_Y = 34;
export const STATUS_Y = 466;
export const RECAP = { time: 150, rows: [206, 238] as const, why: 296, restart: 400 };
const FLASH = 0.9;

/**
 * 카메라. 판 앞·위에서 중앙을 본다. 값의 조건은 둘뿐이다 —
 * **판 전체가 캔버스 안에 든다**, 그리고 **위아래 오버레이와 안 겹친다.**
 * 검사가 이 둘을 본다.
 */
export const CAM = {
  eye: [0, 270, -340] as const,
  at: [0, 10, 0] as const,
  fl: 560,      // 초점거리(px). 38° 기울기에서 판이 y 66..428 을 쓴다
  cx: 320,      // 화면 원점
  cy: 169,
};

export interface Proj { x: number; y: number; z: number; s: number }

const sub = (a: readonly number[], b: readonly number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: number[], b: number[]) =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v: number[]) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

const FWD = unit(sub(CAM.at, CAM.eye));
const RIGHT = unit(cross(FWD, [0, 1, 0]));
const UP = cross(RIGHT, FWD);

/**
 * 세계(판 중심 원점, y 가 높이) → 화면. 카메라 뒤면 `null`.
 * `s` 는 그 깊이에서의 배율 — 화면 크기를 세계 크기에서 뽑을 때 쓴다.
 */
export function project(x: number, y: number, z: number): Proj | null {
  const d = sub([x, y, z], CAM.eye);
  const vz = dot3(d, FWD);
  if (vz <= 1) return null;
  const s = CAM.fl / vz;
  return { x: CAM.cx + dot3(d, RIGHT) * s, y: CAM.cy - dot3(d, UP) * s, z: vz, s };
}

/** 엔진 좌표(캔버스 픽셀 평면) → 세계. 판 중심이 원점이고 엔진 y 가 세계 z 다. */
export const world = (p: Pt, h = 0) => project(p.x - ARENA.x, h, p.y - ARENA.y);

/**
 * 그 자리의 사람 배율. **몸통 폭 = 판정 지름을 코드가 강제하는 지점이다** —
 * 투영된 `K.BODY` 를 재서 그리므로 눈대중이 끼어들 자리가 없다.
 * 실루엣이 판정보다 크면 "안 맞았는데 맞았다"가 되고 요격도 같은 방식으로 거짓말이 된다.
 */
export function bodyScale(p: Pt): number {
  const a = world(p), b = project(p.x - ARENA.x + K.BODY, 0, p.y - ARENA.y);
  if (!a || !b) return 1;
  return Math.abs(b.x - a.x) / SUIT_HALF;
}
/** 우주복 몸통 반폭(그리기 단위). `bodyScale` 이 이것을 판정 반지름에 맞춘다. */
export const SUIT_HALF = 16;

const TAU = Math.PI * 2;
const plateA = (i: number) => [(i / PLATES) * TAU + 0.012, ((i + 1) / PLATES) * TAU - 0.012];
/** 카메라 쪽 조각 — 옆면이 보인다. 두께가 있어야 판이 떠 있는 물체로 읽힌다. */
const nearSide = (i: number) => Math.sin(((i + 0.5) / PLATES) * TAU) < 0.25;
const THICK = 14;

type Layer = { z: number; draw: () => void };

interface PlateAnim { kind: "collapse" | "restore"; from: number; to: number; life: number }

export class Dodge3DScene implements Scene {
  private eng!: Dodge;
  private sfx = new Sfx();
  private note: { text: string; color: string; life: number } | null = null;
  private shake = 0;
  private marks: { p: Pt; color: string; life: number; kind: "block" | "hit" }[] = [];
  /** 조각별 진행 중인 연출. 떨어지는 띠와 솟는 띠가 여기 산다. */
  private anim: Record<number, PlateAnim> = {};
  /** 요격 → 복구를 잇는 선. 인과가 안 보이면 "가끔 판이 넓어진다"가 된다. */
  private link: { from: Pt; to: number; life: number } | null = null;
  /** 마지막 요격 자리 — 복구가 어디서 왔는지 잇기 위해 기억한다. */
  private lastBlock: Pt | null = null;
  private time = 0;

  constructor(private h: Harness) { this.reset(); }
  enter() { this.reset(); }

  private reset() {
    this.eng = new Dodge();
    this.note = null; this.shake = 0; this.marks = [];
    this.anim = {}; this.link = null; this.lastBlock = null;
    this.h.score = 0;
    this.h.to("play");
    this.h.record("dg3:reset", {});
  }

  // ── 입력 — 2D 와 같다. 3D 는 화면이지 규칙이 아니다 ─────────────────────
  private dir(up: string, down: string, left: string, right: string): Pt {
    const d = (c: string) => (this.h.isDown(c) ? 1 : 0);
    return { x: d(right) - d(left), y: d(down) - d(up) };
  }
  private dirs(): Pt[] {
    return [
      this.dir("KeyW", "KeyS", "KeyA", "KeyD"),
      this.dir("ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"),
    ];
  }

  pointer(p: PointerState) { if (this.h.phase !== "play" && p.justDown) this.reset(); }

  key(code: string, down: boolean) {
    if (!down) return;
    if (code === "KeyM") { this.sfx.toggleMute(); return; }
    if (code === "KeyR") return this.reset();
    if (this.h.phase !== "play" && (code === "Space" || code === "Enter")) this.reset();
  }

  update(dt: number) {
    const e = this.eng;
    this.time += dt;
    e.update(dt, this.dirs());
    for (const ev of e.drainEvents()) this.onEvent(ev);

    for (const pe of e.drainPlateEvents()) {
      const lv = e.plates[pe.i];
      // 무너진 띠는 있던 자리에서 떨어지고, 솟은 띠는 새 자리로 올라온다
      this.anim[pe.i] = pe.kind === "collapse"
        ? { kind: "collapse", from: lv + 1, to: lv, life: 1 }
        : { kind: "restore", from: lv - 1, to: lv, life: 1 };
      if (pe.kind === "restore" && this.lastBlock) {
        this.link = { from: { ...this.lastBlock }, to: pe.i, life: 0.7 };
      }
    }
    for (const k of Object.keys(this.anim)) {
      const a = this.anim[+k];
      if ((a.life -= dt / (a.kind === "collapse" ? 1.1 : 0.8)) <= 0) delete this.anim[+k];
    }
    if (this.link && (this.link.life -= dt) <= 0) this.link = null;

    if (this.note) { this.note.life -= dt; if (this.note.life <= 0) this.note = null; }
    this.marks = this.marks.filter((m) => (m.life -= dt) > 0);
    this.shake = Math.max(0, this.shake - dt * 30);

    if (e.over && this.h.phase === "play") {
      this.h.score = Math.round(e.t);
      this.h.to("win");
      this.sfx.lose();
      this.h.record("dg3:match", {
        t: e.t, blocked: e.blocked, leaked: e.leaked, fallen: e.fallen(),
        intact: e.intact, collapsed: e.collapsed, restored: e.restored,
      });
    }
  }

  private shotColor(owner: number) { return owner === NEUTRAL ? C.danger : COLORS[owner]; }

  private onEvent(ev: Event) {
    if (ev.fate === "escaped") return;
    const e = this.eng;
    const p = ev.who >= 0 ? e.players[ev.who] : ARENA;
    const color = this.shotColor(ev.owner);
    this.marks.push({ p: { ...p }, color, life: 0.45, kind: ev.fate === "blocked" ? "block" : "hit" });
    if (ev.fate === "blocked") { this.lastBlock = { ...p }; this.sfx.toggle(true); return; }
    this.note = { text: fateText(ev), color, life: FLASH };
    this.shake = 8;
    this.sfx.missHit();
    this.h.record("dg3:hit", ev);
  }

  hud() {
    const e = this.eng;
    const life = (i: number) =>
      `<span style="color:${COLORS[i]}">P${i + 1}</span> ${"♥".repeat(Math.max(0, e.lives[i]))}` +
      `<span style="opacity:.35">${"♡".repeat(Math.max(0, K.LIVES - e.lives[i]))}</span>` +
      `<span style="opacity:.6">(막음 ${e.blocked[i]} · 샘 ${e.leaked[i]})</span>`;
    if (e.over) {
      const f = e.fallen();
      return `<b>총알피하기 3D</b> &nbsp; <b>${e.t.toFixed(1)}초 버팀</b>` +
        ` &nbsp; <span style="color:${COLORS[Math.max(0, f)]}">P${f + 1} 이 먼저 쓰러졌다</span>` +
        ` &nbsp; ${life(0)} &nbsp; ${life(1)}` +
        ` &nbsp; <span style="opacity:.6">클릭/스페이스 다시 · Esc 메뉴</span>`;
    }
    const pips = "▮".repeat(e.gauge) + "▯".repeat(Math.max(0, K.RESTORE_BLOCKS - e.gauge));
    return `<b>총알피하기 3D</b> &nbsp; <b>${e.t.toFixed(1)}초</b>` +
      ` &nbsp; ${life(0)} &nbsp; ${life(1)}` +
      ` &nbsp; <span style="opacity:.75">발판 ${e.intact}/${e.maxIntact} · 요격 <span style="color:${C.success}">${pips}</span></span>` +
      ` &nbsp; <span style="opacity:.6">내 색은 막고 · <span style="color:${C.danger}">붉은 탄</span>은 아무도 못 막는다 · ${K.RESTORE_BLOCKS}번 막으면 그 자리 발판이 돌아온다</span>` +
      ` &nbsp; <span style="opacity:.6">P1 WASD · P2 방향키 · R 처음부터 · 음소거[M] ${this.sfx.muted ? "🔇" : "🔊"}</span>`;
  }

  // ── 그리기 ──────────────────────────────────────────────────────────────

  /** 임의 높이의 호를 원근 그대로 경로에 잇는다. */
  private arc(ctx: CanvasRenderingContext2D, r: number, y: number, a0: number, a1: number, seg = 14, move = true) {
    let started = !move;
    for (let i = 0; i <= seg; i++) {
      const t = a0 + (a1 - a0) * (i / seg);
      const p = project(Math.cos(t) * r, y, Math.sin(t) * r);
      if (!p) { started = false; continue; }
      started ? ctx.lineTo(p.x, p.y) : (ctx.moveTo(p.x, p.y), started = true);
    }
  }

  /** 판 위 아무 자리의 원 — 그림자·발자국·착탄 표식이 전부 이걸 쓴다. */
  private ringAt(ctx: CanvasRenderingContext2D, p: Pt, r: number, h = 0) {
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const t = (i / 24) * TAU;
      const q = project(p.x - ARENA.x + Math.cos(t) * r, h, p.y - ARENA.y + Math.sin(t) * r);
      if (q) i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
    }
  }

  /** 부채꼴 조각(중심까지 채운 파이). */
  private pie(ctx: CanvasRenderingContext2D, i: number, r: number, y: number) {
    const [a0, a1] = plateA(i);
    ctx.beginPath();
    this.arc(ctx, r, y, a0, a1);
    const c = project(0, y, 0);
    if (c) ctx.lineTo(c.x, c.y);
    ctx.closePath();
  }

  /** 두 반지름 사이의 띠. 무너지고 솟는 것이 이 띠다. */
  private band(ctx: CanvasRenderingContext2D, i: number, rIn: number, rOut: number, y: number) {
    const [a0, a1] = plateA(i);
    ctx.beginPath();
    this.arc(ctx, rOut, y, a0, a1);
    this.arc(ctx, rIn, y, a1, a0, 14, false);
    ctx.closePath();
  }

  private board(ctx: CanvasRenderingContext2D) {
    const e = this.eng;
    // 원래 넓이 — 얼마나 잃었는지가 보여야 압박이 읽힌다
    ctx.setLineDash([9, 13]); ctx.strokeStyle = withAlpha(C.line, 0.55); ctx.lineWidth = 1.5;
    ctx.beginPath(); this.arc(ctx, MAX_R, 0, 0, TAU, 72); ctx.stroke();
    ctx.setLineDash([]);

    // 연출 중인 띠 — 판 아래에서 오가므로 먼저 그린다
    for (const k of Object.keys(this.anim)) {
      const i = +k, a = this.anim[i];
      const p = 1 - a.life;                       // 0 → 1 진행
      const rIn = PLATE_LV[Math.min(a.from, a.to)], rOut = PLATE_LV[Math.max(a.from, a.to)];
      const rise = a.kind === "restore";
      const ease = rise ? 1 - Math.pow(1 - p, 3) : p * p;
      const y = rise ? -90 * (1 - ease) : -ease * 150;
      ctx.globalAlpha = rise ? Math.min(1, ease * 1.6) : 1 - p;
      this.band(ctx, i, rIn, rOut, y);
      ctx.fillStyle = rise ? withAlpha(C.success, 0.35) : C.surface;
      ctx.fill();
      ctx.strokeStyle = rise ? C.success : C.danger;
      ctx.lineWidth = 2; ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // 본 판 — 조각마다 반지름이 따로 논다. 이 톱니가 그 판의 기록이다.
    for (let i = 0; i < PLATES; i++) {
      const r = PLATE_LV[e.plates[i]];
      if (nearSide(i)) {                          // 두께 — 판이 떠 있는 물체로 읽힌다
        const [a0, a1] = plateA(i);
        ctx.beginPath();
        this.arc(ctx, r, 0, a0, a1);
        this.arc(ctx, r, -THICK, a1, a0, 14, false);
        ctx.closePath();
        ctx.fillStyle = C.bg; ctx.fill();
        ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke();
      }
      this.pie(ctx, i, r, 0);
      ctx.fillStyle = i % 2 ? C.surface : C.surfaceAlt; ctx.fill();
      ctx.strokeStyle = withAlpha(C.line, 0.85); ctx.lineWidth = 1; ctx.stroke();
      // 갓 솟은 조각은 잠깐 빛난다 — 어디가 돌아왔는지 놓치면 규칙이 안 보인다
      const a = this.anim[i];
      if (a?.kind === "restore") {
        this.pie(ctx, i, r, 0.6);
        ctx.fillStyle = withAlpha(C.success, 0.3 * a.life); ctx.fill();
      }
    }
  }

  /** 우주복 작업자. 화면 좌표에서 그린다 — 배율은 판정에서 뽑아 온다. */
  private suit(ctx: CanvasRenderingContext2D, i: number, p: Pt) {
    const e = this.eng;
    const g = world(p);
    if (!g) return;
    const s = bodyScale(p);
    const x = g.x, y = g.y;
    const glowC = COLORS[i], body = C.suit.body[i], panel = C.suit.panel[i], trim = C.suit.trim[i];
    const lifeN = Math.max(0, e.lives[i]);
    const hurt = lifeN <= 1, worn = lifeN <= 2;
    const flick = hurt && Math.sin(this.time * 11) > 0.2;
    const visor = flick ? C.danger : glowC;
    const lean = hurt ? 0.12 : 0;

    ctx.save();
    ctx.translate(x, y); ctx.rotate(lean); ctx.translate(-x, -y);

    // 부츠 — 마지막 목숨이면 한쪽이 접힌다(절뚝)
    ctx.fillStyle = C.joint;
    for (const [dx, dh] of [[-8, hurt ? 11 : 15], [8, 15]]) {
      ctx.beginPath(); ctx.roundRect(x + dx * s - 5.5 * s, y - dh * s, 11 * s, dh * s, 3.5 * s); ctx.fill();
    }
    // 다리
    ctx.fillStyle = body;
    for (const dx of [-8, 8]) {
      ctx.beginPath(); ctx.roundRect(x + dx * s - 6 * s, y - 30 * s, 12 * s, 17 * s, 5 * s); ctx.fill();
    }
    // 몸통 — 폭 2*SUIT_HALF*s = 판정 지름
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.roundRect(x - SUIT_HALF * s, y - 52 * s, SUIT_HALF * 2 * s, 26 * s, 10 * s); ctx.fill();
    ctx.fillStyle = withAlpha(panel, 0.75);
    ctx.beginPath(); ctx.roundRect(x - SUIT_HALF * s, y - 34 * s, SUIT_HALF * 2 * s, 9 * s, 4.5 * s); ctx.fill();
    if (worn) {   // 그을음
      ctx.fillStyle = withAlpha(C.bg, 0.55);
      ctx.beginPath(); ctx.ellipse(x - 6 * s, y - 42 * s, 8 * s, 6 * s, 0.4, 0, TAU); ctx.fill();
    }
    // 백팩
    ctx.fillStyle = panel;
    ctx.beginPath(); ctx.roundRect(x + 11 * s, y - 50 * s, 9 * s, 20 * s, 3.5 * s); ctx.fill();
    ctx.fillStyle = trim; ctx.fillRect(x + 13 * s, y - 46 * s, 5 * s, 2.6 * s);
    // 팔
    ctx.strokeStyle = body; ctx.lineWidth = 7.5 * s; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x - 13 * s, y - 46 * s); ctx.lineTo(x - 19 * s, y - 31 * s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 13 * s, y - 46 * s); ctx.lineTo(x + 19 * s, y - 33 * s); ctx.stroke();
    // 어깨 띠 — 위에서 봐도 소속이 보이는 자리. 다치면 한쪽이 꺼진다
    ctx.strokeStyle = trim; ctx.lineWidth = 3.2 * s; ctx.lineCap = "butt";
    ctx.beginPath(); ctx.moveTo(x - 15 * s, y - 48 * s); ctx.lineTo(x - 7 * s, y - 51 * s); ctx.stroke();
    if (!worn) { ctx.beginPath(); ctx.moveTo(x + 15 * s, y - 48 * s); ctx.lineTo(x + 7 * s, y - 51 * s); ctx.stroke(); }
    // 가슴 램프 = 남은 목숨
    for (let k = 0; k < K.LIVES; k++) {
      ctx.fillStyle = k < lifeN ? glowC : withAlpha(C.textFaint, 0.35);
      ctx.beginPath(); ctx.arc(x + (k - 1) * 6.5 * s, y - 38 * s, 2.3 * s, 0, TAU); ctx.fill();
    }

    // 헬멧 — 둥근(P1) / 각진(P2). **총알의 원·네모와 같은 축이다**(DESIGN.md 원칙 2)
    const hy = y - 66 * s, hr = 13.5 * s;
    const helmet = () => {
      ctx.beginPath();
      if (i === 1) ctx.roundRect(x - hr, hy - hr, hr * 2, hr * 2, hr * 0.3);
      else ctx.arc(x, hy, hr, 0, TAU);
    };
    helmet(); ctx.fillStyle = panel; ctx.fill();
    ctx.strokeStyle = body; ctx.lineWidth = 2 * s; ctx.stroke();
    // 바이저 — 색의 본거지
    ctx.save(); helmet(); ctx.clip();
    ctx.fillStyle = visor;
    if (i === 1) ctx.fillRect(x - hr * 0.82, hy - hr * 0.42, hr * 1.64, hr * 0.84);
    else { ctx.beginPath(); ctx.ellipse(x, hy + 0.5 * s, hr * 0.8, hr * 0.58, 0, 0, TAU); ctx.fill(); }
    ctx.restore();
    if (worn) {   // 바이저 금 — 목숨 2 부터, 마지막엔 크게
      ctx.strokeStyle = withAlpha(C.bg, 0.85); ctx.lineWidth = 1.4 * s;
      ctx.beginPath();
      ctx.moveTo(x - 6 * s, hy - 4 * s); ctx.lineTo(x - 1 * s, hy + 2 * s); ctx.lineTo(x + 5 * s, hy - 3 * s);
      if (hurt) { ctx.moveTo(x - 2 * s, hy + 5 * s); ctx.lineTo(x + 2 * s, hy - 1 * s); ctx.lineTo(x + 7 * s, hy + 4 * s); }
      ctx.stroke();
    }
    ctx.restore();

    // 공기 샘 — 마지막 목숨에만. 옆에서 봐도 급한 게 보인다
    if (hurt) {
      for (let k = 0; k < 5; k++) {
        const q = ((this.time * 0.75 + k / 5) % 1);
        ctx.fillStyle = withAlpha(C.textMuted, 0.34 * (1 - q));
        ctx.beginPath();
        ctx.arc(x + 12 * s + q * 26 * s, hy - 6 * s - q * 16 * s, (2 + q * 7) * s, 0, TAU);
        ctx.fill();
      }
    }

    // 이름 — 색만으로 구분하지 않는다(DESIGN.md 원칙 2)
    ctx.font = font(Math.max(9, Math.round(F.xs * s)));
    ctx.fillStyle = C.text; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(`P${i + 1}`, x, hy - hr - 9 * s);
    ctx.textBaseline = "alphabetic";
  }

  /** 총알과 예고선의 모양. 3D 에서도 색 + 모양으로 간다. */
  private shotShape(ctx: CanvasRenderingContext2D, owner: number, x: number, y: number, r: number) {
    ctx.beginPath();
    if (owner === 0) ctx.arc(x, y, r, 0, TAU);
    else if (owner === 1) ctx.rect(x - r, y - r, r * 2, r * 2);
    else {
      const q = r * 1.45;
      ctx.moveTo(x, y - q); ctx.lineTo(x + q, y); ctx.lineTo(x, y + q); ctx.lineTo(x - q, y); ctx.closePath();
    }
  }

  /** 총알이 나는 높이. 바닥 그림자와 짝이 되어 깊이를 만든다. */
  private static readonly FLY = 16;

  draw(ctx: CanvasRenderingContext2D) {
    const e = this.eng;
    ctx.clearRect(0, 0, 640, 480);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, 640, 480);

    // 별 — 좌표를 결정론적으로 만든다. 매 프레임 반짝이면 판정을 가린다(원칙 5)
    for (let i = 0; i < 150; i++) {
      const sx = (i * 761) % 640, sy = ((i * i * 37) % 300);
      ctx.fillStyle = withAlpha(C.textFaint, 0.2 + ((i * 53) % 50) / 140);
      ctx.fillRect(sx, sy, 1, 1);
    }

    ctx.save();
    if (this.shake > 0.1) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);

    this.board(ctx);

    const layers: Layer[] = [];

    // 예고선 — **바닥에 긋는다.** 공중의 선은 어디에 꽂히는지 안 읽힌다
    for (const b of e.bullets) {
      if (b.wait <= 0) continue;
      const from = world({ x: b.x, y: b.y }), to = world({ x: b.aimX, y: b.aimY });
      if (!from || !to) continue;
      const urg = 1 - Math.max(0, Math.min(1, b.wait / K.TELEGRAPH));
      const col = this.shotColor(b.owner);
      layers.push({ z: from.z + 1000, draw: () => {     // 예고선은 항상 판 위, 물체 아래
        ctx.setLineDash([12, 10]);
        ctx.strokeStyle = withAlpha(col, 0.25 + urg * 0.55);
        ctx.lineWidth = 1.5 + urg * 2.5;
        ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = withAlpha(col, 0.5 + urg * 0.4); ctx.lineWidth = 2;
        this.ringAt(ctx, { x: b.aimX, y: b.aimY }, 8 + (1 - urg) * 12); ctx.stroke();
      }});
    }

    // 요격 → 복구를 잇는 선. 이 규칙은 인과가 안 보이면 우연이 된다
    if (this.link) {
      const a = world(this.link.from, 14);
      const mid = ((this.link.to + 0.5) / PLATES) * TAU;
      const r = PLATE_LV[e.plates[this.link.to]] * 0.72;
      const b = project(Math.cos(mid) * r, 8, Math.sin(mid) * r);
      const alpha = this.link.life / 0.7;
      if (a && b) layers.push({ z: 900, draw: () => {
        ctx.strokeStyle = withAlpha(C.success, alpha * 0.9); ctx.lineWidth = 2.5;
        ctx.setLineDash([9, 7]); ctx.lineDashOffset = -this.time * 60;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.setLineDash([]); ctx.lineDashOffset = 0;
      }});
    }

    // 피격/요격 표식
    for (const m of this.marks) {
      const t = m.life / 0.45;
      layers.push({ z: 800, draw: () => {
        ctx.strokeStyle = withAlpha(m.color, t); ctx.lineWidth = 2;
        this.ringAt(ctx, m.p, K.BODY + (1 - t) * (m.kind === "hit" ? 26 : 14));
        ctx.stroke();
      }});
    }

    // 총알 — 발밑 그림자와 짝으로. 화면에서 가장 밝은 것은 언제나 이것이다(원칙 7)
    for (const b of e.bullets) {
      if (b.wait > 0) continue;
      const at = { x: b.x, y: b.y };
      const p = world(at, Dodge3DScene.FLY);
      if (!p) continue;
      const col = this.shotColor(b.owner);
      layers.push({ z: p.z, draw: () => {
        ctx.fillStyle = withAlpha(col, 0.4);
        this.ringAt(ctx, at, 6); ctx.fill();
        const r = Math.max(2.5, K.SHOT * p.s);
        ctx.fillStyle = col;
        this.shotShape(ctx, b.owner, p.x, p.y, r); ctx.fill();
        ctx.fillStyle = C.text;                     // 심 — 층 1 이 가장 밝다
        this.shotShape(ctx, b.owner, p.x, p.y, Math.max(1, r * 0.38)); ctx.fill();
      }});
    }

    // 사람 — 발밑 판정 링을 **항상** 그린다. 요격 거리가 눈에 박히는 유일한 자리다
    e.players.forEach((p, i) => {
      const g = world(p);
      if (!g) return;
      layers.push({ z: g.z, draw: () => {
        ctx.fillStyle = withAlpha(C.bg, 0.5);
        this.ringAt(ctx, p, K.BODY); ctx.fill();
        ctx.strokeStyle = withAlpha(COLORS[i], 0.55); ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        this.ringAt(ctx, p, K.BODY); ctx.stroke();
        ctx.setLineDash([]);
        this.suit(ctx, i, p);
      }});
    });

    layers.sort((a, b) => b.z - a.z).forEach((l) => l.draw());

    ctx.restore();

    // ── 2D 오버레이 — 여기부터는 3D 가 아니고 배치 검사가 본다 ─────────────
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = C.text; ctx.font = font(F.xl);
    ctx.fillText("총알피하기", TITLE.x, TITLE.y);
    ctx.strokeStyle = sigGradient(ctx, TITLE.x, 36, 140, 36); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(TITLE.x, 37); ctx.lineTo(TITLE.right + 40, 37); ctx.stroke();

    if (!e.over) {
      ctx.textAlign = "center"; ctx.font = font(F.lg); ctx.fillStyle = C.text;
      ctx.fillText(`${e.t.toFixed(1)}초`, 320, TURN_Y);
      ctx.textAlign = "right"; ctx.font = font(F.sm); ctx.fillStyle = C.textFaint;
      ctx.fillText(`발판 ${e.intact}/${e.maxIntact} · 요격 ${e.gauge}/${K.RESTORE_BLOCKS}`, 624, TURN_Y);
    }

    ctx.textAlign = "center"; ctx.font = font(F.sm);
    if (this.note) {
      ctx.globalAlpha = Math.min(1, this.note.life / (FLASH * 0.6));
      ctx.fillStyle = this.note.color;
      ctx.fillText(this.note.text, 320, STATUS_Y);
      ctx.globalAlpha = 1;
    } else if (!e.over) {
      ctx.fillStyle = C.textMuted;
      ctx.fillText(`내 색 탄은 몸으로 지운다 — ${K.RESTORE_BLOCKS}번 막으면 그 자리 발판이 돌아온다`, 320, STATUS_Y);
    }

    if (e.over) {
      const f = e.fallen();
      ctx.fillStyle = withAlpha(C.scrim, 0.86); ctx.fillRect(0, 0, 640, 480);
      ctx.textAlign = "center";
      ctx.font = font(F.hero); ctx.fillStyle = C.text;
      ctx.fillText(`${e.t.toFixed(1)}초 버팀`, 320, RECAP.time);
      ctx.font = font(F.xl);
      for (let i = 0; i < 2; i++) {
        ctx.fillStyle = COLORS[i];
        ctx.fillText(`P${i + 1} — 막은 ${e.blocked[i]} · 못 막고 샌 ${e.leaked[i]}`, 320, RECAP.rows[i]);
      }
      ctx.font = font(F.sm); ctx.fillStyle = C.textMuted;
      ctx.fillText(
        `P${f + 1} 이 먼저 쓰러졌다 · 발판 ${e.intact}/${e.maxIntact} 남음 ` +
        `(무너진 ${e.collapsed} · 되찾은 ${e.restored})`, 320, RECAP.why);
      ctx.font = font(F.lg); ctx.fillStyle = C.text;
      ctx.fillText("클릭 / 스페이스 → 다시 · Esc 메뉴", 320, RECAP.restart);
    }
  }
}

/** 검사가 쓰는 값 — 판이 캔버스 안에 드는지 보려면 투영된 경계가 필요하다. */
export function boardBounds(level = TOP_LV) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i <= 180; i++) {
    const a = (i / 180) * TAU;
    for (const h of [0, -THICK]) {
      const p = project(Math.cos(a) * PLATE_LV[level], h, Math.sin(a) * PLATE_LV[level]);
      if (!p) continue;
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
  }
  return { minX, maxX, minY, maxY };
}
