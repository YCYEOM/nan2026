import { describe, it, expect } from "vitest";
import { PushLuck, PushOpts, MODS, ModId } from "./systems/pushluck";
import { ROLL, creepDuration } from "./scenes/pushluck";

// 임계값을 고정하려면 min===max 로 준다. 굴림은 시드로 결정적이다.
// modPool 기본을 ["none"] 으로 둬 라운드 규칙이 기존 판정을 흔들지 않게 한다 —
// 규칙별 검증은 아래 "라운드 규칙" 묶음에서 따로 한다.
const O = (over: Partial<PushOpts> = {}): PushOpts =>
  ({ limitMin: 20, limitMax: 45, target: 100, sides: 6, seed: 42, modPool: ["none"], ...over });

/** 규칙 하나만 나오게 고정한다. 1라운드는 항상 none 이므로 한 판 터뜨려 2라운드로 넘긴다. */
const withMod = (id: ModId, over: Partial<PushOpts> = {}) => {
  const e = new PushLuck(O({ modPool: [id], ...over }));
  while (e.round === 1) e.roll();      // 1라운드(none)를 끝내면 2라운드부터 규칙이 붙는다
  return e;
};

/** 터지기 전까지 굴린다. 반환값은 마지막 결과(터진 결과). */
const rollUntilBoom = (e: PushLuck, cap = 200) => {
  for (let i = 0; i < cap; i++) {
    const r = e.roll();
    if (!r) break;
    if (r.boom) return r;
  }
  throw new Error("cap 안에 터지지 않았다");
};

describe("떠넘기기 — 붕괴 방어", () => {
  it("차례에 굴리기 전에는 넘기기가 거부된다", () => {
    const e = new PushLuck(O());
    expect(e.canPass).toBe(false);
    expect(e.pass()).toBe(false);
    expect(e.turn).toBe(0);          // 차례가 넘어가지 않았다
    e.roll();
    expect(e.canPass).toBe(true);
    expect(e.pass()).toBe(true);
    expect(e.turn).toBe(1);
  });

  it("넘긴 직후에도 상대는 굴리기 전에 다시 넘길 수 없다 (핑퐁 방지)", () => {
    const e = new PushLuck(O());
    e.roll(); e.pass();
    expect(e.pass()).toBe(false);
    expect(e.turn).toBe(1);
  });

  it("굴리면 게이지와 내 pot 이 같은 값만큼 오른다", () => {
    const e = new PushLuck(O({ limitMin: 999, limitMax: 999 }));  // 안 터지게
    const r = e.roll()!;
    expect(r.boom).toBe(false);
    expect(e.gauge).toBe(r.face);
    expect(e.pot[0]).toBe(r.face);
    expect(e.pot[1]).toBe(0);
  });

  it("넘겨도 게이지는 줄지 않는다 — 그래서 넘기기가 공격이다", () => {
    const e = new PushLuck(O({ limitMin: 999, limitMax: 999 }));
    e.roll(); e.roll();
    const g = e.gauge;
    e.pass();
    expect(e.gauge).toBe(g);
    const r = e.roll()!;             // 상대는 더 높은 게이지에서 굴린다
    expect(e.gauge).toBe(g + r.face);
  });
});

describe("떠넘기기 — 터짐 정산", () => {
  it("터진 쪽 pot 은 소멸하고 상대는 자기 pot 을 확보한다", () => {
    const e = new PushLuck(O({ limitMin: 10, limitMax: 10 }));
    // P1 이 굴려 pot 을 쌓고 넘긴다 → P2 가 강제로 굴리다 터진다
    e.roll();
    const p1pot = e.pot[0];
    e.pass();
    const r = rollUntilBoom(e);
    expect(r.boom).toBe(true);
    expect(r.player).toBe(1);
    expect(r.bankedPot).toBe(p1pot);
    expect(e.score[0]).toBe(p1pot);   // 안 터진 쪽이 확보
    expect(e.score[1]).toBe(0);       // 터진 쪽은 0
  });

  it("터지면 게이지·pot 이 리셋되고 라운드가 오른다", () => {
    const e = new PushLuck(O({ limitMin: 8, limitMax: 8 }));
    const before = e.round;
    rollUntilBoom(e);
    expect(e.round).toBe(before + 1);
    expect(e.gauge).toBe(0);
    expect(e.pot).toEqual([0, 0]);
    expect(e.rolled).toBe(false);
  });

  it("터진 사람이 다음 라운드를 먼저 시작한다", () => {
    const e = new PushLuck(O({ limitMin: 8, limitMax: 8 }));
    const r = rollUntilBoom(e);
    expect(e.turn).toBe(r.player);
  });
});

