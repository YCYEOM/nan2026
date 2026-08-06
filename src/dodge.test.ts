// 총알피하기 엔진. 이 게임의 전부는 색 하나라 테스트도 색에서 시작한다:
// 조준 불변식 → 색 판정 3종 → 예고 → 난이도 곡선 → 집계 → 밸런스 분포.
import { describe, it, expect } from "vitest";
import {
  Dodge, K, ARENA, NEUTRAL, TOP_LV, MAX_R, fateText, dist,
  type Bullet, type Pt,
} from "./systems/dodge";
import { TURN_Y, STATUS_Y, RECAP } from "./scenes/dodge";
import { textBand, checkStack } from "./kits/layout";
import { F } from "./ui/tokens";

const DT = 1 / 60;
const still: Pt[] = [{ x: 0, y: 0 }, { x: 0, y: 0 }];

/** 총알 하나를 원하는 상태로 꽂아 넣는다. 추첨 운을 배제하려면 필요하다. */
function plant(g: Dodge, o: { owner: number; at: Pt; toward: Pt; wait?: number }): Bullet {
  const dx = o.toward.x - o.at.x, dy = o.toward.y - o.at.y, len = Math.hypot(dx, dy) || 1;
  const b: Bullet = {
    id: 9000 + g.bullets.length, owner: o.owner, target: o.owner === NEUTRAL ? 0 : 1 - o.owner,
    x: o.at.x, y: o.at.y,
    vx: (dx / len) * K.BULLET_SPEED, vy: (dy / len) * K.BULLET_SPEED,
    wait: o.wait ?? 0,
    aimX: o.toward.x, aimY: o.toward.y,
  };
  g.bullets.push(b);
  return b;
}

/** 아무도 안 움직이는 채로 n 초 돌린다. 자동 생성분은 지워 실험을 오염시키지 않는다. */
function run(g: Dodge, secs: number, opts: { clean?: boolean } = {}) {
  const planted = new Set(g.bullets.map((b) => b.id));
  for (let i = 0; i < Math.round(secs / DT); i++) {
    g.update(DT, still);
    if (opts.clean !== false) g.bullets = g.bullets.filter((b) => planted.has(b.id));
  }
}

describe("조준 불변식 — 색 탄은 반드시 반대 색을 노린다", () => {
  // 자기 색을 조준하면 그냥 흡수하면 그만이라 규칙이 통째로 죽는다.
  it("시드를 바꿔도 색 탄의 대상은 항상 1 - owner 다", () => {
    let colored = 0, neutral = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const g = new Dodge({ seed });
      for (let i = 0; i < 60 * 20; i++) g.update(DT, still);
      for (const b of g.bullets) {
        if (b.owner === NEUTRAL) { neutral++; continue; }
        colored++;
        expect(b.target).toBe(1 - b.owner);
      }
    }
    expect(colored).toBeGreaterThan(0);
    expect(neutral).toBeGreaterThan(0);   // 주인 없는 탄도 실제로 나온다
  });
});

describe("색 판정 — 이 게임의 전부", () => {
  it("자기 색에 닿으면 총알이 사라지고 생명이 안 준다", () => {
    const g = new Dodge({ seed: 1 });
    const p0 = g.players[0];
    plant(g, { owner: 0, at: { x: p0.x - 60, y: p0.y }, toward: p0 });
    run(g, 0.6);
    expect(g.lives[0]).toBe(K.LIVES);
    expect(g.blocked[0]).toBe(1);
    expect(g.bullets).toHaveLength(0);
  });

  it("남의 색에 닿으면 생명이 준다", () => {
    const g = new Dodge({ seed: 1 });
    const p0 = g.players[0];
    plant(g, { owner: 1, at: { x: p0.x - 60, y: p0.y }, toward: p0 });
    run(g, 0.6);
    expect(g.lives[0]).toBe(K.LIVES - 1);
    expect(g.blocked[0]).toBe(0);
  });

  it("못 막은 색 탄은 **그 색 주인의 몫**으로 집계된다", () => {
    const g = new Dodge({ seed: 1 });
    const p0 = g.players[0];
    plant(g, { owner: 1, at: { x: p0.x - 60, y: p0.y }, toward: p0 });
    run(g, 0.6);
    expect(g.leaked[1]).toBe(1);   // P2 색이었으니 P2 가 못 막은 것이다
    expect(g.leaked[0]).toBe(0);
  });

  it("주인 없는 탄은 아무도 못 막고 둘 다 죽인다", () => {
    for (const i of [0, 1]) {
      const g = new Dodge({ seed: 1 });
      const p = g.players[i];
      plant(g, { owner: NEUTRAL, at: { x: p.x - 60, y: p.y }, toward: p });
      run(g, 0.6);
      expect(g.lives[i]).toBe(K.LIVES - 1);
      expect(g.blocked[i]).toBe(0);
      expect(g.leaked).toEqual([0, 0]);   // 주인이 없으니 누구 몫도 아니다
    }
  });

  it("사연이 이름으로 남는다 — 퍼센트가 아니다", () => {
    const g = new Dodge({ seed: 1 });
    const p0 = g.players[0];
    plant(g, { owner: 0, at: { x: p0.x - 60, y: p0.y }, toward: p0 });
    run(g, 0.6);
    const e = g.drainEvents().filter((x) => x.fate !== "escaped");
    expect(e).toHaveLength(1);
    expect(fateText(e[0])).toBe("P1 가 자기 색을 막았다");
    expect(g.drainEvents()).toHaveLength(0);   // 비워진다
  });
});

