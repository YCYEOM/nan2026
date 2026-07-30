// 리듬 릴레이 판정 엔진. 공통 박자, 비트마다 담당(라운드로빈/변칙).
// 노트 종류: 탭 / 홀드(누르고 유지) / 동시(전원 탭) / 협동홀드(전원 같이 길게) / 연타(한 노트 여러 번).
// 모드: team(공유 콤보·생명 + 동시·협동) / solo(각자 점수, 동시류 비활성).

// "hold"=홀드 유지 중, "mash"=연타 채우는 중. 연타 노트는 hold 필드를 창 길이로 재사용하므로
// result 까지 공유하면 UI가 연타에 "홀드 유지"를 띄운다 → 별도 값으로 분리.
export type Result = "perfect" | "good" | "miss" | "early" | "wrong" | "sync" | "hold" | "mash";
export interface Judged { beat: number; player: number; result: Result; }
export interface RhythmOpts {
  bpm: number; beats: number; players: number; lives: number;
  leadIn: number; perfect: number; good: number;
  syncEvery?: number; syncBonus?: number;
  mode?: "team" | "solo";
  seed?: number; holdChance?: number; swapChance?: number; keysPerPlayer?: number;
}

// swap=반전. 표시 색만 상대 색으로 바꾼다 — owner 는 계속 "눌러야 하는 사람"이다.
// 판정·적중률이 owner 한 곳만 보므로 반전은 렌더링 문제로 남고 로직은 안 바뀐다.
// lane=플레이어 안에서 몇 번째 키인가. 담당(owner)이 맞아도 키가 틀리면 wrong 이다.
// 동시류(owner -1)는 전원이 함께 누르는 노트라 lane 을 따지지 않는다 — 자기 키 아무거나.
interface Note { t: number; owner: number; hold: number; mash: number; swap: boolean; lane: number } // owner -1=동시류, mash>0=연타(hold=창)

export class RhythmEngine {
  clock = 0;
  nextBeat = 0;
  combo = 0; maxCombo = 0; score = 0; hits = 0; accScore = 0;
  lives: number;
  pscore: number[]; pcombo: number[]; pmax: number[]; phits: number[];
  // 개인 적중률용. 변칙 차트는 담당을 랜덤으로 뽑아 P1/P2 노트 수·종류가 다르므로
  // 점수 비교는 차트 운을 재게 된다 → 판정받은 노트당 적중률로 비교한다.
  // 동시류도 포함한다 — 안 누르거나 먼저 뗀 사람이 특정되므로 그 사람에게 실패가 간다.
  pjudged: number[]; pacc: number[];
  last: Judged | null = null;
  syncPressed: boolean[]; syncReleased: boolean[]; // 동시/협동: 눌렀나 / 뗐나
  holding = false; holdBeat = -1; holdPlayer = -1; holdLane = 0;
  mashHits = 0; // 현재 연타 노트 누른 횟수
  private syncErr: number[];
  private chart: Note[];

  constructor(readonly o: RhythmOpts) {
    this.lives = o.lives;
    this.pscore = Array(o.players).fill(0);
    this.pcombo = Array(o.players).fill(0);
    this.pmax = Array(o.players).fill(0);
    this.phits = Array(o.players).fill(0);
    this.pjudged = Array(o.players).fill(0);
    this.pacc = Array(o.players).fill(0);
    this.syncPressed = Array(o.players).fill(false);
    this.syncReleased = Array(o.players).fill(false);
    this.syncErr = Array(o.players).fill(0);
    this.chart = this.buildChart();
  }

