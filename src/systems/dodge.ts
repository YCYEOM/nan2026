// 총알피하기 코어 — 색 요격 · 주인 없는 탄 · 가속/축소.
// 렌더 비의존. 실시간이라 `update(dt, dirs)` 가 실제로 일한다(코너킥에 이어 두 번째).
//
// 이 게임의 전부는 색 하나다:
//   **내 색 총알은 나에게 닿으면 사라지고, 남에게 닿으면 죽인다.**
// 그래서 내 색이 상대에게 갈 때 내가 몸으로 가로막아야 한다 —
// 피하는 게임인데 다가가는 게임이 되는 것이 여기서 나온다.
//
// 좌표는 캔버스 픽셀을 그대로 쓴다. 판정이 거리로 이뤄지므로 엔진이 아레나 기하를 안다.

import { rng } from "../kits/rng";

export interface Pt { x: number; y: number }

export const ARENA: Pt = { x: 320, y: 240 };

/**
 * 판은 원 하나가 아니라 **부채꼴 조각의 배열**이다 (CON-007).
 * 조각마다 단계를 가지고 단계가 곧 반지름이라, 방향마다 판 끝이 다르다.
 * 이것이 없으면 좁아짐이 그냥 원이 작아지는 것이고, 복구가 걸릴 자리도 없다.
 */
export const PLATES = 14;
/** 단계 → 반지름. 양 끝은 CON-006 의 `R_MIN` 110 · `R0` 190 을 그대로 물려받는다. */
export const PLATE_LV = [110, 137, 163, 190] as const;
export const TOP_LV = PLATE_LV.length - 1;
/** 가장 넓을 때의 반지름. 총알은 공중을 날므로 파인 조각과 무관하게 이 값을 쓴다. */
export const MAX_R = PLATE_LV[TOP_LV];

// ── 밸런스 노브 ────────────────────────────────────────────────────────────
// 전부 근거 없이 고른 값이다. 이 게임은 이 값들이 곧 재미라서 사람이 쳐보고 정해야 한다.
export const K = {
  LIVES: 3,
  SPEED: 165,         // 사람 이동 속도
  BODY: 11,           // 몸 반지름. 요격 판정은 BODY + SHOT 이다
  SHOT: 5,            // 총알 반지름
  BULLET_SPEED: 200,
  /**
   * 예고 시간(초). **이 게임의 최대 미지수다.**
   * 길면 전부 막아서 긴장이 없고, 짧으면 요격이 아예 성립하지 않아
   * "서로 보완"이라는 컨셉의 근거가 통째로 사라진다.
   */
  TELEGRAPH: 1.1,
  TELEGRAPH_MIN: 0.55,
  TELEGRAPH_DECAY: 0.012,   // 초당 감소
  /** 발사 간격(초). 시간이 갈수록 좁아진다. */
  GAP: 1.15,
  GAP_MIN: 0.42,
  GAP_DECAY: 0.011,
  /** 한 번에 몇 발. 시간이 갈수록 는다 — 원안의 "쏟아진다"가 이 곡선이다. */
  BURST_AT: [0, 22, 45, 70] as const,   // 이 초를 넘길 때마다 +1발
  BURST_MAX: 4,
  /**
   * 주인 없는 탄 비율. 요격 대형을 깨는 장치다 —
   * 너무 많으면 협동이 무의미해지고(어차피 못 막는다),
   * 너무 적으면 둘이 붙어 있는 것이 무료 정답이 된다.
   */
  NEUTRAL_RATE: 0.25,
  SPAWN_PAD: 40,      // 아레나 밖 이만큼 떨어진 곳에서 생성한다
  /**
   * 조각 붕괴 주기(초). CON-006 의 연속 축소(`SHRINK`)를 대신한다 —
   * 좁아짐이 곡선이 아니라 **사건**이 되고, 그래야 복구가 붙을 자리가 생긴다.
   */
  COLLAPSE: 2.0,
  COLLAPSE_MIN: 0.8,
  COLLAPSE_DECAY: 0.012,
  /**
   * 요격 몇 번에 조각 하나가 돌아오는가. **둘의 공동 게이지다.**
   * 손으로 고른 값이 아니다 — 판당 `blocked` 절대 횟수를 재서
   * 복구/붕괴 비율이 0.3~0.6 이 되도록 정했다(DGE-002).
   * 이 비율이 1 을 넘으면 판이 안 끝난다. 테스트가 관계로 못 박는다.
   */
  RESTORE_BLOCKS: 2,
} as const;

