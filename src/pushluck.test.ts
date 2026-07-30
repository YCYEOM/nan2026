import { describe, it, expect } from "vitest";
import { PushLuck, PushOpts } from "./systems/pushluck";

// 임계값을 고정하려면 min===max 로 준다. 굴림은 시드로 결정적이다.
const O = (over: Partial<PushOpts> = {}): PushOpts =>
  ({ limitMin: 20, limitMax: 45, target: 100, sides: 6, seed: 42, ...over });

/** 터지기 전까지 굴린다. 반환값은 마지막 결과(터진 결과). */
const rollUntilBoom = (e: PushLuck, cap = 200) => {
  for (let i = 0; i < cap; i++) {
    const r = e.roll();
    if (!r) break;
    if (r.boom) return r;
  }
  throw new Error("cap 안에 터지지 않았다");
};

describe("떠넘기기 — 붕괴 방어", () => {
  it("차례에 굴리기 전에는 넘기기가 거부된다", () => {
    const e = new PushLuck(O());
    expect(e.canPass).toBe(false);
    expect(e.pass()).toBe(false);
    expect(e.turn).toBe(0);          // 차례가 넘어가지 않았다
    e.roll();
    expect(e.canPass).toBe(true);
    expect(e.pass()).toBe(true);
    expect(e.turn).toBe(1);
  });

  it("넘긴 직후에도 상대는 굴리기 전에 다시 넘길 수 없다 (핑퐁 방지)", () => {
    const e = new PushLuck(O());
    e.roll(); e.pass();
    expect(e.pass()).toBe(false);
    expect(e.turn).toBe(1);
  });

  it("굴리면 게이지와 내 pot 이 같은 값만큼 오른다", () => {
    const e = new PushLuck(O({ limitMin: 999, limitMax: 999 }));  // 안 터지게
    const r = e.roll()!;
    expect(r.boom).toBe(false);
    expect(e.gauge).toBe(r.face);
    expect(e.pot[0]).toBe(r.face);
    expect(e.pot[1]).toBe(0);
  });

  it("넘겨도 게이지는 줄지 않는다 — 그래서 넘기기가 공격이다", () => {
    const e = new PushLuck(O({ limitMin: 999, limitMax: 999 }));
    e.roll(); e.roll();
    const g = e.gauge;
    e.pass();
    expect(e.gauge).toBe(g);
    const r = e.roll()!;             // 상대는 더 높은 게이지에서 굴린다
    expect(e.gauge).toBe(g + r.face);
  });
});

describe("떠넘기기 — 터짐 정산", () => {
  it("터진 쪽 pot 은 소멸하고 상대는 자기 pot 을 확보한다", () => {
    const e = new PushLuck(O({ limitMin: 10, limitMax: 10 }));
    // P1 이 굴려 pot 을 쌓고 넘긴다 → P2 가 강제로 굴리다 터진다
    e.roll();
    const p1pot = e.pot[0];
    e.pass();
    const r = rollUntilBoom(e);
    expect(r.boom).toBe(true);
    expect(r.player).toBe(1);
    expect(r.bankedPot).toBe(p1pot);
    expect(e.score[0]).toBe(p1pot);   // 안 터진 쪽이 확보
    expect(e.score[1]).toBe(0);       // 터진 쪽은 0
  });

  it("터지면 게이지·pot 이 리셋되고 라운드가 오른다", () => {
    const e = new PushLuck(O({ limitMin: 8, limitMax: 8 }));
    const before = e.round;
    rollUntilBoom(e);
    expect(e.round).toBe(before + 1);
    expect(e.gauge).toBe(0);
    expect(e.pot).toEqual([0, 0]);
    expect(e.rolled).toBe(false);
  });

  it("터진 사람이 다음 라운드를 먼저 시작한다", () => {
    const e = new PushLuck(O({ limitMin: 8, limitMax: 8 }));
    const r = rollUntilBoom(e);
    expect(e.turn).toBe(r.player);
  });
});