  private buildChart(): Note[] {
    const iv = 60 / this.o.bpm, sync = this.o.syncEvery ?? 0, team = !this.solo, hc = this.o.holdChance ?? 0.25;
    const sc = this.o.swapChance ?? 0, kpp = this.o.keysPerPlayer ?? 1;
    const chart: Note[] = [];
    if (this.o.seed === undefined) { // 균일 탭(기존 테스트 보존)
      for (let k = 0; k < this.o.beats; k++)
        chart.push({ t: this.o.leadIn + k * iv, owner: team && sync > 0 && (k + 1) % sync === 0 ? -1 : k % this.o.players, hold: 0, mash: 0, swap: false, lane: 0 });
      return chart;
    }
    let s = (this.o.seed >>> 0) || 1;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff;
    const gaps = [1, 1, 1, 1.5, 2];
    let t = this.o.leadIn;
    for (let k = 0; k < this.o.beats; k++) {
      let owner: number, hold = 0, mash = 0;
      if (team && sync > 0 && rnd() < 1 / sync) {          // 동시류
        owner = -1;
        hold = rnd() < 0.4 ? iv * (rnd() < 0.5 ? 1 : 2) : 0; // 40% 협동홀드, 아니면 동시탭
      } else {
        owner = Math.floor(rnd() * this.o.players);
        const r = rnd();
        if (r < hc) hold = iv * (rnd() < 0.5 ? 1 : 2);      // 단일 홀드
        else if (r < hc + 0.12) { mash = 3 + Math.floor(rnd() * 2); hold = iv * 1.6; } // 연타(3~4회, 창 1.6박)
      }
      // 반전은 담당이 정해진 노트만. 동시류(-1)는 전원 담당이라 "상대"가 없다.
      // sc=0 이면 rnd() 를 아예 소비하지 않는다 — 기존 시드 차트가 그대로 재현돼야 한다.
      const swap = sc > 0 && owner >= 0 && rnd() < sc;
      // 키가 하나면(kpp=1) rnd() 를 소비하지 않는다 — swap 과 같은 이유로 기존 차트를 보존한다.
      const lane = kpp > 1 && owner >= 0 ? Math.floor(rnd() * kpp) : 0;
      chart.push({ t, owner, hold, mash, swap, lane });
      t += hold + iv * gaps[Math.floor(rnd() * gaps.length)];
    }
    return chart;
  }

  get solo() { return this.o.mode === "solo"; }
  beatTime(k: number) { return this.chart[k]?.t ?? this.o.leadIn; }
  ownerOf(k: number) { return this.chart[k]?.owner ?? -1; }
  holdOf(k: number) { return this.chart[k]?.hold ?? 0; }
  mashOf(k: number) { return this.chart[k]?.mash ?? 0; }
  /** 반전 노트인가. 표시 색만 상대 색이 된다 — 눌러야 하는 사람은 ownerOf 그대로다. */
  swapOf(k: number) { return this.chart[k]?.swap ?? false; }
  /** 담당자의 몇 번째 키인가. 동시류는 lane 을 안 따지므로 의미 없다. */
  laneOf(k: number) { return this.chart[k]?.lane ?? 0; }
  /** 반전 노트의 표시 색 주인(= 담당의 상대). 반전이 아니면 담당 그대로. */
  shownOwnerOf(k: number) {
    const o = this.ownerOf(k);
    return this.swapOf(k) && o >= 0 ? (o + 1) % this.o.players : o;
  }
  isSync(k: number) { return this.ownerOf(k) === -1 && this.holdOf(k) === 0; } // 동시 탭
  isCoop(k: number) { return this.ownerOf(k) === -1 && this.holdOf(k) > 0; }   // 협동 홀드
  currentPlayer() { return this.ownerOf(this.nextBeat); }
  get done() { return this.solo ? this.nextBeat >= this.o.beats : (this.lives <= 0 || this.nextBeat >= this.o.beats); }
  get won() { return !this.solo && this.lives > 0 && this.nextBeat >= this.o.beats; }
  accuracy() { return this.nextBeat > 0 ? (this.accScore / this.nextBeat) * 100 : 100; }
  /** 담당 노트당 적중률(%). 담당이 하나도 없으면 0 — 비교에서 유리해지면 안 된다. */
  paccuracy(i: number) { return this.pjudged[i] > 0 ? (this.pacc[i] / this.pjudged[i]) * 100 : 0; }
  winner(): number {
    if (!this.solo) return -1;
    // 점수가 아니라 적중률로 가린다. 변칙 차트는 담당 노트 수·종류(연타·홀드 보너스)가
    // 플레이어마다 달라서 점수 비교는 실력이 아니라 차트 운을 잰다.
    let best = -Infinity, bi = -1, tie = false;
    for (let i = 0; i < this.o.players; i++) {
      const v = this.paccuracy(i);
      if (v > best) { best = v; bi = i; tie = false; } else if (v === best) tie = true;
    }
    return tie ? -1 : bi;
  }

  private advance() {
    this.nextBeat++;
    this.syncPressed = this.syncPressed.map(() => false);
    this.syncReleased = this.syncReleased.map(() => false);
    this.syncErr = this.syncErr.map(() => 0);
    this.mashHits = 0;
  }

