import { describe, it, expect } from "vitest";
import { ZeroSum, ZeroOpts, SHAPES, shapeSpec, ShapeId, LAYOUTS, LayoutId } from "./systems/zerosum";

const O = (over: Partial<ZeroOpts> = {}): ZeroOpts =>
  ({ cols: 14, rows: 10, turns: 10, seed: 42, layouts: ["split"], ...over });
/** 모양 하나로 고정한다 — 규칙 검증이 추첨 운에 흔들리면 안 된다. */
const fixed = (id: ShapeId, over: Partial<ZeroOpts> = {}) => new ZeroSum(O({ shapes: [id], ...over }));

/** 매 수마다 불변식을 확인하며 판을 끝까지 돌린다. */
const playOut = (e: ZeroSum, pick: (e: ZeroSum, n: number) => [number, number]) => {
  let n = 0;
  while (!e.done) {
    const [c, r] = pick(e, n++);
    e.claim(c, r);
    const [a, b] = e.counts();
    expect(a + b).toBe(e.size);          // 어느 시점에도 총합은 불변이다
    expect(e.own.every((v) => v === 0 || v === 1)).toBe(true);  // 빈 칸이 없다
  }
};

describe("제로섬 — 불변식", () => {
  it("판은 처음부터 꽉 차 있고 70 대 70 이다", () => {
    const e = new ZeroSum(O());
    expect(e.size).toBe(140);
    expect(e.counts()).toEqual([70, 70]);
    expect(e.own).toHaveLength(140);
    expect(e.own.every((v) => v === 0 || v === 1)).toBe(true);
  });

  it("어느 시점에도 내 칸 + 네 칸 = 140 이다 (이 게임의 전부)", () => {
    const e = new ZeroSum(O());
    playOut(e, (g, n) => [(n * 5) % g.o.cols, (n * 3) % g.o.rows]);
    const [a, b] = e.counts();
    expect(a + b).toBe(140);
  });

  it("같은 칸을 반복해서 찍어도 총합은 안 변한다 (핑퐁 상황)", () => {
    const e = fixed("star");
    for (let i = 0; i < 12; i++) {
      e.claim(7, 5);
      expect(e.counts()[0] + e.counts()[1]).toBe(140);
    }
  });
});

describe("제로섬 — 뺏기", () => {
  it("모양 안의 칸이 전부 내 것이 된다", () => {
    const e = fixed("star");
    const cells = e.area(7, 5);
    expect(cells).toHaveLength(13);
    e.claim(7, 5);
    for (const i of cells) expect(e.own[i]).toBe(0);   // 첫 수는 P1
  });

  it("모양별 칸 수가 명세대로다", () => {
    const e = new ZeroSum(O());
    const want: Record<string, number> = { plus: 5, hbar: 7, vbar: 7, box: 9, star: 13, cross: 13, ring: 16 };
    for (const sp of SHAPES) {
      expect(sp.cells).toHaveLength(want[sp.id]);
      expect(e.area(7, 5, sp.id)).toHaveLength(want[sp.id]);   // 판 안쪽에선 안 잘린다
    }
  });

  it("모든 모양이 점대칭이다 — 회전이 필요 없어야 조작 1종이 유지된다", () => {
    for (const sp of SHAPES) {
      const key = new Set(sp.cells.map(([c, r]) => `${c},${r}`));
      for (const [c, r] of sp.cells) expect(key.has(`${-c},${-r}`)).toBe(true);
    }
  });

  it("고리는 가운데가 비어 있다", () => {
    const ringCells = shapeSpec("ring").cells;
    expect(ringCells.some(([c, r]) => c === 0 && r === 0)).toBe(false);
  });

  it("판 경계 밖은 버린다", () => {
    const e = fixed("star");
    const corner = e.area(0, 0);
    expect(corner.length).toBeLessThan(13);
    for (const i of corner) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(e.size);
    }
  });

  it("이미 내 것인 칸은 kept 로 세고 taken 에 안 들어간다", () => {
    const e = fixed("plus");
    const area = e.area(0, 0).length;
    const first = e.claim(0, 0)!;              // 왼쪽 위 = 원래 P1 구역
    expect(first.kept).toBeGreaterThan(0);
    expect(first.taken + first.kept).toBe(area);
    expect(first.cells).toHaveLength(first.taken);
  });

  it("되받아치면 이미 내 것인 칸 때문에 이득이 줄어든다", () => {
    const e = fixed("star");
    const a = e.claim(7, 5)!;                  // P1 이 가운데를 뺏는다
    const b = e.claim(7, 5)!;                  // P2 가 같은 자리를 되받아친다
    const c = e.claim(7, 5)!;                  // P1 이 또 되받아친다
    expect(a.player).toBe(0);
    expect(b.player).toBe(1);
    expect(b.taken).toBeGreaterThan(0);
    expect(c.taken).toBeLessThanOrEqual(b.taken);   // 반복할수록 남는 게 없다
  });

  it("판 밖 좌표나 끝난 판에는 못 둔다", () => {
    const e = new ZeroSum(O({ turns: 1 }));
    expect(e.claim(-1, 0)).toBeNull();
    expect(e.claim(0, 99)).toBeNull();
    e.claim(0, 0); e.claim(13, 9);
    expect(e.done).toBe(true);
    expect(e.claim(5, 5)).toBeNull();
  });
});