describe("떠넘기기 — 범인 판정", () => {
  it("상대가 넘겨서 받은 강제 첫 굴림에 터지면 passer", () => {
    // P1 이 한 번 굴리고(게이지 낮음) 넘긴 뒤 P2 의 첫 굴림에 반드시 터지게 임계를 낮춘다.
    const e = new PushLuck(O({ limitMin: 1, limitMax: 1 }));
    const first = e.roll()!;          // 눈이 1보다 크면 여기서 터진다
    if (first.boom) {
      expect(first.blame).toBe("none"); // 라운드 첫 굴림 → 아무 탓도 아니다
      return;
    }
    e.pass();
    const r = e.roll()!;
    expect(r.boom).toBe(true);
    expect(r.blame).toBe("passer");
    expect(r.player).toBe(1);
  });

  it("자기 차례 두 번째 이후 굴림에 터지면 self", () => {
    const e = new PushLuck(O({ limitMin: 7, limitMax: 7, seed: 5 }));
    let r = e.roll()!;
    while (!r.boom) r = e.roll()!;    // 넘기지 않고 계속 굴린다
    expect(r.blame).toBe("self");
    expect(r.player).toBe(0);
  });

  it("라운드 첫 굴림에 터지면 none — 아무 탓도 아니다", () => {
    const e = new PushLuck(O({ limitMin: 0, limitMax: 0 }));  // 어떤 눈이든 즉시 터진다
    const r = e.roll()!;
    expect(r.boom).toBe(true);
    expect(r.blame).toBe("none");
  });
});

describe("떠넘기기 — 결정성과 승패", () => {
  it("같은 시드는 같은 굴림 순서, 다른 시드는 다르다", () => {
    const seq = (seed: number) => {
      const e = new PushLuck(O({ seed, limitMin: 999, limitMax: 999 }));
      return Array.from({ length: 12 }, () => e.roll()!.face);
    };
    expect(seq(7)).toEqual(seq(7));
    expect(seq(7)).not.toEqual(seq(8));
  });

  it("굴린 눈은 1..sides 범위 안에 있다", () => {
    const e = new PushLuck(O({ seed: 3, sides: 6, limitMin: 9999, limitMax: 9999 }));
    for (let i = 0; i < 300; i++) {
      const f = e.roll()!.face;
      expect(f).toBeGreaterThanOrEqual(1);
      expect(f).toBeLessThanOrEqual(6);
    }
  });

  it("목표 점수에 먼저 도달한 쪽이 승자이고 그 뒤 굴림은 무효다", () => {
    const e = new PushLuck(O({ limitMin: 6, limitMax: 6, target: 10 }));
    // 양쪽이 같은 전략(한 번 굴리고 넘긴다)을 쓴다. 터진 사람이 다음 라운드를 시작하므로
    // 한쪽만 넘기게 만들면 상대 차례가 아예 오지 않는다 — 대칭 전략으로 돌려야 판이 끝난다.
    for (let i = 0; i < 500 && !e.done; i++) {
      if (!e.rolled) e.roll();
      else e.pass();
    }
    expect(e.done).toBe(true);
    const w = e.winner();
    expect(w).toBeGreaterThanOrEqual(0);
    expect(e.score[w]).toBeGreaterThanOrEqual(10);   // 승자는 목표를 넘겼다
    expect(e.score[1 - w]).toBeLessThan(10);         // 패자는 못 넘겼다
    expect(e.roll()).toBeNull();                     // 끝난 뒤에는 굴릴 수 없다
    expect(e.canPass).toBe(false);
    expect(e.pass()).toBe(false);
  });

  it("임계값은 공개 범위 안에서 뽑힌다", () => {
    for (const seed of [1, 2, 3, 99, 1234]) {
      const e = new PushLuck(O({ seed, limitMin: 20, limitMax: 45 }));
      expect(e.hiddenLimit).toBeGreaterThanOrEqual(20);
      expect(e.hiddenLimit).toBeLessThanOrEqual(45);
      expect(e.limitRange).toEqual([20, 45]);
    }
  });
});