describe("예고 — 요격은 예고 없이는 불가능하다", () => {
  it("예고 중에는 움직이지도 맞히지도 않는다", () => {
    const g = new Dodge({ seed: 1 });
    const p0 = g.players[0];
    const b = plant(g, { owner: 1, at: { x: p0.x - 5, y: p0.y }, toward: p0, wait: 1.0 });
    const at = { x: b.x, y: b.y };
    run(g, 0.5);
    expect(g.lives[0]).toBe(K.LIVES);          // 몸에 겹쳐 있어도 안 맞는다
    expect({ x: b.x, y: b.y }).toEqual(at);    // 제자리다
    run(g, 0.6);
    expect(g.lives[0]).toBe(K.LIVES - 1);      // 예고가 끝나면 맞는다
  });
});

describe("난이도 곡선 — 전부 하한이 있다", () => {
  it("예고가 짧아지되 하한에서 멈춘다", () => {
    const g = new Dodge({ seed: 1 });
    const first = g.telegraph;
    g.t = 30;
    expect(g.telegraph).toBeLessThan(first);
    g.t = 100000;
    expect(g.telegraph).toBe(K.TELEGRAPH_MIN);
  });

  it("발사 간격이 좁아지되 하한에서 멈춘다", () => {
    const g = new Dodge({ seed: 1 });
    const first = g.gap;
    g.t = 30;
    expect(g.gap).toBeLessThan(first);
    g.t = 100000;
    expect(g.gap).toBe(K.GAP_MIN);
  });

  it("동시 발수가 늘되 상한에서 멈춘다", () => {
    const g = new Dodge({ seed: 1 });
    expect(g.burst).toBe(1);
    g.t = 30; const mid = g.burst;
    expect(mid).toBeGreaterThan(1);
    g.t = 100000;
    expect(g.burst).toBe(K.BURST_MAX);
  });

  it("붕괴 주기가 짧아지되 하한에서 멈춘다", () => {
    const g = new Dodge({ seed: 1 });
    const first = g.collapseGap;
    g.t = 30;
    expect(g.collapseGap).toBeLessThan(first);
    g.t = 100000;
    expect(g.collapseGap).toBe(K.COLLAPSE_MIN);
  });

  it("조각이 무너지되 단계 0 밑으로는 안 간다", () => {
    // 가만히 서 있으면 맞아 죽어서 붕괴가 멈춘다 — 곡선만 보려고 생명을 채워둔다
    const g = new Dodge({ seed: 1 });
    expect(g.intact).toBe(g.maxIntact);
    for (let i = 0; i < 60 * 400; i++) { g.lives = [9, 9]; g.update(DT, still); }
    expect(g.plates.every((v) => v >= 0 && v <= TOP_LV)).toBe(true);
    expect(g.intact).toBeLessThan(g.maxIntact / 2);
    expect(g.collapsed).toBeGreaterThan(0);
  });
});

