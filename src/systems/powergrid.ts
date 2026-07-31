// System behavior kit — 공유 전력망(협동+트롤). 팀이 공유 용량을 나눠 씀.
// 트롤 내재: 기계를 켜면 할당량(quota)에 기여하지만 전력을 당김 → 총부하가 용량 넘으면
// 차단기 트립 → 전원 다 나감 + 누적 작업 세트백. 표시 부하는 '지연'(HiddenInfo)이라
// 누가 넘겼는지 즉시 안 보임 = 고의/실수 구분 불가.

import { rng } from "../kits/rng";

export interface Machine {
  on: boolean; draw: number; output: number; owner: 0 | 1;
  volatile?: boolean;          // 불안정: 가끔 draw 급등
  spiking?: boolean; spikeTimer?: number; // 런타임 스파이크 상태
}

export interface GridOpts { capacity: number; quota: number; grace: number; cooldown: number; seed?: number; }

// 이벤트/불안정 노브. seed 있을 때만 이벤트 발생(테스트 결정성 위해 기본 off).
export type EventKind = "storm" | "shock" | "maint";
const EVENT = { INTERVAL: 9, DUR: 5, STORM_CAP: -40, SHOCK_DEMAND: 50, MAINT_CAP: 25 };
const VOLATILE = { SPIKE_AMT: 40, SPIKE_DUR: 1.2, SPIKE_CHANCE: 0.3 }; // 초당 스파이크 확률
export const EVENTS = EVENT, VOL = VOLATILE;

// 비대칭 역할 노브. P1=부하차단(최대 기계 강제 OFF), P2=증설(잠깐 용량↑). 쿨다운 = 희소 자원.
const SHED_CD = 6, BOOST_CD = 8, BOOST_AMT = 45, BOOST_DUR = 4;
export const ROLE = { SHED_CD, BOOST_CD, BOOST_AMT, BOOST_DUR };

// 동적 압박(Layer B) 노브. 수요 급증 = 외부 부하가 창 구간마다 헤드룸을 갉음.
// 열 피드백 = 부하 높으면 용량 서서히 하강(식으면 회복) → 과욕의 지연된 대가(DelayedConsequence).
const HEAT_PEN = 30, HEAT_RISE = 0.25, HEAT_FALL = 0.15;
const DEMAND_SURGE = 35, SURGE_PERIOD = 12, SURGE_DUR = 5;
export const DYN = { HEAT_PEN, HEAT_RISE, HEAT_FALL, DEMAND_SURGE, SURGE_PERIOD, SURGE_DUR };

// 정전 시 '라인을 먼저 넘긴' 플레이어 점수 페널티(마이너스 가능). 환경(열·수요) 탓이면 무적용.
export const CROSS_PENALTY = 100;

// 팀웍 강화 노브. 시너지=둘 다 안전 생산 시 배수. 스트릭=무정전 지속 시 램프업(정전에 리셋).
export const TEAM = { SYNERGY: 1.3, STREAK_MAX: 0.5, STREAK_FULL: 20 };

export class PowerGrid {
  produced = 0;          // 팀 누적 작업(세트백 반영) — 공동 목표
  contrib: [number, number] = [0, 0]; // 플레이어별 원 생산량(세트백 無) — MVP·개인 유혹
  efficiency = 1;        // 브라운아웃 계수: 용량 근처면 <1
  displayLoad = 0;       // 표시용(지연) — 실제 부하와 다름
  overFor = 0;           // 용량 초과 지속
  blackouts = 0;
  tripped = false;
  shedCool = 0; boostCool = 0; boostTimer = 0; // 역할 쿨다운/증설 잔여
  overContrib: [number, number] = [0, 0];      // 현재 초과 구간의 owner별 기여(누적)
  blameLog: [number, number] | null = null;    // 직전 트립의 책임 로그 — 지연 탓에 애매
  history: { t: number; crosser: 0 | 1 | null; blame: [number, number] }[] = []; // 라운드 후 정산용
  heat = 0;   // 0..1, 부하 높으면 상승 → 용량 하강
  phase = 0;  // 수요 급증 스케줄용 내부 시계
  crosser: 0 | 1 | null = null;   // 현재 초과 구간을 '먼저 넘긴' 플레이어(토글로). 환경 탓이면 null
  penalized: 0 | 1 | null = null; // 직전 트립에서 페널티 받은 플레이어(표시용)
  streak = 0;                     // 무정전 지속 시간(초). 정전 시 0으로 리셋.
  event: EventKind | null = null; // 진행 중 이벤트
  eventTimer = 0;
  private nextEventAt: number;
  private rnd: () => number;
  private cool = 0;

