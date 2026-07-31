// 리허설6 "떠넘기기" — 굴리면 게이지와 내 점수가 함께 오르고, 넘기면 쌓인 게이지가 상대에게 간다.
// 재사용: Harness, Sfx, 토큰. 신규: systems/pushluck.
//
// 턴제라 진행은 입력이 한다. 다만 **굴림 연출이 도는 동안만** update 가 진행을 맡는다
// (PSH-004) — 판정은 누르는 순간 확정되고 화면이 3단으로 늦게 보여줄 뿐이다.
// 핫시트 2인이 완성형이다(정보 비대칭이 규칙이 아니라 네트워크가 선행 조건이 아니다).
import { Harness, Scene, PointerState } from "../core/harness";
import { Sfx } from "../systems/sfx";
import { PushLuck, PushOpts, Blame, RollResult, modSpec } from "../systems/pushluck";
import { C, F, font, withAlpha, sigGradient, glow } from "../ui/tokens";

const PLAYERS = 2;
const COLORS = C.player;
// 밸런스 노브 — 전부 근거 없이 고른 값이다. 사람이 쳐보고 정한다.
const SIDES = 6;
const OPTS: PushOpts = { limitMin: 20, limitMax: 45, target: 100, sides: SIDES };
// 심지. 왼쪽 끝에서 시작해 오른쪽 끝 폭탄으로 뻗는다. 불꽃 위치가 곧 게이지다.
const BAR_MAX = OPTS.limitMax + SIDES;   // 최대 임계에서 한 번 더 굴릴 여유 = 심지 전체 길이
const FUSE = { x: 76, y: 240, w: 440 };
const BOMB = { x: 546, y: 240, r: 26 };
// 세로 스택: 제목(32) · 점수판(26·44) · 배너(54~76) · 차례 줄(96) · 주사위(112~180) · 심지(240)
// baseline 만 보고 쌓으면 글자가 위로 뻗어 겹친다 — kits/layout 의 textBand 로 검산한다.
export const BANNER = { x: 140, y: 54, w: 360, h: 22 };
export const TURN_Y = 96;
// 굴린 눈을 크게 보여주는 자리. 위는 차례 줄(아래끝 100.4), 아래는 게이지 숫자다 —
// 위아래가 막혀 있어 겹침이 나면 주사위가 줄어드는 것이 유일하게 빈 자리다.
export const DIE = { x: 320, y: 142, r: 30 };
/** 눈이 확정될 때 튀어나오는 배율. **장식이 판정을 가리면 안 된다**(DESIGN 원칙 5) — 0.35 는 차례 줄을 스쳤다. */
export const POP = 0.22;
/** 게이지 숫자 baseline. 주사위(최대 팝 178.6)와 심지 위험 띠(224) 사이. */
export const GAUGE_Y = 210;
const BTN_ROLL = { x: 96, y: 386, w: 200, h: 54 };
const BTN_PASS = { x: 344, y: 386, w: 200, h: 54 };
// 되돌리기는 그 규칙의 라운드에만, 남았을 때만 나타난다 — 상시 조작이 아니라 조건부 능력이다.
const BTN_UNDO = { x: 246, y: 448, w: 148, h: 26 };

interface Btn { x: number; y: number; w: number; h: number }
const hit = (b: Btn, p: PointerState) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

/** 터짐 연출 + 범인 문구. 이 게임이 클립이 되는 유일한 이유다. */
interface Boom { player: number; blame: Blame; lost: number; banked: number; face: number; life: number; gauge: number }

/**
 * 굴림 연출 타이밍. **결과는 누르는 순간 이미 확정돼 있고 화면이 늦게 보여줄 뿐이다** —
 * 엔진은 한 줄도 안 건드리므로 되돌리기·시드 결정성이 그대로다.
 */
