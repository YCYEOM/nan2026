// 제로섬 코어 — 꽉 찬 격자 · 무작위 반경 · 소유권 이전 · 매 턴 점수.
// 렌더 비의존. 턴제라 dt 가 없다.
//
// 이 게임의 전부는 불변식 하나다: **내 칸 + 네 칸 = COLS*ROWS, 언제나.**
// 빈 칸이 생기는 순간 제로섬이 아니게 되고, 막대 하나로 판세를 보여주는 것도 불가능해진다.
//
// kits/grid 는 쓰지 않았다 — Map 기반 희소 저장이라 140칸이 전부 차 있는 판에는
// 배열이 맞다. 좌표 변환은 씬이 곱셈 두 번으로 한다.

import { rng } from "../kits/rng";

/**
 * 뺏는 모양. **전부 점대칭이다** — 비대칭 모양을 넣으면 회전 조작이 필요해지고
 * 조작 1종(클릭)이라는 이 게임의 강점이 깨진다. 회전이 없으면 방향 운도 없다.
 */
export type ShapeId = "plus" | "hbar" | "vbar" | "box" | "star" | "cross" | "ring";
export interface ShapeSpec { id: ShapeId; name: string; cells: [number, number][] }

const plus = (arm: number): [number, number][] => {
  const out: [number, number][] = [[0, 0]];
  for (let i = 1; i <= arm; i++) out.push([i, 0], [-i, 0], [0, i], [0, -i]);
  return out;
};
const line = (half: number, vertical: boolean): [number, number][] => {
  const out: [number, number][] = [];
  for (let i = -half; i <= half; i++) out.push(vertical ? [0, i] : [i, 0]);
  return out;
};
const box = (half: number): [number, number][] => {
  const out: [number, number][] = [];
  for (let dr = -half; dr <= half; dr++) for (let dc = -half; dc <= half; dc++) out.push([dc, dr]);
  return out;
};
const diamond = (r: number): [number, number][] => {
  const out: [number, number][] = [];
  for (let dr = -r; dr <= r; dr++) {
    const span = r - Math.abs(dr);
    for (let dc = -span; dc <= span; dc++) out.push([dc, dr]);
  }
  return out;
};
// 고리는 가운데를 비운다 — 이미 내 칸인 중심을 낭비하지 않고 상대 영역만 훑는다.
const ring = (half: number): [number, number][] =>
  box(half).filter(([dc, dr]) => Math.max(Math.abs(dc), Math.abs(dr)) === half);

export const SHAPES: readonly ShapeSpec[] = [
  { id: "plus", name: "십자", cells: plus(1) },          // 5
  { id: "hbar", name: "막대", cells: line(3, false) },   // 7 — 깊이 찌른다
  { id: "vbar", name: "기둥", cells: line(3, true) },    // 7 — 경계를 따라 훑는다
  { id: "box", name: "네모", cells: box(1) },            // 9
  { id: "star", name: "별", cells: diamond(2) },         // 13
  { id: "cross", name: "큰십자", cells: plus(3) },        // 13
  { id: "ring", name: "고리", cells: ring(2) },          // 16
] as const;

export const shapeSpec = (id: ShapeId): ShapeSpec => SHAPES.find((s) => s.id === id) ?? SHAPES[0];

/**
 * 시작 배치. **정확히 반반이어야 하고 양쪽이 대등해야 한다.**
 * 한 칸이라도 어긋나면 시작부터 제로섬이 아니고, 대등하지 않으면 좋은 땅을 받은 쪽이 이긴다.
 * 다섯 다 산식만으로 딱 떨어진다 — 정렬해서 앞 절반을 자르는 방식은 무늬가 깨진다.
 */
export type LayoutId = "split" | "stack" | "quad" | "rows" | "cols";
export interface LayoutSpec { id: LayoutId; name: string; mine: (c: number, r: number, cols: number, rows: number) => boolean }

