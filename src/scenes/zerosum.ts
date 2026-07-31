// 리허설7 "제로섬" — 내가 얻은 칸은 반드시 네가 잃은 칸이다.
// 재사용: Harness, Sfx, 토큰. 신규: systems/zerosum.
//
// 화면의 핵심은 **가운데 막대 하나**다. 칸 총합이 불변이라 경계선 하나로 판세가
// 전부 표현된다 — 자막도 설명도 필요 없고, 경계가 어느 쪽으로 밀렸는지만 보면 된다.
import { Harness, Scene, PointerState } from "../core/harness";
import { Sfx } from "../systems/sfx";
import { ZeroSum, ZeroOpts, shapeSpec, layoutSpec } from "../systems/zerosum";
import { C, F, font, withAlpha, sigGradient, glow } from "../ui/tokens";

const COLORS = C.player;
// 밸런스 노브 — 전부 근거 없이 고른 값이다. 사람이 쳐보고 정한다.
const OPTS: ZeroOpts = { cols: 14, rows: 10, turns: 10 };
const CELL = 32;
const BOARD = { x: (640 - OPTS.cols * CELL) / 2, y: 136 };   // 96, 136 → 448×320
export const BAR = { x: 96, y: 92, w: 448, h: 20 };           // 판세 막대 — 이 게임의 얼굴
// 모양 글리프는 7px 단위라 고리(5×5)가 35px 다 — 세로 스택에 넣으면 그만큼을 먹는다.
// 차례 줄 오른쪽 빈 공간으로 뺀다(차례 줄이 x 177~463, 여기는 557~592).
export const GLYPH = { x: 575, y: 30 };
export const HINT_Y = 126;
const FLASH = 0.55;   // 방금 넘어간 칸이 밝게 남는 시간(초)
// 미리보기 요약 baseline. 격자 하단(BOARD.y + rows*CELL = 456) 아래여야 하고
// F.sm(14) 기준 위로 11.2px 뻗으므로 468 이면 456.8 부터 시작해 안 겹친다.
export const SUMMARY_Y = 468;
export const BOARD_BOTTOM = BOARD.y + OPTS.rows * CELL;

export class ZeroScene implements Scene {
  private eng!: ZeroSum;
  private sfx = new Sfx();
  private hover: { c: number; r: number } | null = null;
  /** 방금 넘어간 칸 — 무엇이 바뀌었는지가 punchline 이다. */
  private lit: { cells: number[]; player: number; taken: number; life: number } | null = null;
  private shake = 0;

  constructor(private h: Harness) { this.reset(); }
  enter() { this.reset(); }

  private reset() {
    this.eng = new ZeroSum(OPTS);
    this.hover = null; this.lit = null; this.shake = 0;
    this.h.score = 0;
    this.h.to("play");
    this.h.record("zro:reset", { size: this.eng.size, turns: OPTS.turns * 2, layout: this.eng.layout });
  }

  private cellAt(px: number, py: number) {
    const c = Math.floor((px - BOARD.x) / CELL), r = Math.floor((py - BOARD.y) / CELL);
    return this.eng.inBounds(c, r) ? { c, r } : null;
  }

  pointer(p: PointerState) {
    if (this.h.phase !== "play") { if (p.justDown) this.reset(); return; }
    this.hover = this.cellAt(p.x, p.y);
    if (!p.justDown || !this.hover) return;
    const res = this.eng.claim(this.hover.c, this.hover.r);
    if (!res) return;
    this.lit = { cells: res.cells, player: res.player, taken: res.taken, life: FLASH };
    // 크게 뺏을수록 크게 흔들린다 — 스윙의 크기가 몸으로 읽힌다.
    this.shake = Math.min(10, res.taken * 0.4);
    res.taken > 0 ? this.sfx.role() : this.sfx.missHit();   // 헛수(전부 내 칸)면 다른 소리
    this.h.record("zro:claim", { player: res.player, shape: res.shape, taken: res.taken, kept: res.kept, own: res.own });
    if (this.eng.done) {
      const w = this.eng.winner();
      this.h.score = this.eng.score[Math.max(0, w)];
      this.h.to("win");
      this.sfx.win();
      this.h.record("zro:match", { winner: w, score: this.eng.score });
    }
  }

  key(code: string, down: boolean) {
    if (!down) return;
    if (code === "KeyM") { this.sfx.toggleMute(); return; }
    if (code === "KeyR") return this.reset();
    if (this.h.phase !== "play" && (code === "Space" || code === "Enter")) this.reset();
  }