describe("제로섬 — 턴과 점수", () => {
  it("차례가 번갈아 돌고 정해진 수만큼만 둔다", () => {
    const e = new ZeroSum(O({ turns: 3 }));
    const order: number[] = [];
    while (!e.done) { order.push(e.turn); e.claim(7, 5); }
    expect(order).toEqual([0, 1, 0, 1, 0, 1]);
    expect(e.moves).toBe(6);
    expect(e.turnsLeft).toBe(0);
  });

  it("매 턴 끝에 자기 칸 수만큼 점수를 받고, 매 턴 점수 합은 140 이다", () => {
    const e = new ZeroSum(O({ turns: 4 }));
    let prevSum = 0;
    while (!e.done) {
      e.claim(7, 5);
      const sum = e.score[0] + e.score[1];
      expect(sum - prevSum).toBe(140);       // 매 수마다 파이 하나를 나눠 갖는다
      prevSum = sum;
    }
    expect(prevSum).toBe(140 * 8);
  });

  it("한쪽이 판을 다 가지면 그쪽만 점수를 받는다", () => {
    const e = fixed("box", { cols: 3, rows: 3, turns: 2 });
    e.claim(1, 1);                            // 3×3 네모가 판 전체를 덮는다
    expect(e.counts()).toEqual([9, 0]);
    expect(e.score[0]).toBe(9);
    expect(e.score[1]).toBe(0);
  });

  it("누적 점수가 높은 쪽이 승자다", () => {
    const e = fixed("ring", { turns: 3 });
    while (!e.done) e.claim(e.turn === 0 ? 2 : 11, 5);
    expect(e.done).toBe(true);
    const w = e.winner();
    if (w >= 0) expect(e.score[w]).toBeGreaterThan(e.score[1 - w]);
    else expect(e.score[0]).toBe(e.score[1]);
  });

  it("끝나기 전에는 승자가 없다", () => {
    const e = new ZeroSum(O());
    expect(e.winner()).toBe(-1);
  });
});

describe("제로섬 — 모양과 결정성", () => {
  it("모양은 클릭 전에 정해져 있고 목록 안의 값이다", () => {
    const e = new ZeroSum(O());
    const ids = SHAPES.map((s) => s.id);
    for (let i = 0; i < 20 && !e.done; i++) {
      expect(ids).toContain(e.shape);
      const before = e.shape;
      const res = e.claim(7, 5)!;
      expect(res.shape).toBe(before);        // 방금 보여준 모양으로 처리됐다
    }
  });

  it("**한 라운드 안에서 P1 과 P2 가 같은 모양을 쓴다**", () => {
    // 제로섬은 파이가 고정이라 운의 비대칭이 그대로 승패가 된다 — 만회할 여지가 규칙에 없다.
    const e = new ZeroSum(O({ turns: 12 }));
    while (!e.done) {
      const round = e.round;
      const a = e.claim(7, 5)!;              // P1
      if (e.done) break;
      const b = e.claim(3, 3)!;              // P2 — 같은 라운드
      expect(b.shape).toBe(a.shape);
      expect(a.player).toBe(0);
      expect(b.player).toBe(1);
      expect(e.round).toBe(round + 1);       // 두 수를 두면 라운드가 넘어간다
    }
  });

  it("라운드가 바뀌면 모양이 새로 뽑힌다", () => {
    const e = new ZeroSum(O({ turns: 30 }));
    const perRound: string[] = [];
    while (!e.done) { perRound.push(e.shape); e.claim(7, 5); e.claim(3, 3); }
    expect(new Set(perRound).size).toBeGreaterThan(1);   // 계속 같은 모양만 나오지 않는다
  });

  it("같은 시드는 같은 모양 순서, 다른 시드는 다르다", () => {
    const seq = (seed: number) => {
      const e = new ZeroSum(O({ seed, turns: 12 }));
      const out: string[] = [];
      while (!e.done) { out.push(e.shape); e.claim(7, 5); }
      return out;
    };
    expect(seq(7)).toEqual(seq(7));
    expect(seq(7)).not.toEqual(seq(8));
  });

  it("preview 는 실제로 넘어갈 칸과 같다", () => {
    const e = new ZeroSum(O());
    const pv = e.preview(4, 4);
    const res = e.claim(4, 4)!;
    expect(pv).toEqual(e.area(4, 4, res.shape));
    for (const i of res.cells) expect(pv).toContain(i);
  });
});