export const LAYOUTS: readonly LayoutSpec[] = [
  { id: "split", name: "좌우", mine: (c, _r, cols) => c < cols / 2 },
  { id: "stack", name: "상하", mine: (_c, r, _cols, rows) => r < rows / 2 },
  { id: "quad", name: "사분", mine: (c, r, cols, rows) => (c < cols / 2) !== (r < rows / 2) },
  { id: "rows", name: "가로줄", mine: (_c, r) => r % 2 === 0 },
  { id: "cols", name: "세로줄", mine: (c) => c % 2 === 0 },
] as const;

export const layoutSpec = (id: LayoutId): LayoutSpec => LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0];

/** 매 수 뒤의 상태. 궤적 그래프와 "최고의 한 수"가 여기서 나온다. */
export interface Turn { player: number; own0: number; taken: number }

export interface ZeroOpts {
  cols: number; rows: number;
  turns: number;          // 각자 몇 턴인가
  shapes?: ShapeId[];     // 뽑을 모양 목록. 기본은 전체
  layouts?: LayoutId[];   // 뽑을 시작 배치 목록. 기본은 전체
  seed?: number;          // 없으면 Math.random
}

export interface ClaimResult {
  player: number;
  col: number; row: number;
  shape: ShapeId;
  taken: number;          // 상대에게서 실제로 빼앗은 칸 수
  kept: number;           // 이미 내 것이었던 칸 수 (되받아치기의 낭비분)
  cells: number[];        // 소유권이 바뀐 칸 인덱스 — 씬이 반짝임에 쓴다
  own: [number, number];  // 이 수 뒤의 양쪽 칸 수
}

export class ZeroSum {
  /** 칸 소유자. 0 또는 1 뿐 — 빈 칸은 존재하지 않는다. */
  own: number[];
  score = [0, 0];
  turn = 0;
  /** 지금까지 둔 수의 총합. turns*2 가 되면 끝난다. */
  moves = 0;
  /**
   * 이번 **라운드**의 모양. 클릭 전에 보여준다 — 뒤에 알려주면 결정이 사라지고 그냥 운이 된다.
   * 한 라운드(P1 한 수 + P2 한 수)는 둘 다 같은 모양을 쓴다. 제로섬은 파이가 고정이라
   * 운의 비대칭이 그대로 승패가 되고 만회할 여지가 규칙에 없다 — 그래서 나눠 쓴다.
   */
  shape: ShapeId = "plus";
  /** 이번 판의 시작 배치. 매판 똑같이 시작하면 첫 몇 수가 늘 같은 최적수가 된다. */
  layout: LayoutId = "split";
  /**
   * 시작 상태부터 매 수를 기록한다. 제로섬은 총합이 고정이라 **P1 칸 수 하나**로
   * 판세가 완전히 표현된다 — P2 는 그 여집합이라 선 두 개는 같은 정보를 두 번 그리는 것이다.
   */
  readonly history: Turn[] = [];
  private rnd: () => number;
  private readonly pool: ShapeId[];
  private readonly layoutPool: LayoutId[];

  constructor(readonly o: ZeroOpts) {
    this.pool = o.shapes && o.shapes.length ? o.shapes : SHAPES.map((s) => s.id);
    this.layoutPool = o.layouts && o.layouts.length ? o.layouts : LAYOUTS.map((l) => l.id);
    // kits/rng 는 이웃 시드가 즉시 갈라져 워밍업이 필요 없다 —
    // 여기 있던 LCG 는 시드 1~200 이 전부 같은 배치를 줬다.
    this.rnd = o.seed === undefined ? Math.random : rng(o.seed);
    // 처음부터 꽉 찬 판 — 1턴부터 모든 수가 순수한 강탈이다.
    this.layout = this.layoutPool[Math.floor(this.rnd() * this.layoutPool.length)];
    const mine = layoutSpec(this.layout).mine;
    this.own = Array.from({ length: o.cols * o.rows }, (_, i) =>
      mine(i % o.cols, Math.floor(i / o.cols), o.cols, o.rows) ? 0 : 1);
    this.shape = this.drawShape();
    this.history.push({ player: -1, own0: this.counts()[0], taken: 0 });
  }

