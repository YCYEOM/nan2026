// 코너킥 엔진. 이 게임의 중심은 인과 사슬이라 테스트도 사슬 순서로 간다:
// 파워 정확도 → R0 → 낙하점(항상 원 안) → 판정 6종 → 집계.
import { describe, it, expect } from "vitest";
import {
  CornerKick, K, FIELD, GOAL, GK_ZONE, GK_HOME, GOAL_MID, AIM_ZONE, OUTCOME,
  type Outcome, type Pt,
} from "./systems/corner";
import { TURN_Y, GAUGE, RESULT_Y, STATUS_Y, RECAP_Y, RECAP_TOP } from "./scenes/corner";
import { textBand, checkStack } from "./kits/layout";
import { F } from "./ui/tokens";

const DT = 1 / 60;
const d = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** 조준 → 파워 정지까지. `power` 를 직접 꽂아 정확도를 원하는 값으로 만든다. */
function kick(e: CornerKick, aim: Pt, power: number) {
  e.aimAt(aim.x, aim.y);
  e.power = power;
  e.stopPower();
}

/**
 * 비행을 끝까지 돌린다. `hold` 로 매 프레임 위치를 고정해 AI 이동을 눌러둘 수 있다 —
 * 판정 분기를 하나씩 떼어 보려면 필요하다.
 */
function flight(e: CornerKick, hold: { head?: Pt; def?: Pt; gk?: Pt; jumpAt?: number } = {}) {
  let guard = 0;
  while (e.stage === "flight" && guard++ < 600) {
    if (hold.head) e.head = { ...hold.head };
    if (hold.def) e.defs = e.defs.map(() => ({ ...hold.def! }));
    if (hold.gk) e.gk = { ...hold.gk };
    if (hold.jumpAt !== undefined && e.jumpAt === null && e.t >= hold.jumpAt) e.jump();
    e.update(DT);
  }
  return e.last!;
}

/** 판정 하나를 원하는 결과로 몰아넣는다. 낙하점을 직접 놓아 흩어짐 운을 배제한다. */
function forced(opts: {
  land: Pt; r0?: number; head?: Pt; def?: Pt; gk?: Pt; jumpAt?: number; gkOut?: boolean;
}) {
  const e = new CornerKick({ corners: 6, seed: 1 });
  kick(e, { x: 320, y: 160 }, 0.5);
  e.land = { ...opts.land };
  if (opts.r0 !== undefined) e.r0 = opts.r0;
  if (opts.gkOut !== undefined) e.gkOut = opts.gkOut;
  // `stopPower()` 가 흩어진 낙하점 기준으로 도착을 한 번 찍는다 — 낙하점을 갈아끼웠으니
  // 그 기록은 낡았다. 지우고 비행 루프가 다시 찍게 한다.
  e.headAt = null; e.defAt = null;
  const far = { x: FIELD.x + FIELD.w - 5, y: FIELD.y + FIELD.h - 5 };
  return flight(e, {
    head: opts.head ?? far,
    def: opts.def ?? far,
    gk: opts.gk ?? { ...GK_HOME },
    jumpAt: opts.jumpAt,
  });
}

describe("파워 정확도 → 낙하 원", () => {
  it("가운데에서 멈추면 정확도 1, 원이 가장 작다", () => {
    const e = new CornerKick({ corners: 6, seed: 7 });
    kick(e, { x: 320, y: 160 }, 0.5);
    expect(e.accuracy).toBeCloseTo(1, 6);
    expect(e.r0).toBeCloseTo(K.R_MIN, 6);
  });

  it("끝에서 멈추면 정확도 0, 원이 가장 크다", () => {
    for (const p of [0, 1]) {
      const e = new CornerKick({ corners: 6, seed: 7 });
      kick(e, { x: 320, y: 160 }, p);
      expect(e.accuracy).toBeCloseTo(0, 6);
      expect(e.r0).toBeCloseTo(K.R_MAX, 6);
    }
  });

  it("정확할수록 원이 작다 — 단조 감소", () => {
    const rs = [0.5, 0.4, 0.3, 0.2, 0.1, 0].map((p) => {
      const e = new CornerKick({ corners: 6, seed: 7 });
      kick(e, { x: 320, y: 160 }, p);
      return e.r0;
    });
    for (let i = 1; i < rs.length; i++) expect(rs[i]).toBeGreaterThan(rs[i - 1]);
  });
});