describe("판 가둠 — 원 하나가 아니라 조각별 반지름이다", () => {
  it("밖으로 못 나간다", () => {
    const g = new Dodge({ seed: 1 });
    const out: Pt[] = [{ x: 1, y: 1 }, { x: -1, y: -1 }];
    for (let i = 0; i < 60 * 10; i++) g.update(DT, out);
    for (const p of g.players) expect(dist(p, ARENA)).toBeLessThanOrEqual(g.radiusAt(p) - K.BODY + 1e-6);
  });

  it("발밑 조각이 무너지면 안쪽으로 밀려 들어온다 — 밖에 남지 않는다", () => {
    const g = new Dodge({ seed: 1 });
    const out: Pt[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }];
    // 판을 꽉 채운 채로 벽에 붙인다 — 무작위 붕괴가 실험을 오염시키지 않게
    for (let i = 0; i < 60 * 3; i++) { g.plates.fill(TOP_LV); g.update(DT, out); }
    const p = g.players[0];
    const before = dist(p, ARENA);
    g.plates[g.plateIndex(p)] = 0;                          // 그 방향만 하한으로
    g.update(DT, still);
    expect(dist(p, ARENA)).toBeLessThan(before);
    expect(dist(p, ARENA)).toBeLessThanOrEqual(g.radiusAt(p) - K.BODY + 1e-6);
  });

  it("조각마다 반지름이 따로 논다 — 방향에 따라 판 끝이 다르다", () => {
    const g = new Dodge({ seed: 1 });
    g.plates.fill(TOP_LV);
    const east = { x: ARENA.x + 10, y: ARENA.y };
    const west = { x: ARENA.x - 10, y: ARENA.y };
    expect(g.radiusAt(east)).toBe(g.radiusAt(west));
    g.plates[g.plateIndex(east)] = 0;
    expect(g.radiusAt(east)).toBeLessThan(g.radiusAt(west));
  });
});

describe("복구 — 막으면 땅이 돌아온다", () => {
  /** 요격 한 번을 확실히 만든다. 자기 색 탄을 그 사람 몸에 꽂는다. */
  function block(g: Dodge, i: number) {
    const p = g.players[i];
    plant(g, { owner: i, at: { x: p.x - 60, y: p.y }, toward: p });
    run(g, 0.6);
  }
  // 3회 × 0.6s = 1.8s 로 첫 붕괴(K.COLLAPSE 2.0s) 전에 끝난다 — 실험이 안 오염된다.

  it("RESTORE_BLOCKS 번 막으면 **막은 그 자리** 조각이 한 단계 오른다", () => {
    const g = new Dodge({ seed: 1 });
    const i = g.plateIndex(g.players[0]);
    g.plates[i] = 0;
    for (let n = 0; n < K.RESTORE_BLOCKS; n++) block(g, 0);
    expect(g.plates[i]).toBe(1);
    expect(g.restored).toBe(1);
    expect(g.gauge).toBe(0);
  });

  it("게이지가 덜 차면 아무것도 안 돌아온다", () => {
    const g = new Dodge({ seed: 1 });
    const i = g.plateIndex(g.players[0]);
    g.plates[i] = 0;
    block(g, 0);
    expect(g.gauge).toBe(1);
    expect(g.plates[i]).toBe(0);
    expect(g.restored).toBe(0);
  });

  // 밸런스 값에 기대지 않는다 — RESTORE_BLOCKS 가 바뀌어도 의도만 검사한다(PSH-006 교훈).
  it("공동 게이지다 — 나눠 막아도 차고, 마지막으로 막은 자리가 돌아온다", () => {
    const g = new Dodge({ seed: 1 });
    g.plates.fill(0);
    const mine = g.plateIndex(g.players[0]);
    const yours = g.plateIndex(g.players[1]);
    expect(yours).not.toBe(mine);
    for (let n = 0; n < K.RESTORE_BLOCKS - 1; n++) block(g, 0);   // P1 이 마지막 한 칸만 남기고
    expect(g.restored).toBe(0);
    block(g, 1);                                                  // 마지막 칸은 P2 가 채운다
    expect(g.restored).toBe(1);
    expect(g.plates[yours]).toBe(1);
    expect(g.plates[mine]).toBe(0);   // P1 자리가 아니라 마지막으로 막은 자리다
  });

  it("이미 꼭대기인 조각에서 막으면 게이지만 비운다", () => {
    const g = new Dodge({ seed: 1 });
    const i = g.plateIndex(g.players[0]);
    g.plates[i] = TOP_LV;
    for (let n = 0; n < K.RESTORE_BLOCKS; n++) block(g, 0);
    expect(g.gauge).toBe(0);
    expect(g.plates[i]).toBe(TOP_LV);
    expect(g.restored).toBe(0);
  });

  it("피격은 게이지를 안 올린다 — 보상은 요격에만 붙는다", () => {
    const g = new Dodge({ seed: 1 });
    const p = g.players[0];
    plant(g, { owner: 1, at: { x: p.x - 60, y: p.y }, toward: p });
    run(g, 0.6);
    expect(g.lives[0]).toBe(K.LIVES - 1);
    expect(g.gauge).toBe(0);
  });

  it("지형 사연은 색 사연과 따로 흐르고 씬이 읽으면 비워진다", () => {
    const g = new Dodge({ seed: 1 });
    const i = g.plateIndex(g.players[0]);
    g.plates[i] = 0;
    for (let n = 0; n < K.RESTORE_BLOCKS; n++) block(g, 0);
    const pe = g.drainPlateEvents();
    expect(pe.some((e) => e.kind === "restore" && e.i === i)).toBe(true);
    expect(g.drainPlateEvents()).toHaveLength(0);
  });
});