  update(dt: number) {
    this.shake = Math.max(0, this.shake - dt * 30);
    if (this.lit) { this.lit.life -= dt; if (this.lit.life <= 0) this.lit = null; }
  }

  hud() {
    const e = this.eng;
    const [a, b] = e.counts();
    if (e.done) {
      const w = e.winner();
      return `<b>제로섬</b> &nbsp; <b style="color:${COLORS[Math.max(0, w)]}">${w < 0 ? "무승부" : `P${w + 1} 승`}</b>` +
        ` &nbsp; ${e.score[0]} : ${e.score[1]}` +
        ` &nbsp; <span style="opacity:.6">클릭/스페이스 다시 · Esc 메뉴</span>`;
    }
    return `<b>제로섬</b> &nbsp; <b style="color:${COLORS[e.turn]}">P${e.turn + 1} 차례</b>` +
      ` &nbsp; 모양 <b>${shapeSpec(e.shape).name}</b><span style="opacity:.6">(${e.shapeSize}칸)</span>` +
      ` &nbsp; R${e.round}` +
      ` &nbsp; <span style="opacity:.6">${layoutSpec(e.layout).name} 배치</span>` +
      ` &nbsp; 칸 <span style="color:${COLORS[0]}">${a}</span>:<span style="color:${COLORS[1]}">${b}</span>` +
      `<span style="opacity:.6">(합 ${a + b} 불변)</span>` +
      ` &nbsp; 점수 ${e.score[0]}:${e.score[1]}` +
      ` &nbsp; 남은 수 ${e.turnsLeft}` +
      ` &nbsp; <span style="opacity:.6">칸 클릭 · R 처음부터 · 음소거[M] ${this.sfx.muted ? "🔇" : "🔊"}</span>`;
  }

  /**
   * 이번 모양의 미니 도해. 이름("고리")만으로는 어떤 모양인지 안 읽힌다 —
   * 라운드마다 모양이 바뀌므로 그림이 없으면 매번 눌러봐야 안다.
   */
  private shapeGlyph(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string) {
    const cells = shapeSpec(this.eng.shape).cells, u = 7;
    ctx.fillStyle = withAlpha(color, 0.85);
    for (const [dc, dr] of cells) ctx.fillRect(cx + dc * u - u / 2 + 1, cy + dr * u - u / 2 + 1, u - 2, u - 2);
    // 기준점(찍는 자리)을 흰 테두리로 표시 — 모양이 어디를 중심으로 놓이는지가 결정의 전부다.
    ctx.strokeStyle = C.text; ctx.lineWidth = 1;
    ctx.strokeRect(cx - u / 2 + 0.5, cy - u / 2 + 0.5, u - 1, u - 1);
  }

  /**
   * 판세 궤적. 제로섬은 총합이 고정이라 **선 하나**로 판이 어떻게 밀고 당겼는지가
   * 전부 표현된다 — 다른 게임은 총합이 안 고정이라 이런 선이 아예 안 나온다.
   * 가운데가 반반 기준선이고 위로 갈수록 P1 우세다.
   */
  private trail(ctx: CanvasRenderingContext2D) {
    const e = this.eng, h = e.history;
    const G = { x: 120, y: 282, w: 400, h: 110 };
    const px = (i: number) => G.x + (i / Math.max(1, h.length - 1)) * G.w;
    const py = (own0: number) => G.y + G.h - (own0 / e.size) * G.h;

    ctx.fillStyle = withAlpha(C.surface, 0.9); ctx.fillRect(G.x, G.y, G.w, G.h);
    // 위쪽 절반은 P1 우세, 아래쪽은 P2 우세 — 색으로 구역을 나눠 방향을 읽게 한다.
    ctx.fillStyle = withAlpha(COLORS[0], 0.08); ctx.fillRect(G.x, G.y, G.w, G.h / 2);
    ctx.fillStyle = withAlpha(COLORS[1], 0.08); ctx.fillRect(G.x, G.y + G.h / 2, G.w, G.h / 2);
    ctx.strokeStyle = withAlpha(C.text, 0.4); ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(G.x, G.y + G.h / 2); ctx.lineTo(G.x + G.w, G.y + G.h / 2); ctx.stroke();
    ctx.setLineDash([]);

    glow(ctx, C.text, 8, () => {
      ctx.strokeStyle = C.text; ctx.lineWidth = 2; ctx.lineJoin = "round";
      ctx.beginPath();
      h.forEach((t, i) => (i === 0 ? ctx.moveTo(px(i), py(t.own0)) : ctx.lineTo(px(i), py(t.own0))));
      ctx.stroke();
    });
    // 각 수를 둔 사람 색으로 점을 찍는다 — 누가 밀었는지가 선 위에 보인다.
    h.forEach((t, i) => {
      if (t.player < 0) return;
      ctx.fillStyle = COLORS[t.player];
      ctx.beginPath(); ctx.arc(px(i), py(t.own0), 2.5, 0, Math.PI * 2); ctx.fill();
    });

    ctx.font = font(F.xs); ctx.fillStyle = C.textMuted;
    ctx.textAlign = "left"; ctx.fillText("판세 궤적 — 위: P1 우세", G.x, G.y - 6);
    ctx.textAlign = "right"; ctx.fillText("아래: P2 우세", G.x + G.w, G.y - 6);
    ctx.textAlign = "center";

    // 최고의 한 수 — 그래프가 "어떻게"를 말하면 이건 "언제·누가"를 말한다. 클립 자막이 된다.
    const best = e.bestMove();
    if (best) {
      ctx.font = font(F.md); ctx.fillStyle = COLORS[best.player];
      ctx.fillText(`최고의 한 수 — ${best.move}수째 P${best.player + 1} 가 ${best.taken}칸 강탈`, 320, G.y + G.h + 18);
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const e = this.eng;
    const [a, b] = e.counts();
    ctx.clearRect(0, 0, 640, 480);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, 640, 480);

    ctx.save();
    if (this.shake > 0.1) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);

