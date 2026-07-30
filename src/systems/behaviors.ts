// System behavior kit (문서 10.3). 플레이어가 안 움직여도 세계가 변하는 규칙.
import { Grid, Cell } from "../kits/grid";

// Decay / Growth: 값이 시간당 rate 비율로 감쇠(음수면 성장). 초 단위 dt.
export function decay(value: number, rate: number, dt: number, min = 0): number {
  return Math.max(min, value - value * rate * dt);
}

// Chain Reaction: 시드에서 시작해 4방향 이웃 중 match를 만족하는 칸으로 전파(flood fill).
// 방문한 셀 순서를 반환 → 연출에서 지연 점등에 사용.
export function chainReact<T>(
  grid: Grid<T>,
  seed: Cell,
  match: (v: T, c: number, r: number) => boolean,
): Cell[] {
  const seen = new Set<string>();
  const order: Cell[] = [];
  const queue: Cell[] = [seed];
  while (queue.length) {
    const cur = queue.shift()!;
    const k = `${cur.c},${cur.r}`;
    if (seen.has(k)) continue;
    const v = grid.get(cur.c, cur.r);
    if (v === undefined || !match(v, cur.c, cur.r)) continue;
    seen.add(k);
    order.push(cur);
    queue.push(...grid.neighbors4(cur.c, cur.r));
  }
  return order;
}