/** 총알 색. 인덱스가 곧 주인이고 `-1` 은 주인이 없다는 뜻이다. */
export const NEUTRAL = -1;

export interface Bullet {
  id: number;
  /** 0·1 은 그 플레이어의 색, `NEUTRAL` 은 주인 없음. */
  owner: number;
  /** 누구를 조준했나. 색 탄은 반드시 `1 - owner` 다. */
  target: number;
  x: number; y: number;
  vx: number; vy: number;
  /** 남은 예고 시간. 0 이 되면 날기 시작한다. */
  wait: number;
  /** 예고선을 그릴 도착점 — 조준 시점의 대상 위치다. 총알은 이 직선을 따라간다. */
  aimX: number; aimY: number;
}

/** 한 발이 끝난 사연. 화면이 이름으로 적고 결산이 집계한다. */
export type Fate = "blocked" | "hit" | "neutralHit" | "escaped";

export interface Event {
  fate: Fate;
  /** 총알 주인. `NEUTRAL` 이면 주인 없는 탄. */
  owner: number;
  /** 누가 막았나 / 누가 맞았나. `escaped` 면 -1. */
  who: number;
  t: number;
}

/** 지형이 바뀐 사연. 색 탄의 인과(`Event`)와 섞지 않는다 — 다른 종류다. */
export interface PlateEvent {
  kind: "collapse" | "restore";
  /** 조각 번호 0..PLATES-1 */
  i: number;
  t: number;
}