describe("불변식 — 낙하점은 언제나 원 안에 있다", () => {
  // 이게 깨지면 화면의 원이 거짓말을 한다. 원을 보고 뛴다는 게임의 전제가 무너진다.
  it("시드·조준·파워를 바꿔도 초기 원 안이다", () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const p of [0, 0.15, 0.33, 0.5, 0.72, 0.9, 1]) {
        const e = new CornerKick({ corners: 6, seed });
        const aim = { x: AIM_ZONE.x0 + (seed % 7) * 80, y: AIM_ZONE.y0 + (seed % 5) * 60 };
        kick(e, aim, p);
        expect(d(e.land, e.aim)).toBeLessThanOrEqual(e.r0 + 1e-9);
      }
    }
  });

  it("비행 중 어느 시점에도 원 안이다 — 중심이 미끄러져도", () => {
    const e = new CornerKick({ corners: 6, seed: 42 });
    kick(e, { x: 300, y: 200 }, 0.2);
    for (let i = 0; i <= 20; i++) {
      const at = i / 20;
      const c = e.circle(at);
      expect(d(e.land, c)).toBeLessThanOrEqual(c.r + 1e-9);
    }
  });

  it("원은 조준점에서 시작해 낙하점으로 수축한다", () => {
    const e = new CornerKick({ corners: 6, seed: 9 });
    kick(e, { x: 300, y: 200 }, 0.25);
    const a = e.circle(0), z = e.circle(1);
    expect(a.x).toBeCloseTo(e.aim.x, 6);
    expect(a.r).toBeCloseTo(e.r0, 6);
    expect(z.x).toBeCloseTo(e.land.x, 6);
    expect(z.r).toBeCloseTo(0, 6);
  });

  it("낙하점은 경기장 안이다", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const e = new CornerKick({ corners: 6, seed });
      kick(e, { x: AIM_ZONE.x0, y: AIM_ZONE.y1 }, 0);   // 최악 파워 + 구석 조준
      expect(e.land.x).toBeGreaterThanOrEqual(FIELD.x);
      expect(e.land.x).toBeLessThanOrEqual(FIELD.x + FIELD.w);
      expect(e.land.y).toBeGreaterThanOrEqual(FIELD.y);
      expect(e.land.y).toBeLessThanOrEqual(FIELD.y + FIELD.h);
    }
  });
});

describe("조준 범위", () => {
  it("범위 밖 클릭은 잘려 들어온다", () => {
    const e = new CornerKick({ corners: 6, seed: 1 });
    e.aimAt(-500, 5000);
    expect(e.aim.x).toBe(AIM_ZONE.x0);
    expect(e.aim.y).toBe(AIM_ZONE.y1);
  });
});

