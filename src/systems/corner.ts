// 코너킥 코어 — 낙하 원 수축 · 헤딩 판정 · 수비 AI 1 + 골키퍼.
// 렌더 비의존. 이 저장소 첫 실시간 게임이라 `update(dt, dir)` 가 실제로 일한다.
//
// 이 게임의 전부는 인과 사슬 하나다:
//   **파워 정확도 → 낙하 원 반경 R0 → 헤더의 난이도 → 범인 이름.**
// 사슬 중 한 칸이라도 화면에서 안 보이면 "운으로 골이 들어간다"가 된다.
//
// 좌표는 캔버스 픽셀을 그대로 쓴다. 판정이 거리로 이뤄지므로 엔진이 경기장 기하를
// 알아야 하고, 씬이 따로 변환하면 판정과 그림이 어긋날 여지가 생긴다.

import { rng } from "../kits/rng";

export interface Pt { x: number; y: number }

// ── 경기장 ────────────────────────────────────────────────────────────────
// 아래 60px(420~480)은 파워 게이지와 상태줄 몫이다 — 필드를 480 까지 늘리면
// 게이지가 경기장 위에 올라타고, 이 저장소가 네 번 낸 겹침 버그를 다섯 번째로 낸다.
export const FIELD = { x: 30, y: 60, w: 580, h: 360 } as const;
export const GOAL = { x0: 250, x1: 390, y: FIELD.y } as const;
/** 왼쪽 코너 고정. 좌/우 선택은 세로 조각 다음이다. */
export const CORNER: Pt = { x: FIELD.x, y: FIELD.y };
/**
 * 골키퍼 출동 존. 낙하점이 여기 들어오면 GK 가 나온다 —
 * 골문 앞은 헤딩이 쉽지만 GK 가 먹고, 멀면 GK 는 안 나오지만 수비수가 붙는다.
 * 딜레마는 이 사각형 하나에서 나온다.
 */
export const GK_ZONE = { x0: 240, x1: 400, y0: FIELD.y, y1: 150 } as const;
export const GK_HOME: Pt = { x: (GOAL.x0 + GOAL.x1) / 2, y: FIELD.y + 15 };
/** 조준 가능 범위. 골라인 뒤나 하프라인 근처로는 올릴 수 없다. */
export const AIM_ZONE = { x0: FIELD.x + 24, x1: FIELD.x + FIELD.w - 24, y0: FIELD.y + 12, y1: 340 } as const;