  constructor(readonly machines: Machine[], readonly o: GridOpts) {
    this.rnd = rng(o.seed ?? 1);
    this.nextEventAt = o.seed !== undefined ? EVENT.INTERVAL : Infinity;
  }

  private rand() { return this.rnd(); }

  private draw1(m: Machine) { return m.draw + (m.spiking ? VOLATILE.SPIKE_AMT : 0); } // 스파이크 반영 실효 draw
  load() { return this.machines.reduce((s, m) => s + (m.on ? this.draw1(m) : 0), 0); }
  // 팀웍: 둘 다 생산 + 안전 부하(브라운아웃 밖)면 시너지. 무정전 스트릭은 시간에 램프업.
  bothProducing() {
    return this.machines.some((m) => m.on && m.owner === 0) && this.machines.some((m) => m.on && m.owner === 1);
  }
  synergyOn() { return this.bothProducing() && this.efficiency >= 1; }
  streakMult() { return 1 + TEAM.STREAK_MAX * Math.min(1, this.streak / TEAM.STREAK_FULL); }
  teamMult() { return (this.synergyOn() ? TEAM.SYNERGY : 1) * this.streakMult(); }
  surging() { return this.phase % SURGE_PERIOD < SURGE_DUR; }        // 수요 급증 창?
  demand() { return (this.surging() ? DEMAND_SURGE : 0) + (this.event === "shock" ? EVENT.SHOCK_DEMAND : 0); }
  // 유효 용량 = 기본 + 증설 − 열손실 + 이벤트(정전폭풍↓/정비↑). 소수 반올림.
  cap() {
    const ev = this.event === "storm" ? EVENT.STORM_CAP : this.event === "maint" ? EVENT.MAINT_CAP : 0;
    return Math.round(this.o.capacity + (this.boostTimer > 0 ? BOOST_AMT : 0) - this.heat * HEAT_PEN + ev);
  }
  done() { return this.produced >= this.o.quota; }
  mvp(): 0 | 1 | -1 { return this.contrib[0] === this.contrib[1] ? -1 : this.contrib[0] > this.contrib[1] ? 0 : 1; }

  // P1 역할: 켜진 기계 중 최대 부하 하나 강제 OFF(팀 구조 or 상대 기계 꺼버리기 = 발뺌 가능 트롤)
  shed(): boolean {
    if (this.tripped || this.shedCool > 0) return false;
    const on = this.machines.filter((m) => m.on);
    if (!on.length) return false;
    on.reduce((a, b) => (b.draw > a.draw ? b : a)).on = false;
    this.shedCool = SHED_CD;
    return true;
  }
  // P2 역할: 잠깐 용량↑ (밀어붙이기 or 아껴서 방치 = 발뺌 가능 트롤)
  boost(): boolean {
    if (this.tripped || this.boostCool > 0) return false;
    this.boostTimer = BOOST_DUR; this.boostCool = BOOST_CD;
    return true;
  }

  toggle(i: number) {
    const m = this.machines[i];
    if (this.tripped || !m) return;
    const before = this.load() + this.demand() > this.cap();
    m.on = !m.on;
    // 안전→초과로 '먼저 넘긴' 토글이면 그 owner를 크로서로 기록
    if (m.on && !before && this.load() + this.demand() > this.cap()) this.crosser = m.owner;
  }