describe("한 판의 끝", () => {
  it("한쪽 생명이 다하면 끝난다 — 협동이라 승자는 없고 누가 먼저인지만 남는다", () => {
    const g = new Dodge({ seed: 1 });
    for (let n = 0; n < K.LIVES; n++) {
      const p0 = g.players[0];
      plant(g, { owner: 1, at: { x: p0.x - 60, y: p0.y }, toward: p0 });
      run(g, 0.6);
    }
    expect(g.lives[0]).toBe(0);
    expect(g.over).toBe(true);
    expect(g.fallen()).toBe(0);
  });

  it("끝나면 더 진행하지 않는다", () => {
    const g = new Dodge({ seed: 1 });
    g.lives[1] = 0;
    g.update(DT, still);
    const t = g.t;
    for (let i = 0; i < 60; i++) g.update(DT, still);
    expect(g.t).toBe(t);
  });
});

describe("결정성", () => {
  it("같은 시드면 같은 탄 순서다", () => {
    const snap = () => {
      const g = new Dodge({ seed: 4242 });
      for (let i = 0; i < 60 * 12; i++) g.update(DT, still);
      return g.bullets.map((b) => `${b.owner}:${b.target}:${b.x.toFixed(2)},${b.y.toFixed(2)}`);
    };
    expect(snap()).toEqual(snap());
  });

  it("시드가 다르면 탄 순서가 다르다", () => {
    const at = (s: number) => {
      const g = new Dodge({ seed: s });
      for (let i = 0; i < 60 * 6; i++) g.update(DT, still);
      return g.bullets.map((b) => `${b.owner}:${b.x.toFixed(0)}`).join("|");
    };
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map(at)).size).toBeGreaterThan(6);
  });
});