// ── 밸런스 노브 ────────────────────────────────────────────────────────────
// 전부 근거 없이 고른 값이다. 이 게임은 이 값들이 곧 재미라서 사람이 쳐보고 정해야 한다.
export const K = {
  FLIGHT: 1.7,        // 비행 시간(초)
  R_MIN: 8,           // 완벽한 파워일 때 낙하 원 반경
  R_MAX: 110,         // 최악일 때
  BIG: 70,            // R0 가 이보다 크면 못 넣어도 키커 탓("공이 나빴다")
  POWER_SPEED: 1.55,  // 게이지 왕복 속도(1/초)
  HEAD_SPEED: 150,
  /**
   * **헤더와 같은 속도다.** 처음엔 135 로 느리게 줬는데, 지연까지 겹치니 헤더가
   * 구조적으로 늘 먼저 도착해 수비수가 무의미해졌다(이상적 헤더 기준 2%).
   * 속도를 맞추면 승부가 시작 기하와 얼마나 곧게 달렸는가로 넘어간다 — 그게 경주다.
   */
  DEF_SPEED: 150,
  GK_SPEED: 120,
  /**
   * 반응 지연(초). 이게 없으면 둘 다 벽이 된다 — GK 는 존 안을 100% 먹고,
   * 수비수는 헤더가 어디로 가든 같은 목표를 같은 속도로 쫓아 먼저 붙는다.
   * 헤더는 그 위에 **파워 단계부터 미리 붙을 수 있다**는 이점을 하나 더 갖는다.
   * 0.25 는 이상적 헤더 기준 수비수 승률 15% 가 나오는 값이다(사람은 더 높을 것).
   */
  DEF_DELAY: 0.25,
  GK_DELAY: 0.85,
  DEF_MARK: [40, 60] as [number, number],   // 전담 마크는 헤더를 이만큼 떨어져 선다
  DEF_JITTER: 18,     // 지역 방어 자리의 흔들림 — 같은 자리면 같은 수가 늘 통한다
  /**
   * 낙하점에 "닿았다"고 보는 거리. **헤더와 수비수가 같은 값을 쓴다** — 같은 물리적
   * 사건이라서다. 예전에 수비수만 30 으로 헐겁게 줬더니 둘 다 원 중심을 쫓을 때
   * 수비수의 도착 판정이 기하학적으로 먼저 참이 돼서 **구조적으로 늘 이겼다.**
   */
  REACH: 26,
  CATCH: 26,          // GK 가 걷어내는 거리
  WINDOW: 0.18,       // 점프 허용 오차(초)
  PERFECT: 0.07,      // 이 안이면 먼 쪽 포스트를 노린다
  GK_SPAN: 60,        // GK 가 골라인에서 커버하는 폭 (골문 바로 앞 기준)
  /**
   * 커버 폭이 배로 늘어나는 거리. **깊게 올리면 안전하지만 골이 안 된다** —
   * 이게 없으면 GK 도 수비수도 못 오는 뒤쪽이 정답이 돼서 딜레마가 사라진다.
   * 골문 중앙에서 약 234px 을 넘어가면 먼 포스트까지 덮여 사실상 골이 불가능하다.
   */
  GK_SPAN_GROW: 220,
  GK_LINE: 26,        // GK 가 이만큼 안에 있으면 아직 골문을 지키는 것으로 본다
} as const;

// ── 판정 ──────────────────────────────────────────────────────────────────
export type Outcome = "goal" | "keeperOut" | "defender" | "badBall" | "lateRun" | "mistimed" | "keeperSave";
export type Blame = "none" | "kicker" | "header";

/**
 * 실패 사유는 퍼센트가 아니라 **이름**이다. MIM-001 이 퍼센트 페이오프로 취소됐다.
 * `골키퍼가 나왔다`(GK 가 존으로 뛰어나와 걷어냄)와 `골키퍼 선방`(GK 가 골문을 지키고
 * 있었고 슛이 그 코스로 갔음)은 정반대 상황이라 한 이름으로 합치지 않는다.
 */
export const OUTCOME: Record<Outcome, { name: string; blame: Blame }> = {
  goal: { name: "골!", blame: "none" },
  keeperOut: { name: "골키퍼가 나왔다", blame: "kicker" },
  defender: { name: "수비가 먼저 봤다", blame: "kicker" },
  badBall: { name: "공이 나빴다", blame: "kicker" },
  lateRun: { name: "늦게 붙었다", blame: "header" },
  mistimed: { name: "머리 타이밍", blame: "header" },
  keeperSave: { name: "골키퍼 선방", blame: "header" },
};

export interface Judge {
  outcome: Outcome;
  corner: number;      // 0-based
  kicker: number;
  accuracy: number;    // 0..1
  r0: number;
  headDist: number;
  defDist: number;
  gkDist: number;
  timingErr: number;   // 점프를 안 했으면 Infinity
  gkOut: boolean;
  /** 낙하점에 닿은 시각. 경합의 근거다 — 화면에 그대로 적는다. */
  headAt: number | null;
  defAt: number | null;
  /** 슛 조준점 x. goal·keeperSave 일 때만 의미가 있다. */
  shotX: number;
  /** 이 거리에서 GK 가 덮는 폭. "왜 막혔는지"를 화면에 적는 데 쓴다. */
  gkSpan: number;
}

export type Stage = "aim" | "power" | "flight" | "result" | "done";

export interface CornerOpts {
  corners: number;
  seed?: number;
}