    const turnColor = COLORS[e.turn];

    // 제목
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = C.text; ctx.font = font(F.xl);
    ctx.fillText("제로섬", 16, 32);
    ctx.strokeStyle = sigGradient(ctx, 16, 36, 120, 36); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(16, 37); ctx.lineTo(96, 37); ctx.stroke();

    // 차례 + 이번 반경 — 반경은 클릭 전에 보여준다. 뒤에 알려주면 결정이 사라진다.
    ctx.textAlign = "center"; ctx.font = font(F.xl); ctx.fillStyle = turnColor;
    if (!e.done) {
      // 모양 이름만으로는 안 읽힌다 — 아래에 미니 도해를 그린다.
      glow(ctx, turnColor, 12, () => {
        ctx.fillText(`▶ P${e.turn + 1} 차례 — ${shapeSpec(e.shape).name} (${e.shapeSize}칸) · 남은 수 ${e.turnsLeft}`, 320, 34);
      });
      this.shapeGlyph(ctx, GLYPH.x, GLYPH.y, turnColor);
    }

    // ── 판세 막대 ────────────────────────────────────────────
    // 총합이 불변이라 경계선 하나가 판세 전부다. 이 게임의 얼굴.
    const split = BAR.x + (a / e.size) * BAR.w;
    ctx.fillStyle = COLORS[0]; ctx.fillRect(BAR.x, BAR.y, split - BAR.x, BAR.h);
    ctx.fillStyle = COLORS[1]; ctx.fillRect(split, BAR.y, BAR.x + BAR.w - split, BAR.h);
    glow(ctx, C.text, 10, () => {
      ctx.strokeStyle = C.text; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(split, BAR.y - 6); ctx.lineTo(split, BAR.y + BAR.h + 6); ctx.stroke();
    });
    ctx.font = font(F.sm); ctx.textBaseline = "middle";
    ctx.textAlign = "left"; ctx.fillStyle = C.bg;
    ctx.fillText(String(a), BAR.x + 6, BAR.y + BAR.h / 2);
    ctx.textAlign = "right";
    ctx.fillText(String(b), BAR.x + BAR.w - 6, BAR.y + BAR.h / 2);
    ctx.textBaseline = "alphabetic";
    // 시작선(70:70) — 지금이 시작보다 어느 쪽으로 밀렸는지 한눈에 보인다
    ctx.strokeStyle = withAlpha(C.text, 0.35); ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(BAR.x + BAR.w / 2, BAR.y - 3); ctx.lineTo(BAR.x + BAR.w / 2, BAR.y + BAR.h + 3); ctx.stroke();
    ctx.setLineDash([]);