describe("판정 6종 — 전부 결정적이다", () => {
  const at = (p: Pt, dx: number, dy = 0): Pt => ({ x: p.x + dx, y: p.y + dy });

  it("골 — 자리에 있고 완벽한 점프, GK 는 골문 가운데", () => {
    const land = { x: 300, y: 130 };
    const j = forced({ land, head: land, jumpAt: K.FLIGHT - 0.02 });
    expect(j.outcome).toBe("goal");
    // 완벽한 점프는 먼 쪽 포스트를 노린다 — 가운데 선 GK 를 넘어간다
    expect(j.shotX).toBeGreaterThan(GOAL_MID);
  });

  it("골키퍼 선방 — 자리에도 있고 창 안이지만 완벽하지 않아 가운데로 갔다", () => {
    const land = { x: 300, y: 130 };
    const j = forced({ land, head: land, jumpAt: K.FLIGHT - (K.PERFECT + K.WINDOW) / 2 });
    expect(j.outcome).toBe("keeperSave");
    expect(j.shotX).toBe(GOAL_MID);
  });

  it("머리 타이밍 — 자리에는 있었는데 점프 창을 놓쳤다", () => {
    const land = { x: 300, y: 130 };
    expect(forced({ land, head: land, jumpAt: 0.1 }).outcome).toBe("mistimed");
    expect(forced({ land, head: land }).outcome).toBe("mistimed");   // 아예 안 뛴 경우
  });

  it("늦게 붙었다 — 원이 작았는데 헤더가 멀다", () => {
    const land = { x: 300, y: 130 };
    const j = forced({ land, r0: K.BIG - 10, head: at(land, K.REACH + 20), jumpAt: K.FLIGHT - 0.02 });
    expect(j.outcome).toBe("lateRun");
    expect(OUTCOME[j.outcome].blame).toBe("header");
  });

  it("공이 나빴다 — 원이 컸으면 같은 실패가 키커 탓이 된다", () => {
    const land = { x: 300, y: 130 };
    const j = forced({ land, r0: K.BIG + 10, head: at(land, K.REACH + 20), jumpAt: K.FLIGHT - 0.02 });
    expect(j.outcome).toBe("badBall");
    expect(OUTCOME[j.outcome].blame).toBe("kicker");
  });

  it("서 있던 수비는 미리 붙은 헤더를 못 이긴다 — 공중볼 경합의 규칙", () => {
    // 수비가 더 가깝게 서 있어도, 공을 읽기 전(DEF_DELAY)에 서 있던 것은 경합이 아니다.
    // 이게 없으면 지역 수비 4인이 박스를 덮어 그 근처 공은 t=0 에 이미 진 공이 된다.
    const land = { x: 300, y: 200 };
    const j = forced({ land, head: at(land, 20), def: at(land, 5), jumpAt: K.FLIGHT - 0.02 });
    expect(j.outcome).toBe("goal");
    expect(j.defDist).toBeLessThan(j.headDist);   // 수비가 더 가까웠는데도
    expect(j.headAt!).toBeLessThan(K.DEF_DELAY);  // 헤더가 먼저 자리를 잡았다
  });

  it("수비수가 끝까지 못 닿으면 경합에 못 낀다", () => {
    const land = { x: 300, y: 200 };
    const j = forced({ land, head: land, def: at(land, K.REACH + 10), jumpAt: K.FLIGHT - 0.02 });
    expect(j.outcome).not.toBe("defender");
    expect(j.defAt).toBeNull();
  });

  it("둘 다 닿았으면 **먼저 온 쪽**이 이긴다 — 거리가 아니라 시각", () => {
    // 수비수를 낙하점에 붙여둔 채 헤더는 늦게 붙인다
    const land = { x: 300, y: 200 };
    const e = new CornerKick({ corners: 6, seed: 1 });
    kick(e, { x: 300, y: 200 }, 0.5);
    e.land = { ...land };
    e.headAt = null; e.defAt = null;
    let guard = 0;
    while (e.stage === "flight" && guard++ < 600) {
      e.defs = e.defs.map(() => ({ ...land }));             // 처음부터 와 있다
      e.head = e.t > 1.0 ? { ...land } : { x: 600, y: 400 }; // 1.0s 에 도착
      e.gk = { x: 600, y: 400 };
      if (e.jumpAt === null && e.t >= K.FLIGHT - 0.02) e.jump();
      e.update(DT);
    }
    expect(e.last!.outcome).toBe("defender");
    expect(e.last!.defAt).toBeLessThan(e.last!.headAt!);
  });

  it("헤더가 먼저 왔으면 수비수가 같은 자리에 있어도 이긴다", () => {
    // 이전 구현은 여기서 수비수가 이겼다 — AI 는 목표점에 정확히 붙고 사람은 못 붙어서다
    const land = { x: 200, y: 170 };
    const e = new CornerKick({ corners: 6, seed: 1 });
    kick(e, land, 0.5);
    e.land = { ...land };
    e.headAt = null; e.defAt = null;
    let guard = 0;
    while (e.stage === "flight" && guard++ < 600) {
      e.head = { x: land.x + 6, y: land.y + 6 };            // 근사값 — 사람은 정확히 못 선다
      const dp = e.t > 0.8 ? land : { x: 600, y: 400 };     // AI 는 정확히 붙지만 늦게 왔다
      e.defs = e.defs.map(() => ({ ...dp }));
      if (e.jumpAt === null && e.t >= K.FLIGHT - 0.02) e.jump();
      e.update(DT);
    }
    expect(e.last!.defDist).toBeLessThan(e.last!.headDist);  // 수비수가 더 가깝지만
    expect(e.last!.outcome).toBe("goal");                    // 먼저 온 쪽이 이긴다
  });

  it("골키퍼가 나왔다 — 존 안에 떨어졌고 GK 가 닿았다", () => {
    const land = { x: 320, y: 100 };   // GK_ZONE 안
    const j = forced({ land, gkOut: true, head: land, gk: land, jumpAt: K.FLIGHT - 0.02 });
    expect(j.outcome).toBe("keeperOut");
  });

  it("GK 가 나왔지만 못 닿으면 빈 골문이다 — 존 도박의 보상", () => {
    const land = { x: 250, y: 145 };
    const j = forced({
      land, gkOut: true, head: land,
      gk: { x: 400, y: 200 },                       // 나왔고 낙하점에서 멀다
      jumpAt: K.FLIGHT - (K.PERFECT + K.WINDOW) / 2, // 완벽하지 않은 점프인데도
    });
    expect(j.outcome).toBe("goal");
  });
});