  step(dt: number) {
    // 역할 타이머·수요 스케줄은 블랙아웃 중에도 흐름
    this.shedCool = Math.max(0, this.shedCool - dt);
    this.boostCool = Math.max(0, this.boostCool - dt);
    this.boostTimer = Math.max(0, this.boostTimer - dt);
    this.phase += dt;
    if (this.eventTimer > 0) { this.eventTimer -= dt; if (this.eventTimer <= 0) this.event = null; }

    // 랜덤 이벤트 스케줄 (seed 있을 때만) — 정전폭풍/수요쇼크/정비
    if (this.o.seed !== undefined && this.event === null && this.phase >= this.nextEventAt) {
      const r = this.rand();
      this.event = r < 0.4 ? "shock" : r < 0.75 ? "storm" : "maint";
      this.eventTimer = EVENT.DUR;
      this.nextEventAt = this.phase + EVENT.INTERVAL;
    }
    // 불안정 기계 스파이크
    for (const m of this.machines) if (m.volatile && m.on) {
      if (m.spiking) { m.spikeTimer = (m.spikeTimer ?? 0) - dt; if (m.spikeTimer <= 0) m.spiking = false; }
      else if (this.rand() < VOLATILE.SPIKE_CHANCE * dt) { m.spiking = true; m.spikeTimer = VOLATILE.SPIKE_DUR; }
    }

    if (this.tripped) { // 블랙아웃 쿨다운 — 조작 무시, 부하 0으로 수렴
      this.displayLoad += (0 - this.displayLoad) * Math.min(1, dt * 3);
      this.heat = Math.max(0, this.heat - HEAT_FALL * dt); // 정전 중 냉각
      this.cool -= dt;
      if (this.cool <= 0) { this.tripped = false; this.overFor = 0; }
      return;
    }
    const L = this.load(), cap = this.cap(), total = L + this.demand();
    this.displayLoad += (L - this.displayLoad) * Math.min(1, dt * 3); // 지연 미터(player 부분만 가려짐)

    // 열: 총부하가 용량 85% 넘으면 상승, 아니면 하강
    this.heat = Math.max(0, Math.min(1, this.heat + (total > cap * 0.85 ? HEAT_RISE : -HEAT_FALL) * dt));

    if (total > cap) {
      this.overFor += dt;
      this.overContrib[0] += this.machines.reduce((s, m) => s + (m.on && m.owner === 0 ? m.draw : 0), 0) * dt;
      this.overContrib[1] += this.machines.reduce((s, m) => s + (m.on && m.owner === 1 ? m.draw : 0), 0) * dt;
      if (this.overFor >= this.o.grace) { this.trip(); return; }
    } else {
      this.overFor = Math.max(0, this.overFor - dt * 2); // 초과 안 하면 회복
      if (this.overFor === 0) { this.overContrib = [0, 0]; this.crosser = null; }
    }

    // 브라운아웃: 총부하가 용량 90% 넘기면 전 기계 효율 하락(용량서 0.4까지).
    const soft = cap * 0.9;
    this.efficiency = total <= soft ? 1 : Math.max(0.4, 1 - ((total - soft) / (cap - soft)) * 0.6);

    this.streak += dt;                    // 무정전 지속 → 스트릭 램프업
    const mult = this.teamMult();         // 시너지 × 스트릭
    const gain0 = this.machines.reduce((s, m) => s + (m.on && m.owner === 0 ? m.output : 0), 0) * this.efficiency * mult * dt;
    const gain1 = this.machines.reduce((s, m) => s + (m.on && m.owner === 1 ? m.output : 0), 0) * this.efficiency * mult * dt;
    this.contrib[0] += gain0; this.contrib[1] += gain1; // 개인 점수는 안 깎임
    this.produced += gain0 + gain1;                     // 팀 점수만 트립 세트백
  }

  private trip() {
    this.tripped = true;
    this.blackouts++;
    this.cool = this.o.cooldown;
    this.blameLog = [Math.round(this.overContrib[0]), Math.round(this.overContrib[1])]; // 애매한 책임
    this.overContrib = [0, 0];
    this.penalized = this.crosser; // 먼저 넘긴 사람만 점수 페널티(환경 탓이면 null → 무적용)
    if (this.crosser !== null) this.contrib[this.crosser] -= CROSS_PENALTY;
    this.history.push({ t: Math.round(this.phase), crosser: this.crosser, blame: [this.blameLog[0], this.blameLog[1]] });
    this.crosser = null;
    this.streak = 0; // 무정전 스트릭 리셋 — 공유 손실
    this.produced = Math.max(0, this.produced - this.o.quota * 0.15); // 세트백
    for (const m of this.machines) m.on = false;
  }
}