/**
 * 수비 4인의 시작 자리. 실제 코너킥처럼 **지역 방어 3 + 전담 마크 1** 이다.
 * 넷을 다 헤더에게 붙이면 어디로 올려도 같은 상황이 되고, 넷을 다 지역에 두면
 * 깊게 올려 아무도 없는 곳으로 도망갈 수 있다.
 *
 * 자리가 흩어져 있으므로 **어디로 올리느냐가 누구를 상대하느냐를 정한다** —
 * 수비가 하나였을 때는 없던 결정이다.
 */
export const DEF_SLOTS: readonly (Pt | "mark")[] = [
  { x: 262, y: 108 },   // 니어 포스트
  { x: 320, y: 130 },   // 골 에어리어 중앙
  { x: 378, y: 108 },   // 파 포스트
  "mark",               // 헤더 전담
] as const;

export const GOAL_MID = (GOAL.x0 + GOAL.x1) / 2;
export const GOAL_CENTER: Pt = { x: GOAL_MID, y: GOAL.y };

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const inField = (p: Pt) => p.x >= FIELD.x && p.x <= FIELD.x + FIELD.w && p.y >= FIELD.y && p.y <= FIELD.y + FIELD.h;

/** 목표점으로 최대 `sp*dt` 만큼 다가간다. 지나치지 않는다. */
function step(p: Pt, to: Pt, sp: number, dt: number) {
  const dx = to.x - p.x, dy = to.y - p.y, d = Math.hypot(dx, dy);
  if (d < 1e-6) return;
  const m = Math.min(d, sp * dt);
  p.x += (dx / d) * m;
  p.y += (dy / d) * m;
}

export class CornerKick {
  stage: Stage = "aim";
  /** 몇 번째 코너인가 (0-based). 키커는 `corner % 2` — 코너마다 역할이 바뀐다. */
  corner = 0;
  goals = 0;
  /** 키커별 [올린 수, 골]. 협동이지만 개인 기여는 남는다(DESIGN.md 원칙 4). */
  readonly byKicker: [number, number][] = [[0, 0], [0, 0]];
  readonly history: Judge[] = [];

  aim: Pt = { x: 320, y: 160 };
  /** 게이지 값 0..1. 왕복한다. */
  power = 0;
  private powerDir = 1;
  accuracy = 0;
  r0 = 0;
  /** 실제 낙하점. 비행 시작 시 확정한다 — 착지 때 뽑으면 그동안 그린 원이 거짓말이 된다. */
  land: Pt = { x: 320, y: 160 };
  /** 비행 경과(초). */
  t = 0;
  head: Pt = { x: 320, y: 250 };
  /** 수비 4인. 지역 방어 3 + 전담 마크 1 — `DEF_SLOTS` 참고. */
  defs: Pt[] = [];
  gk: Pt = { ...GK_HOME };
  gkOut = false;
  /** 지금 공에 나가는 수비수. 씬이 표시해 "누가 오는지"를 보이게 한다. */
  challenger = 0;
  jumpAt: number | null = null;
  /**
   * 낙하점에 처음 닿은 시각(초). 수비는 **넷 중 가장 먼저 닿은 사람**의 시각이다.
   * **경합은 거리가 아니라 "먼저 왔는가"로 가른다** —
   * 거리로 재면 목표점에 정확히 붙는 AI 가 근사값일 수밖에 없는 사람을 항상 이긴다.
   * 명세가 처음부터 "반 발 먼저"라고 적어놓고 구현만 거리 비교였다.
   */
  headAt: number | null = null;
  defAt: number | null = null;
  last: Judge | null = null;

  private rnd: () => number;

  constructor(readonly o: CornerOpts) {
    this.rnd = o.seed === undefined ? Math.random : rng(o.seed);
    this.setup();
  }

  get kicker() { return this.corner % 2; }
  get header() { return 1 - this.kicker; }
  get done() { return this.stage === "done"; }
  get cornersLeft() { return Math.max(0, this.o.corners - this.corner); }
  /** 비행 진행도 0..1. */
  get k() { return clamp(this.t / K.FLIGHT, 0, 1); }

