// 떠넘기기 코어 — 공유 게이지 · 숨은 임계값 · 굴리기/넘기기 · 범인 판정 · 라운드 규칙.
// 렌더 비의존. 턴제라 dt 가 없다 — 입력 이벤트만으로 상태가 움직인다.
//
// 설계에서 막은 두 붕괴(CON-003). 어떤 라운드 규칙도 이 둘을 깨지 않는다:
//  1) 넘기기가 공짜면 "항상 즉시 넘기기"가 지배전략 → 차례에 한 번 굴려야 넘길 수 있다.
//  2) 굴리기가 순수 손해면 아무도 안 굴린다 → 오른 게이지만큼 내 pot 도 오른다.

import { rng } from "../kits/rng";

/** 터진 책임이 누구에게 있나. 이 게임이 클립이 되는 이유다. */
export type Blame = "passer" | "self" | "none";

/**
 * 라운드 규칙. 조작(굴리기/넘기기)은 그대로 두고 **상황**만 바꾼다 —
 * 변주가 결과(숫자)에만 있고 상황에 없으면 40번째 판이 1번째 판과 같아 보인다.
 */
export type ModId = "none" | "short" | "fog" | "double" | "hotpotato" | "undo" | "burst" | "fixed";
export interface ModSpec { id: ModId; name: string; desc: string }

export const MODS: readonly ModSpec[] = [
  { id: "none", name: "기본", desc: "특별한 규칙 없음" },
  { id: "short", name: "짧은 심지", desc: "임계 범위가 절반이다" },
  { id: "fog", name: "안개", desc: "임계 범위를 알려주지 않는다" },
  { id: "double", name: "두 배", desc: "굴린 눈이 점수에 2배로 들어간다" },
  { id: "hotpotato", name: "뜨거운 감자", desc: "넘기면 게이지가 5 오른다" },
  { id: "undo", name: "되돌리기", desc: "각자 1회씩 마지막 굴림을 취소한다" },
  { id: "burst", name: "연발", desc: "한 번 누르면 두 번 굴러간다" },
  { id: "fixed", name: "눈 고정", desc: "주사위가 항상 3이다" },
] as const;

export const modSpec = (id: ModId): ModSpec => MODS.find((m) => m.id === id) ?? MODS[0];

export interface RollResult {
  face: number;        // 이번 행동으로 게이지에 더해진 총량 (연발이면 두 눈의 합)
  faces: number[];     // 실제로 굴린 눈들. 연발이면 2개, 첫 굴림에 터지면 1개
  gauge: number;       // 굴린 뒤 게이지
  boom: boolean;
  blame: Blame;        // boom 일 때만 의미가 있다
  player: number;      // 굴린 사람
  lostPot: number;     // 터져서 소멸한 pot (boom 일 때)
  bankedPot: number;   // 상대가 확보한 pot (boom 일 때)
}

export interface PushOpts {
  limitMin: number; limitMax: number; target: number;
  sides?: number;         // 주사위 면 수. 기본 6
  seed?: number;          // 없으면 Math.random
  modPool?: ModId[];      // 2라운드부터 뽑을 규칙 목록. 기본은 전체
}

/** 되돌리기용 스냅샷. 라운드 상태 전부 — 터진 것까지 되돌려야 드라마가 난다. */
interface Snap {
  gauge: number; pot: number[]; score: number[];
  turn: number; rolled: boolean; byPass: boolean; limit: number; round: number; mod: ModId;
  /** 그 시점의 잔여 충전. 되돌릴 수 있는지를 **스냅샷 자신이** 판정하게 해서
   *  라운드가 넘어가도 낡은 스냅샷이 살아 있는 문제를 없앤다. */
  undoLeft: number[];
}

