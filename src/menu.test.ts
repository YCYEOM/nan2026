import { describe, it, expect } from "vitest";
import { layout } from "./scenes/menu";

const CANVAS_H = 480;
const HINT_BOTTOM = 124;   // 힌트(baseline 118, F.sm) 아래

describe("메뉴 배치", () => {
  it("항목이 1~7개면 마지막 행이 캔버스 안에 들어온다", () => {
    // 5번째 게임이 y 494 에 그려져 마우스로 접근조차 못 하던 것이 이 작업의 이유다.
    for (let n = 1; n <= 7; n++) {
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
    const above = top - 140, below = 470 - bottom;   // 밴드 140~470
    expect(Math.abs(above - below)).toBeLessThanOrEqual(1);
  });

  it("행 높이가 하한(34) 아래로 내려가지 않는다", () => {
    for (let n = 1; n <= 12; n++) expect(layout(n)[0].h).toBeGreaterThanOrEqual(34);
  });

  it("설명 글자(행 높이의 78%)가 행 밖으로 나가지 않는다", () => {
    // 행 안 글자는 h 비율로 잡는다 — 행이 낮아져도 잘리면 안 된다.
    for (const n of [2, 5, 7]) {
      const h = layout(n)[0].h;
      expect(h * 0.78).toBeLessThan(h);
      expect(h * 0.78 + 4).toBeLessThanOrEqual(h);   // F.xs baseline 아래 여유
    }
  });

  it("현재 게임 수(5)와 리듬 하위 메뉴(2) 둘 다 안전하다", () => {
    for (const n of [5, 2]) {
      const rows = layout(n);
      expect(rows[rows.length - 1].y + rows[rows.length - 1].h).toBeLessThanOrEqual(CANVAS_H);
    }
  });
});