    // ── 격자 ─────────────────────────────────────────────────
    const pv = !e.done && this.hover ? new Set(e.preview(this.hover.c, this.hover.r)) : null;
    const litSet = this.lit ? new Set(this.lit.cells) : null;
    const litT = this.lit ? Math.max(0, this.lit.life / FLASH) : 0;
    for (let r = 0; r < OPTS.rows; r++) for (let c = 0; c < OPTS.cols; c++) {
      const i = e.idx(c, r), x = BOARD.x + c * CELL, y = BOARD.y + r * CELL;
      ctx.fillStyle = withAlpha(COLORS[e.own[i]], 0.75);
      ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
      // 방금 넘어간 칸 — 무엇이 바뀌었는지가 punchline 이다
      if (litSet?.has(i)) {
        ctx.fillStyle = withAlpha(C.text, litT * 0.8);
        ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
      }
      // 미리보기 — 뺏을 범위를 클릭 전에 보여준다. 상대 칸만 테두리를 밝게 한다.
      if (pv?.has(i)) {
        const steal = e.own[i] !== e.turn;
        ctx.strokeStyle = steal ? C.text : withAlpha(C.text, 0.25);
        ctx.lineWidth = steal ? 2 : 1;
        ctx.strokeRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3);
      }
    }
    // 판 테두리
    ctx.strokeStyle = C.line; ctx.lineWidth = 1;
    ctx.strokeRect(BOARD.x + 0.5, BOARD.y + 0.5, OPTS.cols * CELL - 1, OPTS.rows * CELL - 1);

    ctx.restore();

    // 미리보기 요약 — 몇 칸을 뺏는지와 **왜 그만큼인지**를 같이 준다(DESIGN 원칙 4).
    // 반경만 알려주면 가장자리에서 잘린 것도, 이미 내 칸이라 낭비된 것도 설명이 안 된다.
    // 격자 하단이 456 이고 캔버스가 480 이라 아래 여유가 24px 뿐이다 —
    // 두 줄로 쌓으면 격자 위로 올라타거나 화면 밖으로 잘린다. 한 줄로 합친다.
    ctx.textAlign = "center"; ctx.font = font(F.sm);
    if (!e.done && this.hover) {
      const cells = e.preview(this.hover.c, this.hover.r);
      const full = e.shapeSize;
      let steal = 0;
      for (const i of cells) if (e.own[i] !== e.turn) steal++;
      const mine = cells.length - steal, clipped = full - cells.length;
      // 최대에서 깎인 이유를 그대로 적는다 — 안 적으면 크기가 제멋대로로 보인다.
      const why: string[] = [`최대 ${full}칸`];
      if (clipped > 0) why.push(`판 밖 −${clipped}`);
      if (mine > 0) why.push(`내 칸 −${mine}`);
      ctx.fillStyle = steal > 0 ? turnColor : C.textFaint;
      ctx.fillText(steal > 0 ? `${steal}칸을 뺏는다 · ${why.join(" · ")}` : "여기는 이미 전부 내 칸이다", 320, SUMMARY_Y);
    } else if (!e.done) {
      ctx.fillStyle = C.textMuted;
      ctx.fillText("칸을 골라 클릭한다 — 내가 얻은 만큼 정확히 상대가 잃는다", 320, SUMMARY_Y);
    }

    // 첫 수 전에만 규칙 한 줄. 두고 나면 사라진다 — 계속 떠 있으면 판을 가린다.
    if (!e.done && e.moves === 0) {
      ctx.font = font(F.sm); ctx.fillStyle = C.textMuted;
      ctx.fillText(`시작 배치: ${layoutSpec(e.layout).name} · 20수 뒤 누적 점수로 승부`, 320, HINT_Y);
    }

    // 방금 한 일 — 핫시트에서 고개를 돌렸다 와도 따라잡힌다.
    if (this.lit && this.lit.taken > 0) {
      const t = Math.max(0, this.lit.life / FLASH);
      ctx.globalAlpha = t;
      ctx.font = font(F.lg); ctx.fillStyle = COLORS[this.lit.player];
      ctx.fillText(`P${this.lit.player + 1} 가 ${this.lit.taken}칸 가져감`, 320, HINT_Y);
      ctx.globalAlpha = 1;
    }

    // 점수 — 매 턴 자기 칸 수만큼 쌓인다
    ctx.font = font(F.sm); ctx.fillStyle = C.textMuted;
    ctx.textAlign = "left";
    ctx.fillText(`P1 점수 ${e.score[0]}`, BAR.x, BAR.y - 14);
    ctx.textAlign = "right";
    ctx.fillText(`P2 점수 ${e.score[1]}`, BAR.x + BAR.w, BAR.y - 14);

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
      ctx.fillText(`${e.score[0]} : ${e.score[1]}`, 320, 236);
      ctx.font = font(F.sm); ctx.fillStyle = C.textMuted;
      ctx.fillText(`${layoutSpec(e.layout).name} 배치 · ${OPTS.turns * 2}수 · 마지막 판세 ${a} : ${b} (합 ${a + b})`, 320, 258);
      this.trail(ctx);
      ctx.font = font(F.lg); ctx.fillStyle = C.text;
      ctx.fillText("클릭 / 스페이스 → 다시 · Esc 메뉴", 320, 432);
    }
  }
}