export class PushLuck {
  gauge = 0;
  pot = [0, 0];
  score = [0, 0];
  turn = 0;
  round = 1;
  /** 이번 차례에 굴렸는가. false 면 넘기기가 거부된다. */
  rolled = false;
  /** 이번 라운드 규칙. */
  mod: ModId = "none";
  /** 되돌리기 남은 횟수 — **각자 1회씩**. 공용으로 두면 먼저 쓰는 사람이 가져가고
   *  상대는 정작 터졌을 때 못 쓴다. 보이지 않게 빼앗는 구조라 전략이 아니라 불공평이다. */
  undoLeft = [0, 0];
  /** 이번 차례가 상대의 넘기기로 시작됐는가. 강제 첫 굴림에 터지면 넘긴 사람 탓이다. */
  private byPass = false;
  /** 숨은 임계값. 범위는 공개하고 값은 감춘다. */
  private limit = 0;
  private snap: Snap | null = null;
  private rnd: () => number;
  readonly sides: number;
  private readonly pool: ModId[];

  constructor(readonly o: PushOpts) {
    this.sides = o.sides ?? 6;
    this.pool = o.modPool && o.modPool.length ? o.modPool : MODS.map((m) => m.id);
    this.rnd = o.seed === undefined ? Math.random : rng(o.seed);
    this.newRound(0);
  }

  /** 임계 범위 — 화면과 시청자에게 보여주는 유일한 위험 정보. 짧은 심지면 절반이다. */
  get limitRange(): [number, number] {
    const half = this.mod === "short";
    const f = (v: number) => (half ? Math.floor(v / 2) : v);
    return [f(this.o.limitMin), f(this.o.limitMax)];
  }
  /** 안개 라운드는 범위를 화면에 띄우면 안 된다. */
  get rangeHidden() { return this.mod === "fog"; }
  /** 테스트·기록용. 플레이 중 화면에 띄우면 도박이 산수가 된다. */
  get hiddenLimit() { return this.limit; }
  /** 판돈 배수 — 3라운드마다 1씩 오른다. 후반 라운드가 자동으로 더 극적이 된다. */
  get stakeMult() { return 1 + Math.floor((this.round - 1) / 3); }
  get done() { return this.score.some((v) => v >= this.o.target); }
  /** 승자 인덱스, 아직/무승부면 -1. 반환형을 number 로 못 박는다 —
   *  리터럴 유니온(-1|0|1)으로 추론되면 호출부에서 색 배열 인덱싱이 막힌다. */
  winner(): number {
    if (!this.done) return -1;
    if (this.score[0] === this.score[1]) return -1;
    return this.score[0] > this.score[1] ? 0 : 1;
  }
  /** 넘길 수 있나. 차례에 한 번은 굴려야 한다. */
  get canPass() { return !this.done && this.rolled; }
  /** 되돌릴 수 있나. 굴린 사람의 충전이 남아 있어야 한다. */
  get canUndo() { return this.snap !== null && this.snap.undoLeft[this.snap.turn] > 0; }
  /** 되돌리기를 쓸 수 있는 사람(없으면 -1). 화면이 누구 것인지 밝히는 데 쓴다. */
  get undoOwner() { return this.canUndo ? this.snap!.turn : -1; }

  private newRound(first: number) {
    // 1라운드는 항상 기본이다 — 첫 판부터 변칙이면 무엇이 기본인지 배울 자리가 없다.
    this.mod = this.round === 1 ? "none" : this.pool[Math.floor(this.rnd() * this.pool.length)];
    const [lo, hi] = this.limitRange;
    this.limit = lo + Math.floor(this.rnd() * Math.max(0, hi - lo + 1));
    this.gauge = 0;
    this.pot = [0, 0];
    this.turn = first;
    this.rolled = false;
    this.byPass = false;
    this.undoLeft = this.mod === "undo" ? [1, 1] : [0, 0];
    // snap 은 여기서 지우지 않는다 — 터진 직후의 구조 창구가 닫히면 안 된다.
    // 다음 굴림이 takeSnap 으로 덮고, 넘기기가 null 로 지운다.
  }