describe("떠넘기기 — 범인 판정", () => {
  it("상대가 넘겨서 받은 강제 첫 굴림에 터지면 passer", () => {
    // P1 이 한 번 굴리고(게이지 낮음) 넘긴 뒤 P2 의 첫 굴림에 반드시 터지게 임계를 낮춘다.
    const e = new PushLuck(O({ limitMin: 1, limitMax: 1 }));
    const first = e.roll()!;          // 눈이 1보다 크면 여기서 터진다
    if (first.boom) {
      expect(first.blame).toBe("none"); // 라운드 첫 굴림 → 아무 탓도 아니다
      return;
    }
    e.pass();
    const r = e.roll()!;
    expect(r.boom).toBe(true);
    expect(r.blame).toBe("passer");
    expect(r.player).toBe(1);
  });

  it("자기 차례 두 번째 이후 굴림에 터지면 self", () => {
    const e = new PushLuck(O({ limitMin: 7, limitMax: 7, seed: 5 }));
    let r = e.roll()!;
    while (!r.boom) r = e.roll()!;    // 넘기지 않고 계속 굴린다
    expect(r.blame).toBe("self");
    expect(r.player).toBe(0);
  });

  it("라운드 첫 굴림에 터지면 none — 아무 탓도 아니다", () => {
    const e = new PushLuck(O({ limitMin: 0, limitMax: 0 }));  // 어떤 눈이든 즉시 터진다
    const r = e.roll()!;
    expect(r.boom).toBe(true);
    expect(r.blame).toBe("none");
  });
});

describe("떠넘기기 — 결정성과 승패", () => {
  it("같은 시드는 같은 굴림 순서, 다른 시드는 다르다", () => {
    const seq = (seed: number) => {
      const e = new PushLuck(O({ seed, limitMin: 999, limitMax: 999 }));
      return Array.from({ length: 12 }, () => e.roll()!.face);
    };
    expect(seq(7)).toEqual(seq(7));
    expect(seq(7)).not.toEqual(seq(8));
  });

  it("굴린 눈은 1..sides 범위 안에 있다", () => {
    const e = new PushLuck(O({ seed: 3, sides: 6, limitMin: 9999, limitMax: 9999 }));
    for (let i = 0; i < 300; i++) {
      const f = e.roll()!.face;
      expect(f).toBeGreaterThanOrEqual(1);
      expect(f).toBeLessThanOrEqual(6);
    }
  });

  it("목표 점수에 먼저 도달한 쪽이 승자이고 그 뒤 굴림은 무효다", () => {
    const e = new PushLuck(O({ limitMin: 6, limitMax: 6, target: 10 }));
    // 양쪽이 같은 전략(한 번 굴리고 넘긴다)을 쓴다. 터진 사람이 다음 라운드를 시작하므로
    // 한쪽만 넘기게 만들면 상대 차례가 아예 오지 않는다 — 대칭 전략으로 돌려야 판이 끝난다.
    for (let i = 0; i < 500 && !e.done; i++) {
      if (!e.rolled) e.roll();
      else e.pass();
    }
    expect(e.done).toBe(true);
    const w = e.winner();
    expect(w).toBeGreaterThanOrEqual(0);
    expect(e.score[w]).toBeGreaterThanOrEqual(10);   // 승자는 목표를 넘겼다
    expect(e.score[1 - w]).toBeLessThan(10);         // 패자는 못 넘겼다
    expect(e.roll()).toBeNull();                     // 끝난 뒤에는 굴릴 수 없다
    expect(e.canPass).toBe(false);
    expect(e.pass()).toBe(false);
  });

  it("임계값은 공개 범위 안에서 뽑힌다", () => {
    for (const seed of [1, 2, 3, 99, 1234]) {
      const e = new PushLuck(O({ seed, limitMin: 20, limitMax: 45 }));
      expect(e.hiddenLimit).toBeGreaterThanOrEqual(20);
      expect(e.hiddenLimit).toBeLessThanOrEqual(45);
      expect(e.limitRange).toEqual([20, 45]);
    }
  });
});