  /**
   * 지금 화면에 보이는 낙하 원. **중심이 조준점에서 실제 낙하점으로 미끄러진다.**
   * 중심을 처음부터 진실에 두면 첫 프레임에 답이 보이고 "포착"이라는 동사가 사라진다.
   * 이 정의 덕에 `land` 는 매 시점의 원 안에 항상 들어 있다 — 원이 거짓말을 하지 않는다.
   */
  circle(at = this.k): { x: number; y: number; r: number } {
    return {
      x: this.aim.x + (this.land.x - this.aim.x) * at,
      y: this.aim.y + (this.land.y - this.aim.y) * at,
      r: this.r0 * (1 - at),
    };
  }

  /**
   * 이 지점에서 슛할 때 GK 가 덮는 골문 폭. **멀수록 넓다** — 공이 오래 날아
   * GK 가 자리를 잡을 시간이 생긴다. 깊게 올리면 수비수도 GK 도 못 오지만 골도 안 된다는
   * 것이 이 한 줄에서 나온다. 조준 단계에서 미리 보여줘 결정에 쓰이게 한다.
   */
  coverSpan(at: Pt = this.land) {
    return Math.min(GOAL.x1 - GOAL.x0, K.GK_SPAN * (1 + dist(at, GOAL_CENTER) / K.GK_SPAN_GROW));
  }

  /**
   * 새 코너 준비. 수비수는 **헤더를 마크하고 선다** — 코너킥에서 실제로 그렇고,
   * 고정 위치에 두면 "깊게 올리면 수비수가 못 온다"가 정답이 돼 버린다.
   * 마크 방향만 매번 달라 같은 수가 늘 통하지는 않는다.
   */
  private setup() {
    this.stage = "aim";
    this.power = 0; this.powerDir = 1;
    this.accuracy = 0; this.r0 = 0;
    this.t = 0; this.jumpAt = null; this.gkOut = false;
    this.headAt = null; this.defAt = null;
    this.head = { x: 320, y: 250 };
    const [lo, hi] = K.DEF_MARK;
    this.defs = DEF_SLOTS.map((slot) => {
      if (slot === "mark") {
        const ang = this.rnd() * Math.PI * 2, d = lo + this.rnd() * (hi - lo);
        return this.inside(this.head.x + Math.cos(ang) * d, this.head.y + Math.sin(ang) * d);
      }
      const j = K.DEF_JITTER;
      return this.inside(slot.x + (this.rnd() - 0.5) * 2 * j, slot.y + (this.rnd() - 0.5) * 2 * j);
    });
    this.gk = { ...GK_HOME };
  }

  private inside(x: number, y: number): Pt {
    return { x: clamp(x, FIELD.x, FIELD.x + FIELD.w), y: clamp(y, FIELD.y, FIELD.y + FIELD.h) };
  }

  /** 키커가 낙하점을 정한다. 조준 범위 밖은 잘라낸다. */
  aimAt(x: number, y: number) {
    if (this.stage !== "aim") return;
    this.aim = { x: clamp(x, AIM_ZONE.x0, AIM_ZONE.x1), y: clamp(y, AIM_ZONE.y0, AIM_ZONE.y1) };
    this.stage = "power";
  }

  /**
   * 파워 게이지를 멈춘다. **이 한 줄이 게임의 중심이다** —
   * 키커의 정확도가 그대로 헤더의 난이도가 된다.
   */
  stopPower() {
    if (this.stage !== "power") return;
    this.accuracy = 1 - Math.abs(this.power - 0.5) * 2;
    this.r0 = K.R_MIN + (1 - this.accuracy) * (K.R_MAX - K.R_MIN);
    this.land = this.scatter();
    this.gkOut = this.land.x >= GK_ZONE.x0 && this.land.x <= GK_ZONE.x1
      && this.land.y >= GK_ZONE.y0 && this.land.y <= GK_ZONE.y1;
    this.stage = "flight";
    // 파워 단계에서 이미 낙하점에 서 있었다면 그 순간이 도착이다 —
    // 조준을 읽고 미리 붙은 것은 실력이므로 공짜로 뺏지 않는다.
    this.mark(0);
  }