export const ROLL = {
  // 처음 넣을 때 눈 6이 2.22초였고 "너무 길다"는 지적을 받았다(PSH-005).
  // 넷을 같은 비율로 줄였다 — PER_PIP 만 줄이면 큰 눈의 긴장이 사라지고
  // TUMBLE 만 줄이면 굴러가는 느낌이 사라진다. 지금은 눈 6에 1.35초.
  TUMBLE: 0.55,     // 눈이 굴러가는 시간
  SETTLE: 0.2,      // 눈이 확정되고 잠깐 머문다 — 여기서 숨을 참는다
  PER_PIP: 0.1,     // 심지가 눈 하나만큼 타는 시간
  CREEP_MIN: 0.18,
  TICK_FAST: 0.04,  // 구르는 초반 눈 바뀌는 간격
  TICK_SLOW: 0.2,   // 끝에서 이만큼까지 느려진다
} as const;

/**
 * 심지가 `span` 만큼 타는 데 걸리는 시간. **눈에 비례한다** —
 * 고정 시간이면 1 과 6 이 같은 긴장이 되고, 이 게임에서 큰 눈은 곧 큰 위험이다.
 */
export function creepDuration(span: number) {
  return Math.max(ROLL.CREEP_MIN, Math.abs(span) * ROLL.PER_PIP);
}

type Stage = "tumble" | "settle" | "creep";
/** 진행 중인 굴림 연출. `result` 는 이미 확정된 것이고 여기서 바뀌지 않는다. */
interface Anim {
  stage: Stage; t: number;
  face: number;      // 구르는 동안 보여줄 눈(연출용)
  next: number;      // 다음에 눈이 바뀔 때까지
  shown: number;     // 화면에 그리는 게이지
  from: number; to: number;
  ticked: number;    // 지글 소리를 낸 마지막 눈금
  result: RollResult;
}

export class PushScene implements Scene {
  private eng!: PushLuck;
  private sfx = new Sfx();
  private lastFace = 0;
  private lastFaces: number[] = [];
  private boom: Boom | null = null;
  private shake = 0; private flash = 0; private popScale = 0;
  private passHint = 0;   // 굴리기 전에 넘기려 했을 때 잠깐 띄우는 거절 표시
  private anim: Anim | null = null;

  /** 연출이 도는 동안은 모든 입력을 막는다 — 안 막으면 같은 굴림이 두 번 들어간다. */
  private get busy() { return this.anim !== null; }

  /**
   * 화면에 그릴 게이지. 연출 중이면 기어가는 값, 터짐 연출 중이면 **끊긴 자리**다.
   * `newRound` 가 엔진 게이지를 0 으로 되돌리므로, 이걸 안 쓰면 폭발은 끊긴 자리에
   * 그려지는데 재와 불꽃만 출발점으로 돌아가 있다.
   */
  private gaugeShown() {
    if (this.anim) return this.anim.shown;
    if (this.boom) return this.boom.gauge;
    return this.eng.gauge;
  }

  constructor(private h: Harness) { this.reset(); }
  enter() { this.reset(); }

  private reset() {
    this.eng = new PushLuck(OPTS);
    this.lastFace = 0; this.lastFaces = []; this.boom = null;
    this.shake = 0; this.flash = 0; this.popScale = 0; this.passHint = 0;
    this.anim = null;
    this.h.score = 0;
    this.h.to("play");
    this.h.record("psh:reset", { limitRange: this.eng.limitRange, target: OPTS.target });
  }

  /** 굴린다 — 판정은 여기서 끝나고, 화면은 `update` 가 3단으로 풀어놓는다. */
  private doRoll() {
    if (this.busy) return;
    const from = this.eng.gauge;
    const r = this.eng.roll();
    if (!r) return;
    this.anim = {
      stage: "tumble", t: 0,
      face: 1 + Math.floor(Math.random() * SIDES), next: ROLL.TICK_FAST,
      shown: from, from, to: r.gauge, ticked: from, result: r,
    };
    this.sfx.tick();
  }

