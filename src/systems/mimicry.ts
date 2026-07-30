// 모방 게임 코어 — 타깃 절차 생성 · 스트로크 수명 · 유사도(격자 IoU).
// 렌더 비의존: 좌표는 전부 정규화(0~1)다. 씬이 칸 크기로 곱한다.
// kits/grid 는 쓰지 않았다 — IoU 는 칸 집합의 교/합집합이고 Grid 는 값 맵이라
// set/has 만 쓰게 된다. Set<number>(r*cols+c) 가 더 짧고 빠르다.

export interface Pt { x: number; y: number }
/** born = 그려진 시각(단계 시작 기준 초). 중계할 때 이 시각부터 TTL 동안만 보인다. */
export interface Stroke { pts: Pt[]; born: number }

export const GRID_COLS = 32, GRID_ROWS = 24;
/** 타깃 점을 뽑는 굵은 격자. 완전 무작위 좌표는 낙서가 된다 — 칸을 쓰면 모양이 읽힌다. */
export const TARGET_COLS = 5, TARGET_ROWS = 4;

/**
 * 타깃 폴리라인. 같은 seed 는 같은 도형이다.
 * 굵은 격자 칸을 셔플해 앞에서 n개 뽑아 순서대로 잇는다 — 칸 중복 재추첨 대신
 * 셔플을 쓴 이유는 무한 루프가 없기 때문이다.
 */
export function makeTarget(seed: number, points = 5): Pt[] {
  const total = TARGET_COLS * TARGET_ROWS, n = Math.max(2, Math.min(points, total));
  let s = (seed >>> 0) || 1;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff;
  const idx = Array.from({ length: total }, (_, i) => i);
  for (let i = total - 1; i > 0; i--) {          // Fisher-Yates
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, n).map((k) => ({
    x: ((k % TARGET_COLS) + 0.5) / TARGET_COLS,
    y: (Math.floor(k / TARGET_COLS) + 0.5) / TARGET_ROWS,
  }));
}

/** 폴리라인들을 격자 칸 집합으로 굽는다. 스트로크 순서·굵기·방향은 버린다. */
function raster(polys: Pt[][], cols = GRID_COLS, rows = GRID_ROWS): Set<number> {
  const g = new Set<number>();
  const put = (x: number, y: number) => {
    const c = Math.min(cols - 1, Math.max(0, Math.floor(x * cols)));
    const r = Math.min(rows - 1, Math.max(0, Math.floor(y * rows)));
    g.add(r * cols + c);
  };
  for (const pts of polys) {
    if (pts.length === 0) continue;
    put(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      // 칸보다 촘촘히 샘플링해야 선이 끊기지 않는다(칸 대각 최악을 감안해 ×2).
      const steps = Math.max(1, Math.ceil(Math.hypot((b.x - a.x) * cols, (b.y - a.y) * rows) * 2));
      for (let t = 1; t <= steps; t++) put(a.x + ((b.x - a.x) * t) / steps, a.y + ((b.y - a.y) * t) / steps);
    }
  }
  return g;
}

/**
 * 1칸 팽창(4이웃). 얇은 선끼리는 한 칸만 어긋나도 교집합이 0이 되어
 * 사람 눈의 "비슷한데"와 크게 벌어진다 — 한 겹 두껍게 굽는다.
 * ponytail: 팽창 1회 고정. 여전히 가혹하면 DILATE 를 노브로 빼거나 거리변환으로 바꾼다.
 */
function dilate(g: Set<number>, cols: number, rows: number): Set<number> {
  const out = new Set(g);
  for (const k of g) {
    const c = k % cols, r = (k - c) / cols;
    if (c > 0) out.add(k - 1);
    if (c < cols - 1) out.add(k + 1);
    if (r > 0) out.add(k - cols);
    if (r < rows - 1) out.add(k + cols);
  }
  return out;
}

/**
 * 두 그림의 유사도 0~1. 저해상 격자 IoU.
 * 둘 다 빈 그림이면 1(같다), 한쪽만 비었으면 0.
 */
export function similarity(a: Pt[][], b: Pt[][], cols = GRID_COLS, rows = GRID_ROWS): number {
  const ga = dilate(raster(a, cols, rows), cols, rows);
  const gb = dilate(raster(b, cols, rows), cols, rows);
  if (ga.size === 0 || gb.size === 0) return ga.size === gb.size ? 1 : 0;
  let inter = 0;
  for (const k of ga) if (gb.has(k)) inter++;
  return inter / (ga.size + gb.size - inter);
}

/** 스트로크의 남은 수명 0~1. ttl<=0 이면 사라지지 않는다(1). */
export function life(s: Stroke, now: number, ttl: number): number {
  if (ttl <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - (now - s.born) / ttl));
}

/** 중계 시점 now 에 보이는 스트로크들. 그려진 시각(born) 이후 ttl 동안만 보인다. */
export function relayVisible(strokes: Stroke[], now: number, ttl: number) {
  return strokes.filter((s) => now >= s.born && life(s, now, ttl) > 0);
}

export const polys = (strokes: Stroke[]): Pt[][] => strokes.map((s) => s.pts);