  /**
   * 조준점에서 R0 안 어딘가로 흩뿌린다.
   * 판 밖으로 나가면 **오프셋을 줄여서** 안으로 들인다 — 잘라내면 원 밖으로 나가
   * "낙하점은 항상 원 안"이라는 불변식이 깨진다. 줄이는 것은 불변식을 지킨다.
   */
  private scatter(): Pt {
    const ang = this.rnd() * Math.PI * 2;
    let d = this.r0 * this.rnd();
    for (let i = 0; i < 8; i++) {
      const p = { x: this.aim.x + Math.cos(ang) * d, y: this.aim.y + Math.sin(ang) * d };
      if (inField(p)) return p;
      d *= 0.6;
    }
    return { ...this.aim };
  }

  /** 헤더의 점프. 비행 중 한 번만 기록된다. */
  jump() {
    if (this.stage !== "flight" || this.jumpAt !== null) return;
    this.jumpAt = this.t;
  }

  /** 결과를 보고 다음 코너로. 마지막이면 끝난다. */
  next() {
    if (this.stage !== "result") return;
    this.corner++;
    if (this.corner >= this.o.corners) { this.stage = "done"; return; }
    this.setup();
  }

  /**
   * @param dir 헤더의 이동 방향(정규화 전). 파워 단계부터 움직일 수 있다 —
   *   키커가 게이지를 재는 동안 헤더가 할 일이 없으면 안 된다.
   */
  update(dt: number, dir: Pt = { x: 0, y: 0 }) {
    if (this.stage === "power") {
      this.power += this.powerDir * K.POWER_SPEED * dt;
      if (this.power >= 1) { this.power = 1; this.powerDir = -1; }
      if (this.power <= 0) { this.power = 0; this.powerDir = 1; }
    }
    if (this.stage === "power" || this.stage === "flight") this.moveHead(dt, dir);
    if (this.stage !== "flight") return;

    this.t += dt;
    const c = this.circle();
    // 수비수는 **원 중심**을 쫓는다. 헤더를 쫓으면 술래잡기가 되고,
    // 같은 목표점을 향한 경주여야 "반 발 먼저"가 성립한다.
    // **가장 가까운 한 명만 공에 나간다.** 넷이 다 달려들면 경주가 아니라 포위가 되고
    // (이상적 헤더 상대 수비 45% · 골 23%), 실제 코너킥에서도 지역을 버리고 넷이
    // 몰려가지는 않는다. 나머지 셋은 자리를 지킨다 —
    // 그래서 **어디로 올리느냐가 누구를 상대하느냐**를 정한다.
    this.challenger = this.nearestDef(c);
    if (this.t >= K.DEF_DELAY) step(this.defs[this.challenger], c, K.DEF_SPEED, dt);
    // GK 는 존 안일 때만, 그것도 늦게 나온다.
    if (this.gkOut && this.t >= K.GK_DELAY) step(this.gk, this.land, K.GK_SPEED, dt);

    if (this.t >= K.FLIGHT) this.t = K.FLIGHT;
    this.mark(this.t);
    if (this.t >= K.FLIGHT) this.finish();
  }

  /** 낙하점에 처음 닿은 시각을 기록한다. 한 번 찍히면 안 바뀐다. */
  private mark(t: number) {
    if (this.headAt === null && dist(this.head, this.land) <= K.REACH) this.headAt = t;
    // **수비는 공을 읽기 전(`DEF_DELAY`)까지 경합에 낀 것이 아니다.** 지역 수비는 박스를
    // 덮고 서 있으므로, 서 있는 것만으로 도착을 인정하면 그 근처에 떨어지는 공은
    // t=0 에 이미 진 공이 된다(이상적 헤더 상대 수비 45%). 뛰어든 헤더가 서 있던
    // 수비를 이기는 것이 공중볼 경합이고, 그래서 **미리 붙을 수 있는 정확한 크로스**가
    // 값을 갖는다 — 인과 사슬이 여기로 흐른다.
    if (this.defAt === null && t >= K.DEF_DELAY && this.defDist() <= K.REACH) this.defAt = t;
  }

