import { describe, it, expect } from "vitest";
import { rng } from "./kits/rng";

describe("시드 난수 (kits/rng)", () => {
  it("같은 시드는 같은 수열, 다른 시드는 다르다", () => {
    const take = (seed: number) => Array.from({ length: 20 }, rng(seed));
    expect(take(7)).toEqual(take(7));
    expect(take(7)).not.toEqual(take(8));
  });

  it("반환값이 항상 [0, 1) 이다 — 1.0 이 나오면 배열 범위를 벗어난다", () => {
    // 옛 코드는 0xffffffff 로 나눠 정확히 1.0 이 나올 수 있었다. 그러면
    // Math.floor(rnd()*n) 이 n 을 돌려줘 리듬은 비트 시각이 NaN 이 됐다.
    for (const seed of [0, 1, 42, 0xffffffff, 123456789]) {
      const r = rng(seed);
      for (let i = 0; i < 5000; i++) {
        const v = r();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    }
  });

  it("**이웃 시드가 즉시 갈라진다** — 첫 출력만으로도 값이 흩어진다", () => {
    // 옛 LCG 는 여기서 시드 1~200 이 **전부 같은 값**을 줬다(고유값 1종).
    // 제로섬의 배치·모양 추첨이 첫 출력 하나로 정해지므로 이게 깨지면 매판 같은 판이 나온다.
    const N = 200;
    const first = Array.from({ length: N }, (_, i) => Math.floor(rng(i + 1)() * 5));
    expect(new Set(first).size).toBe(5);                       // 5지선다가 전부 나온다

    // 값별 빈도가 고르다. 기대 40, 이항분포 σ≈5.7 이라 ±3σ 를 경계로 둔다.
    const cnt = [0, 0, 0, 0, 0];
    for (const v of first) cnt[v]++;
    for (const c of cnt) { expect(c).toBeGreaterThan(23); expect(c).toBeLessThan(57); }

    // 연속한 시드가 같은 값을 주는 비율이 무작위 수준이다. 기대 (N-1)/5 ≈ 39.8, σ≈5.6.
    // 옛 LCG 는 여기서 199 가 나온다(전부 같은 값이므로).
    const runs = first.filter((v, i) => i > 0 && v === first[i - 1]).length;
    expect(runs).toBeLessThan(57);                             // 기대 +3σ
  });

  it("분포가 한쪽으로 쏠리지 않는다", () => {
    const r = rng(2026), bins = [0, 0, 0, 0];
    for (let i = 0; i < 40000; i++) bins[Math.floor(r() * 4)]++;
    for (const b of bins) { expect(b).toBeGreaterThan(9000); expect(b).toBeLessThan(11000); }
  });

  it("시드 0 도 동작한다", () => {
    const r = rng(0);
    const out = Array.from({ length: 10 }, r);
    expect(new Set(out).size).toBe(10);           // 0 에 갇히지 않는다
  });
});
