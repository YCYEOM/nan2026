// Grid Placement Kit (문서 10.2). 칸 단위 배치·이동·점유. 렌더 비의존 → 테스트 가능.

export interface Cell { c: number; r: number; }

export class Grid<T = unknown> {
  private cells = new Map<string, T>();

  constructor(
    readonly cols: number,
    readonly rows: number,
    readonly cell = 32,
    readonly ox = 0,
    readonly oy = 0,
  ) {}

  private key(c: number, r: number) { return `${c},${r}`; }
  inBounds(c: number, r: number) { return c >= 0 && r >= 0 && c < this.cols && r < this.rows; }

  // 픽셀 → 셀. 범위 밖이면 null.
  pick(x: number, y: number): Cell | null {
    const c = Math.floor((x - this.ox) / this.cell);
    const r = Math.floor((y - this.oy) / this.cell);
    return this.inBounds(c, r) ? { c, r } : null;
  }

  // 셀 → 좌상단 픽셀.
  origin(c: number, r: number) { return { x: this.ox + c * this.cell, y: this.oy + r * this.cell }; }
  center(c: number, r: number) { return { x: this.ox + (c + 0.5) * this.cell, y: this.oy + (r + 0.5) * this.cell }; }

  get(c: number, r: number) { return this.cells.get(this.key(c, r)); }
  has(c: number, r: number) { return this.cells.has(this.key(c, r)); }

  set(c: number, r: number, v: T) {
    if (!this.inBounds(c, r)) return false;
    this.cells.set(this.key(c, r), v);
    return true;
  }

  clear(c: number, r: number) { this.cells.delete(this.key(c, r)); }

  neighbors4(c: number, r: number): Cell[] {
    return [ { c: c + 1, r }, { c: c - 1, r }, { c, r: r + 1 }, { c, r: r - 1 } ]
      .filter((n) => this.inBounds(n.c, n.r));
  }

  forEach(fn: (c: number, r: number, v: T) => void) {
    for (const [k, v] of this.cells) {
      const [c, r] = k.split(",").map(Number);
      fn(c, r, v);
    }
  }
}