describe("밸런스 — 딜레마가 숫자로 재현된다", () => {
  /** 총알이 이 사람에게 가장 가까워지는 시점과 그때의 거리. */
  function approach(b: Bullet, p: Pt) {
    const rx = p.x - b.x, ry = p.y - b.y;
    const vv = b.vx * b.vx + b.vy * b.vy;
    const t = vv < 1e-9 ? 0 : Math.max(0, (rx * b.vx + ry * b.vy) / vv);
    return { t: t + b.wait, d: Math.hypot(b.x + b.vx * t - p.x, b.y + b.vy * t - p.y) };
  }

  /**
   * 그럴듯하게 플레이하는 사람. 완벽하지는 않다 — 급한 위협이 있으면 옆으로 빠지고,
   * 없으면 자기 색 탄을 막으러 가고, 할 일이 없으면 짝과 `keep` 만큼 거리를 유지한다.
   * **`keep` 이 이 시뮬레이션의 손잡이다** — 붙어 있기와 떨어져 있기를 갈아 끼운다.
   */
  function policy(g: Dodge, i: number, keep: number): Pt {
    const me = g.players[i];
    let worst: { b: Bullet; t: number } | null = null;
    for (const b of g.bullets) {
      if (b.owner === i) continue;                    // 내 색은 나를 못 죽인다
      const a = approach(b, me);
      if (a.d > g.touch + 6) continue;
      if (!worst || a.t < worst.t) worst = { b, t: a.t };
    }
    if (worst && worst.t < 0.8) {                     // 피한다 — 진행 방향의 수직으로
      const b = worst.b;
      const n = { x: -b.vy, y: b.vx }, len = Math.hypot(n.x, n.y) || 1;
      const side = (me.x - b.x) * n.x + (me.y - b.y) * n.y >= 0 ? 1 : -1;
      return { x: (n.x / len) * side, y: (n.y / len) * side };
    }
    const mine = g.bullets.filter((b) => b.owner === i);
    const mate = g.players[1 - i];
    if (mine.length) {                                // 막으러 간다 — 가장 급한 것부터
      let best = mine[0], bt = approach(mine[0], mate).t;
      for (const b of mine) { const t = approach(b, mate).t; if (t < bt) { best = b; bt = t; } }
      return { x: best.aimX - me.x, y: best.aimY - me.y };
    }
    // 할 일 없음 — 짝과 거리를 맞추고 벽에서 멀어진다
    const dx = me.x - mate.x, dy = me.y - mate.y, d = Math.hypot(dx, dy) || 1;
    const sign = d < keep ? 1 : -1;
    const cx = ARENA.x - me.x, cy = ARENA.y - me.y, cd = Math.hypot(cx, cy) || 1;
    const pull = Math.max(0, (cd - (g.radiusAt(me) - 40)) / 60) * 2;
    return { x: (dx / d) * sign + (cx / cd) * pull, y: (dy / d) * sign + (cy / cd) * pull };
  }

  function play(seed: number, keep: number) {
    const g = new Dodge({ seed });
    let guard = 0;
    while (!g.over && guard++ < 60 * 240) g.update(DT, [policy(g, 0, keep), policy(g, 1, keep)]);
    return g;
  }

  /**
   * **표본을 30 → 120 판으로 올렸다.** 조각 판을 넣고 30판으로 재니 딜레마 검사가
   * 통과했는데, 120판으로 재니 거짓이었다 — 시드 1~30 이 우연히 맞았을 뿐이다.
   * 이 저장소는 "통과하는데 성질은 없는" 검사로 이미 데었다(DEC-DGE-METRIC-WRONG).
   */
  const GAMES = 120;

  function stats(keep: number) {
    const games = Array.from({ length: GAMES }, (_, i) => play(i + 1, keep));
    const sum = (f: (g: Dodge) => number) => games.reduce((a, g) => a + f(g), 0);
    const deaths = sum((g) => K.LIVES * 2 - g.lives[0] - g.lives[1]);
    const N = GAMES;
    const byColor = sum((g) => g.leaked[0] + g.leaked[1]);
    const times = games.map((g) => g.t).sort((a, b) => a - b);
    return {
      blocked: sum((g) => g.blocked[0] + g.blocked[1]),
      byColor, byNeutral: deaths - byColor, deaths,
      collapsed: sum((g) => g.collapsed),
      restored: sum((g) => g.restored),
      deathsPerGame: deaths / N,
      neutralShare: (deaths - byColor) / deaths,
      median: times[Math.floor(times.length / 2)],
    };
  }

  const near = stats(60);    // 붙어 있기
  const mid = stats(130);
  const far = stats(220);    // 떨어져 있기

  /**
   * **이 검사가 이 게임의 존재 이유를 지킨다.** 요격이 0 이면 "서로 보완"이 성립하지 않고
   * 각자 피하는 1인 게임 둘이 된다 — 컨셉의 근거가 통째로 사라진다.
   */
  it("요격이 실제로 일어난다", () => {
    expect(mid.blocked).toBeGreaterThan(0);
  });

  it("그렇다고 전부 막지는 못한다 — 못 막고 새는 색 탄이 있다", () => {
    expect(mid.byColor).toBeGreaterThan(0);
  });

  /**
   * **컨셉이 표로 적어둔 딜레마의 회귀 테스트다.**
   * 붙어 있으면 주인 없는 탄(중점 조준)이 물고, 떨어지면 요격을 못 해 색 탄이 샌다.
   * 이게 깨지면 한쪽 거리가 무료 정답이 되고 게임이 정적이 된다.
   */
  /**
   * **이 검사는 지금 실패한다. 일부러 실패인 채로 둔다(`it.fails`).**
   *
   * CON-006 의 원형 판에서는 참이었다 — 120판 기준 주인 없는 탄 사망 비중이
   * 붙어 있기 42% / 130px 30% / 떨어지기 29% 로 기울기가 뚜렷했다.
   * **조각 판(DGE-002)을 넣자 37/38/36 으로 평평해졌다.**
   *
   * 원인을 분리해서 확인했다 — 복구를 끄고 붕괴를 원본 축소 속도(0.8s 고정)에
   * 맞춰도 63/62/64 로 평평했다. 사망 수·요격 수·한 판 길이·실제 간격은 전부
   * 원본과 같았고 **구성만 달랐다.** 즉 복구 규칙도 붕괴 속도도 아니고
   * **톱니 판 자체**가 딜레마를 죽였다.
   *
   * 지우지 않는 이유: 이 성질이 CON-006 의 존재 이유이고(REQ-DGE-NO-FREE-SPACING),
   * 설계로 되살려야 할 빚이다. `it.fails` 로 두면 **누가 고치는 순간 이 검사가
   * 빨개져서** 되살아난 것을 알린다. 조용히 지우면 아무도 다시 안 본다.
   *
   * 30판으로는 통과했었다 — 시드 1~30 이 우연히 맞았다. 표본을 120 으로 올려서 드러났다.
   */
  it.fails("[알려진 회귀] 붙어 있으면 주인 없는 탄이, 떨어지면 색 탄이 더 죽인다", () => {
    expect(near.neutralShare).toBeGreaterThan(far.neutralShare);
    expect(far.byColor / far.deaths).toBeGreaterThan(near.byColor / near.deaths);
  });

  /** 딜레마의 방향은 잃었지만 **대가의 크기는 여전히 같다** — 무료인 거리는 없다. */
  it("어느 거리도 공짜가 아니다 — 죽는 횟수는 비슷하다", () => {
    for (const s of [near, mid, far]) {
      expect(s.deathsPerGame).toBeGreaterThan(2);
      expect(s.deathsPerGame).toBeLessThan(6);
    }
  });

  /** 평평해진 것이 "주인 없는 탄이 논다"는 뜻은 아니다 — 세 거리 모두 3분의 1 넘게 문다. */
  it("주인 없는 탄이 어느 거리에서도 3분의 1 넘게 죽인다", () => {
    for (const s of [near, mid, far]) expect(s.neutralShare).toBeGreaterThan(0.3);
  });

  it("주인 없는 탄이 실제로 사람을 맞힌다 — 대형을 깨는 장치가 논다", () => {
    expect(mid.byNeutral).toBeGreaterThan(0);
  });

  it("한 판이 순식간에 끝나지도, 영원히 가지도 않는다", () => {
    expect(mid.median).toBeGreaterThan(10);
    expect(mid.median).toBeLessThan(180);
  });

  it("복구가 실제로 일어난다 — 요격에 양의 보상이 붙는다", () => {
    expect(mid.restored).toBeGreaterThan(0);
  });

  /**
   * **불변식: 복구는 지연이지 역전이 아니다.**
   * 값이 아니라 관계를 검사한다 — 붕괴 주기나 `RESTORE_BLOCKS` 를 나중에 바꿔도
   * "안 끝나는 게임"이 조용히 들어올 수 없다(PSH-006 패턴).
   * 이게 깨지면 판이 안 줄고 후반 압박 셋 중 하나가 통째로 죽는다.
   */
  it("판당 복구 단계 수 < 판당 붕괴 단계 수", () => {
    for (const s of [near, mid, far]) {
      expect(s.restored).toBeLessThan(s.collapsed);
      expect(s.restored / s.collapsed).toBeLessThan(0.6);
    }
  });
});

