import { describe, it, expect } from "vitest";
import { layout, rowText, BLOCK_H } from "./scenes/menu";
import { textBand, checkStack } from "./kits/layout";
import { F } from "./ui/tokens";

const CANVAS_H = 480;
const HINT_BOTTOM = 124;   // 힌트(baseline 118, F.sm) 아래
const MAX_ITEMS = 7;       // 스크롤 없이 들어가는 상한

/** 한 행 안의 글자 구간. 행 안 좌표(0 ~ h)로 돌려준다. */
function bands(h: number) {
  const t = rowText(h);
  return [
    { name: "이름", ...textBand(t.name, F.lg) },
    { name: "설명", ...textBand(t.desc, F.xs) },
  ];
}

describe("메뉴 배치", () => {
  it("항목이 1~7개면 마지막 행이 캔버스 안에 들어온다", () => {
    // 5번째 게임이 y 494 에 그려져 마우스로 접근조차 못 하던 것이 TASK-008 의 이유였다.
    for (let n = 1; n <= MAX_ITEMS; n++) {
      const rows = layout(n);
      const last = rows[n - 1];
      expect(last.y + last.h).toBeLessThanOrEqual(CANVAS_H);
      expect(rows[0].y).toBeGreaterThanOrEqual(HINT_BOTTOM);   // 힌트를 덮지 않는다
    }
  });

  it("행이 겹치지 않고 순서대로 내려간다", () => {
    for (const n of [2, 5, 7]) {
      const rows = layout(n);
      for (let i = 1; i < n; i++) {
        expect(rows[i].y).toBeGreaterThan(rows[i - 1].y + rows[i - 1].h);
      }
    }
  });

  it("모든 행의 높이가 같다", () => {
    for (const n of [1, 3, 5, 7]) {
      const rows = layout(n);
      expect(new Set(rows.map((r) => r.h)).size).toBe(1);
    }
  });

  it("항목이 늘면 행이 낮아진다 (밴드가 고정이므로)", () => {
    expect(layout(2)[0].h).toBeGreaterThanOrEqual(layout(5)[0].h);
    expect(layout(5)[0].h).toBeGreaterThan(layout(7)[0].h);
  });

  it("항목이 적으면 세로 중앙에 모인다", () => {
    const rows = layout(2);
    const top = rows[0].y, bottom = rows[1].y + rows[1].h;
    const above = top - 132, below = 476 - bottom;   // 밴드 132~476
    expect(Math.abs(above - below)).toBeLessThanOrEqual(1);
  });
});

describe("행 안 글자 — 비율이 아니라 스택이다", () => {
  /**
   * **이 묶음이 실제 버그를 잡는다.** 예전 검사는 `h*0.78 + 4 <= h` 로 baseline 에
   * 손으로 고른 4 를 더해 봤을 뿐이라, 7항목에서 이름과 설명이 1.32px 겹치는 것을
   * 통과시켰다. `fillText` 의 y 는 baseline 이고 글자는 그 위로 뻗는다 —
   * 이 저장소가 같은 종류의 실수를 다섯 번 했다(TASK-010~013).
   */
  it("이름과 설명이 안 겹치고 행 안에 든다 (n=1~7)", () => {
    for (let n = 1; n <= MAX_ITEMS; n++) {
      const h = layout(n)[0].h;
      expect(checkStack(bands(h), h)).toEqual([]);
    }
  });

  it("가장 빡빡한 7항목에서도 줄 간격과 위아래 여백이 남는다", () => {
    const h = layout(MAX_ITEMS)[0].h;
    const [name, desc] = bands(h);
    expect(desc.top - name.bottom).toBeGreaterThanOrEqual(2);
    expect(h - desc.bottom).toBeGreaterThanOrEqual(3);
    expect(name.top).toBeGreaterThanOrEqual(3);
  });

  it("글자 덩어리가 행 안에서 세로 중앙이다", () => {
    for (const h of [40, 52, 70]) {
      const [name, desc] = bands(h);
      expect(Math.abs(name.top - (h - desc.bottom))).toBeLessThanOrEqual(0.01);
    }
  });

  it("행 높이 하한이 글자 덩어리에서 유도된다 — 손으로 고른 값이 아니다", () => {
    for (let n = 1; n <= 12; n++) expect(layout(n)[0].h).toBeGreaterThanOrEqual(BLOCK_H + 7);
  });
});

describe("천장", () => {
  it("7항목까지는 들어가고 8항목은 캔버스를 넘는다", () => {
    const fits = (n: number) => {
      const rows = layout(n);
      return rows[n - 1].y + rows[n - 1].h <= CANVAS_H;
    };
    expect(fits(MAX_ITEMS)).toBe(true);
    // 8번째 게임을 넣으려면 스크롤이 필요하다. 조용히 잘리지 않도록 여기서 못 박는다.
    expect(fits(MAX_ITEMS + 1)).toBe(false);
  });

  it("현재 게임 수(7)와 리듬 하위 메뉴(2) 둘 다 안전하다", () => {
    for (const n of [7, 2]) {
      const rows = layout(n);
      expect(rows[rows.length - 1].y + rows[rows.length - 1].h).toBeLessThanOrEqual(CANVAS_H);
      expect(checkStack(bands(rows[0].h), rows[0].h)).toEqual([]);
    }
  });
});
