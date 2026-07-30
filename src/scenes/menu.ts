// 씬 선택 메뉴. 하네스의 "Scene 갈아끼우기"를 시작 화면으로 노출 — 여러 게임 중 선택.
// 새 게임은 main.ts의 GAMES 배열에 한 줄 추가하면 자동으로 목록에 뜸.
// 하위 메뉴(모드 선택 등)도 이 씬을 그대로 재사용한다 — title/hint 만 바꿔 넘긴다.
import { Harness, Scene, PointerState } from "../core/harness";
import { C, F, font, sigGradient, glow } from "../ui/tokens";

export interface GameEntry { name: string; desc: string; make: (h: Harness) => Scene; }

const OX = 120, OW = 400, ROW_Y = 150, ROW_H = 70, GAP = 16;

export class MenuScene implements Scene {
  private p: PointerState = { x: 0, y: 0, down: false, justDown: false, justUp: false };

  constructor(
    private h: Harness,
    private games: GameEntry[],
    private onPick: (i: number) => void,
    private title = "NAN2026 — 게임 선택",
    private hint = "숫자키 또는 클릭으로 선택 · 게임 중 Esc로 메뉴",
  ) {}

  enter() { this.h.to("menu"); this.h.record("menu"); }

  // phase가 "menu"라 harness가 update를 안 부름 → 입력은 pointer/key에서 직접 처리.
  update() {}

  private rowY(i: number) { return ROW_Y + i * (ROW_H + GAP); }

  pointer(p: PointerState) {
    this.p = p;
    if (!p.justDown) return;
    for (let i = 0; i < this.games.length; i++) {
      const y = this.rowY(i);
      if (p.x >= OX && p.x <= OX + OW && p.y >= y && p.y <= y + ROW_H) { this.onPick(i); return; }
    }
  }

  key(code: string, down: boolean) {
    if (!down) return;
    const m = /^Digit([1-9])$/.exec(code);
    if (m) { const i = +m[1] - 1; if (i < this.games.length) this.onPick(i); }
  }

  hud() { return `<b>${this.title}</b> &nbsp; <span style="opacity:.6">${this.hint}</span>`; }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.clearRect(0, 0, 640, 480);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, 640, 480);
    ctx.font = font(F.huge); ctx.textAlign = "center";
    glow(ctx, C.sig, 18, () => {
      ctx.fillStyle = sigGradient(ctx, 180, 0, 460, 0);
      ctx.fillText(this.title, 320, 90);
    });
    ctx.font = font(F.sm); ctx.fillStyle = C.textMuted;
    ctx.fillText(this.hint, 320, 118);

    this.games.forEach((g, i) => {
      const y = this.rowY(i), hover = this.p.x >= OX && this.p.x <= OX + OW && this.p.y >= y && this.p.y <= y + ROW_H;
      ctx.fillStyle = hover ? C.surfaceHi : C.surfaceAlt;
      ctx.fillRect(OX, y, OW, ROW_H);
      // hover 에 플레이어 색을 쓰지 않는다 (DESIGN.md 원칙 1) — 주목 역할인 C.accent 를 쓴다.
      ctx.strokeStyle = hover ? C.accent : C.line;
      ctx.lineWidth = 2; ctx.strokeRect(OX, y, OW, ROW_H);
      ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      ctx.fillStyle = C.accent; ctx.font = font(F.xl); ctx.fillText(`${i + 1}`, OX + 18, y + 42);
      ctx.fillStyle = C.text; ctx.font = font(F.lg); ctx.fillText(g.name, OX + 50, y + 30);
      ctx.fillStyle = C.textMuted; ctx.font = font(F.xs); ctx.fillText(g.desc, OX + 50, y + 52);
    });
  }
}