export interface DodgeOpts { seed?: number }

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export class Dodge {
  /** 두 사람. 인덱스가 곧 색이다. */
  players: Pt[] = [{ x: ARENA.x - 40, y: ARENA.y }, { x: ARENA.x + 40, y: ARENA.y }];
  lives: number[] = [K.LIVES, K.LIVES];
  /** 각자 막은 수 / 자기 색인데 못 막아서 상대가 맞은 수. 결산의 전부다. */
  blocked: number[] = [0, 0];
  leaked: number[] = [0, 0];
  bullets: Bullet[] = [];
  /** 버틴 시간(초). 성적이자 난이도 곡선의 입력이다. */
  t = 0;
  /** 조각별 단계. 인덱스가 곧 방향이고 값이 곧 반지름 단계다. */
  plates: number[] = Array.from({ length: PLATES }, () => TOP_LV);
  /** 요격 공동 게이지. 협동이므로 누가 막았든 같은 통에 들어간다. */
  gauge = 0;
  /** 무너진 단계 수 / 돌아온 단계 수. **불변식(복구 < 붕괴)의 측정치다.** */
  collapsed = 0;
  restored = 0;
  over = false;
  /** 방금 일어난 일들. 씬이 읽고 비운다. */
  readonly events: Event[] = [];
  /** 방금 무너지고 솟은 조각들. 씬이 읽고 비운다. */
  readonly plateEvents: PlateEvent[] = [];

  private nextId = 1;
  private spawnIn = 0.8;   // 첫 발까지의 여유 — 시작하자마자 맞으면 억울하다
  private collapseIn: number = K.COLLAPSE;
  private rnd: () => number;

  constructor(o: DodgeOpts = {}) {
    this.rnd = o.seed === undefined ? Math.random : rng(o.seed);
  }

  /** 지금 난이도. 전부 하한이 있고 시간에만 의존한다 — 같은 시각이면 같은 값이다. */
  get telegraph() { return Math.max(K.TELEGRAPH_MIN, K.TELEGRAPH - this.t * K.TELEGRAPH_DECAY); }
  get gap() { return Math.max(K.GAP_MIN, K.GAP - this.t * K.GAP_DECAY); }
  get burst() {
    let n = 1;
    for (const at of K.BURST_AT) if (this.t >= at) n = Math.min(K.BURST_MAX, n + (at === 0 ? 0 : 1));
    return n;
  }

  /** 지금 붕괴 주기. 시간에만 의존한다 — 같은 시각이면 같은 값이다. */
  get collapseGap() { return Math.max(K.COLLAPSE_MIN, K.COLLAPSE - this.t * K.COLLAPSE_DECAY); }

  /** 요격/피격 판정 거리. 몸과 총알이 닿으면 된다. */
  get touch() { return K.BODY + K.SHOT; }

  /** 이 점이 어느 조각 위인가. 각도 하나로 정해진다. */
  plateIndex(p: Pt): number {
    const a = Math.atan2(p.y - ARENA.y, p.x - ARENA.x);
    const turn = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return Math.min(PLATES - 1, Math.floor((turn / (Math.PI * 2)) * PLATES));
  }

  /** 이 방향의 판 끝. **원 하나였던 `radius` 를 대신한다.** */
  radiusAt(p: Pt): number { return PLATE_LV[this.plates[this.plateIndex(p)]]; }

  /** 남은 단계 합. 결산의 성적 지표이자 모수를 가진 숫자다(DESIGN.md 원칙 4). */
  get intact() { return this.plates.reduce((a, b) => a + b, 0); }
  get maxIntact() { return PLATES * TOP_LV; }

  /** 두 사람의 중점. 주인 없는 탄의 조준점이자 "붙어 있기"의 대가가 계산되는 자리다. */
  midpoint(): Pt {
    const [a, b] = this.players;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  /** 둘 사이 거리. 요격 난이도와 주인 없는 탄의 위험이 여기서 갈린다. */
  get spread() { return dist(this.players[0], this.players[1]); }

  /**
   * 판 안으로 가둔다. **원 하나가 아니라 그 사람 각도의 조각 반지름**을 쓴다 —
   * 안쪽으로 당기면 각도가 안 바뀌므로 같은 조각으로 수렴한다.
   * 발밑 조각이 무너지면 그 자리에서 안쪽으로 밀려 들어온다.
   */
  private confine(p: Pt) {
    const d = dist(p, ARENA), lim = this.radiusAt(p) - K.BODY;
    if (d <= lim) return;
    const s = lim / d;
    p.x = ARENA.x + (p.x - ARENA.x) * s;
    p.y = ARENA.y + (p.y - ARENA.y) * s;
  }

  /**
   * 조각 하나를 한 단계 무너뜨린다. **무작위로 고른다** —
   * 가장 바깥 단계부터 고르면 판이 균일하게 내려가 그냥 작아지는 원이 되고,
   * 조각으로 나눈 이유가 사라진다. 무작위여야 톱니가 생긴다.
   */
  private collapse() {
    const live: number[] = [];
    for (let i = 0; i < PLATES; i++) if (this.plates[i] > 0) live.push(i);
    if (!live.length) return;
    const i = live[Math.floor(this.rnd() * live.length)];
    this.plates[i]--;
    this.collapsed++;
    this.plateEvents.push({ kind: "collapse", i, t: this.t });
  }

  /**
   * 한 발 생성. **색 탄은 반드시 반대 색을 조준한다** —
   * 자기 색을 조준하면 그냥 흡수하면 그만이라 규칙이 죽는다.
   */
  private spawn() {
    const neutral = this.rnd() < K.NEUTRAL_RATE;
    const owner = neutral ? NEUTRAL : (this.rnd() < 0.5 ? 0 : 1);
    const target = neutral ? (this.rnd() < 0.5 ? 0 : 1) : 1 - owner;
    // **주인 없는 탄은 둘의 중간을 노린다.** 무작위 한 명을 노리면 컨셉이 적어둔
    // "붙어 있으면 한 발에 둘 다 걸린다"가 코드에 없는 말이 된다 —
    // 그러면 붙어 있기가 공짜가 되고, 조준점이 늘 코앞이라 요격도 공짜가 된다
    // 중점을 노려야 떨어져 있을 이유가 생기고, 떨어지면 요격이 달려가야 하는 일이 된다.
    // (조준 산포도 넣어봤지만 빗나감만 늘려 판이 쉬워졌다 — 값을 못 해서 지웠다.)
    const tp = neutral ? this.midpoint() : this.players[target];

    // 판 밖 360도 랜덤 지점에서 조준한다. 총알은 공중이라 파인 조각과 무관하다
    const ang = this.rnd() * Math.PI * 2;
    const r = MAX_R + K.SPAWN_PAD;
    const x = ARENA.x + Math.cos(ang) * r, y = ARENA.y + Math.sin(ang) * r;
    const dx = tp.x - x, dy = tp.y - y, len = Math.hypot(dx, dy) || 1;

    this.bullets.push({
      id: this.nextId++, owner, target,
      x, y,
      vx: (dx / len) * K.BULLET_SPEED, vy: (dy / len) * K.BULLET_SPEED,
      wait: this.telegraph,
      aimX: tp.x, aimY: tp.y,
    });
  }

  /**
   * @param dirs 두 사람의 이동 방향(정규화 전). 인덱스가 곧 플레이어다.
   */
  update(dt: number, dirs: Pt[] = [{ x: 0, y: 0 }, { x: 0, y: 0 }]) {
    if (this.over) return;
    this.t += dt;

    this.collapseIn -= dt;
    if (this.collapseIn <= 0) { this.collapse(); this.collapseIn = this.collapseGap; }

    this.players.forEach((p, i) => {
      const d = dirs[i] ?? { x: 0, y: 0 };
      const m = Math.hypot(d.x, d.y);
      if (m > 1e-6) { p.x += (d.x / m) * K.SPEED * dt; p.y += (d.y / m) * K.SPEED * dt; }
      this.confine(p);
    });

    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      for (let i = 0; i < this.burst; i++) this.spawn();
      this.spawnIn = this.gap;
    }

    const keep: Bullet[] = [];
    for (const b of this.bullets) {
      // 예고 중에는 아무도 안 맞는다 — 요격은 예고 없이는 불가능하다
      if (b.wait > 0) { b.wait -= dt; keep.push(b); continue; }
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      const res = this.collide(b);
      if (res === null) {
        if (dist(b, ARENA) > MAX_R + K.SPAWN_PAD) {
          this.events.push({ fate: "escaped", owner: b.owner, who: -1, t: this.t });
        } else keep.push(b);
      }
    }
    this.bullets = keep;
    if (this.lives.some((l) => l <= 0)) this.over = true;
  }

  /**
   * 이 총알이 누구와 닿았나. 닿았으면 사연을 남기고 `true` 계열을 돌려준다.
   * **판정은 색 하나로 갈린다** — 내 색이면 소멸, 남의 색이면 생명 −1,
   * 주인 없는 탄은 누구든 죽이고 아무도 못 막는다.
   */
  private collide(b: Bullet): Fate | null {
    for (let i = 0; i < this.players.length; i++) {
      if (dist(b, this.players[i]) > this.touch) continue;
      if (b.owner === i) {
        // 자기 색 — 몸으로 지운다. 다치지 않는다.
        this.blocked[i]++;
        this.events.push({ fate: "blocked", owner: b.owner, who: i, t: this.t });
        this.earn(this.players[i]);
        return "blocked";
      }
      // 남의 색이거나 주인 없는 탄 — 맞는다
      this.lives[i]--;
      if (b.owner !== NEUTRAL) this.leaked[b.owner]++;   // 막았어야 할 사람의 몫
      const fate: Fate = b.owner === NEUTRAL ? "neutralHit" : "hit";
      this.events.push({ fate, owner: b.owner, who: i, t: this.t });
      return fate;
    }
    return null;
  }

  /**
   * 요격 하나를 게이지에 넣는다. 차면 **막은 바로 그 자리**의 조각이 한 단계 오른다.
   *
   * 어느 조각이 돌아오는지가 이 규칙의 전부다 — 무작위로 돌려주면 인과가 화면에
   * 안 잡히고 "가끔 판이 넓어진다"가 된다. 몸을 던진 자리에서 땅이 솟아야
   * 원인과 보상이 한 프레임에 들어온다.
   *
   * 이미 꼭대기인 조각에서 막았으면 **게이지만 비운다.** 가까운 낮은 조각을 찾아
   * 올리면 인과가 다시 흐려진다.
   */
  private earn(at: Pt) {
    if (++this.gauge < K.RESTORE_BLOCKS) return;
    this.gauge = 0;
    const i = this.plateIndex(at);
    if (this.plates[i] >= TOP_LV) return;
    this.plates[i]++;
    this.restored++;
    this.plateEvents.push({ kind: "restore", i, t: this.t });
  }

  /** 먼저 쓰러진 사람. 협동이라 승자는 없다 — 누가 먼저인지만 남는다. */
  fallen() { return this.lives.findIndex((l) => l <= 0); }

  /** 씬이 읽고 비운다. */
  drainEvents(): Event[] {
    const out = this.events.slice();
    this.events.length = 0;
    return out;
  }

  /** 씬이 읽고 비운다. 조각이 떨어지고 솟는 연출이 여기 걸린다. */
  drainPlateEvents(): PlateEvent[] {
    const out = this.plateEvents.slice();
    this.plateEvents.length = 0;
    return out;
  }
}

/** 사연을 사람이 읽는 문장으로. 퍼센트가 아니라 이름이다. */
export function fateText(e: Event): string {
  const who = (i: number) => `P${i + 1}`;
  switch (e.fate) {
    case "blocked": return `${who(e.who)} 가 자기 색을 막았다`;
    case "hit": return `${who(e.owner)} 색 탄 — ${who(e.who)} 가 맞았다`;
    case "neutralHit": return `주인 없는 탄 — ${who(e.who)} 가 맞았다`;
    case "escaped": return "";
  }
}

export { clamp, dist };