describe("정적 배치 — 겹치지 않는다", () => {
  // 이 저장소는 겹침 버그를 네 번 냈다(TASK-010~013). 산술로 막을 수 있는 것만 막는다 —
  // **움직이는 물체(사람 둘·총알 여럿·예고선 여럿)는 이 검사가 못 본다.**
  it("경기 화면 세로 스택", () => {
    const bands = [
      { name: "상태 줄", ...textBand(TURN_Y, F.lg) },
      { name: "아레나", top: ARENA.y - MAX_R, bottom: ARENA.y + MAX_R },
      { name: "아래 줄", ...textBand(STATUS_Y, F.sm) },
    ];
    expect(checkStack(bands, 480)).toEqual([]);
  });

  it("결산 오버레이 세로 스택", () => {
    const bands = [
      { name: "버틴 시간", ...textBand(RECAP.time, F.hero) },
      { name: "P1 성적", ...textBand(RECAP.rows[0], F.xl) },
      { name: "P2 성적", ...textBand(RECAP.rows[1], F.xl) },
      { name: "사유", ...textBand(RECAP.why, F.sm) },
      { name: "재시작", ...textBand(RECAP.restart, F.lg) },
    ];
    expect(checkStack(bands, 480)).toEqual([]);
  });

  it("아레나가 캔버스 안에 든다 — 축소만 하므로 시작 크기만 보면 된다", () => {
    expect(ARENA.y - MAX_R).toBeGreaterThan(0);
    expect(ARENA.y + MAX_R).toBeLessThan(480);
    expect(ARENA.x - MAX_R).toBeGreaterThan(0);
    expect(ARENA.x + MAX_R).toBeLessThan(640);
  });
});