describe("GK 커버 폭 — 깊게 올리면 안전하지만 골이 안 된다", () => {
  it("멀수록 넓어지고 골문 폭을 넘지 않는다", () => {
    const e = new CornerKick({ corners: 6, seed: 1 });
    const near = e.coverSpan({ x: GOAL_MID, y: GOAL.y + 40 });
    const mid = e.coverSpan({ x: GOAL_MID, y: GOAL.y + 150 });
    const far = e.coverSpan({ x: GOAL_MID, y: GOAL.y + 400 });
    expect(near).toBeLessThan(mid);
    expect(mid).toBeLessThan(far);
    expect(far).toBeLessThanOrEqual(GOAL.x1 - GOAL.x0);
  });

  it("깊은 곳에서는 완벽한 점프로도 못 넣는다", () => {
    const land = { x: 320, y: 330 };
    const j = forced({ land, head: land, jumpAt: K.FLIGHT - 0.02 });
    expect(j.outcome).toBe("keeperSave");
  });
});

describe("AI", () => {
  it("수비수는 원 중심을 쫓는다 — 헤더가 아니라", () => {
    const e = new CornerKick({ corners: 6, seed: 3 });
    kick(e, { x: 300, y: 150 }, 0.5);
    e.defs = e.defs.map(() => ({ x: 500, y: 400 }));
    const before = d(e.defs[0], e.land);
    while (e.stage === "flight") { e.head = { x: 60, y: 430 }; e.update(DT); }
    // 헤더는 정반대 구석에 두었는데도 수비수는 낙하점으로 다가갔다
    expect(e.defDist()).toBeLessThan(before);
  });

  it("GK 는 존 밖이면 골문을 지킨다", () => {
    const e = new CornerKick({ corners: 6, seed: 5 });
    kick(e, { x: 320, y: 300 }, 0.5);   // 존 밖
    expect(e.gkOut).toBe(false);
    flight(e);
    expect(e.gk).toEqual(GK_HOME);
  });

  it("GK 는 존 안이면 나온다", () => {
    const e = new CornerKick({ corners: 6, seed: 5 });
    kick(e, { x: (GK_ZONE.x0 + GK_ZONE.x1) / 2, y: (GK_ZONE.y0 + GK_ZONE.y1) / 2 }, 0.5);
    expect(e.gkOut).toBe(true);
    flight(e);
    expect(e.gk).not.toEqual(GK_HOME);
  });

  it("반응 지연이 있어 GK 는 초반에 안 움직인다", () => {
    const e = new CornerKick({ corners: 6, seed: 5 });
    kick(e, { x: 320, y: 100 }, 0.5);
    while (e.t < K.GK_DELAY - DT) e.update(DT);
    expect(e.gk).toEqual(GK_HOME);
  });

  it("수비수도 반응 지연이 있다", () => {
    const e = new CornerKick({ corners: 6, seed: 5 });
    kick(e, { x: 320, y: 200 }, 0.5);
    const start = e.defs.map((p) => ({ ...p }));
    while (e.t < K.DEF_DELAY - DT) e.update(DT);
    expect(e.defs).toEqual(start);
  });
});