  private applyHit(k: number, player: number, result: Result, mult: number) {
    this.accScore += result === "perfect" ? 1 : 0.6;
    this.tally(k, result === "perfect" ? 1 : 0.6);
    const pts = (result === "perfect" ? 100 : 50) * mult, p = Math.max(0, player);
    if (this.solo) {
      this.pcombo[p]++; this.pmax[p] = Math.max(this.pmax[p], this.pcombo[p]); this.phits[p]++;
      this.pscore[p] += pts * Math.min(this.pcombo[p], 8);
    } else {
      this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo); this.hits++;
      this.score += pts * Math.min(this.combo, 8);
    }
  }

  private missAt(k: number, mp: number, did?: boolean[]) {
    if (this.solo) { if (mp >= 0) this.pcombo[mp] = 0; }
    else { this.combo = 0; this.lives--; }
    this.tally(k, 0, did);
    this.last = { beat: k, player: mp, result: "miss" };
  }

  /**
   * 노트 k 판정 1건을 개인별로 기록. ok: perfect 1 / good 0.6 / miss 0.
   * 동시류는 전원에게 기록하되 `did[i]`(자기 몫을 했는가)로 가른다 —
   * 한 명이 안 누르거나 먼저 떼서 팀이 깨지면 그 사람만 실패로 잡힌다.
   */
  private tally(k: number, ok: number, did?: boolean[]) {
    const o = this.ownerOf(k);
    if (o >= 0) { this.pjudged[o]++; this.pacc[o] += ok; return; }
    for (let i = 0; i < this.o.players; i++) {
      this.pjudged[i]++;
      // did 가 오면 팀이 깨진 경우다. 자기 몫을 한 사람은 1(타이밍 등급은 따지지 않는다),
      // 안 한 사람은 0. did 가 없으면 전원 성공이라 판정 등급 ok 를 그대로 준다.
      this.pacc[i] += did ? (did[i] ? 1 : 0) : ok;
    }
  }


  private holdBeats(k: number) { return 1 + Math.round(this.holdOf(k) / (60 / this.o.bpm)); }

  step(dt: number): Judged[] {
    const out: Judged[] = [];
    if (this.done) return out;
    this.clock += dt;
    while (this.nextBeat < this.o.beats) {
      const k = this.nextBeat, start = this.beatTime(k);
      if (this.holding && this.holdBeat === k) { // 홀드/협동홀드 유지 중
        if (this.clock > start + this.holdOf(k) + this.o.good) { // 끝까지 유지 → 자동 성공
          const coop = this.ownerOf(k) === -1;
          this.applyHit(k, this.holdPlayer, "good", coop ? (this.o.syncBonus ?? 2) : this.holdBeats(k));
          this.last = { beat: k, player: coop ? -1 : this.holdPlayer, result: "good" }; out.push(this.last);
          this.holding = false; this.advance(); continue;
        }
        break;
      }
      if (this.mashOf(k) > 0) { // 연타 창(뒤 grace 포함)
        if (this.clock > start + this.holdOf(k) + this.o.good) { this.missAt(k, this.ownerOf(k)); out.push(this.last!); this.advance(); if (!this.solo && this.lives <= 0) break; continue; }
        break;
      }
      if (this.clock > start + this.o.good) { // 탭/동시시작/홀드시작 놓침
        // 동시류는 창 안에 누른 사람만 자기 몫을 한 것 → 안 누른 사람에게만 실패가 간다.
        this.missAt(k, this.ownerOf(k), this.ownerOf(k) === -1 ? this.syncPressed.slice() : undefined);
        out.push(this.last!); this.advance();
        if (!this.solo && this.lives <= 0) break; continue;
      }
      break;
    }
    return out;
  }

  /** lane = 그 플레이어의 몇 번째 키인가. 키가 하나뿐인 설정에서는 항상 0이다. */
  press(player: number, lane = 0): Judged {
    if (this.done || this.nextBeat >= this.o.beats || this.holding) return { beat: this.nextBeat, player, result: "wrong" };
    const k = this.nextBeat, start = this.beatTime(k), err = Math.abs(this.clock - start);

    if (this.ownerOf(k) === -1) { // 동시 탭 or 협동 홀드 — 전원 start 창에 press
      if (err > this.o.good) return { beat: k, player, result: "early" };
      if (!this.syncPressed[player]) { this.syncPressed[player] = true; this.syncErr[player] = err; }
      if (this.syncPressed.slice(0, this.o.players).every(Boolean)) {
        if (this.holdOf(k) === 0) { // 동시 탭 → 즉시 판정
          const worst = Math.max(...this.syncErr.slice(0, this.o.players));
          const result: Result = worst <= this.o.perfect ? "perfect" : "good";
          this.accScore += result === "perfect" ? 1 : 0.6;
          this.tally(k, result === "perfect" ? 1 : 0.6); // 전원 성공 (applyHit 을 안 거치는 경로)
          this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo); this.hits++;
          this.score += (result === "perfect" ? 100 : 50) * Math.min(this.combo, 8) * (this.o.syncBonus ?? 2);
          this.advance(); this.last = { beat: k, player, result }; return this.last;
        }
        this.holding = true; this.holdBeat = k; this.holdPlayer = player; // 협동 홀드 시작(전원 유지)
        this.last = { beat: k, player, result: "hold" }; return this.last;
      }
      return { beat: k, player, result: "sync" };
    }

    if (this.mashOf(k) > 0) { // 연타 — 창 앞뒤로 good만큼 여유
      if (this.clock < start - this.o.good || this.clock > start + this.holdOf(k) + this.o.good) return { beat: k, player, result: "early" };
      if (player !== this.ownerOf(k) || lane !== this.laneOf(k)) return { beat: k, player, result: "wrong" };
      this.mashHits++;
      if (this.mashHits >= this.mashOf(k)) { // 채움 → 성공(횟수 보너스)
        this.applyHit(k, player, "perfect", 1 + this.mashOf(k) * 0.4);
        this.advance(); this.last = { beat: k, player, result: "perfect" }; return this.last;
      }
      this.last = { beat: k, player, result: "mash" }; return this.last; // 진행중
    }

    if (player !== this.ownerOf(k) || lane !== this.laneOf(k)) return { beat: k, player, result: "wrong" };
    if (err > this.o.good) return { beat: k, player, result: "early" };
    if (this.holdOf(k) > 0) { // 단일 홀드 시작
      this.holding = true; this.holdBeat = k; this.holdPlayer = player; this.holdLane = lane;
      this.last = { beat: k, player, result: "hold" }; return this.last;
    }
    const result: Result = err <= this.o.perfect ? "perfect" : "good";
    this.applyHit(k, player, result, 1);
    this.advance(); this.last = { beat: k, player, result }; return this.last;
  }

  release(player: number, lane = 0): Judged | null {
    if (!this.holding) return null;
    const k = this.holdBeat, end = this.beatTime(k) + this.holdOf(k), err = this.clock - end;

    if (this.ownerOf(k) === -1) { // 협동 홀드 — 전원이 끝에 뗌
      if (err < -this.o.good) { // 한 명이라도 일찍 뗌 → 팀 브레이크. 먼저 뗀 사람만 실패로 기록.
        this.holding = false;
        this.missAt(k, -1, this.syncReleased.map((_, i) => i !== player));
        this.advance(); return this.last;
      }
      if (!this.syncReleased[player]) this.syncReleased[player] = true;
      if (this.syncReleased.slice(0, this.o.players).every(Boolean)) {
        const result: Result = Math.abs(err) <= this.o.perfect ? "perfect" : "good";
        this.holding = false; this.applyHit(k, -1, result, (this.o.syncBonus ?? 2) * this.holdBeats(k));
        this.advance(); this.last = { beat: k, player: -1, result }; return this.last;
      }
      return { beat: k, player, result: "hold" }; // 다른 사람 대기
    }

    // 단일 홀드. 같은 사람이 다른 키를 떼도 홀드가 끊기면 안 된다 → lane 까지 본다.
    if (player !== this.holdPlayer || lane !== this.holdLane) return null;
    this.holding = false;
    if (err < -this.o.good) { this.missAt(k, this.holdPlayer); this.advance(); return this.last; }
    const result: Result = Math.abs(err) <= this.o.perfect ? "perfect" : "good";
    this.applyHit(k, this.holdPlayer, result, this.holdBeats(k));
    this.advance(); this.last = { beat: k, player: this.holdPlayer, result }; return this.last;
  }
}