  /** 연출이 끝난 뒤에야 결과를 화면 상태로 옮긴다 — 판 종료도 여기서다. */
  private settleRoll() {
    const r = this.anim!.result;
    this.anim = null;
    if (r.boom) {
      // 터진 게이지를 기억한다 — newRound 가 게이지를 0 으로 되돌려서
      // 그리는 시점엔 불꽃이 이미 출발점에 있다. 폭발은 끊긴 자리에서 나야 한다.
      this.boom = { player: r.player, blame: r.blame, lost: r.lostPot, banked: r.bankedPot, face: r.face, life: 2.4, gauge: r.gauge };
      this.shake = 12; this.flash = 0.7;
      this.sfx.trip();
      this.h.record("psh:boom", { player: r.player, blame: r.blame, lost: r.lostPot, banked: r.bankedPot, mod: this.eng.mod });
      if (this.eng.done) {
        const w = this.eng.winner();
        this.h.score = this.eng.score[Math.max(0, w)];
        this.h.to("win");   // 승패는 화면에서 이름으로 밝힌다
        this.sfx.win();
        this.h.record("psh:match", { winner: w, score: this.eng.score });
      }
    } else {
      // 위험 구간에 들어갔으면 경고음, 아니면 확인음. 소리도 위험을 말한다.
      this.eng.gauge >= this.eng.limitRange[0] ? this.sfx.warn() : this.sfx.toggle(true);
    }
  }

  private doUndo() {
    if (this.busy || !this.eng.undo()) return;
    this.boom = null;              // 터짐 연출도 같이 취소한다 — 없던 일이 됐다
    this.shake = 0; this.flash = 0;
    this.lastFace = 0; this.lastFaces = [];
    this.sfx.role();
    this.h.record("psh:undo", { round: this.eng.round, gauge: this.eng.gauge });
  }

  private doPass() {
    if (this.busy) return;
    if (!this.eng.pass()) { this.passHint = 1.2; this.sfx.missHit(); return; }
    this.sfx.role();
    this.h.record("psh:pass", { turn: this.eng.turn, gauge: this.eng.gauge });
  }

  pointer(p: PointerState) {
    if (!p.justDown) return;
    if (this.h.phase !== "play") return this.reset();
    if (this.eng.canUndo && hit(BTN_UNDO, p)) return this.doUndo();
    if (hit(BTN_ROLL, p)) return this.doRoll();
    if (hit(BTN_PASS, p)) return this.doPass();
  }

  key(code: string, down: boolean) {
    if (!down) return;
    if (code === "KeyM") { this.sfx.toggleMute(); return; }
    if (code === "KeyR") return this.reset();
    if (this.h.phase !== "play") { if (code === "Space" || code === "Enter") this.reset(); return; }
    if (code === "Space") return this.doRoll();
    if (code === "Enter") return this.doPass();
    if (code === "KeyZ") return this.doUndo();
  }

  update(dt: number) {
    // 굴림 연출이 도는 동안만 update 가 **진행**을 맡는다. 나머지는 감쇠뿐이다.
    if (this.anim) this.stepRoll(dt);
    this.shake = Math.max(0, this.shake - dt * 40);
    this.flash = Math.max(0, this.flash - dt * 1.6);
    this.popScale = Math.max(0, this.popScale - dt * 3);
    this.passHint = Math.max(0, this.passHint - dt * 2);
    if (this.boom) {
      this.boom.life -= dt;
      if (this.boom.life <= 0) this.boom = null;
    }
  }

  /**
   * 굴림 연출 3단. **구름 → 확정 → 심지가 탄다.**
   * 결과는 이미 정해져 있고 여기서는 그것을 보여주는 속도만 정한다.
   */
  private stepRoll(dt: number) {
    const a = this.anim!;
    a.t += dt;

    if (a.stage === "tumble") {
      // 감속한다 — 처음엔 달그락거리다가 끝에서 하나씩 떨어진다
      a.next -= dt;
      if (a.next <= 0) {
        a.face = 1 + Math.floor(Math.random() * SIDES);
        const p = Math.min(1, a.t / ROLL.TUMBLE);
        a.next = ROLL.TICK_FAST + p * p * ROLL.TICK_SLOW;
        this.sfx.tick();
      }
      if (a.t >= ROLL.TUMBLE) {
        a.stage = "settle"; a.t = 0;
        // 눈이 확정된다. 심지는 아직 안 움직인다 — 여기가 숨을 참는 자리다.
        this.lastFace = a.result.face;
        this.lastFaces = a.result.faces;
        this.popScale = 1;
        this.sfx.hit(false);
      }
      return;
    }

    if (a.stage === "settle") {
      if (a.t >= ROLL.SETTLE) { a.stage = "creep"; a.t = 0; }
      return;
    }

    // creep — 불꽃이 옛 자리에서 새 자리로 기어간다
    const span = a.to - a.from;
    const p = Math.min(1, a.t / creepDuration(span));
    a.shown = a.from + span * p;
    while (a.ticked < Math.floor(a.shown)) { a.ticked++; this.sfx.tick(); }
    if (p >= 1) this.settleRoll();
  }

