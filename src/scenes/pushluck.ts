// 리허설6 "떠넘기기" — 굴리면 게이지와 내 점수가 함께 오르고, 넘기면 쌓인 게이지가 상대에게 간다.
// 재사용: Harness, Sfx, 토큰. 신규: systems/pushluck.
//
// 턴제라 update 로 진행할 것이 없다 — 입력만으로 상태가 움직이고 update 는 연출 감쇠만 한다.
// 핫시트 2인이 완성형이다(정보 비대칭이 규칙이 아니라 네트워크가 선행 조건이 아니다).
import { Harness, Scene, PointerState } from "../core/harness";
import { Sfx } from "../systems/sfx";
import { PushLuck, PushOpts, Blame } from "../systems/pushluck";
import { C, F, font, withAlpha, sigGradient, glow } from "../ui/tokens";

const PLAYERS = 2;
const COLORS = C.player;
// 밸런스 노브 — 전부 근거 없이 고른 값이다. 사람이 쳐보고 정한다.
const SIDES = 6;
const OPTS: PushOpts = { limitMin: 20, limitMax: 45, target: 100, sides: SIDES };
// 게이지 막대. 임계 최대값을 막대 끝으로 삼아 "위험 구간"을 음영으로 깐다.
const BAR = { x: 80, y: 214, w: 480, h: 40 };
const BAR_MAX = OPTS.limitMax + SIDES;   // 최대 임계에서 한 번 더 굴릴 여유
const DIE = { x: 320, y: 150, r: 34 };        // 굴린 눈을 크게 보여주는 자리
const BTN_ROLL = { x: 96, y: 386, w: 200, h: 54 };
const BTN_PASS = { x: 344, y: 386, w: 200, h: 54 };

interface Btn { x: number; y: number; w: number; h: number }
const hit = (b: Btn, p: PointerState) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

/** 터짐 연출 + 범인 문구. 이 게임이 클립이 되는 유일한 이유다. */
interface Boom { player: number; blame: Blame; lost: number; banked: number; face: number; life: number }

export class PushScene implements Scene {
  private eng!: PushLuck;
  private sfx = new Sfx();
  private lastFace = 0;
  private boom: Boom | null = null;
  private shake = 0; private flash = 0; private popScale = 0;
  private passHint = 0;   // 굴리기 전에 넘기려 했을 때 잠깐 띄우는 거절 표시

  constructor(private h: Harness) { this.reset(); }
  enter() { this.reset(); }

  private reset() {
    this.eng = new PushLuck(OPTS);
    this.lastFace = 0; this.boom = null;
    this.shake = 0; this.flash = 0; this.popScale = 0; this.passHint = 0;
    this.h.score = 0;
    this.h.to("play");
    this.h.record("psh:reset", { limitRange: this.eng.limitRange, target: OPTS.target });
  }

  private doRoll() {
    const r = this.eng.roll();
    if (!r) return;
    this.lastFace = r.face;
    this.popScale = 1;
    if (r.boom) {
      this.boom = { player: r.player, blame: r.blame, lost: r.lostPot, banked: r.bankedPot, face: r.face, life: 2.4 };
      this.shake = 12; this.flash = 0.7;
      this.sfx.trip();
      this.h.record("psh:boom", { player: r.player, blame: r.blame, lost: r.lostPot, banked: r.bankedPot });
      if (this.eng.done) {
        const w = this.eng.winner();
        this.h.score = this.eng.score[Math.max(0, w)];
        this.h.to(w === this.eng.turn ? "win" : "win");   // 승패는 화면에서 이름으로 밝힌다
        this.sfx.win();
        this.h.record("psh:match", { winner: w, score: this.eng.score });
      }
    } else {
      // 위험 구간에 들어갔으면 경고음, 아니면 확인음. 소리도 위험을 말한다.
      this.eng.gauge >= this.eng.limitRange[0] ? this.sfx.warn() : this.sfx.toggle(true);
    }
  }

  private doPass() {
    if (!this.eng.pass()) { this.passHint = 1.2; this.sfx.missHit(); return; }
    this.sfx.role();
    this.h.record("psh:pass", { turn: this.eng.turn, gauge: this.eng.gauge });
  }

  pointer(p: PointerState) {
    if (!p.justDown) return;
    if (this.h.phase !== "play") return this.reset();
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
  }

