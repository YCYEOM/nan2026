import { describe, it, expect } from "vitest";
import { Grid } from "./kits/grid";
import { decay, chainReact } from "./systems/behaviors";

describe("Grid", () => {
  it("픽셀 ↔ 셀 왕복", () => {
    const g = new Grid(4, 4, 32, 100, 50);
    const cell = g.pick(100 + 32 + 5, 50 + 5)!; // c=1, r=0
    expect(cell).toEqual({ c: 1, r: 0 });
    const o = g.origin(1, 0);
    expect(o).toEqual({ x: 132, y: 50 });
  });

  it("범위 밖은 null / set 거부", () => {
    const g = new Grid(2, 2, 10);
    expect(g.pick(-1, -1)).toBeNull();
    expect(g.set(5, 5, "x")).toBe(false);
  });
});

describe("decay", () => {
  it("rate·dt만큼 감쇠하고 min 아래로 안 내려감", () => {
    expect(decay(100, 0.5, 1)).toBe(50);
    expect(decay(1, 10, 1, 0)).toBe(0);
  });
});

describe("chainReact", () => {
  it("같은 값 인접 덩어리만 전파", () => {
    const g = new Grid<string>(3, 3, 10);
    g.set(0, 0, "a"); g.set(1, 0, "a"); g.set(2, 0, "b"); g.set(1, 1, "a");
    const order = chainReact(g, { c: 0, r: 0 }, (v) => v === "a");
    expect(order.length).toBe(3); // (0,0)(1,0)(1,1), (2,0)은 b라 제외
  });
});
