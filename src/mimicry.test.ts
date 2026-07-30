import { describe, it, expect } from "vitest";
import { makeTarget, similarity, life, relayVisible, polys, Stroke, Pt } from "./systems/mimicry";

const line = (x0: number, y0: number, x1: number, y1: number): Pt[] => [{ x: x0, y: y0 }, { x: x1, y: y1 }];
const st = (pts: Pt[], born = 0): Stroke => ({ pts, born });

describe("모방 — 타깃 생성", () => {
  it("같은 시드는 같은 도형, 다른 시드는 다른 도형", () => {
    expect(makeTarget(7)).toEqual(makeTarget(7));
    expect(makeTarget(7)).not.toEqual(makeTarget(8));
  });

  it("점 개수를 지키고 좌표가 0~1 안에 있다", () => {
    for (const n of [2, 4, 5, 6]) {
      const t = makeTarget(3, n);
      expect(t).toHaveLength(n);
      for (const p of t) {
        expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(1);
        expect(p.y).toBeGreaterThan(0); expect(p.y).toBeLessThan(1);
      }
    }
  });

  it("점이 겹치지 않는다 — 같은 칸을 두 번 쓰지 않는다", () => {
    const t = makeTarget(11, 6);
    const keys = new Set(t.map((p) => `${p.x},${p.y}`));
    expect(keys.size).toBe(6);
  });

  it("격자 수보다 많이 요구하면 격자 수로 잘린다 (무한 루프 방지)", () => {
    expect(makeTarget(1, 999)).toHaveLength(5 * 4);
  });
});

describe("모방 — 유사도(격자 IoU)", () => {
  it("자기 자신과 비교하면 1", () => {
    const a = [line(0.1, 0.1, 0.9, 0.9)];
    expect(similarity(a, a)).toBe(1);
  });

  it("둘 다 빈 그림이면 1, 한쪽만 비었으면 0", () => {
    const a = [line(0.1, 0.1, 0.9, 0.9)];
    expect(similarity([], [])).toBe(1);
    expect(similarity(a, [])).toBe(0);
    expect(similarity([], a)).toBe(0);
  });

  it("많이 어긋난 그림이 조금 어긋난 그림보다 낮다 (단조성)", () => {
    const base = [line(0.2, 0.5, 0.8, 0.5)];
    const near = [line(0.2, 0.55, 0.8, 0.55)];  // 살짝 아래
    const far = [line(0.2, 0.9, 0.8, 0.9)];     // 한참 아래
    const sNear = similarity(base, near), sFar = similarity(base, far);
    expect(sNear).toBeGreaterThan(sFar);
    expect(sNear).toBeLessThan(1);              // 어긋났으니 1은 아니다
    expect(sFar).toBe(0);                       // 겹치는 칸이 없다
  });

  it("완전히 다른 방향의 선은 낮은 값이지만 교차점이 있으면 0은 아니다", () => {
    const h = [line(0.1, 0.5, 0.9, 0.5)];
    const v = [line(0.5, 0.1, 0.5, 0.9)];
    const s = similarity(h, v);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(0.3);
  });
});

describe("모방 — 스트로크 수명", () => {
  it("갓 그린 선은 1, 절반 지나면 0.5, 수명이 지나면 0", () => {
    const s = st(line(0, 0, 1, 1), 2);
    expect(life(s, 2, 4)).toBe(1);
    expect(life(s, 4, 4)).toBeCloseTo(0.5, 6);
    expect(life(s, 6, 4)).toBe(0);
    expect(life(s, 99, 4)).toBe(0);
  });

  it("ttl 0 이면 사라지지 않는다 (P1 자기 캔버스)", () => {
    expect(life(st(line(0, 0, 1, 1), 0), 999, 0)).toBe(1);
  });

  it("중계는 그려진 시각 이후 수명 동안만 보인다", () => {
    const a = st(line(0, 0, 0.5, 0.5), 0);   // 0초에 그림
    const b = st(line(0.5, 0.5, 1, 1), 5);   // 5초에 그림
    const ttl = 3;
    expect(relayVisible([a, b], 0, ttl)).toEqual([a]);      // b는 아직 안 그려짐
    expect(relayVisible([a, b], 4, ttl)).toEqual([]);       // a는 만료, b는 아직
    expect(relayVisible([a, b], 6, ttl)).toEqual([b]);
    expect(relayVisible([a, b], 9, ttl)).toEqual([]);       // 둘 다 만료
  });

  it("polys 는 스트로크에서 점 배열만 뽑는다", () => {
    const pts = line(0, 0, 1, 1);
    expect(polys([st(pts, 3)])).toEqual([pts]);
  });
});