  hud() {
    const e = this.eng;
    const [lo, hi] = e.limitRange;
    if (e.done) {
      const w = e.winner();
      return `<b>떠넘기기</b> &nbsp; <b style="color:${COLORS[Math.max(0, w)]}">P${w + 1} 승</b>` +
        ` &nbsp; ${e.score[0]} : ${e.score[1]} <span style="opacity:.6">(목표 ${OPTS.target})</span>` +
        ` &nbsp; <span style="opacity:.6">클릭/스페이스 다시 · Esc 메뉴</span>`;
    }
    const s = e.score.map((v, i) => `<span style="color:${COLORS[i]}">P${i + 1} ${v}</span>`).join(" : ");
    const pot = e.pot.map((v, i) => `<span style="color:${COLORS[i]}">${v}</span>`).join("/");
    const sp = modSpec(e.mod);
    const rule = e.mod === "none" ? "" : ` &nbsp; <b style="color:${C.accentHi}">${sp.name}</b>`;
    const mult = e.stakeMult > 1 ? ` <span style="opacity:.6">×${e.stakeMult}</span>` : "";
    return `<b>떠넘기기</b> R${e.round}${mult}${rule} &nbsp; ${s} <span style="opacity:.6">(목표 ${OPTS.target})</span>` +
      ` &nbsp; 게이지 <b>${Math.round(this.gaugeShown())}</b><span style="opacity:.6">${e.rangeHidden ? "(안개)" : `(터짐 ${lo}~${hi})`}</span>` +
      ` &nbsp; 이번 판 ${pot}` +
      ` &nbsp; <span style="opacity:.6">스페이스 굴리기 · 엔터 넘기기 · Z 되돌리기 · R 처음부터 · 음소거[M] ${this.sfx.muted ? "🔇" : "🔊"}</span>`;
  }