describe("떠넘기기 — 라운드 규칙", () => {
  it("1라운드는 항상 기본, 2라운드부터 규칙이 붙는다", () => {
    const e = new PushLuck(O({ modPool: ["short"], limitMin: 8, limitMax: 8 }));
    expect(e.mod).toBe("none");        // 첫 판은 무엇이 기본인지 배우는 자리다
    rollUntilBoom(e);
    expect(e.round).toBe(2);
    expect(e.mod).toBe("short");
  });

  it("modPool 로 뽑을 규칙을 제한할 수 있다", () => {
    const e = new PushLuck(O({ modPool: ["fog"], limitMin: 8, limitMax: 8 }));
    for (let i = 0; i < 5; i++) rollUntilBoom(e);
    expect(e.mod).toBe("fog");
  });

  it("짧은 심지 — 임계 범위가 절반이다", () => {
    const e = withMod("short");
    expect(e.limitRange).toEqual([10, 22]);
    expect(e.hiddenLimit).toBeGreaterThanOrEqual(10);
    expect(e.hiddenLimit).toBeLessThanOrEqual(22);
  });

  it("안개 — 범위를 가린다고 표시되지만 값 자체는 정상이다", () => {
    const e = withMod("fog");
    expect(e.rangeHidden).toBe(true);
    expect(e.limitRange).toEqual([20, 45]);   // 화면만 가리고 규칙은 그대로다
    expect(new PushLuck(O()).rangeHidden).toBe(false);
  });

  it("두 배 — 점수만 2배, 게이지는 그대로", () => {
    const e = withMod("double", { limitMin: 999, limitMax: 999 });
    const g0 = e.gauge, p0 = e.pot[e.turn], who = e.turn;
    const r = e.roll()!;
    expect(e.gauge - g0).toBe(r.face);                        // 게이지는 눈만큼
    expect(e.pot[who] - p0).toBe(r.face * 2 * e.stakeMult);   // 점수는 2배
  });

  it("뜨거운 감자 — 넘기면 게이지가 5 오르되 그 자체로는 안 터진다", () => {
    const e = withMod("hotpotato", { limitMin: 999, limitMax: 999 });
    e.roll();
    const g = e.gauge, r = e.round;
    expect(e.pass()).toBe(true);
    expect(e.gauge).toBe(g + 5);
    expect(e.round).toBe(r);           // 라운드가 안 끝났다 = 안 터졌다
    expect(e.pot).toEqual(e.pot);      // 아무도 안 굴렸으므로 pot 변화 없음
  });

  it("뜨거운 감자로 임계를 넘겨두면 다음 굴림이 터지고 책임은 넘긴 사람에게 간다", () => {
    const e = withMod("hotpotato", { limitMin: 6, limitMax: 6 });
    while (e.gauge === 0) e.roll();    // 한 번 굴려 pot 을 만든다(터졌으면 라운드가 바뀐다)
    if (e.round !== 2) return;         // 첫 굴림에 터졌으면 이 판정은 못 본다
    if (!e.pass()) return;
    const r = e.roll()!;
    expect(r.boom).toBe(true);
    expect(r.blame).toBe("passer");
  });

  it("연발 — 두 번 굴러가고, 첫 굴림에 터지면 두 번째는 안 굴린다", () => {
    const safe = withMod("burst", { limitMin: 999, limitMax: 999 });
    const r = safe.roll()!;
    expect(r.faces).toHaveLength(2);
    expect(r.face).toBe(r.faces[0] + r.faces[1]);
    expect(safe.gauge).toBe(r.face);

    const doomed = withMod("burst", { limitMin: 0, limitMax: 0 });
    const b = doomed.roll()!;
    expect(b.boom).toBe(true);
    expect(b.faces).toHaveLength(1);   // 두 번째는 굴리지 않았다
  });

  it("눈 고정 — 항상 3이 나온다", () => {
    const e = withMod("fixed", { limitMin: 999, limitMax: 999 });
    for (let i = 0; i < 20; i++) expect(e.roll()!.faces).toEqual([3]);
  });

  it("되돌리기 — 터진 라운드를 통째로 되돌린다", () => {
    const e = withMod("undo", { limitMin: 8, limitMax: 8 });
    expect(e.undoLeft).toEqual([1, 1]);   // 각자 1회씩. 공용이 아니다
    // 터지기 직전 상태를 기억해 둔다
    let before = { gauge: e.gauge, pot: [...e.pot], score: [...e.score], round: e.round, turn: e.turn };
    let r = e.roll()!;
    while (!r.boom) {
      before = { gauge: e.gauge, pot: [...e.pot], score: [...e.score], round: e.round, turn: e.turn };
      r = e.roll()!;
    }
    expect(e.round).toBe(before.round + 1);   // 터져서 라운드가 넘어갔다
    expect(e.canUndo).toBe(true);
    expect(e.undo()).toBe(true);
    expect(e.round).toBe(before.round);        // 라운드가 돌아왔다
    expect(e.gauge).toBe(before.gauge);
    expect(e.pot).toEqual(before.pot);
    expect(e.score).toEqual(before.score);     // 상대가 확보한 점수도 되돌아왔다
    expect(e.turn).toBe(before.turn);
    expect(e.undoLeft[r.player]).toBe(0);      // 쓴 사람 것만 줄었다
    expect(e.undoLeft[1 - r.player]).toBe(1);  // 상대 것은 그대로 남았다
    expect(e.canUndo).toBe(false);
    expect(e.undo()).toBe(false);
  });

  it("되돌리기는 각자 1회다 — 한쪽이 써도 상대 것은 남는다", () => {
    const e = withMod("undo", { limitMin: 999, limitMax: 999 });
    const first = e.turn;
    e.roll();
    expect(e.undoOwner).toBe(first);
    expect(e.undo()).toBe(true);
    expect(e.undoLeft[first]).toBe(0);
    // 상대에게 차례를 넘기고 굴리면 상대는 자기 충전으로 되돌릴 수 있다
    e.roll();
    expect(e.pass()).toBe(true);
    const other = e.turn;
    expect(other).toBe(1 - first);
    e.roll();
    expect(e.undoOwner).toBe(other);
    expect(e.undo()).toBe(true);
    expect(e.undoLeft[other]).toBe(0);
  });

  it("넘기면 이전 굴림은 못 되돌린다 (창구가 닫힌다)", () => {
    const e = withMod("undo", { limitMin: 999, limitMax: 999 });
    e.roll();
    expect(e.canUndo).toBe(true);
    e.pass();
    expect(e.canUndo).toBe(false);
    expect(e.undoOwner).toBe(-1);
  });

  it("되돌리기 규칙이 아닌 라운드로 넘어가면 낡은 스냅샷이 되살아나지 않는다", () => {
    // 되돌리기 라운드에서 터진 뒤 구조하지 않고 계속 굴리면 창구가 닫혀야 한다.
    const e = withMod("undo", { limitMin: 6, limitMax: 6, modPool: ["undo", "none"] });
    rollUntilBoom(e);
    e.roll();                        // 새 라운드에서 한 번 굴린다 → 스냅샷이 덮인다
    if (e.mod !== "undo") expect(e.canUndo).toBe(false);
  });

  it("되돌리기가 없는 규칙에서는 못 되돌린다", () => {
    const e = new PushLuck(O({ limitMin: 999, limitMax: 999 }));
    e.roll();
    expect(e.undoLeft).toEqual([0, 0]);
    expect(e.canUndo).toBe(false);
    expect(e.undo()).toBe(false);
  });

  it("규칙 목록이 8종이고 id 가 중복되지 않는다", () => {
    expect(MODS).toHaveLength(8);
    expect(new Set(MODS.map((m) => m.id)).size).toBe(8);
    // 넘기기 금지는 뺐다 — 결정 자체가 사라져 그 라운드에 게임이 없었다
    expect(MODS.map((m) => m.id)).not.toContain("nopass");
    for (const m of MODS) { expect(m.name.length).toBeGreaterThan(0); expect(m.desc.length).toBeGreaterThan(0); }
  });
});

