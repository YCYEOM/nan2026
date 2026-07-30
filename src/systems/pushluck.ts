// 떠넘기기 코어 — 공유 게이지 · 숨은 임계값 · 굴리기/넘기기 · 범인 판정.
// 렌더 비의존. 턴제라 dt 가 없다 — 입력 이벤트만으로 상태가 움직인다.
//
// 설계에서 막은 두 붕괴(CON-003):
//  1) 넘기기가 공짜면 "항상 즉시 넘기기"가 지배전략 → 차례에 한 번 굴려야 넘길 수 있다.
//  2) 굴리기가 순수 손해면 아무도 안 굴린다 → 오른 게이지만큼 내 pot 도 오른다.
// 하나만 빼도 한쪽이 지배전략이 되어 "굴릴까 넘길까"가 결정이 아니게 된다.

/** 터진 책임이 누구에게 있나. 이 게임이 클립이 되는 이유다. */
export type Blame = "passer" | "self" | "none";
export interface RollResult {
  face: number;        // 굴린 눈
  gauge: number;       // 굴린 뒤 게이지
  boom: boolean;
  blame: Blame;        // boom 일 때만 의미가 있다
  player: number;      // 굴린 사람
  lostPot: number;     // 터져서 소멸한 pot (boom 일 때)
  bankedPot: number;   // 상대가 확보한 pot (boom 일 때)
}

export interface PushOpts {
  limitMin: number; limitMax: number; target: number;
  sides?: number;      // 주사위 면 수. 기본 6
  seed?: number;       // 없으면 Math.random
}

export class PushLuck {
  gauge = 0;
  pot = [0, 0];
  score = [0, 0];
  turn = 0;
  round = 1;
  /** 이번 차례에 굴렸는가. false 면 넘기기가 거부된다. */
  rolled = false;
  /** 이번 차례가 상대의 넘기기로 시작됐는가. 강제 첫 굴림에 터지면 넘긴 사람 탓이다. */
  private byPass = false;
  /** 숨은 임계값. 범위는 공개하고 값은 감춘다. */
  private limit = 0;
  private rnd: () => number;
  readonly sides: number;

  constructor(readonly o: PushOpts) {
    this.sides = o.sides ?? 6;
    if (o.seed === undefined) {
      this.rnd = Math.random;
    } else {
      let s = (o.seed >>> 0) || 1;
      this.rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000;
    }
    this.newRound(0);
  }

  /** 임계 범위 — 화면과 시청자에게 보여주는 유일한 위험 정보. */
  get limitRange(): [number, number] { return [this.o.limitMin, this.o.limitMax]; }
  /** 테스트·기록용. 플레이 중 화면에 띄우면 도박이 산수가 된다. */
  get hiddenLimit() { return this.limit; }
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

  private newRound(first: number) {
    const span = Math.max(0, this.o.limitMax - this.o.limitMin);
    this.limit = this.o.limitMin + Math.floor(this.rnd() * (span + 1));
    this.gauge = 0;
    this.pot = [0, 0];
    this.turn = first;
    this.rolled = false;
    this.byPass = false;
  }

  roll(): RollResult | null {
    if (this.done) return null;
    const p = this.turn;
    const face = 1 + Math.floor(this.rnd() * this.sides);
    // 강제 첫 굴림인가 — 판정을 굴리기 **전에** 잡아야 한다. rolled 가 곧 바뀐다.
    const forced = !this.rolled && this.byPass;
    const firstOfRound = !this.rolled && !this.byPass;
    this.gauge += face;
    this.pot[p] += face;
    this.rolled = true;

    if (this.gauge <= this.limit) {
      return { face, gauge: this.gauge, boom: false, blame: "none", player: p, lostPot: 0, bankedPot: 0 };
    }
    // 터짐 — 내 pot 은 소멸하고 상대는 자기 pot 을 확보한다. 스윙이 양쪽으로 난다.
    const other = 1 - p;
    const lostPot = this.pot[p], bankedPot = this.pot[other];
    this.score[other] += bankedPot;
    const blame: Blame = forced ? "passer" : firstOfRound ? "none" : "self";
    const res: RollResult = { face, gauge: this.gauge, boom: true, blame, player: p, lostPot, bankedPot };
    this.round++;
    // 다음 라운드는 터진 사람이 먼저 시작한다 — 벌 위에 선수 불이익까지 얹지 않는다.
    if (!this.done) this.newRound(p);
    return res;
  }

  /** 차례를 상대에게 넘긴다. 게이지는 줄지 않는다 — 그래서 넘기기가 공격이다. */
  pass(): boolean {
    if (!this.canPass) return false;
    this.turn = 1 - this.turn;
    this.rolled = false;
    this.byPass = true;
    return true;
  }
}
