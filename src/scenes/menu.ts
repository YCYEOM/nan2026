// 씬 선택 메뉴. 하네스의 "Scene 갈아끼우기"를 시작 화면으로 노출 — 여러 게임 중 선택.
// 새 게임은 main.ts의 GAMES 배열에 한 줄 추가하면 자동으로 목록에 뜸.
// 하위 메뉴(모드 선택 등)도 이 씬을 그대로 재사용한다 — title/hint 만 바꿔 넘긴다.
import { Harness, Scene, PointerState } from "../core/harness";
import { C, F, font, sigGradient, glow } from "../ui/tokens";

export interface GameEntry { name: string; desc: string; make: (h: Harness) => Scene; }

const OX = 120, OW = 400;
// 목록이 놓일 세로 밴드 — 힌트(baseline 118, F.sm 이라 아래끝 120.4) 아래부터 캔버스 여백까지.
const LIST_TOP = 132, LIST_BOT = 476;
const GAP = 8;
/** 이름과 설명 사이 간격. */
const LINE_GAP = 3;
/** 두 줄(이름 F.lg + 설명 F.xs)이 차지하는 세로. 행 높이 하한의 근거다. */
export const BLOCK_H = F.lg + LINE_GAP + F.xs;
/**
 * 행 높이 하한. **글자가 들어가는지가 근거다** — 예전 하한 34 는 그런 근거 없이
 * 정해진 값이었고, 7항목에서 행이 36px 이 되자 이름과 설명이 1.32px 겹쳤다.
 * 스택(33px) + 위아래 여백 3.5px 씩.
 */
const ROW_MIN = BLOCK_H + 7;
const ROW_MAX = 70;

export interface Row { y: number; h: number }

/**
 * 항목 수에서 행 높이·시작 y 를 **유도한다.** 상수로 두면 게임이 늘 때마다
 * 마지막 행이 화면 밖으로 나간다 — 실제로 5번째 게임이 y 494 에 그려져
 * 마우스로 접근조차 못 하는 상태로 있었다.
 * ponytail: `n*ROW_MIN + (n-1)*GAP ≤ 344` 를 풀면 **7항목이 상한**이다.
 * 8번째부터는 스크롤이 필요하다 — 그때 별도 작업으로 만든다.
 */
export function layout(n: number): Row[] {
  const band = LIST_BOT - LIST_TOP;
  const h = Math.max(ROW_MIN, Math.min(ROW_MAX, Math.floor((band - GAP * (n - 1)) / Math.max(1, n))));
  const total = n * h + (n - 1) * GAP;
  const top = LIST_TOP + Math.max(0, (band - total) / 2);   // 항목이 적으면 가운데로 모은다
  return Array.from({ length: n }, (_, i) => ({ y: top + i * (h + GAP), h }));
}

/**
 * 행 안 글자의 baseline. **비율이 아니라 스택이다.**
 * 비율(`h*0.45`·`h*0.78`)은 폰트 크기와 무관하게 움직여서, 행이 낮아지면 두 줄이
 * 서로 파고든다 — 7항목에서 실제로 그랬다. 덩어리를 통째로 세로 중앙에 놓는다.
 */
export function rowText(h: number) {
  const top = (h - BLOCK_H) / 2;
  return {
    name: top + F.lg * 0.8,                            // baseline 은 글자 아래끝 기준
    desc: top + F.lg + LINE_GAP + F.xs * 0.8,
  };
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
      ctx.textAlign = "left";
      // 번호는 middle baseline 으로 행 한가운데 — 비율 계산이 하나 줄어든다.
      ctx.textBaseline = "middle";
      ctx.fillStyle = C.accent; ctx.font = font(F.xl); ctx.fillText(`${i + 1}`, OX + 18, y + h / 2);
      ctx.textBaseline = "alphabetic";
      const t = rowText(h);
      ctx.fillStyle = C.text; ctx.font = font(F.lg); ctx.fillText(g.name, OX + 50, y + t.name);
      ctx.fillStyle = C.textMuted; ctx.font = font(F.xs); ctx.fillText(g.desc, OX + 50, y + t.desc);
    });
  }
}