  update(dt: number) {
    // 진행은 입력이 하고 update 는 연출만 감쇠한다.
    this.shake = Math.max(0, this.shake - dt * 40);
    this.flash = Math.max(0, this.flash - dt * 1.6);
    this.popScale = Math.max(0, this.popScale - dt * 3);
    this.passHint = Math.max(0, this.passHint - dt * 2);
    if (this.boom) {
      this.boom.life -= dt;
      if (this.boom.life <= 0) this.boom = null;
    }
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
    return `<b>떠넘기기</b> R${e.round} &nbsp; ${s} <span style="opacity:.6">(목표 ${OPTS.target})</span>` +
      ` &nbsp; 게이지 <b>${e.gauge}</b><span style="opacity:.6">(터짐 ${lo}~${hi})</span>` +
      ` &nbsp; 이번 판 ${pot}` +
      ` &nbsp; <span style="opacity:.6">스페이스 굴리기 · 엔터 넘기기 · R 처음부터 · 음소거[M] ${this.sfx.muted ? "🔇" : "🔊"}</span>`;
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

    // 차례 — 화면에서 가장 큰 글자가 누구 차례인지 말한다
    ctx.textAlign = "center"; ctx.font = font(F.xl); ctx.fillStyle = turnColor;
    if (!e.done) {
      glow(ctx, turnColor, 12, () => {
        const must = e.rolled ? "굴리거나 넘긴다" : "반드시 한 번 굴려야 한다";
        ctx.fillText(`▶ P${e.turn + 1} 차례 — ${must}`, 320, 92);
      });
    }

    // 굴린 눈 — 크게. punchline 시각이다.
    if (this.lastFace > 0) {
      const s = 1 + this.popScale * 0.35;
      ctx.save(); ctx.translate(DIE.x, DIE.y); ctx.scale(s, s);
      ctx.fillStyle = withAlpha(C.text, 0.08);
      ctx.beginPath(); ctx.arc(0, 0, DIE.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.text; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = C.text; ctx.font = font(F.huge);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(this.lastFace), 0, 1);
      ctx.restore();
      ctx.textBaseline = "alphabetic";
    }

    // ── 게이지 막대 ──────────────────────────────────────────
    // 위험 구간(임계 범위)을 음영으로 깐다. 막대가 그 안에 들어가면
    // "지금 위험하다"가 설명 없이 읽힌다 — 쇼츠 2초 판독의 근거.
    ctx.fillStyle = C.slot; ctx.fillRect(BAR.x, BAR.y, BAR.w, BAR.h);
    const px = (v: number) => BAR.x + (Math.min(v, BAR_MAX) / BAR_MAX) * BAR.w;
    ctx.fillStyle = withAlpha(C.danger, 0.22);
    ctx.fillRect(px(lo), BAR.y, px(hi) - px(lo), BAR.h);
    // 채운 양 — 위험 구간 안이면 경고색
    const inDanger = e.gauge >= lo;
    ctx.fillStyle = inDanger ? C.danger : turnColor;
    ctx.fillRect(BAR.x, BAR.y, px(e.gauge) - BAR.x, BAR.h);
    ctx.strokeStyle = C.line; ctx.lineWidth = 1;
    ctx.strokeRect(BAR.x + 0.5, BAR.y + 0.5, BAR.w - 1, BAR.h - 1);
    // 범위 경계선과 눈금 글자
    for (const v of [lo, hi]) {
      ctx.strokeStyle = withAlpha(C.danger, 0.8); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px(v), BAR.y - 6); ctx.lineTo(px(v), BAR.y + BAR.h + 6); ctx.stroke();
      ctx.fillStyle = C.danger; ctx.font = font(F.xs); ctx.textAlign = "center";
      ctx.fillText(String(v), px(v), BAR.y + BAR.h + 20);
    }
    // 게이지 숫자
    ctx.fillStyle = inDanger ? C.danger : C.text; ctx.font = font(F.xxl); ctx.textAlign = "center";
    ctx.fillText(String(e.gauge), 320, BAR.y - 14);
    ctx.font = font(F.xs); ctx.fillStyle = C.textMuted;
    ctx.fillText(`터짐 ${lo}~${hi} 사이 · 값은 숨겨져 있다`, 320, BAR.y + BAR.h + 38);

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
    }
    if (this.passHint > 0) {
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
      glow(ctx, C.danger, 18, () => ctx.fillText(`💥 P${b.player + 1} 터짐`, 320, 316));
      ctx.font = font(F.lg); ctx.fillStyle = C.text;
      ctx.fillText(this.blameText(b), 320, 346);
      ctx.font = font(F.sm); ctx.fillStyle = C.textMuted;
      ctx.fillText(`${b.lost}점 소멸 · P${2 - b.player} 가 ${b.banked}점 확보`, 320, 366);
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