  get size() { return this.o.cols * this.o.rows; }
  get done() { return this.moves >= this.o.turns * 2; }
  get turnsLeft() { return Math.max(0, this.o.turns * 2 - this.moves); }
  /** 라운드 = P1 한 수 + P2 한 수. 모양은 라운드 단위로 공유된다. */
  get round() { return Math.floor(this.moves / 2) + 1; }
  idx(c: number, r: number) { return r * this.o.cols + c; }
  inBounds(c: number, r: number) { return c >= 0 && r >= 0 && c < this.o.cols && r < this.o.rows; }

  /** 칸 수 — 합은 언제나 size 다. */
  counts(): [number, number] {
    let a = 0;
    for (const v of this.own) if (v === 0) a++;
    return [a, this.size - a];
  }

  winner(): number {
    if (!this.done) return -1;
    if (this.score[0] === this.score[1]) return -1;
    return this.score[0] > this.score[1] ? 0 : 1;
  }

  /** 가장 많이 뺏은 수. 판세 그래프가 "어떻게" 를 말하면 이건 "언제·누가" 를 말한다. */
  bestMove(): { move: number; player: number; taken: number } | null {
    let best: { move: number; player: number; taken: number } | null = null;
    this.history.forEach((h, i) => {
      if (h.player < 0) return;
      if (!best || h.taken > best.taken) best = { move: i, player: h.player, taken: h.taken };
    });
    return best;
  }

  private drawShape(): ShapeId {
    return this.pool[Math.floor(this.rnd() * this.pool.length)];
  }

  /** 모양을 (c,r) 에 얹었을 때 덮이는 칸 인덱스. 판 밖은 버린다. */
  area(c: number, r: number, id: ShapeId = this.shape): number[] {
    const out: number[] = [];
    for (const [dc, dr] of shapeSpec(id).cells) {
      const cc = c + dc, rr = r + dr;
      if (this.inBounds(cc, rr)) out.push(this.idx(cc, rr));
    }
    return out;
  }

  /** 이번 모양이 판 안쪽에서 덮는 최대 칸 수 — 화면이 "왜 이만큼인지"를 설명하는 데 쓴다. */
  get shapeSize() { return shapeSpec(this.shape).cells.length; }

  /** 미리보기용 — 지금 모양으로 이 자리를 찍으면 어디가 넘어가나. */
  preview(c: number, r: number) { return this.area(c, r); }

  claim(c: number, r: number): ClaimResult | null {
    if (this.done || !this.inBounds(c, r)) return null;
    const p = this.turn, shape = this.shape;
    const cells = this.area(c, r, shape);
    let taken = 0, kept = 0;
    const changed: number[] = [];
    for (const i of cells) {
      if (this.own[i] === p) { kept++; continue; }   // 되받아치기의 낭비분
      this.own[i] = p;
      taken++;
      changed.push(i);
    }
    this.moves++;
    // 매 턴 끝에 자기 칸 수만큼 점수. 오래 들고 있는 것이 값이 된다 —
    // 이게 없으면 마지막에 두는 사람이 유리하고 초반 수가 무의미해진다.
    // 매 턴 양쪽 점수의 합이 size 로 고정이라 점수도 제로섬(정확히는 상수합)이다.
    const [a, b] = this.counts();
    this.score[0] += a;
    this.score[1] += b;
    this.history.push({ player: p, own0: a, taken });
    this.turn = 1 - p;
    // 모양은 **라운드가 바뀔 때만** 새로 뽑는다 — 같은 라운드의 두 수는 같은 모양을 쓴다.
    if (!this.done && this.moves % 2 === 0) this.shape = this.drawShape();
    return { player: p, col: c, row: r, shape, taken, kept, cells: changed, own: [a, b] };
  }
}