describe("헤더 이동", () => {
  it("파워 단계에서도 움직인다 — 키커가 재는 동안 할 일이 있어야 한다", () => {
    const e = new CornerKick({ corners: 6, seed: 1 });
    e.aimAt(320, 160);
    const y0 = e.head.y;
    for (let i = 0; i < 30; i++) e.update(DT, { x: 0, y: -1 });
    expect(e.head.y).toBeLessThan(y0);
  });

  it("경기장 밖으로 못 나간다", () => {
    const e = new CornerKick({ corners: 6, seed: 1 });
    e.aimAt(320, 160);
    for (let i = 0; i < 600; i++) e.update(DT, { x: -1, y: -1 });
    expect(e.head.x).toBeGreaterThanOrEqual(FIELD.x);
    expect(e.head.y).toBeGreaterThanOrEqual(FIELD.y);
  });

  it("대각 이동이 직선 이동보다 빠르지 않다 — 정규화", () => {
    const straight = new CornerKick({ corners: 6, seed: 1 });
    const diag = new CornerKick({ corners: 6, seed: 1 });
    straight.aimAt(320, 160); diag.aimAt(320, 160);
    for (let i = 0; i < 30; i++) {
      straight.update(DT, { x: 1, y: 0 });
      diag.update(DT, { x: 1, y: 1 });
    }
    expect(diag.head.x - 320).toBeLessThan(straight.head.x - 320);
  });
});

describe("한 판의 흐름", () => {
  /** 코너 하나를 끝까지 돌린다. 조준점은 GK 존 밖이라 GK 가 안 나온다. */
  const SPOT = { x: 200, y: 170 };
  function corner(e: CornerKick, score: boolean) {
    kick(e, SPOT, 0.5);
    flight(e, score
      ? { head: { ...e.land }, def: { x: 600, y: 430 }, jumpAt: K.FLIGHT - 0.02 }
      : { head: { x: 60, y: 430 }, def: { x: 600, y: 430 } });
    e.next();
  }

  it("코너마다 키커가 바뀐다", () => {
    const e = new CornerKick({ corners: 6, seed: 2 });
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) { seen.push(e.kicker); corner(e, false); }
    expect(seen).toEqual([0, 1, 0, 1, 0, 1]);
  });

  it("6코너를 마치면 끝난다", () => {
    const e = new CornerKick({ corners: 6, seed: 2 });
    for (let i = 0; i < 6; i++) { expect(e.done).toBe(false); corner(e, false); }
    expect(e.done).toBe(true);
    expect(e.history).toHaveLength(6);
  });

  it("키커별 성적이 모수와 함께 쌓인다", () => {
    const e = new CornerKick({ corners: 4, seed: 2 });
    corner(e, true);    // P1 이 올림 → 골
    corner(e, false);   // P2 가 올림 → 실패
    corner(e, true);    // P1 이 올림 → 골
    corner(e, false);   // P2 가 올림 → 실패
    expect(e.byKicker[0]).toEqual([2, 2]);
    expect(e.byKicker[1]).toEqual([2, 0]);
    expect(e.goals).toBe(2);
  });

  it("결과를 보기 전에는 다음 코너로 안 넘어간다", () => {
    const e = new CornerKick({ corners: 6, seed: 2 });
    e.next();
    expect(e.corner).toBe(0);
    expect(e.stage).toBe("aim");
  });
});