  private moveHead(dt: number, dir: Pt) {
    const m = Math.hypot(dir.x, dir.y);
    if (m < 1e-6) return;
    this.head.x = clamp(this.head.x + (dir.x / m) * K.HEAD_SPEED * dt, FIELD.x, FIELD.x + FIELD.w);
    this.head.y = clamp(this.head.y + (dir.y / m) * K.HEAD_SPEED * dt, FIELD.y, FIELD.y + FIELD.h);
  }

  /**
   * 착지 판정. **확률 없음** — 전부 화면에 보이는 거리와 시간으로만 결정된다.
   * 순서가 곧 규칙이다: 위에서 걸리는 것이 결과다.
   */
  /** 넷 중 낙하점에 가장 가까운 수비수의 거리. */
  defDist() { return Math.min(...this.defs.map((d) => dist(d, this.land))); }

  /** 이 지점에 가장 가까운 수비수의 인덱스. */
  nearestDef(to: Pt) {
    let best = 0;
    for (let i = 1; i < this.defs.length; i++)
      if (dist(this.defs[i], to) < dist(this.defs[best], to)) best = i;
    return best;
  }

  private finish() {
    const headDist = dist(this.head, this.land);
    const defDist = this.defDist();
    const gkDist = dist(this.gk, this.land);
    const timingErr = this.jumpAt === null ? Infinity : Math.abs(this.jumpAt - K.FLIGHT);

    // 점프가 완벽하면 먼 쪽 포스트, 아니면 골문 가운데.
    // GK 가 골문을 지키고 있으면 가운데는 막히고 먼 포스트만 통한다 —
    // 존 딜레마(GK 를 끌어내면 가운데도 들어간다)의 실체가 이것이다.
    const far = this.land.x < GOAL_MID ? GOAL.x1 - 8 : GOAL.x0 + 8;
    const shotX = timingErr <= K.PERFECT ? far : GOAL_MID;
    const gkSpan = this.coverSpan();

    const outcome = ((): Outcome => {
      if (this.gkOut && gkDist <= K.CATCH) return "keeperOut";
      // 헤더가 아예 못 붙었으면 수비 얘기는 부차적이다 — 왜 못 붙었는지가 정보다.
      if (headDist > K.REACH) return this.r0 > K.BIG ? "badBall" : "lateRun";
      // 둘 다 붙었다. **먼저 온 쪽이 이긴다** — 거리로 재면 AI 가 늘 이긴다.
      // 같은 프레임에 닿은 진짜 동시 도착일 때만 가까운 쪽으로 가른다.
      if (this.defAt !== null && (this.headAt === null || this.defAt < this.headAt
        || (this.defAt === this.headAt && defDist < headDist))) return "defender";
      if (timingErr > K.WINDOW) return "mistimed";
      const guarding = this.gk.y <= GOAL.y + K.GK_LINE && Math.abs(shotX - this.gk.x) <= gkSpan / 2;
      return guarding ? "keeperSave" : "goal";
    })();

    const j: Judge = {
      outcome, corner: this.corner, kicker: this.kicker,
      accuracy: this.accuracy, r0: this.r0,
      headDist, defDist, gkDist, timingErr, gkOut: this.gkOut, shotX, gkSpan,
      headAt: this.headAt, defAt: this.defAt,
    };
    this.last = j;
    this.history.push(j);
    this.byKicker[this.kicker][0]++;
    if (outcome === "goal") { this.goals++; this.byKicker[this.kicker][1]++; }
    this.stage = "result";
  }
}