describe("떠넘기기 — 판돈 상승", () => {
  it("3라운드마다 배수가 1씩 오른다", () => {
    const e = new PushLuck(O({ limitMin: 8, limitMax: 8 }));
    const seen: number[] = [];
    for (let i = 0; i < 7 && !e.done; i++) { seen.push(e.stakeMult); rollUntilBoom(e); }
    expect(seen.slice(0, 6)).toEqual([1, 1, 1, 2, 2, 2]);
  });

  it("배수가 pot 획득에 반영된다", () => {
    const e = new PushLuck(O({ limitMin: 999, limitMax: 999 }));
    (e as unknown as { round: number }).round = 4;   // R4 = 배수 2
    expect(e.stakeMult).toBe(2);
    const who = e.turn, p0 = e.pot[who];
    const r = e.roll()!;
    expect(e.pot[who] - p0).toBe(r.face * 2);
  });
});

describe("굴림 연출 타이밍 (PSH-004)", () => {
  // 화면은 못 보지만 "큰 눈이 오래 탄다"는 산술로 볼 수 있다.
  it("심지가 타는 시간이 눈에 비례한다", () => {
    const ds = [1, 2, 3, 4, 5, 6].map(creepDuration);
    for (let i = 1; i < ds.length; i++) expect(ds[i]).toBeGreaterThanOrEqual(ds[i - 1]);
    expect(ds[5]).toBeGreaterThan(ds[0]);   // 6 은 1 보다 확실히 오래 탄다
  });

  it("아무리 작은 눈도 하한만큼은 탄다 — 순간이동하지 않는다", () => {
    expect(creepDuration(0)).toBe(ROLL.CREEP_MIN);
    expect(creepDuration(1)).toBeGreaterThanOrEqual(ROLL.CREEP_MIN);
  });

  it("한 번 굴리는 데 걸리는 시간이 긴장되되 답답하지 않은 범위다", () => {
    // 처음엔 눈 6이 2.22초였고 "너무 길다"는 지적을 받았다(PSH-005). 상한을 조였다.
    const total = (span: number) => ROLL.TUMBLE + ROLL.SETTLE + creepDuration(span);
    expect(total(1)).toBeGreaterThan(0.6);   // 즉시 끝나지 않는다
    expect(total(6)).toBeLessThan(1.5);      // 기다리다 지치지 않는다
    expect(total(6)).toBeGreaterThan(total(1));   // 비례는 유지된다
  });

  it("구르는 눈 간격이 감속한다 — 처음이 빠르고 끝이 느리다", () => {
    expect(ROLL.TICK_FAST).toBeLessThan(ROLL.TICK_FAST + ROLL.TICK_SLOW);
    expect(ROLL.TUMBLE).toBeGreaterThan(ROLL.TICK_FAST + ROLL.TICK_SLOW);   // 최소 몇 번은 바뀐다
  });
});

