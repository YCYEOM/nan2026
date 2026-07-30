// Drag & Drop Kit (문서 10.2). 포인터로 원형/사각 아이템을 집어 옮긴다.
import type { PointerState } from "../core/harness";

export interface Draggable {
  x: number;
  y: number;
  r: number; // 히트 반경
  data?: unknown;
}

export class DragDrop {
  held: Draggable | null = null;
  private grabDx = 0;
  private grabDy = 0;

  constructor(private items: Draggable[]) {}

  // 매 프레임 pointer 상태로 호출. 놓는 순간의 아이템을 반환(드롭 이벤트 처리용), 없으면 null.
  update(p: PointerState): Draggable | null {
    if (p.justDown && !this.held) {
      // 위에서부터(뒤에 그린 것 우선) 히트 검사
      for (let i = this.items.length - 1; i >= 0; i--) {
        const it = this.items[i];
        if (Math.hypot(p.x - it.x, p.y - it.y) <= it.r) {
          this.held = it;
          this.grabDx = it.x - p.x;
          this.grabDy = it.y - p.y;
          break;
        }
      }
    }
    if (this.held) {
      this.held.x = p.x + this.grabDx;
      this.held.y = p.y + this.grabDy;
    }
    if (p.justUp && this.held) {
      const dropped = this.held;
      this.held = null;
      return dropped;
    }
    return null;
  }
}