  private button(ctx: CanvasRenderingContext2D, b: Btn, label: string, sub: string, on: boolean, color: string) {
    ctx.fillStyle = on ? color : C.slot;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = on ? color : C.line; ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = on ? C.bg : C.textFaint; ctx.font = font(F.lg);
    ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 - 7);
    ctx.fillStyle = on ? withAlpha(C.bg, 0.7) : C.textFaint; ctx.font = font(F.xs);
    ctx.fillText(sub, b.x + b.w / 2, b.y + b.h / 2 + 13);
    ctx.textBaseline = "alphabetic";
  }

  draw(ctx: CanvasRenderingContext2D) {
    const e = this.eng;
    const [lo, hi] = e.limitRange;
    ctx.clearRect(0, 0, 640, 480);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, 640, 480);

    ctx.save();
    if (this.shake > 0.1) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);

    const turnColor = COLORS[e.turn];

    // 제목 + 밑줄(시그니처 그라데이션은 장식 전용)
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = C.text; ctx.font = font(F.xl);
    ctx.fillText("떠넘기기", 16, 32);
    ctx.strokeStyle = sigGradient(ctx, 16, 36, 140, 36); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(16, 37); ctx.lineTo(120, 37); ctx.stroke();

    // 점수판 — 목표 대비 진행을 모수와 함께 적는다(DESIGN 원칙 4)
    ctx.font = font(F.md);
    for (let i = 0; i < PLAYERS; i++) {
      const x = i === 0 ? 200 : 440;
      ctx.textAlign = "center";
      ctx.fillStyle = COLORS[i];
      ctx.fillText(`P${i + 1}  ${e.score[i]}`, x, 26);
      ctx.font = font(F.xs); ctx.fillStyle = C.textMuted;
      ctx.fillText(`목표 ${OPTS.target} · 이번 판 ${e.pot[i]}`, x, 44);
      ctx.font = font(F.md);
    }

    // 이번 라운드 규칙 — 화면 위 한 줄이 그대로 클립 자막이 된다.
    // "이번 판 넘기기 금지" 는 시청자가 2초에 읽는다.
    const spec = modSpec(e.mod);
    if (!e.done) {
      const plain = e.mod === "none";
      ctx.textAlign = "center";
      ctx.fillStyle = plain ? C.slot : withAlpha(C.accentHi, 0.16);
      ctx.fillRect(BANNER.x, BANNER.y, BANNER.w, BANNER.h);
      ctx.strokeStyle = plain ? C.line : C.accentHi; ctx.lineWidth = 1;
      ctx.strokeRect(BANNER.x + 0.5, BANNER.y + 0.5, BANNER.w - 1, BANNER.h - 1);
      ctx.textBaseline = "middle";
      ctx.fillStyle = plain ? C.textMuted : C.accentHi; ctx.font = font(F.sm);
      ctx.fillText(plain ? `R${e.round} · 기본 규칙` : `R${e.round} · ${spec.name} — ${spec.desc}`, 320, BANNER.y + BANNER.h / 2);
      ctx.textBaseline = "alphabetic";
    }

    // 차례 — 화면에서 가장 큰 글자가 누구 차례인지 말한다
    ctx.textAlign = "center"; ctx.font = font(F.xl); ctx.fillStyle = turnColor;
    if (!e.done) {
      glow(ctx, turnColor, 12, () => {
        const must = e.rolled ? "굴리거나 넘긴다" : "반드시 한 번 굴려야 한다";
        ctx.fillText(`▶ P${e.turn + 1} 차례 — ${must}`, 320, TURN_Y);
      });
    }

    // 굴린 눈 — 크게. punchline 시각이다.
    if (this.lastFace > 0) {
      const s = 1 + this.popScale * POP;
      ctx.save(); ctx.translate(DIE.x, DIE.y); ctx.scale(s, s);
      ctx.fillStyle = withAlpha(C.text, 0.08);
      ctx.beginPath(); ctx.arc(0, 0, DIE.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.text; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = C.text; ctx.font = font(F.huge);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(this.lastFace), 0, this.lastFaces.length > 1 ? -5 : 1);
      if (this.lastFaces.length > 1) {   // 연발 — 무엇이 합쳐진 값인지 보여준다
        ctx.fillStyle = C.accentHi; ctx.font = font(F.xs);
        ctx.fillText(this.lastFaces.join(" + "), 0, 18);
      }
      ctx.restore();
      ctx.textBaseline = "alphabetic";
    }

    // ── 타들어가는 심지 ──────────────────────────────────────
    // 불꽃 위치 = 게이지. 뒤는 재, 앞은 성한 심지, 붉은 구간은 임계 범위다.
    // "이 안 어딘가에서 터진다"가 설명 없이 읽힌다 — 쇼츠 2초 판독의 근거.
    const shown = this.gaugeShown();
    const inDanger = shown >= lo;
    const fx = (v: number) => FUSE.x + (Math.min(v, BAR_MAX) / BAR_MAX) * FUSE.w;
    // 심지를 살짝 물결지게 그려 줄처럼 보이게 한다. 진폭은 작게 —
    // 크면 불꽃이 어디쯤인지 흐려져 장식이 판정을 가린다(DESIGN 원칙 5).
    const fy = (v: number) => FUSE.y + Math.sin((v / BAR_MAX) * Math.PI * 6) * 5;
    const strand = (from: number, to: number, color: string, w: number, alpha = 1) => {
      if (to <= from) return;
      ctx.save();
      ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = w;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      const step = BAR_MAX / 120;
      for (let v = from, i = 0; v <= to + 1e-6; v += step, i++) {
        const cv = Math.min(v, to);
        i === 0 ? ctx.moveTo(fx(cv), fy(cv)) : ctx.lineTo(fx(cv), fy(cv));
      }
      ctx.stroke();
      ctx.restore();
    };

    // 1. 위험 구간 — 심지 뒤에 굵고 흐린 붉은 띠. 안개 라운드는 이걸 안 그린다.
    if (!e.rangeHidden) strand(lo, hi, C.danger, 22, 0.22);
    // 2. 성한 심지(불꽃 앞) / 타버린 재(불꽃 뒤)
    strand(shown, BAR_MAX, C.textMuted, 6);
    strand(0, shown, C.line, 4);
    // 3. 범위 경계 눈금 (안개면 생략)
    for (const v of e.rangeHidden ? [] : [lo, hi]) {
      ctx.strokeStyle = withAlpha(C.danger, 0.85); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(fx(v), fy(v) - 20); ctx.lineTo(fx(v), fy(v) + 20); ctx.stroke();
      ctx.fillStyle = C.danger; ctx.font = font(F.xs); ctx.textAlign = "center";
      ctx.fillText(String(v), fx(v), fy(v) + 36);
    }
    // 4. 끝의 폭탄 — 도달하지 않는 게 정상이다. 심지 중간에서 터지는 것이
    //    "언제 터질지 모른다"의 그림이고, 남은 심지가 여유로 읽힌다.
    ctx.fillStyle = withAlpha(C.text, e.done ? 0.15 : 0.9);
    ctx.beginPath(); ctx.arc(BOMB.x, BOMB.y, BOMB.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.bg; ctx.font = font(F.lg);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("💣", BOMB.x, BOMB.y + 1);
    ctx.textBaseline = "alphabetic";
    // 5. 불꽃 — 지글거림은 반지름 흔들림으로 낸다(파티클 배열을 새로 만들지 않는다)
    // 터진 뒤에는 불꽃이 없다 — 심지가 끊겼고 그 자리는 폭발이 맡는다
    if (!e.done && !this.boom) {
      const flameX = fx(shown), flameY = fy(shown);
      const jitter = 1 + Math.random() * 0.35;
      const hot = inDanger ? C.danger : C.accentHi;
      glow(ctx, hot, 22, () => {
        ctx.fillStyle = withAlpha(hot, 0.55);
        ctx.beginPath(); ctx.arc(flameX, flameY, 13 * jitter, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = hot;
        ctx.beginPath(); ctx.arc(flameX, flameY, 8 * jitter, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.text;
        ctx.beginPath(); ctx.arc(flameX, flameY, 3.5 * jitter, 0, Math.PI * 2); ctx.fill();
      });
    }
    // 6. 폭발 — 심지가 끊긴 그 자리에서 난다. 끝의 폭탄에서 터지게 하면
    //    "끝까지 가야 터진다"로 읽혀 숨은 임계값이라는 규칙과 어긋난다.
    if (this.boom) {
      const t = Math.max(0, Math.min(1, this.boom.life / 2.4));
      const bx = fx(this.boom.gauge), by = fy(this.boom.gauge);
      glow(ctx, C.danger, 26, () => {
        ctx.strokeStyle = C.danger; ctx.lineWidth = 4 * t;
        ctx.beginPath(); ctx.arc(bx, by, 18 + (1 - t) * 90, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = withAlpha(C.danger, t * 0.8);
        ctx.beginPath(); ctx.arc(bx, by, 10 + t * 22, 0, Math.PI * 2); ctx.fill();
      });
      ctx.fillStyle = withAlpha(C.text, t); ctx.font = font(F.xxl);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("💥", bx, by);
      ctx.textBaseline = "alphabetic";
    }

    // 7. 숫자 — 그림이 말해도 판단에 필요한 값은 글로도 준다(DESIGN 원칙 4)
    ctx.fillStyle = inDanger ? C.danger : C.text; ctx.font = font(F.xxl); ctx.textAlign = "center";
    ctx.fillText(String(Math.round(shown)), 320, GAUGE_Y);
    ctx.font = font(F.xs); ctx.fillStyle = C.textMuted;
    ctx.fillText(
      e.rangeHidden
        ? "안개 — 어디서 끊기는지 아무 정보도 없다"
        : `심지는 ${lo}~${hi} 사이 어딘가에서 끊긴다 · 정확한 지점은 숨겨져 있다`,
      320, FUSE.y + 60);

    ctx.restore();

    // 터짐 섬광 — 화면 가장자리
    if (this.flash > 0) {
      const g = ctx.createRadialGradient(320, 240, 160, 320, 240, 430);
      g.addColorStop(0, withAlpha(C.danger, 0));
      g.addColorStop(1, withAlpha(C.danger, this.flash * 0.55));
      ctx.fillStyle = g; ctx.fillRect(0, 0, 640, 480);
    }

    // 버튼
    if (!e.done) {
      this.button(ctx, BTN_ROLL, "굴리기", "스페이스", true, turnColor);
      this.button(ctx, BTN_PASS, "넘기기", e.canPass ? "엔터" : "먼저 한 번 굴려야 한다", e.canPass, turnColor);
      if (e.canUndo) {
        ctx.fillStyle = withAlpha(C.accentHi, 0.9);
        ctx.fillRect(BTN_UNDO.x, BTN_UNDO.y, BTN_UNDO.w, BTN_UNDO.h);
        ctx.fillStyle = C.bg; ctx.font = font(F.sm);
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(`↩ 되돌리기 (Z) · P${e.undoOwner + 1} 몫 1회`, BTN_UNDO.x + BTN_UNDO.w / 2, BTN_UNDO.y + BTN_UNDO.h / 2);
        ctx.textBaseline = "alphabetic";
      }
    }
    // 터짐 문구와 자리가 겹친다. 터진 순간에 넘기기 거절이 같이 뜰 이유도 없다.
    if (this.passHint > 0 && !this.boom) {
      ctx.globalAlpha = Math.min(1, this.passHint);
      ctx.fillStyle = C.danger; ctx.font = font(F.md); ctx.textAlign = "center";
      ctx.fillText("아직 못 넘긴다 — 이번 차례에 한 번은 굴려야 한다", 320, 370);
      ctx.globalAlpha = 1;
    }

    // 터짐 문구 — 범인을 이름으로 적는다
    if (this.boom) {
      const b = this.boom;
      ctx.globalAlpha = Math.min(1, b.life / 0.6);
      ctx.textAlign = "center";
      ctx.fillStyle = C.danger; ctx.font = font(F.huge);
      glow(ctx, C.danger, 18, () => ctx.fillText(`💥 P${b.player + 1} 터짐`, 320, 330));
      ctx.font = font(F.lg); ctx.fillStyle = C.text;
      ctx.fillText(this.blameText(b), 320, 356);
      ctx.font = font(F.sm); ctx.fillStyle = C.textMuted;
      ctx.fillText(`${b.lost}점 소멸 · P${2 - b.player} 가 ${b.banked}점 확보`, 320, 374);
      ctx.globalAlpha = 1;
    }

    if (e.done) {
      const w = e.winner();
      ctx.fillStyle = withAlpha(C.scrim, 0.84); ctx.fillRect(0, 0, 640, 480);
      ctx.textAlign = "center";
      const col = w < 0 ? C.textMuted : COLORS[w];
      glow(ctx, col, 20, () => {
        ctx.font = font(F.hero); ctx.fillStyle = col;
        ctx.fillText(w < 0 ? "무승부" : `🏆 P${w + 1} 승`, 320, 200);
      });
      ctx.font = font(F.xxl); ctx.fillStyle = C.text;
      ctx.fillText(`${e.score[0]} : ${e.score[1]}`, 320, 250);
      ctx.font = font(F.sm); ctx.fillStyle = C.textMuted;
      ctx.fillText(`${e.round - 1}라운드 · 목표 ${OPTS.target}점`, 320, 274);
      ctx.font = font(F.lg); ctx.fillStyle = C.text;
      ctx.fillText("클릭 / 스페이스 → 다시 · Esc 메뉴", 320, 320);
    }
  }

  private blameText(b: Boom): string {
    const me = `P${b.player + 1}`, other = `P${2 - b.player}`;
    if (b.blame === "passer") return `${other} 가 넘겼다 — ${me} 는 강제로 굴려야 했다`;
    if (b.blame === "self") return `${me} 가 한 번 더 굴렸다`;
    return "라운드 첫 굴림 — 그냥 운이 없었다";
  }
}
