// 씬 선택 메뉴. 하네스의 "Scene 갈아끼우기"를 시작 화면으로 노출 — 여러 게임 중 선택.
// 새 게임은 main.ts의 GAMES 배열에 한 줄 추가하면 자동으로 목록에 뜸.
// 하위 메뉴(모드 선택 등)도 이 씬을 그대로 재사용한다 — title/hint 만 바꿔 넘긴다.
import { Harness, Scene, PointerState } from "../core/harness";
import { C, F, font, sigGradient, glow } from "../ui/tokens";

export interface GameEntry { name: string; desc: string; make: (h: Harness) => Scene; }

const OX = 120, OW = 400;
// 목록이 놓일 세로 밴드 — 제목(90)·힌트(118) 아래부터 캔버스 끝 여백까지.
const LIST_TOP = 140, LIST_BOT = 470;
const ROW_MAX = 70, ROW_MIN = 34, GAP = 12;

export interface Row { y: number; h: number }

/**
 * 항목 수에서 행 높이·시작 y 를 **유도한다.** 상수로 두면 게임이 늘 때마다
 * 마지막 행이 화면 밖으로 나간다 — 실제로 5번째 게임이 y 494 에 그려져
 * 마우스로 접근조차 못 하는 상태로 있었다.
 * ponytail: rowH 하한 34 → 7항목까지. 넘으면 스크롤이 필요하다.
 */
export function layout(n: number): Row[] {
  const band = LIST_BOT - LIST_TOP;
  const h = Math.max(ROW_MIN, Math.min(ROW_MAX, Math.floor((band - GAP * (n - 1)) / Math.max(1, n))));
  const total = n * h + (n - 1) * GAP;
  const top = LIST_TOP + Math.max(0, (band - total) / 2);   // 항목이 적으면 가운데로 모은다
  return Array.from({ length: n }, (_, i) => ({ y: top + i * (h + GAP), h }));
}

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

  /** 그리기와 히트박스가 **같은 함수**를 쓴다 — 갈라지면 눌리는 곳과 보이는 곳이 어긋난다. */
  private rows() { return layout(this.games.length); }

  pointer(p: PointerState) {
    this.p = p;
    if (!p.justDown) return;
    const rows = this.rows();
    for (let i = 0; i < rows.length; i++) {
      const { y, h } = rows[i];
      if (p.x >= OX && p.x <= OX + OW && p.y >= y && p.y <= y + h) { this.onPick(i); return; }
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

    const rows = this.rows();
    this.games.forEach((g, i) => {
      const { y, h } = rows[i];
      const hover = this.p.x >= OX && this.p.x <= OX + OW && this.p.y >= y && this.p.y <= y + h;
      ctx.fillStyle = hover ? C.surfaceHi : C.surfaceAlt;
      ctx.fillRect(OX, y, OW, h);
      // hover 에 플레이어 색을 쓰지 않는다 (DESIGN.md 원칙 1) — 주목 역할인 C.accent 를 쓴다.
      ctx.strokeStyle = hover ? C.accent : C.line;
      ctx.lineWidth = 2; ctx.strokeRect(OX, y, OW, h);
      ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      // 글자 위치도 행 높이 비율로 잡는다 — 행이 낮아져도 설명이 밖으로 나가지 않는다.
      ctx.fillStyle = C.accent; ctx.font = font(F.xl); ctx.fillText(`${i + 1}`, OX + 18, y + h * 0.62);
      ctx.fillStyle = C.text; ctx.font = font(F.lg); ctx.fillText(g.name, OX + 50, y + h * 0.45);
      ctx.fillStyle = C.textMuted; ctx.font = font(F.xs); ctx.fillText(g.desc, OX + 50, y + h * 0.78);
    });
  }
}
