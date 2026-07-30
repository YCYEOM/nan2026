import { describe, it, expect } from "vitest";
import { PowerGrid, Machine, GridOpts, ROLE, DYN } from "./systems/powergrid";

const OPTS: GridOpts = { capacity: 130, quota: 1000, grace: 1.2, cooldown: 2.5 };
const SPEC = [{ draw: 20, output: 8 }, { draw: 35, output: 15 }, { draw: 60, output: 26 }];
const build = () => {
  const m: Machine[] = [];
  for (const owner of [0, 1] as const) for (const s of SPEC) m.push({ on: false, ...s, owner });
  return new PowerGrid(m, OPTS);
};
const run = (pg: PowerGrid, secs: number, dt = 0.1) => { for (let t = 0; t < secs; t += dt) pg.step(dt); };

describe("전력망 협동/트롤", () => {
  it("전부 켜면 용량 초과 → 차단기 트립, 전원 다 나감", () => {
    const pg = build();
    pg.machines.forEach((_, i) => pg.toggle(i)); // 부하 230 > 130
    run(pg, 2); // grace 1.2 초과
    expect(pg.blackouts).toBe(1);
    expect(pg.machines.every((m) => !m.on)).toBe(true);
  });

  it("보수적 협동(각자 중=70)은 수요 급증에도 트립 없이 할당량 달성", () => {
    const pg = build();
    [1, 4].forEach((i) => pg.toggle(i)); // 중+중=70, 급증(+35)에도 105 ≤ 130
    run(pg, 40);
    expect(pg.blackouts).toBe(0);
    expect(pg.done()).toBe(true);
  });

  it("트롤(반복 초과)은 세트백으로 진행을 갉아먹는다", () => {
    const pg = build();
    pg.produced = 500;
    pg.machines.forEach((_, i) => pg.toggle(i));
    run(pg, 2); // 트립 1회
    expect(pg.produced).toBeLessThan(500); // quota*0.15 = 150 세트백
  });

  it("지연 미터는 실제 부하를 즉시 반영하지 않는다 (가려짐)", () => {
    const pg = build();
    [2, 5].forEach((i) => pg.toggle(i)); // 부하 120, 아직 표시 0
    pg.step(0.1);
    expect(pg.displayLoad).toBeLessThan(pg.load()); // 미터가 뒤늦게 따라옴
  });

  it("안전하게 더 많이 생산한 쪽이 MVP (개인 유혹은 유지)", () => {
    const pg = build();
    pg.phase = DYN.SURGE_DUR + 0.1;      // 수요 0 구간
    pg.toggle(1); pg.toggle(2);          // P1만 중+대=95 (≤ 용량85%, 무트립·무가열), P2 방치
    run(pg, 3);
    expect(pg.blackouts).toBe(0);
    expect(pg.contrib[0]).toBeGreaterThan(pg.contrib[1]); // 더 당긴 P1
    expect(pg.mvp()).toBe(0);
  });

  it("브라운아웃: 용량 90% 넘으면 효율<1 로 팀 생산이 깎인다", () => {
    const pg = build();
    [1, 2, 4].forEach((i) => pg.toggle(i)); // 부하 35+60+35=130 = 용량 = 브라운아웃 최대
    pg.step(0.1);
    expect(pg.efficiency).toBeLessThan(1);
    expect(pg.efficiency).toBeGreaterThanOrEqual(0.4);
  });

  it("P1 부하차단: 최대 부하 기계를 끄고 트립을 막는다", () => {
    const pg = build();
    pg.machines.forEach((_, i) => pg.toggle(i)); // 부하 230 초과
    expect(pg.shed()).toBe(true);
    expect(pg.machines.filter((m) => m.on && m.draw === 60).length).toBe(1); // 대 하나만 꺼짐
    expect(pg.shedCool).toBeGreaterThan(0);
    expect(pg.shed()).toBe(false); // 쿨다운 중 재사용 불가
  });

  it("P2 증설: 유효 용량을 잠깐 올려 초과를 흡수", () => {
    const pg = build();
    [1, 2, 4, 5].forEach((i) => pg.toggle(i)); // 부하 35+60+35+60=190 > 130
    pg.boost();
    expect(pg.cap()).toBe(130 + ROLE.BOOST_AMT); // 175 — 여전히 190>175라 완전방어는 아님
    run(pg, ROLE.BOOST_DUR + 0.5);
    expect(pg.boostTimer).toBe(0); // 증설 만료
  });

  it("트립 시 책임 로그가 남지만 양쪽 다 기여 → 특정 애매", () => {
    const pg = build();
    pg.machines.forEach((_, i) => pg.toggle(i)); // 양 플레이어 다 초과에 기여
    run(pg, 2); // 트립
    expect(pg.blameLog).not.toBeNull();
    expect(pg.blameLog![0]).toBeGreaterThan(0);
    expect(pg.blameLog![1]).toBeGreaterThan(0);
  });

  it("수요 급증 창에서만 외부 부하가 헤드룸을 먹는다", () => {
    const pg = build();
    expect(pg.surging()).toBe(true);             // phase 0 ∈ [0, SURGE_DUR)
    expect(pg.demand()).toBe(DYN.DEMAND_SURGE);
    pg.phase = DYN.SURGE_DUR + 1;                 // 창 밖
    expect(pg.demand()).toBe(0);
  });

  it("열 피드백: 고부하가 용량을 끌어내린다 (지연된 대가)", () => {
    const pg = build();
    [1, 2].forEach((i) => pg.toggle(i)); // 중+대=95, 급증(+35)=총130 ≥ 용량 85%
    run(pg, 0.5);                        // grace(1.2) 전 — 트립 없이 가열만
    expect(pg.heat).toBeGreaterThan(0);
    expect(pg.cap()).toBeLessThan(130);
  });

  it("정전 시 라인을 먼저 넘긴 사람만 점수 페널티 (마이너스 가능)", () => {
    const pg = build();
    pg.phase = DYN.SURGE_DUR + 0.1; // 수요 0 구간
    pg.toggle(1); pg.toggle(2);     // P1 = 95, 아직 ≤130
    pg.toggle(5);                   // P2 대 → 총155 > 130, P2가 먼저 넘김
    run(pg, 2);                     // 트립
    expect(pg.penalized).toBe(1);
    expect(pg.contrib[1]).toBeLessThan(0); // 페널티로 마이너스
    expect(pg.contrib[0]).toBeGreaterThanOrEqual(0); // 안 넘긴 P1은 무페널티
  });

  it("환경(열·수요)이 라인을 넘기면 개인 페널티 없음 (팀 세트백만)", () => {
    const pg = build();
    pg.phase = DYN.SURGE_DUR + 0.1;
    [1, 2, 3].forEach((i) => pg.toggle(i)); // 중+대+소 = 115, 처음엔 ≤130 (아무도 안 넘김)
    run(pg, 6);                             // 열이 용량을 끌어내려 트립
    expect(pg.blackouts).toBeGreaterThan(0);
    expect(pg.penalized).toBeNull();
  });

  it("정산 이력: 정전마다 시각·범인·초과기여를 기록", () => {
    const pg = build();
    pg.phase = DYN.SURGE_DUR + 0.1;
    pg.toggle(1); pg.toggle(2); pg.toggle(5); // P2가 라인 넘김
    run(pg, 2);                               // 트립
    expect(pg.history).toHaveLength(1);
    expect(pg.history[0].crosser).toBe(1);
    expect(pg.history[0].t).toBeGreaterThan(0);
    expect(pg.history[0].blame[1]).toBeGreaterThan(0);
  });

  it("협동 시너지: 둘 다 안전하게 생산하면 팀 배수>1, 한 명만이면 시너지 없음", () => {
    const pg = build();
    pg.phase = DYN.SURGE_DUR + 0.1;
    pg.toggle(1); pg.step(0.1);           // P1만
    expect(pg.synergyOn()).toBe(false);
    pg.toggle(4); pg.step(0.1);           // 이제 둘 다 (각자 중=70, 안전)
    expect(pg.synergyOn()).toBe(true);
    expect(pg.teamMult()).toBeGreaterThan(1);
  });

  it("seed 없으면 이벤트 미발생, seed 있으면 발생 (결정적)", () => {
    const noSeed = build();
    run(noSeed, 30);
    expect(noSeed.event).toBeNull();

    const seeded = new PowerGrid(
      [{ on: false, draw: 20, output: 8, owner: 0 }],
      { ...OPTS, seed: 42 },
    );
    let sawEvent = false;
    for (let t = 0; t < 40 && !sawEvent; t += 0.1) { seeded.step(0.1); if (seeded.event) sawEvent = true; }
    expect(sawEvent).toBe(true);
  });

  it("불안정 기계는 가끔 draw가 급등한다 (스파이크)", () => {
    const pg = new PowerGrid(
      [{ on: true, draw: 45, output: 28, owner: 0, volatile: true }],
      { ...OPTS, seed: 7 },
    );
    let sawSpike = false;
    for (let t = 0; t < 20 && !sawSpike; t += 0.1) { pg.step(0.1); if (pg.load() > 45) sawSpike = true; }
    expect(sawSpike).toBe(true); // 실효 draw가 기본(45)보다 커지는 순간 존재
  });

  it("무정전 스트릭은 시간에 쌓이고, 정전 시 0으로 리셋", () => {
    const pg = build();
    pg.phase = DYN.SURGE_DUR + 0.1;
    pg.toggle(1); pg.toggle(4);           // 안전 생산
    run(pg, 10);
    expect(pg.streak).toBeGreaterThan(5);
    expect(pg.streakMult()).toBeGreaterThan(1);
    pg.toggle(2); pg.toggle(5);           // 부하 초과 유도
    run(pg, 2);                           // 트립
    expect(pg.blackouts).toBeGreaterThan(0);
    expect(pg.streak).toBe(0);            // 공유 손실
  });
});