describe("제로섬 — 시작 배치", () => {
  it("배치 5종이 각각 정확히 70:70 으로 시작한다", () => {
    // 한 칸이라도 어긋나면 시작부터 제로섬이 아니다.
    for (const l of LAYOUTS) {
      const e = new ZeroSum(O({ layouts: [l.id] }));
      expect(e.layout).toBe(l.id);
      expect(e.counts()).toEqual([70, 70]);
      expect(e.counts()[0] + e.counts()[1]).toBe(e.size);
    }
  });

  it("배치가 양쪽이 대등하다 — 뒤집으면 P1 영역이 P2 영역이 된다", () => {
    // 대등하지 않으면 좋은 땅을 받은 쪽이 이긴다.
    for (const l of LAYOUTS) {
      const e = new ZeroSum(O({ layouts: [l.id] }));
      const at = (c: number, r: number) => e.own[e.idx(c, r)];
      let mirroredH = true, mirroredV = true;
      for (let r = 0; r < 10; r++) for (let c = 0; c < 14; c++) {
        if (at(13 - c, r) === at(c, r)) mirroredH = false;
        if (at(c, 9 - r) === at(c, r)) mirroredV = false;
      }
      expect(mirroredH || mirroredV).toBe(true);   // 좌우 또는 상하 뒤집기로 뒤바뀐다
    }
  });

  it("모든 배치에서 불변식이 유지된다", () => {
    for (const l of LAYOUTS) {
      const e = new ZeroSum(O({ layouts: [l.id], turns: 6 }));
      while (!e.done) {
        e.claim(7, 5);
        expect(e.counts()[0] + e.counts()[1]).toBe(140);
      }
    }
  });

  it("같은 시드는 같은 배치, 다른 시드는 달라질 수 있다", () => {
    const pick = (seed: number) => new ZeroSum({ cols: 14, rows: 10, turns: 10, seed }).layout;
    expect(pick(7)).toBe(pick(7));
    const ids = new Set<LayoutId>();
    for (let s = 1; s <= 40; s++) ids.add(pick(s));
    expect(ids.size).toBeGreaterThan(1);   // 배치가 하나로 굳지 않는다
  });
});

describe("제로섬 — 판세 궤적", () => {
  it("시작 상태부터 매 수를 기록한다 (길이 = 수 + 1)", () => {
    const e = new ZeroSum(O({ turns: 4 }));
    expect(e.history).toHaveLength(1);
    expect(e.history[0].player).toBe(-1);
    expect(e.history[0].own0).toBe(70);
    let n = 0;
    while (!e.done) { e.claim(7, 5); n++; expect(e.history).toHaveLength(n + 1); }
    expect(e.history).toHaveLength(9);   // 8수 + 시작
  });

  it("기록된 칸 수가 실제 판과 일치한다", () => {
    const e = new ZeroSum(O({ turns: 5 }));
    while (!e.done) {
      e.claim(Math.floor(Math.random() * 14), Math.floor(Math.random() * 10));
      expect(e.history[e.history.length - 1].own0).toBe(e.counts()[0]);
    }
  });

  it("최고의 한 수는 가장 많이 뺏은 수다", () => {
    const e = new ZeroSum(O({ turns: 5 }));
    while (!e.done) e.claim(7, 5);
    const best = e.bestMove()!;
    expect(best).not.toBeNull();
    const maxTaken = Math.max(...e.history.filter((h) => h.player >= 0).map((h) => h.taken));
    expect(best.taken).toBe(maxTaken);
    expect(e.history[best.move].taken).toBe(maxTaken);
    expect(e.history[best.move].player).toBe(best.player);
  });

  it("한 수도 안 뒀으면 최고의 한 수가 없다", () => {
    expect(new ZeroSum(O()).bestMove()).toBeNull();
  });
});
