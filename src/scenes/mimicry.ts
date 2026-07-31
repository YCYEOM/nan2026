// 리허설5 "모방" — 사라지는 선. P1이 원본을 보고 그리고, P2는 사라지는 중계만 보고 다시 만든다.
// 재사용: Harness, Sfx, 토큰. 신규: systems/mimicry (타깃·수명·유사도).
//
// 세로 조각은 2분할 한 화면이고 마우스가 하나라 **순차**로 돌린다(P1 단계 → P2 단계).
// P1의 선은 P2 단계에서 그려진 시각(born)대로 재생되며 STROKE_TTL 만큼만 보인다.
// 동시 플레이·진짜 정보 비대칭은 네트워크 이후다 — 지금은 안 보는 쪽 칸을 덮어 대신한다.
import { Harness, Scene, PointerState } from "../core/harness";
import { Sfx } from "../systems/sfx";
import { makeTarget, similarity, life, relayVisible, polys, Pt, Stroke } from "../systems/mimicry";
import { C, F, font, withAlpha, sigGradient, glow } from "../ui/tokens";

interface Box { x: number; y: number; w: number; h: number }
// 참조 상자와 그리기 칸의 **가로세로 비가 같아야 한다**(둘 다 4:3).
// 다르면 정규화 좌표가 눌려서 잘 그려도 유사도가 깎인다.
//
// panel() 이 라벨을 상자 바로 위(b.y - 6)에 F.sm 으로 그린다 — baseline 위로 11.2px 뻗으므로
// **상자 위 17px 이 비어 있어야** 위 요소와 안 겹친다. 처음엔 그 여백이 없어
// 라벨이 원본 상자를 파고들었다.
const REF: Box = { x: 16, y: 72, w: 160, h: 120 };
const A1: Box = { x: 16, y: 216, w: 288, h: 216 };
const A2: Box = { x: 336, y: 216, w: 288, h: 216 };
// 차례 안내 자리 — 원본 상자 오른쪽의 빈 공간. 좁은 틈에서 자리를 다투는 대신 비어 있는 곳을 쓴다.
export const TURN = { x: 408, y: 130 };
export const HINT_Y = 452, TTL_HINT_Y = 470;
// 공개 화면 3분할 (역시 4:3)
const R1: Box = { x: 16, y: 170, w: 192, h: 144 };
const R2: Box = { x: 224, y: 170, w: 192, h: 144 };
const R3: Box = { x: 432, y: 170, w: 192, h: 144 };

const DRAW_TIME = 14;     // 단계별 제한 시간(초)
const STROKE_TTL = 2.5;   // 중계에서 선이 보이는 시간 — 이 게임의 핵심 노브
const MIN_DIST = 3;       // 스트로크 점 간 최소 픽셀. 점 폭주 방지
const TARGET_PTS = 5;
const LW = 3;             // 선 굵기

type Stage = "draw1" | "draw2" | "reveal";

export class MimicryScene implements Scene {
  private sfx = new Sfx();
  private target: Pt[] = [];
  private s1: Stroke[] = [];   // P1이 그린 선 (P1 캔버스에서는 사라지지 않는다)
  private s2: Stroke[] = [];
  private stage: Stage = "draw1";
  private t = 0;               // 현재 단계 경과 초
  private cur: Stroke | null = null;
  // relay = 원본↔P1(전달이 성실했나) / redraw = P1↔P2(채널을 지나며 망가진 정도)
  // total = 원본↔P2(끝에서 끝). 총점만 보여주면 범인이 안 갈려서 구간을 함께 낸다.
  private sc = { relay: 0, redraw: 0, total: 0 };

  constructor(private h: Harness) { this.reset(); }

  enter() { this.reset(); }

  private reset() {
    this.target = makeTarget(Math.floor(Math.random() * 1e9) || 1, TARGET_PTS);
    this.s1 = []; this.s2 = []; this.cur = null;
    this.stage = "draw1"; this.t = 0;
    this.sc = { relay: 0, redraw: 0, total: 0 };
    this.h.score = 0;
    this.h.to("play");
    this.h.record("mim:reset", { pts: TARGET_PTS });
  }

  private area() { return this.stage === "draw1" ? A1 : A2; }
  private strokes() { return this.stage === "draw1" ? this.s1 : this.s2; }

  private submit() {
    this.cur = null;
    if (this.stage === "draw1") {
      this.stage = "draw2"; this.t = 0;
      this.sfx.event();
      this.h.record("mim:stage", { to: "draw2", strokes: this.s1.length });
      return;
    }
    const tgt = [this.target], p1 = polys(this.s1), p2 = polys(this.s2);
    this.sc = {
      relay: similarity(tgt, p1),
      redraw: similarity(p1, p2),
      total: similarity(tgt, p2),
    };
    this.stage = "reveal";
    this.h.score = Math.round(this.sc.total * 100);
    if (this.sc.total >= 0.5) { this.sfx.win(); this.h.to("win"); }
    else { this.sfx.lose(); this.h.to("lose"); }
    this.h.record("mim:reveal", this.sc);
  }