describe("결정성", () => {
  it("같은 시드면 같은 흩어짐과 같은 수비 배치다", () => {
    const run = () => {
      const e = new CornerKick({ corners: 6, seed: 1234 });
      const def = e.defs.map((p) => ({ ...p }));
      kick(e, { x: 310, y: 170 }, 0.3);
      return { def, land: { ...e.land }, r0: e.r0 };
    };
    expect(run()).toEqual(run());
  });

  it("시드가 다르면 배치가 다르다", () => {
    const at = (s: number) => { const e = new CornerKick({ corners: 6, seed: s }); return e.defs.map((p) => `${p.x},${p.y}`).join("|"); };
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map(at)).size).toBeGreaterThan(6);
  });
});

describe("밸런스 — 아무도 구조적으로 이기지 않는다", () => {
  /**
   * 이상적으로 움직이는 헤더: 매 프레임 원 중심으로 최대 속도, 착지에 맞춰 점프.
   * 사람은 이보다 못 한다 — 그래서 이 시뮬레이션은 **헤더 실력의 상한**이다.
   */
  function perfect(seed: number, power: number) {
    const e = new CornerKick({ corners: 1, seed });
    e.aimAt(AIM_ZONE.x0 + ((seed * 37) % 500), AIM_ZONE.y0 + ((seed * 53) % 260));
    // 키커가 게이지를 재는 1초 동안 조준점으로 **미리 붙는다.** 이 게임에서 헤더의
    // 가장 큰 무기이고, 이걸 빼고 재면 수비가 실제보다 훨씬 세 보인다.
    for (let i = 0; i < 60; i++) e.update(DT, { x: e.aim.x - e.head.x, y: e.aim.y - e.head.y });
    e.power = power;
    e.stopPower();
    let guard = 0;
    while (e.stage === "flight" && guard++ < 600) {
      const c = e.circle();
      if (e.t >= K.FLIGHT - 0.015 && e.jumpAt === null) e.jump();
      e.update(DT, { x: c.x - e.head.x, y: c.y - e.head.y });
    }
    return e.last!;
  }

  function tally(power: number, n = 400) {
    const t: Partial<Record<Outcome, number>> = {};
    for (let s = 1; s <= n; s++) { const o = perfect(s, power).outcome; t[o] = (t[o] ?? 0) + 1; }
    return { t, n };
  }

  /**
   * **이 묶음이 실제 버그를 두 번 잡았다.**
   * (1) 초기 구현은 경합을 최종 거리로 갈랐다. AI 는 `step()` 이 목표점에 정확히 붙어
   *     `defDist = 0` 이 되고 사람은 근사값이라, 수비수가 완벽한 헤더 상대로도 55% 를 먹었다.
   * (2) 수비를 4인 지역 방어로 늘렸을 때, 서 있는 것만으로 도착을 인정하면 박스 안 공이
   *     t=0 에 이미 진 공이 됐다(수비 45% · 골 23%).
   * 둘 다 단위 테스트 39개를 전부 통과한 채로 존재했다 — 분기가 도달 가능한 것과
   * 분기가 실제로 얼마나 나오는지는 다르다.
   */
  it("정확한 크로스면 수비 4인도 헤더를 못 잡는다", () => {
    const { t, n } = tally(0.5);
    expect((t.defender ?? 0) / n).toBeLessThan(0.05);
  });

  it("나쁜 크로스면 수비가 문다 — 수비수가 장식이 아니다", () => {
    const { t, n } = tally(0.1);
    expect((t.defender ?? 0) / n).toBeGreaterThan(0.08);
  });

  it("**인과 사슬** — 파워가 나빠질수록 골이 단조 감소한다", () => {
    // 이 게임의 전제 그 자체다. 한때 완벽 71 vs 나쁨 72 로 완전히 죽어 있었다.
    const goals = [0.5, 0.25, 0.1].map((p) => tally(p).t.goal ?? 0);
    expect(goals[0]).toBeGreaterThan(goals[1]);
    expect(goals[1]).toBeGreaterThan(goals[2]);
  });

  it("이상적인 헤더도 절반 남짓이다 — GK 와 존이 일한다", () => {
    const { t, n } = tally(0.5);
    expect((t.goal ?? 0) / n).toBeGreaterThan(0.3);
    expect((t.goal ?? 0) / n).toBeLessThan(0.7);
  });
});

