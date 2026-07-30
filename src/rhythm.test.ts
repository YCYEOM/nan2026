import { describe, it, expect } from "vitest";
import { RhythmEngine, RhythmOpts } from "./systems/rhythm";

const OPTS: RhythmOpts = { bpm: 100, beats: 8, players: 2, lives: 3, leadIn: 1, perfect: 0.08, good: 0.18 };
// interval = 0.6, beatTime(k) = 1 + 0.6k

describe("리듬 릴레이 엔진", () => {
  it("차례는 라운드로빈으로 돈다", () => {
    const e = new RhythmEngine(OPTS);
    expect(e.currentPlayer()).toBe(0);      // beat0 → P1
    e.step(1.0); e.press(0);                // 히트 → nextBeat=1
    expect(e.currentPlayer()).toBe(1);      // beat1 → P2
  });

  it("정확 타이밍 = perfect, 콤보·점수 상승", () => {
    const e = new RhythmEngine(OPTS);
    e.step(1.0);                            // clock = beatTime(0)
    const j = e.press(0);
    expect(j.result).toBe("perfect");
    expect(e.combo).toBe(1);
    expect(e.score).toBeGreaterThan(0);
  });

  it("남의 차례에 누르면 wrong, 상태 불변", () => {
    const e = new RhythmEngine(OPTS);
    e.step(1.0);
    expect(e.press(1).result).toBe("wrong"); // beat0은 P1 담당
    expect(e.combo).toBe(0);
    expect(e.nextBeat).toBe(0);
  });

  it("창을 넘기면 miss — 콤보 리셋 + 팀 생명 감소", () => {
    const e = new RhythmEngine(OPTS);
    const miss = e.step(1 + 0.18 + 0.01);   // beat0 창 초과
    expect(miss).toHaveLength(1);
    expect(e.lives).toBe(2);
    expect(e.combo).toBe(0);
    expect(e.nextBeat).toBe(1);
  });

  it("동시 비트: 전원이 창 안에 눌러야 성공(보너스), 한 명만이면 대기", () => {
    const s = { ...OPTS, syncEvery: 2, syncBonus: 2 }; // 홀수 비트(k=1,3,..)가 동시
    const e = new RhythmEngine(s);
    e.step(1.0); e.press(0);                 // beat0(P1) 히트 → nextBeat=1(동시)
    expect(e.isSync(1)).toBe(true);
    expect(e.currentPlayer()).toBe(-1);      // 담당 없음(전원)
    e.step(e.beatTime(1) - e.clock);
    expect(e.press(0).result).toBe("sync");  // 한 명 등록 → 대기
    expect(e.nextBeat).toBe(1);              // 아직 미해결
    const b = e.press(1);                    // 파트너 → 해결
    expect(["perfect", "good"]).toContain(b.result);
    expect(e.nextBeat).toBe(2);
    expect(e.combo).toBe(2);
  });

  it("동시 비트: 한 명만 누르고 창 넘기면 팀 미스", () => {
    const s = { ...OPTS, syncEvery: 2 };
    const e = new RhythmEngine(s);
    e.step(1.0); e.press(0);                 // beat0 히트 → beat1(동시)
    e.step(e.beatTime(1) - e.clock); e.press(0); // 혼자만
    e.step(0.3);                             // 창 초과 → 미스
    expect(e.combo).toBe(0);
    expect(e.lives).toBe(s.lives - 1);
  });

  it("홀드: 시작 누름=hold, 끝에서 뗌=성공(보너스), 너무 일찍 뗌=미스", () => {
    // 홀드 노트를 강제로 만든 엔진(seed로 chart 생성 후 홀드가 있는 비트 탐색)
    const e = new RhythmEngine({ ...OPTS, mode: "solo", seed: 5, beats: 40 });
    let k = -1;
    for (let i = 0; i < 40; i++) if (e.holdOf(i) > 0 && e.ownerOf(i) >= 0 && e.mashOf(i) === 0) { k = i; break; }
    expect(k).toBeGreaterThanOrEqual(0); // 변칙 차트에 홀드 존재

    // k 비트 앞까지 정타로 진행
    for (let i = 0; i < k; i++) { e.step(e.beatTime(i) - e.clock); e.press(e.ownerOf(i)); }
    const owner = e.ownerOf(k);
    e.step(e.beatTime(k) - e.clock);
    expect(e.press(owner).result).toBe("hold"); // 시작 등록
    expect(e.holding).toBe(true);
    // 끝 시각에 뗌 → 성공
    e.step(e.holdOf(k));
    const r = e.release(owner)!;
    expect(["perfect", "good"]).toContain(r.result);
    expect(e.holding).toBe(false);
    expect(e.nextBeat).toBe(k + 1);
  });

  it("홀드를 너무 일찍 뗴면 미스(브레이크)", () => {
    const e = new RhythmEngine({ ...OPTS, mode: "solo", seed: 5, beats: 40 });
    let k = -1;
    for (let i = 0; i < 40; i++) if (e.holdOf(i) > 0 && e.ownerOf(i) >= 0 && e.mashOf(i) === 0) { k = i; break; }
    for (let i = 0; i < k; i++) { e.step(e.beatTime(i) - e.clock); e.press(e.ownerOf(i)); }
    const owner = e.ownerOf(k);
    e.step(e.beatTime(k) - e.clock); e.press(owner);
    const r = e.release(owner)!; // 시작하자마자 뗌 → 너무 이름
    expect(r.result).toBe("miss");
  });

  it("연타 노트: 담당이 창 안에서 필요 횟수만큼 누르면 성공", () => {
    const e = new RhythmEngine({ ...OPTS, mode: "solo", seed: 5, beats: 60 });
    let k = -1; for (let i = 0; i < 60; i++) if (e.mashOf(i) > 0) { k = i; break; }
    expect(k).toBeGreaterThanOrEqual(0);
    while (e.nextBeat < k) e.step(0.03);            // 앞 비트는 흘려보냄(solo=생명 무관)
    e.step(Math.max(0, e.beatTime(k) - e.clock));
    const owner = e.ownerOf(k), need = e.mashOf(k);
    let res: any;
    for (let i = 0; i < need; i++) {
      res = e.press(owner);
      // 채우기 전 중간 press 는 "mash"(연타 진행중). "hold" 면 UI가 "홀드 유지!"를 띄운다.
      if (i < need - 1) expect(res.result).toBe("mash");
    }
    expect(res.result).toBe("perfect");
    expect(e.nextBeat).toBe(k + 1);
  });

  it("협동 홀드: 전원이 같이 누르고 유지하다 끝에 다같이 떼면 성공", () => {
    const e = new RhythmEngine({ ...OPTS, mode: "team", seed: 5, beats: 80, lives: 99, syncEvery: 2 });
    let k = -1; for (let i = 0; i < 80; i++) if (e.isCoop(i)) { k = i; break; }
    expect(k).toBeGreaterThanOrEqual(0);
    while (e.nextBeat < k) e.step(0.03);
    e.step(Math.max(0, e.beatTime(k) - e.clock));
    e.press(0);
    expect(e.press(1).result).toBe("hold");         // 전원 눌러 유지 시작
    expect(e.holding).toBe(true);
    e.step(e.holdOf(k));                             // 끝까지 유지
    e.release(0);
    const b = e.release(1)!;                         // 전원 떼기 완료
    expect(["perfect", "good"]).toContain(b.result);
    expect(e.holding).toBe(false);
    expect(e.nextBeat).toBe(k + 1);
  });

  it("정확도(%): 정타는 만점 기여, 미스는 정확도를 깎는다", () => {
    const e = new RhythmEngine({ ...OPTS, beats: 4 });
    e.step(e.beatTime(0) - e.clock); e.press(0);              // perfect
    e.step(e.beatTime(1) - e.clock); e.press(1);              // perfect
    e.step(e.beatTime(2) + OPTS.good + 0.05 - e.clock);       // beat2 miss
    e.step(e.beatTime(3) - e.clock); e.press(3 % OPTS.players); // perfect
    expect(e.nextBeat).toBe(4);
    expect(e.accuracy()).toBeCloseTo(75, 0);                  // 3 perfect / 4 beats
  });

  it("seed 없으면 균일(간격 일정·담당 라운드로빈)", () => {
    const e = new RhythmEngine(OPTS);
    expect(e.beatTime(1) - e.beatTime(0)).toBeCloseTo(e.beatTime(2) - e.beatTime(1), 5);
    for (let k = 0; k < OPTS.beats; k++) expect(e.ownerOf(k)).toBe(k % OPTS.players);
  });

  it("seed 있으면 변칙(간격 여러 종류 + 담당 비라운드로빈)", () => {
    const e = new RhythmEngine({ ...OPTS, seed: 123 });
    const gaps = new Set<number>();
    for (let k = 1; k < OPTS.beats; k++) gaps.add(+(e.beatTime(k) - e.beatTime(k - 1)).toFixed(3));
    expect(gaps.size).toBeGreaterThan(1);   // 간격이 불규칙
    let roundRobin = true;
    for (let k = 0; k < OPTS.beats; k++) if (e.ownerOf(k) !== -1 && e.ownerOf(k) !== k % OPTS.players) roundRobin = false;
    expect(roundRobin).toBe(false);         // 담당이 순수 순번이 아님
  });

  it("개인전(solo): 각자 점수·콤보, 동시 비트 없음, 최고 점수가 승자", () => {
    const s = { ...OPTS, mode: "solo" as const, syncEvery: 4 };
    const e = new RhythmEngine(s);
    expect(e.isSync(3)).toBe(false);          // solo는 동시 비트 비활성
    // P1(짝수 비트)만 정타, P2(홀수)는 전부 미스
    for (let k = 0; k < OPTS.beats; k++) {
      e.step(e.beatTime(k) - e.clock);
      if (k % 2 === 0) e.press(0);            // P2 차례는 안 누름 → 미스
      else e.step(s.good + 0.05);             // 창 넘겨 확정 미스
    }
    e.step(1);
    expect(e.done).toBe(true);
    expect(e.pscore[0]).toBeGreaterThan(0);
    expect(e.pscore[1]).toBe(0);
    expect(e.winner()).toBe(0);               // P1 승
    expect(e.pcombo[0]).toBeGreaterThan(1);   // P1은 미스 없이 콤보 유지
  });

  it("생명 소진 시 done(패배), 전 비트 처리 시 won", () => {
    const lose = new RhythmEngine(OPTS);
    lose.step(3.0);                         // beat0·1·2 연속 미스 → 생명 0
    expect(lose.lives).toBe(0);
    expect(lose.done).toBe(true);
    expect(lose.won).toBe(false);

    const win = new RhythmEngine(OPTS);
    for (let k = 0; k < OPTS.beats; k++) {
      win.step(win.beatTime(k) - win.clock); // 각 비트 정타
      const r = win.press(k % OPTS.players);
      expect(r.result === "perfect" || r.result === "good").toBe(true);
    }
    expect(win.won).toBe(true);
    expect(win.lives).toBe(3);
  });

  it("변칙 차트는 담당 노트 수가 플레이어마다 다르다 (점수 비교가 불공정한 이유)", () => {
    const e = new RhythmEngine({ ...OPTS, mode: "solo", seed: 5, beats: 60 });
    let own = 0;
    for (let k = 0; k < 60; k++) if (e.ownerOf(k) >= 0) own++;
    while (!e.done) e.step(0.05);             // 전부 흘려보냄 → 담당 노트 전부 miss
    expect(e.pjudged[0] + e.pjudged[1]).toBe(own);
    expect(e.pjudged[0]).not.toBe(e.pjudged[1]);  // 배분이 고르지 않다
    expect(e.paccuracy(0)).toBe(0);
    expect(e.paccuracy(1)).toBe(0);
  });

  it("동시 탭을 한 명만 놓치면 그 사람 적중률만 떨어진다", () => {
    const e = new RhythmEngine({ ...OPTS, lives: 99, syncEvery: 2 });
    let k = -1; for (let i = 0; i < OPTS.beats; i++) if (e.isSync(i)) { k = i; break; }
    expect(k).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < k; i++) { e.step(e.beatTime(i) - e.clock); e.press(e.ownerOf(i)); }
    e.step(e.beatTime(k) - e.clock);
    e.press(0);                               // P1만 누름
    const before = [e.pjudged[0], e.pjudged[1]];
    e.step(0.25);                             // 창(good 0.18)만 넘김 → 팀 미스. 다음 비트는 아직.
    expect(e.pjudged[0]).toBe(before[0] + 1); // 둘 다 판정 1건씩 받되
    expect(e.pjudged[1]).toBe(before[1] + 1);
    expect(e.paccuracy(0)).toBeGreaterThan(e.paccuracy(1)); // 안 누른 P2만 손해
  });

  it("협동 홀드를 먼저 뗀 사람만 실패로 기록된다", () => {
    const e = new RhythmEngine({ ...OPTS, lives: 99, seed: 5, beats: 80, syncEvery: 2 });
    let k = -1; for (let i = 0; i < 80; i++) if (e.isCoop(i)) { k = i; break; }
    expect(k).toBeGreaterThanOrEqual(0);
    while (e.nextBeat < k) e.step(0.05);
    e.step(Math.max(0, e.beatTime(k) - e.clock));
    e.press(0); e.press(1);                   // 전원 눌러 유지 시작
    expect(e.holding).toBe(true);
    // 앞 비트에서 개인 노트가 이미 불균등하게 배분돼 있으므로 이 노트의 증가분만 본다.
    const j0 = e.pjudged[0], j1 = e.pjudged[1], a0 = e.pacc[0], a1 = e.pacc[1];
    e.release(1);                             // P2가 한참 일찍 뗌 → 팀 브레이크
    expect(e.pjudged[0] - j0).toBe(1);        // 둘 다 판정 1건씩 받되
    expect(e.pjudged[1] - j1).toBe(1);
    expect(e.pacc[0] - a0).toBe(1);           // 유지하던 P1은 자기 몫 완료
    expect(e.pacc[1] - a1).toBe(0);           // 먼저 뗀 P2만 실패
  });

  it("반전은 담당이 있는 노트에만 붙고 동시류는 절대 반전되지 않는다", () => {
    const e = new RhythmEngine({ ...OPTS, seed: 7, beats: 80, syncEvery: 2, swapChance: 1 });
    let swapped = 0, coop = 0;
    for (let k = 0; k < 80; k++) {
      if (e.ownerOf(k) === -1) { coop++; expect(e.swapOf(k)).toBe(false); }
      else { expect(e.swapOf(k)).toBe(true); swapped++; }        // swapChance 1 → 담당 노트는 전부 반전
      // 표시 색 주인은 담당의 상대여야 한다(반전) / 같아야 한다(비반전)
      expect(e.shownOwnerOf(k)).toBe(e.swapOf(k) ? (e.ownerOf(k) + 1) % 2 : e.ownerOf(k));
    }
    expect(coop).toBeGreaterThan(0);  // 동시류가 실제로 섞인 차트여야 검증이 의미 있다
    expect(swapped).toBeGreaterThan(0);
  });

  it("반전은 표시만 바꾼다 — 판정은 담당(ownerOf)이 눌러야 성공한다", () => {
    const swap = new RhythmEngine({ ...OPTS, mode: "solo", seed: 11, beats: 40, swapChance: 1 });
    // 반전 노트를 표시 색 주인이 누르면 wrong, 담당이 누르면 성공한다.
    // (swapChance 미지정 차트가 그대로 재현되는지는 기존 시드 테스트들이 이미 잡는다 —
    //  buildChart 가 sc=0 일 때 rnd() 를 소비하지 않기 때문이다.)
    let k = -1; for (let i = 0; i < 40; i++) if (swap.swapOf(i) && swap.mashOf(i) === 0 && swap.holdOf(i) === 0) { k = i; break; }
    expect(k).toBeGreaterThanOrEqual(0);
    while (swap.nextBeat < k) swap.step(0.05);
    swap.step(Math.max(0, swap.beatTime(k) - swap.clock));
    const owner = swap.ownerOf(k), shown = swap.shownOwnerOf(k);
    expect(shown).not.toBe(owner);
    expect(swap.press(shown).result).toBe("wrong");   // 색을 따라간 사람은 틀린다
    expect(swap.press(owner).result).toBe("perfect"); // 담당이 눌러야 맞는다
  });

  it("담당이 맞아도 키(lane)가 틀리면 wrong 이다", () => {
    const e = new RhythmEngine({ ...OPTS, mode: "solo", seed: 3, beats: 40, keysPerPlayer: 2 });
    let k = -1; for (let i = 0; i < 40; i++) if (e.holdOf(i) === 0 && e.mashOf(i) === 0) { k = i; break; }
    expect(k).toBeGreaterThanOrEqual(0);
    while (e.nextBeat < k) e.step(0.05);
    e.step(Math.max(0, e.beatTime(k) - e.clock));
    const owner = e.ownerOf(k), lane = e.laneOf(k);
    expect(e.press(owner, 1 - lane).result).toBe("wrong");  // 내 노트인데 다른 키
    expect(e.press(1 - owner, lane).result).toBe("wrong");   // 맞는 키인데 남의 노트
    expect(e.press(owner, lane).result).toBe("perfect");     // 담당 + 키 둘 다 맞아야
  });

  it("홀드 중 같은 사람의 다른 키를 떼도 홀드가 끊기지 않는다", () => {
    const e = new RhythmEngine({ ...OPTS, mode: "solo", seed: 3, beats: 40, keysPerPlayer: 2 });
    let k = -1; for (let i = 0; i < 40; i++) if (e.holdOf(i) > 0 && e.mashOf(i) === 0 && e.ownerOf(i) >= 0) { k = i; break; }
    expect(k).toBeGreaterThanOrEqual(0);
    while (e.nextBeat < k) e.step(0.05);
    e.step(Math.max(0, e.beatTime(k) - e.clock));
    const owner = e.ownerOf(k), lane = e.laneOf(k);
    expect(e.press(owner, lane).result).toBe("hold");
    expect(e.release(owner, 1 - lane)).toBeNull();  // 다른 키 keyup 은 무시
    expect(e.holding).toBe(true);                   // 홀드는 살아 있다
    e.step(e.beatTime(k) + e.holdOf(k) - e.clock);  // 끝까지 유지
    expect(e.release(owner, lane)!.result).toBe("perfect");
  });

  it("keysPerPlayer 를 안 주면 모든 노트가 lane 0 이다 (기존 동작 보존)", () => {
    const e = new RhythmEngine({ ...OPTS, seed: 3, beats: 40 });
    for (let k = 0; k < 40; k++) expect(e.laneOf(k)).toBe(0);
    e.step(1.0);
    expect(e.press(e.ownerOf(0)).result).toBe("perfect"); // lane 인자 없이도 그대로 동작
  });

  it("승패는 노트 수가 아니라 적중률로 가린다", () => {
    const e = new RhythmEngine({ ...OPTS, mode: "solo", seed: 5, beats: 60 });
    // P1: 4노트 중 4개 성공(100%) / P2: 20노트 중 15개 성공(75%) — 점수는 P2가 높을 상황
    e.pjudged = [4, 20]; e.pacc = [4, 15];
    e.pscore = [400, 3000];
    expect(e.paccuracy(0)).toBe(100);
    expect(e.paccuracy(1)).toBe(75);
    expect(e.winner()).toBe(0);
  });
});