  /** 굴리기 직전 상태를 담는다. **조건 없이** 덮어써야 낡은 스냅샷이 남지 않는다. */
  private takeSnap() {
    this.snap = {
      gauge: this.gauge, pot: [...this.pot], score: [...this.score],
      turn: this.turn, rolled: this.rolled, byPass: this.byPass,
      limit: this.limit, round: this.round, mod: this.mod,
      undoLeft: [...this.undoLeft],
    };
  }

  /** 마지막 굴림을 통째로 되돌린다. 터진 라운드도 되돌아온다 — 그게 이 규칙의 전부다. */
  undo(): boolean {
    if (!this.canUndo) return false;
    const s = this.snap!;
    this.gauge = s.gauge; this.pot = [...s.pot]; this.score = [...s.score];
    this.turn = s.turn; this.rolled = s.rolled; this.byPass = s.byPass;
    this.limit = s.limit; this.round = s.round; this.mod = s.mod;
    this.undoLeft = [...s.undoLeft];
    this.undoLeft[this.turn]--;   // 자기 굴림은 자기 충전으로 되돌린다
    this.snap = null;
    return true;
  }

  private die() { return this.mod === "fixed" ? 3 : 1 + Math.floor(this.rnd() * this.sides); }

  roll(): RollResult | null {
    if (this.done) return null;
    const p = this.turn;
    this.takeSnap();
    // 강제 첫 굴림인가 — 판정을 굴리기 **전에** 잡아야 한다. rolled 가 곧 바뀐다.
    const forced = !this.rolled && this.byPass;
    const firstOfRound = !this.rolled && !this.byPass;
    // 연발은 두 번 굴린다. 첫 굴림에 터지면 두 번째는 안 굴린다.
    const times = this.mod === "burst" ? 2 : 1;
    const gain = this.mod === "double" ? 2 : 1;
    const faces: number[] = [];

    for (let i = 0; i < times; i++) {
      const f = this.die();
      faces.push(f);
      this.gauge += f;
      this.pot[p] += f * gain * this.stakeMult;
      this.rolled = true;
      if (this.gauge > this.limit) {
        const other = 1 - p;
        const lostPot = this.pot[p], bankedPot = this.pot[other];
        this.score[other] += bankedPot;
        const blame: Blame = forced ? "passer" : firstOfRound ? "none" : "self";
        const res: RollResult = {
          face: faces.reduce((a, b) => a + b, 0), faces: [...faces],
          gauge: this.gauge, boom: true, blame, player: p, lostPot, bankedPot,
        };
        this.round++;
        // 다음 라운드는 터진 사람이 먼저 시작한다 — 벌 위에 선수 불이익까지 얹지 않는다.
        // snap 은 그대로 살려둔다: 터진 직후 되돌리기로 이 라운드 종료 자체를 취소할 수 있다.
        // 유효성은 snap.undoLeft 가 판정하므로 새 라운드 충전과 섞이지 않는다.
        if (!this.done) this.newRound(p);
        return res;
      }
    }
    return {
      face: faces.reduce((a, b) => a + b, 0), faces,
      gauge: this.gauge, boom: false, blame: "none", player: p, lostPot: 0, bankedPot: 0,
    };
  }

  /** 차례를 상대에게 넘긴다. 게이지는 줄지 않는다 — 그래서 넘기기가 공격이다. */
  pass(): boolean {
    if (!this.canPass) return false;
    this.turn = 1 - this.turn;
    this.rolled = false;
    this.byPass = true;
    this.snap = null;   // 넘기고 나면 이전 굴림은 못 되돌린다
    // 뜨거운 감자 — 넘기는 값이 공짜가 아니다. 여기서 터짐을 판정하지는 않는다:
    // 아무도 안 굴렸는데 터지면 이상하다. 임계를 넘겨두면 다음 굴림이 확정으로 터지고
    // 그 책임은 넘긴 사람에게 간다(blame passer).
    if (this.mod === "hotpotato") this.gauge += 5;
    return true;
  }
}