describe("정적 배치 — 겹치지 않는다", () => {
  // 이 저장소는 겹침 버그를 네 번 냈다(TASK-010~013). 산술로 막을 수 있는 것만 막는다 —
  // **움직이는 물체(공·헤더·수비·GK·낙하 원)는 이 검사가 못 본다.**
  it("경기 화면 세로 스택", () => {
    const bands = [
      { name: "차례 줄", ...textBand(TURN_Y, F.lg) },
      { name: "골망", top: GOAL.y - 16, bottom: GOAL.y },
      { name: "필드", top: FIELD.y, bottom: FIELD.y + FIELD.h },
      { name: "게이지", top: GAUGE.y - 4, bottom: GAUGE.y + GAUGE.h + 4 },  // 손잡이가 위아래 4px 넘친다
      { name: "상태줄", ...textBand(STATUS_Y, F.sm) },
    ];
    expect(checkStack(bands, 480)).toEqual([]);
  });

  it("판정 이름은 필드 아래·상태줄 위에 든다", () => {
    const bands = [
      { name: "필드", top: FIELD.y, bottom: FIELD.y + FIELD.h },
      { name: "판정 이름", ...textBand(RESULT_Y, F.xxl) },
      { name: "상태줄", ...textBand(STATUS_Y, F.sm) },
    ];
    expect(checkStack(bands, 480)).toEqual([]);
  });

  it("결산 오버레이 세로 스택", () => {
    const bands = [
      { name: "총 골", ...textBand(RECAP_TOP.total, F.hero) },
      { name: "키커1", ...textBand(RECAP_TOP.kicker[0], F.xl) },
      { name: "키커2", ...textBand(RECAP_TOP.kicker[1], F.xl) },
      { name: "결과줄1", ...textBand(RECAP_Y[0], F.sm) },
      { name: "결과줄2", ...textBand(RECAP_Y[1], F.sm) },
      { name: "범인 집계", ...textBand(RECAP_Y[2], F.sm) },
      { name: "재시작", ...textBand(RECAP_TOP.restart, F.lg) },
    ];
    expect(checkStack(bands, 480)).toEqual([]);
  });

  it("결산 결과줄이 캔버스 폭을 안 넘는다 — 3개씩 끊는다", () => {
    // 가장 긴 이름 3개를 이어도 640px 안이어야 한다. 한글 F.sm 은 폭 약 14px 로 잡는다.
    const longest = (Object.keys(OUTCOME) as Outcome[])
      .map((o) => OUTCOME[o].name.length).sort((a, b) => b - a).slice(0, 3);
    const chars = longest.reduce((a, b) => a + b, 0) + 6;   // " · " 두 개
    expect(chars * F.sm).toBeLessThan(640);
  });

  it("조준 범위는 필드 안이다", () => {
    expect(AIM_ZONE.x0).toBeGreaterThanOrEqual(FIELD.x);
    expect(AIM_ZONE.x1).toBeLessThanOrEqual(FIELD.x + FIELD.w);
    expect(AIM_ZONE.y1).toBeLessThanOrEqual(FIELD.y + FIELD.h);
  });
});

describe("범인 배분", () => {
  it("실패 6종이 키커 3 · 헤더 3 으로 갈린다 — 한쪽만 탓하지 않는다", () => {
    const fails = (Object.keys(OUTCOME) as Outcome[]).filter((o) => o !== "goal");
    expect(fails).toHaveLength(6);
    const kicker = fails.filter((o) => OUTCOME[o].blame === "kicker");
    const header = fails.filter((o) => OUTCOME[o].blame === "header");
    expect(kicker).toHaveLength(3);
    expect(header).toHaveLength(3);
  });
});