  private norm(x: number, y: number, b: Box): Pt {
    return {
      x: Math.min(1, Math.max(0, (x - b.x) / b.w)),
      y: Math.min(1, Math.max(0, (y - b.y) / b.h)),
    };
  }

  pointer(p: PointerState) {
    if (this.h.phase !== "play") { if (p.justDown) this.reset(); return; }
    const b = this.area();
    const inBox = p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
    if (p.justDown && inBox) {
      this.cur = { pts: [this.norm(p.x, p.y, b)], born: this.t };
      this.strokes().push(this.cur);
      this.sfx.tick();
    } else if (p.down && this.cur) {
      const last = this.cur.pts[this.cur.pts.length - 1];
      const lx = b.x + last.x * b.w, ly = b.y + last.y * b.h;
      if (Math.hypot(p.x - lx, p.y - ly) >= MIN_DIST) this.cur.pts.push(this.norm(p.x, p.y, b));
    }
    if (p.justUp) this.cur = null;
  }

  key(code: string, down: boolean) {
    if (!down) return;
    if (code === "KeyM") { this.sfx.toggleMute(); return; }
    if (code === "KeyR") return this.reset();
    if (this.h.phase !== "play") {
      if (code === "Space" || code === "Enter") this.reset();
      return;
    }
    if (code === "Space" || code === "Enter") return this.submit();
    if (code === "KeyZ") { this.strokes().pop(); this.cur = null; }  // 마지막 선 지우기
  }

  update(dt: number) {
    this.t += dt;
    if (this.t >= DRAW_TIME) this.submit();
  }

  hud() {
    const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
    if (this.stage === "reveal") {
      const col = this.sc.total >= 0.5 ? C.success : C.accent;
      return `<b>모방</b> &nbsp; 총점 <b style="color:${col}">${pct(this.sc.total)}</b>` +
        ` &nbsp; 전달 ${pct(this.sc.relay)} · 재현 ${pct(this.sc.redraw)}` +
        ` &nbsp; <span style="opacity:.6">클릭/스페이스 다시 · Esc 메뉴</span>`;
    }
    const who = this.stage === "draw1"
      ? `<b style="color:${C.player[0]}">P1</b> 원본을 보고 그린다`
      : `<b style="color:${C.player[1]}">P2</b> 사라지는 선만 보고 다시 그린다`;
    const left = Math.max(0, DRAW_TIME - this.t);
    return `<b>모방</b> &nbsp; ${who} &nbsp; 남은 <b>${left.toFixed(1)}s</b>` +
      ` &nbsp; <span style="opacity:.6">드래그 그리기 · Z 마지막 선 · 스페이스 제출 · R 처음부터 · 음소거[M] ${this.sfx.muted ? "🔇" : "🔊"}</span>`;
  }

  // ── 렌더 헬퍼 ────────────────────────────────────────────────
  private panel(ctx: CanvasRenderingContext2D, b: Box, label: string, accent: string) {
    ctx.fillStyle = C.surface; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = accent; ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    ctx.fillStyle = accent; ctx.font = font(F.sm);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillText(label, b.x + 2, b.y - 6);
  }

  /** 정규화 폴리라인들을 칸에 맞춰 그린다. 점 하나뿐인 스트로크는 점으로 찍는다. */
  private poly(ctx: CanvasRenderingContext2D, ps: Pt[][], b: Box, color: string, lw: number, alpha = 1) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineWidth = lw; ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const pts of ps) {
      if (pts.length === 0) continue;
      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(b.x + pts[0].x * b.w, b.y + pts[0].y * b.h, lw / 2, 0, Math.PI * 2);
        ctx.fill(); continue;
      }
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const X = b.x + pts[i].x * b.w, Y = b.y + pts[i].y * b.h;
        i === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 안 볼 차례인 칸을 덮는다. 2분할 한 화면에서 정보 비대칭을 흉내내는 유일한 수단이다. */
  private cover(ctx: CanvasRenderingContext2D, b: Box, text: string) {
    ctx.fillStyle = withAlpha(C.scrim, 0.94); ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = C.line; ctx.lineWidth = 1;
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    ctx.fillStyle = C.textFaint; ctx.font = font(F.sm);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, b.x + b.w / 2, b.y + b.h / 2);
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.clearRect(0, 0, 640, 480);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, 640, 480);

    if (this.stage === "reveal") return this.drawReveal(ctx);

    const p1turn = this.stage === "draw1";
    const turnColor = p1turn ? C.player[0] : C.player[1];

    // 제목 — 테두리 그라데이션은 장식 전용(DESIGN.md), 여기선 제목 밑줄에만 쓴다
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = C.text; ctx.font = font(F.xl);
    ctx.fillText("사라지는 선", 16, 30);
    ctx.strokeStyle = sigGradient(ctx, 16, 34, 200, 34); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(16, 35); ctx.lineTo(160, 35); ctx.stroke();

    // 남은 시간 — 막대 + 숫자. 5초 아래면 경고색
    const left = Math.max(0, DRAW_TIME - this.t), low = left <= 5;
    ctx.fillStyle = C.slot; ctx.fillRect(336, 40, 288, 12);
    ctx.fillStyle = low ? C.danger : turnColor;
    ctx.fillRect(336, 40, 288 * (left / DRAW_TIME), 12);
    ctx.fillStyle = low ? C.danger : C.textMuted; ctx.font = font(F.md);
    ctx.textAlign = "right";
    ctx.fillText(`${left.toFixed(1)}s`, 624, 30);   // 제목과 같은 줄

    // 차례 안내 — 화면에서 가장 큰 글자가 누구 차례인지 말한다
    // 원본 상자 오른쪽 빈 공간에 둔다 — 상자와 시선이 나란해져 오히려 읽기 쉽다.
    ctx.textAlign = "center"; ctx.font = font(F.lg); ctx.fillStyle = turnColor;
    glow(ctx, turnColor, 12, () => {
      ctx.fillText(p1turn ? "▶ P1 차례 — 원본을 보고 그려라" : "▶ P2 차례 — 사라지는 선을 따라가라", TURN.x, TURN.y);
    });

    // 원본 참조 상자 — P1만 본다
    this.panel(ctx, REF, "원본", C.text);
    if (p1turn) this.poly(ctx, [this.target], REF, C.text, 2);
    else this.cover(ctx, REF, "원본 — P2에게 가려짐");

    // P1 칸
    this.panel(ctx, A1, p1turn ? "P1 — 여기에 그린다" : "P1 그림", C.player[0]);
    if (p1turn) this.poly(ctx, polys(this.s1), A1, C.player[0], LW);
    else this.cover(ctx, A1, "P1 그림 — 중계로만 보인다");

    // P2 칸. P2 차례에는 P1의 선이 그려진 시각대로 재생되며 사라진다.
    this.panel(ctx, A2, p1turn ? "P2 — 아직 차례가 아니다" : "P2 — 여기에 그린다", C.player[1]);
    if (p1turn) {
      this.cover(ctx, A2, "P2 차례를 기다린다");
    } else {
      for (const s of relayVisible(this.s1, this.t, STROKE_TTL)) {
        this.poly(ctx, [s.pts], A2, C.player[0], LW, life(s, this.t, STROKE_TTL));
      }
      this.poly(ctx, polys(this.s2), A2, C.player[1], LW);
    }

    // 조작 힌트
    ctx.textAlign = "center"; ctx.font = font(F.sm); ctx.fillStyle = C.textMuted;
    ctx.fillText("드래그로 그리기 · Z 마지막 선 지우기 · 스페이스 제출 · R 처음부터", 320, HINT_Y);
    if (!p1turn) {
      ctx.fillStyle = C.textFaint;
      ctx.fillText(`P1의 선은 ${STROKE_TTL}초만 보인다 — 원본은 아무도 보여주지 않는다`, 320, TTL_HINT_Y);
    }
  }

  private drawReveal(ctx: CanvasRenderingContext2D) {
    const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
    const ok = this.sc.total >= 0.5;
    const col = ok ? C.success : C.danger;

    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.font = font(F.xxl); ctx.fillStyle = col;
    ctx.fillText(ok ? "전달 성공" : "전달 실패", 320, 62);
    glow(ctx, col, 18, () => {
      ctx.font = font(F.hero); ctx.fillStyle = col;
      ctx.fillText(pct(this.sc.total), 320, 124);
    });
    ctx.font = font(F.sm); ctx.fillStyle = C.textMuted;
    ctx.fillText("원본 → P2 (끝에서 끝)", 320, 146);

    this.panel(ctx, R1, "원본", C.text);
    this.poly(ctx, [this.target], R1, C.text, 2);
    this.panel(ctx, R2, "P1이 그린 것", C.player[0]);
    this.poly(ctx, polys(this.s1), R2, C.player[0], 2);
    this.panel(ctx, R3, "P2가 그린 것", C.player[1]);
    this.poly(ctx, polys(this.s2), R3, C.player[1], 2);

    // 구간 점수 — 더 낮은 쪽이 범인이다. 총점만 보여주면 누가 망쳤는지 안 갈린다.
    const worseRelay = this.sc.relay <= this.sc.redraw;
    ctx.font = font(F.lg);
    ctx.fillStyle = worseRelay ? C.danger : C.textMuted;
    ctx.textAlign = "left";
    ctx.fillText(`원본 → P1  전달 ${pct(this.sc.relay)}`, 60, 350);
    ctx.fillStyle = worseRelay ? C.textMuted : C.danger;
    ctx.textAlign = "right";
    ctx.fillText(`P1 → P2  재현 ${pct(this.sc.redraw)}`, 580, 350);

    ctx.textAlign = "center"; ctx.font = font(F.md); ctx.fillStyle = C.text;
    ctx.fillText(`${worseRelay ? "P1이 원본을 놓쳤다" : "P2가 중계를 놓쳤다"} — 더 낮은 쪽이 붉다`, 320, 380);
    ctx.font = font(F.sm); ctx.fillStyle = C.textMuted;
    ctx.fillText("클릭 / 스페이스 → 새 도형 · Esc 메뉴", 320, 414);
  }
}
