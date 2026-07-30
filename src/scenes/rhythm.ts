// 리허설4 "리듬" — 협동 릴레이. 한 명씩 돌아가며 자기 차례 비트를 타이밍 맞춰 누른다.
// 재사용: Harness, Sfx. 신규: RhythmEngine. N인 확장 = PLAYERS/KEYS/COLORS만 늘리면 됨.
import { Harness, Scene, PointerState } from "../core/harness";
import { RhythmEngine, RhythmOpts, Result } from "../systems/rhythm";
import { Sfx } from "../systems/sfx";
import { C, F, font, withAlpha, sigGradient, glow } from "../ui/tokens";

const PLAYERS = 2;
const KEYS_PER_PLAYER = 3;
// KEYS[플레이어][레인]. 인원·키 확장은 이 두 배열과 C.player 만 늘리면 된다.
// 홈 포지션 기준 — P1 왼손 약·중·검지(S D F), P2 오른손 검·중·약지(J K L).
const KEYS = [["KeyS", "KeyD", "KeyF"], ["KeyJ", "KeyK", "KeyL"]];
const KEY_LABEL = [["S", "D", "F"], ["J", "K", "L"]];
const COLORS = C.player;
const BASE: RhythmOpts = { bpm: 90, beats: 32, players: PLAYERS, lives: 4, leadIn: 2.0, perfect: 0.09, good: 0.2, syncEvery: 4, syncBonus: 2 };
const APPROACH = 2.0;          // 비트가 보이기 시작하는 선행 시간(초)
const HIT_X = 150;             // 판정선 x
const TAIL_SEGMENTS = 16;      // 홀드 꼬리를 궤도 따라 그릴 때 나눌 구간 수
// 레인 = 플레이어 × 키. 한 플레이어의 키가 위아래로 붙어 있어 "내 구역"이 한 덩어리로 읽힌다.
const LANES = PLAYERS * KEYS_PER_PLAYER;
// 하이웨이 세로 공간: 차례 안내(y 140) 아래 ~ 키 힌트(y 428) 위.
// 레인 높이·노트 반지름·웨이브 진폭을 이 공간에서 **유도한다.** 키를 늘릴 때마다
// 세 값을 손으로 다시 맞추면 반드시 하나를 놓친다 — 제약을 주석이 아니라 식으로 둔다.
const LANE_TOP = 158, LANE_SPACE = 258;
const LANE_H = Math.floor(LANE_SPACE / LANES);
const LANE_BOT = LANE_TOP + LANE_H * LANES;
const MID_Y = LANE_TOP + (LANE_H * LANES) / 2;   // 동시류는 레인이 없다 → 하이웨이 중앙
const HALF = Math.floor(LANE_H / 2);
// 반전 점선 링이 `rad + 6` 이라 그것까지 레인 안에 들어와야 한다.
const RAD = Math.min(16, HALF - 6), RAD_FAR = RAD - 2;
// 웨이브 진폭. `WAVE + RAD <= LANE_H/2` — 넘으면 노트가 옆 레인을 침범해 어느 키인지 못 읽는다.
// 레인 도입 전에는 26이었다. 레인이 생기면서 굽이침보다 "어느 키인가"가 먼저다.
const WAVE = Math.max(0, HALF - RAD);
const laneIdx = (p: number, l: number) => p * KEYS_PER_PLAYER + l;
const laneY = (p: number, l: number) => LANE_TOP + LANE_H * laneIdx(p, l) + LANE_H / 2;
// 키 코드 → {플레이어, 레인}
const KEYMAP: Record<string, { p: number; l: number }> = Object.fromEntries(
  KEYS.slice(0, PLAYERS).flatMap((ks, p) => ks.slice(0, KEYS_PER_PLAYER).map((code, l) => [code, { p, l }])),
);
// 직접 작곡한 멜로디(C 메이저 펜타토닉, 16음 루프). 비트마다 한 음 → 타이밍의 귀 앵커.
// 마음에 들면 이 배열만 늘리면 됨(펜타토닉이라 어떤 부분도 안 튐).
const MELODY = [
  261.63, 329.63, 392.00, 440.00, 392.00, 329.63, 293.66, 329.63,
  392.00, 440.00, 523.25, 440.00, 392.00, 329.63, 392.00, 261.63,
];

export class RhythmScene implements Scene {
  private eng!: RhythmEngine;
  private sfx = new Sfx();
  private lastTick = -1;
  private fb: { result: Result; player: number; at: number; y: number } | null = null;
  private opts!: RhythmOpts;
  private mode: "team" | "solo";
  // juice: 파티클·화면 흔들림·비트 섬광
  private parts: { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string; r: number }[] = [];
  private rings: { r: number; life: number; max: number; c: string; w: number; y: number }[] = [];
  private shake = 0; private beatFlash = 0; private missFlash = 0;
  private stage = 0; private cleared = false; // 스테이지 진행

  constructor(private h: Harness, mode: "team" | "solo" = "team") {
    this.mode = mode;
    this.reset();
  }

  // 스테이지가 오를수록 템포↑·판정창↓·동시/홀드↑ (더 빠르고 복잡).
  private optsForStage(stage: number): RhythmOpts {
    return {
      ...BASE, mode: this.mode, seed: Math.floor(Math.random() * 1e9) || 1,
      bpm: BASE.bpm + stage * 12,
      perfect: Math.max(0.05, 0.09 - stage * 0.008),
      good: Math.max(0.12, 0.2 - stage * 0.015),
      syncEvery: Math.max(2, 4 - stage),
      holdChance: Math.min(0.5, 0.25 + stage * 0.06),
      keysPerPlayer: KEYS_PER_PLAYER,
      // 반전은 2스테이지부터. 1스테이지는 색이 담당을 말한다는 규칙을 배우는 자리다.
      swapChance: stage === 0 ? 0 : Math.min(0.35, 0.15 + (stage - 1) * 0.07),
    };
  }

  private reset() {
    this.opts = this.optsForStage(this.stage);
    this.eng = new RhythmEngine(this.opts);
    this.lastTick = -1; this.fb = null;
    this.parts = []; this.rings = []; this.shake = 0; this.beatFlash = 0; this.missFlash = 0;
    this.h.score = 0;
    this.h.to("play");
    this.h.record("reset", { stage: this.stage });
  }

  private burst(color: string, n: number, speed: number, life: number, r: number, y: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = speed * (0.4 + Math.random() * 0.6);
      this.parts.push({ x: HIT_X, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, max: life, c: color, r });
    }
  }

  private ring(color: string, w: number, life: number, y: number) {
    this.rings.push({ r: 20, life, max: life, c: color, w, y });
  }

  /**
   * 판정 등급별 피드백. 셋이 확실히 달라야 "방금 뭐였지"가 안 생긴다.
   * perfect 링 2겹 + 파티클 22 + 흔들림 3.5 / good 링 1겹 + 파티클 9 + 흔들림 1 / miss 링 없음 + 붉은 가장자리.
   */
  private feedback(result: Result, player: number, y: number) {
    const color = COLORS[player >= 0 ? player : 0];
    if (result === "perfect") {
      this.sfx.hit(true);
      this.ring(C.text, 5, 0.28, y); this.ring(color, 3, 0.42, y);
      this.burst(color, 22, 300, 0.55, 3.5, y);
      this.burst(C.text, 6, 170, 0.35, 2, y);
      this.shake = Math.max(this.shake, 3.5);
      this.beatFlash = Math.max(this.beatFlash, 0.7);
    } else if (result === "good") {
      this.sfx.hit(false);
      this.ring(color, 2, 0.3, y);
      this.burst(color, 9, 150, 0.4, 2.5, y);
      this.shake = Math.max(this.shake, 1);
    } else { // miss
      this.sfx.missHit();
      this.burst(C.danger, 7, 70, 0.5, 2.5, y); // 힘없이 흩어져 아래로 떨어진다
      this.shake = 8;
      this.missFlash = 0.5;
    }
  }

  /**
   * 노트가 p 시점에 놓인 레인 y (p=1 등장, p=0 판정선). 동시류는 레인이 없어 하이웨이 중앙.
   *
   * 반전 노트는 **상대 레인에서 등장해 담당 레인으로 건너온다.** 레인을 도입하니
   * 위치가 색보다 강한 신호가 돼서, 담당 레인에 그리면 "저 사람 줄에 있으니 저 사람 것"으로
   * 반전이 무의미해졌다. 등장 시점의 위치를 색과 같이 거짓말시켜 반사를 잡고,
   * 판정 시점에는 담당 레인에 수렴시켜 표적 원과 어긋나지 않게 한다.
   */
  private laneAt(k: number, p: number) {
    const e = this.eng, o = e.ownerOf(k);
    if (o === -1) return MID_Y;
    const to = laneY(o, e.laneOf(k));                    // 판정 시점 = 담당 레인
    if (!e.swapOf(k)) return to;
    const from = laneY(e.shownOwnerOf(k), e.laneOf(k));  // 등장 시점 = 상대 레인
    return to + (from - to) * p;
  }

  enter() { this.reset(); }
  pointer(p: PointerState) { if (this.h.phase !== "play" && p.justDown) this.proceed(); }

  // 종료 화면에서: 클리어면 다음 스테이지, 실패면 같은 스테이지 재도전.
  private proceed() { if (this.cleared) this.stage++; this.reset(); }

  key(code: string, down: boolean) {
    if (down && code === "KeyR") return this.reset(); // 이 스테이지 다시
    if (down && code === "KeyM") { this.sfx.toggleMute(); return; }
    if (down && code === "Space" && this.h.phase !== "play") return this.proceed();
    if (this.h.phase !== "play" || !(code in KEYMAP)) return;
    const { p: pl, l: lane } = KEYMAP[code];
    if (down) {
      const j = this.eng.press(pl, lane);
      // 판정 y 는 판정된 노트(j.beat)의 레인이다. press 성공 시 nextBeat 가 이미 넘어가므로
      // 현재 노트가 아니라 j.beat 를 봐야 한다.
      const y = this.laneAt(j.beat, 0);
      this.fb = { result: j.result, player: pl, at: this.eng.clock, y };
      if (j.result === "perfect" || j.result === "good") this.feedback(j.result, pl, y);
      else if (j.result === "sync" || j.result === "hold" || j.result === "mash") this.sfx.tick(); // 등록 확인음
      this.h.record("press", j);
    } else {
      const j = this.eng.release(pl, lane); // 홀드/협동홀드 뗌
      if (j) {
        const y = this.laneAt(j.beat, 0);
        this.fb = { result: j.result, player: pl, at: this.eng.clock, y };
        if (j.result === "perfect" || j.result === "good" || j.result === "miss") this.feedback(j.result, pl, y);
        else if (j.result === "hold") this.sfx.tick(); // 협동: 내 뗌 등록, 파트너 대기
        this.h.record("release", j);
      }
    }
  }

  hud() {
    const e = this.eng;
    const st = ` <b>ST${this.stage + 1}</b>(${this.opts.bpm}bpm)`;
    const acc = ` &nbsp; 정확도 <b style="color:${e.accuracy() >= 90 ? C.success : C.accent}">${e.accuracy().toFixed(0)}%</b><span style="opacity:.6">(${Math.min(e.nextBeat, this.opts.beats)}/${this.opts.beats})</span>`;
    const beat = ` &nbsp; 비트 ${Math.min(e.nextBeat, this.opts.beats)}/${this.opts.beats}`;
    const tail = ` &nbsp; <span style="opacity:.6">키 ${KEY_LABEL.slice(0, PLAYERS).map((ks, i) => `P${i + 1}:${ks.slice(0, KEYS_PER_PLAYER).join("")}`).join(" ")} · 음소거[M] ${this.sfx.muted ? "🔇" : "🔊"} · 90%↑ 다음 스테이지</span>`;
    if (e.solo) {
      // 담당 노트 수가 플레이어마다 다르므로 비교는 적중률로 한다. 점수는 참고값.
      const p = e.pscore.map((s, i) =>
        `<span style="color:${COLORS[i]}">P${i + 1} ${e.paccuracy(i).toFixed(0)}%<span style="opacity:.6">(${e.pjudged[i]}노트·${s}점)</span></span>`).join(" vs ");
      return `<b>리듬 대결</b>${st} &nbsp; ${p}${acc}${beat}${tail}`;
    }
    return `<b>리듬 릴레이</b>${st} &nbsp; 점수 ${e.score}` +
      ` &nbsp; 콤보 <b style="color:${C.accent}">${e.combo}</b> &nbsp; 생명 ${"♥".repeat(Math.max(0, e.lives))}${acc}${beat}${tail}`;
  }

  update(dt: number) {
    if (this.h.phase !== "play") return; // 종료 화면 진행은 pointer/key에서 처리(harness는 play에서만 update)
    for (const j of this.eng.step(dt)) { // step은 놓친 미스 + 끝까지 유지된 홀드 성공을 반환
      const y = this.laneAt(j.beat, 0);
      this.fb = { result: j.result, player: j.player, at: this.eng.clock, y };
      this.feedback(j.result === "miss" ? "miss" : "good", j.player, y);
    }
    // 멜로디: 비트를 넘을 때마다 그 음 연주 + 비트 섬광. 홀드는 길게 울림.
    while (this.lastTick + 1 < this.opts.beats && this.eng.clock >= this.eng.beatTime(this.lastTick + 1)) {
      this.lastTick++;
      const dur = this.eng.holdOf(this.lastTick) > 0 ? Math.min(1.2, this.eng.holdOf(this.lastTick)) : 0.22;
      this.sfx.note(MELODY[this.lastTick % MELODY.length], dur);
      this.beatFlash = 0.5;
    }
    // juice 감쇠 + 파티클 진행
    this.shake = Math.max(0, this.shake - dt * 40);
    this.beatFlash = Math.max(0, this.beatFlash - dt * 2.5);
    this.missFlash = Math.max(0, this.missFlash - dt * 2);
    for (const q of this.parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 220 * dt; q.life -= dt; }
    this.parts = this.parts.filter((q) => q.life > 0);
    for (const g of this.rings) { g.r += (200 + g.w * 30) * dt; g.life -= dt; }
    this.rings = this.rings.filter((g) => g.life > 0);
    this.h.score = this.eng.score;
    if (this.eng.done && this.h.phase === "play") {
      const finished = this.eng.nextBeat >= this.opts.beats; // 끝까지 감(팀전 생명 소진 아님)
      this.cleared = finished && this.eng.accuracy() >= 90;   // 90%↑ = 스테이지 클리어
      this.h.to(this.cleared ? "win" : "lose");
      this.cleared ? this.sfx.win() : this.sfx.lose();
      this.h.record(this.cleared ? "stage-clear" : "stage-fail", { stage: this.stage, acc: Math.round(this.eng.accuracy()) });
    }
  }

  // 접근 경로: x는 등속(시각 도착=실제 박자, 공정). 일부 노트만 y로 굽이침(판정선엔 정확히 수렴).
  private span = 640 - HIT_X - 40;
  // 탭은 약 1/3만 웨이브(전부 굽이치면 과함). 홀드는 꼬리가 길어 모양이 읽히므로 항상 웨이브.
  // 연타는 hold 를 창 길이로 재사용할 뿐 꼬리를 안 그리므로 제외한다.
  private wavy(k: number) { return k % 3 === 1 || (this.eng.holdOf(k) > 0 && this.eng.mashOf(k) === 0); }
  private pathX(p: number) { return HIT_X + p * this.span; }
  // 웨이브는 자기 레인 안에서만 굽이친다. 진폭이 레인 반높이를 넘으면 어느 키인지 못 읽는다.
  private pathY(k: number, p: number) {
    const base = this.laneAt(k, p);
    return this.wavy(k) ? base + WAVE * Math.sin(p * Math.PI * (2 + (k % 3))) : base;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const e = this.eng;
    ctx.clearRect(0, 0, 640, 480);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, 640, 480);

    ctx.save();
    if (this.shake > 0.1) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);

    // 하이웨이. 레인마다 소유자 색을 아주 옅게 깔아 "위 두 줄은 내 구역"이 배경에서 읽힌다.
    ctx.fillStyle = C.surface; ctx.fillRect(0, LANE_TOP, 640, LANE_H * LANES);
    for (let p = 0; p < PLAYERS; p++) for (let l = 0; l < KEYS_PER_PLAYER; l++) {
      ctx.fillStyle = withAlpha(COLORS[p], 0.05);
      ctx.fillRect(0, LANE_TOP + LANE_H * laneIdx(p, l), 640, LANE_H);
    }
    if (this.beatFlash > 0) { ctx.fillStyle = withAlpha(C.text, this.beatFlash * 0.18); ctx.fillRect(0, LANE_TOP, 640, LANE_H * LANES); }
    // 레인 구분선. 플레이어 경계는 진하게, 같은 사람의 키 사이는 흐리게 — 묶음이 보인다.
    for (let i = 1; i < LANES; i++) {
      ctx.strokeStyle = withAlpha(C.line, i % KEYS_PER_PLAYER === 0 ? 0.9 : 0.35); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, LANE_TOP + LANE_H * i + 0.5); ctx.lineTo(640, LANE_TOP + LANE_H * i + 0.5); ctx.stroke();
    }
    // 테두리만 시그니처 그라데이션(장식) — 상태를 알리는 요소가 아니다.
    ctx.strokeStyle = sigGradient(ctx, 0, LANE_TOP, 640, LANE_BOT); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, LANE_TOP + 0.5); ctx.lineTo(640, LANE_TOP + 0.5);
    ctx.moveTo(0, LANE_BOT - 0.5); ctx.lineTo(640, LANE_BOT - 0.5); ctx.stroke();

    // 판정선 — 지금 담당인 사람의 색으로 빛난다. 화면에서 가장 큰 시각 요소가 차례를 말한다.
    const turnColor = e.currentPlayer() === -1 ? C.text : COLORS[e.currentPlayer()];
    glow(ctx, turnColor, 18, () => {
      ctx.strokeStyle = turnColor; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(HIT_X, LANE_TOP - 5); ctx.lineTo(HIT_X, LANE_BOT + 5); ctx.stroke();
    });
    // 레인마다 표적 원. 다음 노트가 올 레인만 밝게 — 키가 넷이면 "어디로 오는가"가 타이밍만큼 중요하다.
    const nb0 = e.nextBeat, tp = e.currentPlayer();
    for (let p = 0; p < PLAYERS; p++) for (let l = 0; l < KEYS_PER_PLAYER; l++) {
      const ly = laneY(p, l);
      // 동시류는 레인이 없어 전원 표적이 켜진다. 아니면 담당 플레이어의 해당 레인만.
      const target = !e.done && (tp === -1 || (tp === p && e.laneOf(nb0) === l));
      if (target) {
        glow(ctx, COLORS[p], 14, () => {
          ctx.strokeStyle = COLORS[p]; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(HIT_X, ly, 15, 0, Math.PI * 2); ctx.stroke();
        });
        ctx.fillStyle = withAlpha(COLORS[p], 0.16);
        ctx.beginPath(); ctx.arc(HIT_X, ly, 15, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.strokeStyle = withAlpha(C.line, 0.8); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(HIT_X, ly, 15, 0, Math.PI * 2); ctx.stroke();
      }
    }

    // 접근하는 비트들 (변속·웨이브 궤도)
    for (let k = e.nextBeat; k < this.opts.beats; k++) {
      const dtb = e.beatTime(k) - e.clock;
      if (dtb > APPROACH) break;
      if (e.clock - (e.beatTime(k) + e.holdOf(k)) > 0.3) continue; // 끝 시각 기준 컬링
      const cur = k === e.nextBeat, rad = cur ? RAD : RAD_FAR;
      const held = cur && e.holding && e.holdBeat === k;
      const p = held ? 0 : Math.max(0, Math.min(1, dtb / APPROACH));
      const nx = held ? HIT_X : this.pathX(p), ny = held ? this.laneAt(k, 0) : this.pathY(k, p);
      ctx.globalAlpha = cur ? 1 : 0.8;
      const owner = e.ownerOf(k), hold = e.holdOf(k), mash = e.mashOf(k);
      // 반전 노트: 색은 상대(shown), 눌러야 하는 사람은 owner. 색이 거짓말하는 유일한 곳이다.
      const swap = e.swapOf(k), shown = e.shownOwnerOf(k);
      // 협동 홀드 / 홀드 / 연타 꼬리(막대)
      if (hold > 0 && mash === 0) {
        const pe = Math.max(0, Math.min(1, (e.beatTime(k) + hold - e.clock) / APPROACH));
        ctx.strokeStyle = owner === -1 ? C.text : COLORS[shown]; ctx.globalAlpha = held ? 0.9 : (cur ? 0.55 : 0.4);
        ctx.lineWidth = 14; ctx.lineCap = "round"; ctx.lineJoin = "round";
        // 꼬리를 머리·끝 두 점만 잇는 직선으로 그리면 웨이브 노트에서 궤도를 벗어난다.
        // 같은 pathX/pathY 를 여러 구간으로 샘플링해 궤도 위에 얹는다.
        ctx.beginPath(); ctx.moveTo(nx, ny);
        for (let s = 1; s <= TAIL_SEGMENTS; s++) {
          const t = held ? (pe * s) / TAIL_SEGMENTS : p + ((pe - p) * s) / TAIL_SEGMENTS;
          ctx.lineTo(this.pathX(t), this.pathY(k, t));
        }
        ctx.stroke();
        ctx.globalAlpha = cur ? 1 : 0.8;
      }
      if (owner === -1) { // 동시 탭 or 협동 홀드 — 흰 큰 원 + 색 반쪽
        glow(ctx, C.sig, 16, () => {
          ctx.fillStyle = withAlpha(C.text, 0.9); ctx.beginPath(); ctx.arc(nx, ny, rad + 3, 0, Math.PI * 2); ctx.fill();
        });
        for (let pl = 0; pl < PLAYERS; pl++) {
          ctx.fillStyle = COLORS[pl];
          ctx.globalAlpha = (cur && (held ? e.syncReleased[pl] : e.syncPressed[pl])) ? 0.3 : (cur ? 1 : 0.8);
          ctx.beginPath();
          ctx.arc(nx, ny, rad - 4, (pl / PLAYERS) * 2 * Math.PI - Math.PI / 2, ((pl + 1) / PLAYERS) * 2 * Math.PI - Math.PI / 2);
          ctx.lineTo(nx, ny); ctx.fill();
        }
        ctx.globalAlpha = cur ? 1 : 0.8;
        ctx.fillStyle = C.text; ctx.font = font(F.xs); ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(hold > 0 ? "협동" : "동시", nx, ny);
      } else if (mash > 0) { // 연타 — 노란 링 + 남은 횟수
        const remain = cur ? Math.max(0, mash - e.mashHits) : mash;
        ctx.fillStyle = withAlpha(COLORS[shown], 0.25); ctx.beginPath(); ctx.arc(nx, ny, rad, 0, Math.PI * 2); ctx.fill();
        // 연타 링은 rad+2. 반전 점선 링(rad+6)과 겹치지 않게 안쪽에 둔다 —
        // 연타 + 반전이 같은 노트에 걸리면 두 링이 포개져 둘 다 안 읽힌다.
        glow(ctx, C.accentHi, 14, () => {
          ctx.strokeStyle = C.accentHi; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(nx, ny, rad + 2, 0, Math.PI * 2); ctx.stroke();
        });
        ctx.fillStyle = C.text; ctx.font = font(F.xs); ctx.textAlign = "center"; ctx.textBaseline = "middle";
        // 키가 넷이면 "연타×3" 보다 "F×3" 이 낫다 — 어느 키인지가 몇 번인지보다 먼저다.
        ctx.fillText(`${KEY_LABEL[owner][e.laneOf(k)]}×${remain}`, nx, ny);
      } else { // 탭 / 단일 홀드 — 속을 비운 네온 링. 담당 색이 광원이다.
        glow(ctx, COLORS[shown], cur ? 16 : 8, () => {
          ctx.fillStyle = withAlpha(COLORS[shown], cur ? 0.22 : 0.14);
          ctx.beginPath(); ctx.arc(nx, ny, rad, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = COLORS[shown]; ctx.lineWidth = cur ? 4 : 3; ctx.stroke();
        });
        // 라벨은 담당 번호가 아니라 **누를 키**다. P1 이 키를 둘 가지면 "P1" 은 정보가 아니다.
        // 홀드는 꼬리 막대가 이미 종류를 말하므로 글자는 키에 쓴다.
        ctx.fillStyle = C.text; ctx.font = font(F.sm); ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(KEY_LABEL[owner][e.laneOf(k)], nx, ny);
      }
      // 반전 표식은 글자가 아니라 모양으로 준다. 12px 이모지는 반지름 18~22 원 안에서 뭉개져
      // 순간 판독이 안 됐다(DESIGN.md 원칙 2 — 색 하나에도, 작은 글자 하나에도 걸지 않는다).
      // 담당 색 점선 링을 두르면 한 노트에 두 색이 겹쳐 "특별한 노트"가 멀리서 보이고,
      // 점선 색이 눌러야 하는 사람을 말한다. 몸통은 여전히 상대 색이라 반사는 계속 속는다.
      if (swap) {
        ctx.save();
        ctx.setLineDash([5, 4]);
        glow(ctx, COLORS[owner], cur ? 12 : 6, () => {
          ctx.strokeStyle = COLORS[owner]; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(nx, ny, rad + 6, 0, Math.PI * 2); ctx.stroke();
        });
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    // 파티클 (정타 버스트)
    for (const q of this.parts) {
      ctx.globalAlpha = Math.max(0, q.life / q.max); ctx.fillStyle = q.c;
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.fill();
    }
    // 충격파 링 — perfect 는 2겹, good 은 1겹, miss 는 없음
    for (const g of this.rings) {
      const t = Math.max(0, g.life / g.max);
      ctx.globalAlpha = t; ctx.strokeStyle = g.c; ctx.lineWidth = g.w * t;
      ctx.beginPath(); ctx.arc(HIT_X, g.y, g.r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // 미스 — 화면 가장자리가 붉게 물든다. perfect/good 에는 없는 신호라 셋이 확실히 갈린다.
    if (this.missFlash > 0) {
      const g = ctx.createRadialGradient(320, 240, 180, 320, 240, 420);
      g.addColorStop(0, withAlpha(C.danger, 0));
      g.addColorStop(1, withAlpha(C.danger, this.missFlash * 0.5));
      ctx.fillStyle = g; ctx.fillRect(0, 0, 640, 480);
    }

    // 차례 표시
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    if (e.clock < e.beatTime(0)) {
      // 카운트다운에도 첫 노트 담당을 밝힌다. 누가 시작하는지 모른 채 노트가 도착하면 늦는다.
      const first = e.ownerOf(0);
      ctx.fillStyle = C.textMuted; ctx.font = font(F.xl);
      ctx.fillText(`준비… ${Math.ceil(e.beatTime(0) - e.clock)}`, 320, 112);
      ctx.font = font(F.xl);
      if (first === -1) {
        ctx.fillStyle = C.text;
        ctx.fillText(`첫 노트는 ${e.isCoop(0) ? "협동 홀드" : "동시"} — 모두 함께`, 320, 140);
      } else {
        ctx.fillStyle = COLORS[first];
        ctx.fillText(`첫 노트는 ${e.swapOf(0) ? "반전! " : ""}P${first + 1} — [${KEY_LABEL[first][e.laneOf(0)]}]`, 320, 140);
      }
    } else if (!e.done) {
      const pl = e.currentPlayer(), nb = e.nextBeat;
      const key = pl >= 0 ? KEY_LABEL[pl][e.laneOf(nb)] : "";
      ctx.font = font(F.xl);
      if (pl === -1) {
        ctx.fillStyle = C.text;
        const t = e.isCoop(nb) ? (e.holding ? "협동 홀드 — 끝에 다같이 떼기!" : "협동 홀드! 다같이 누르고 유지") : "◉ 동시! 모두 함께";
        // 동시류는 레인을 안 따진다 → 자기 키 아무거나. 그래서 두 키를 함께 보여준다.
        ctx.fillText(`${t} — ${KEY_LABEL.slice(0, PLAYERS).map((ks) => `[${ks.slice(0, KEYS_PER_PLAYER).join("/")}]`).join(" ")}`, 320, 140);
      } else if (e.swapOf(nb)) {
        // 색은 상대를 가리키고 있다. 문장이 사실을 말하는 유일한 채널이라 담당과 키를 명시한다.
        ctx.fillStyle = COLORS[pl];
        ctx.fillText(`🔀 반전! P${e.shownOwnerOf(nb) + 1} 색 → P${pl + 1} 가 [${key}]`, 320, 140);
      } else if (e.mashOf(nb) > 0) {
        ctx.fillStyle = COLORS[pl];
        ctx.fillText(`⚡ P${pl + 1} 연타! [${key}] ×${Math.max(0, e.mashOf(nb) - e.mashHits)}`, 320, 140);
      } else {
        ctx.fillStyle = COLORS[pl];
        ctx.fillText(`▶ P${pl + 1} 차례 — [${key}]`, 320, 140);
      }
    }

    // 콤보 — 팀전은 공유 콤보 크게, 개인전은 플레이어별 작게
    if (!e.solo && e.combo > 1) {
      ctx.fillStyle = C.accent; ctx.font = font(F.hero); ctx.textAlign = "center";
      ctx.fillText(`${e.combo} COMBO`, 320, 110);
    } else if (e.solo) {
      ctx.font = font(F.lg); ctx.textAlign = "center";
      for (let i = 0; i < PLAYERS; i++) {
        ctx.fillStyle = COLORS[i];
        ctx.fillText(`P${i + 1}  ${e.paccuracy(i).toFixed(0)}% (${e.pjudged[i]}) · x${e.pcombo[i]}`, 200 + i * 240, 105);
      }
    }

    // 판정 팝업(0.5s 페이드)
    if (this.fb && e.clock - this.fb.at < 0.5) {
      const txt: Record<Result, string> = { perfect: "PERFECT!", good: "GOOD", miss: "MISS", early: "", wrong: "", sync: "동시 대기…", hold: "홀드 유지!", mash: "연타!" };
      const t = txt[this.fb.result];
      if (t) {
        const age = (e.clock - this.fb.at) / 0.5;
        ctx.globalAlpha = 1 - age;
        const col = this.fb.result === "miss" ? C.danger : this.fb.result === "perfect" ? C.success : C.accent;
        ctx.fillStyle = col;
        // 등급별 크기·연출 차등: perfect 는 크고 튀어오르며 글로우, good 은 보통, miss 는 아래로 처진다.
        ctx.font = font(this.fb.result === "perfect" ? F.xxl : F.xl); ctx.textAlign = "center";
        const dy = this.fb.result === "perfect" ? -18 * (1 - (1 - age) ** 2)
                 : this.fb.result === "miss" ? 14 * age : -6 * age;
        // 판정선 **왼쪽**에, 판정된 레인 높이에 띄운다. 노트는 x >= HIT_X 에만 있으므로
        // 이 구역은 구조적으로 비어 있다 — 팝업이 노트나 판정선을 가릴 수 없다(원칙 5).
        // 레인이 넷이 되면서 "어느 레인이 판정됐는가"도 함께 말한다.
        const px = HIT_X / 2, py = this.fb.y + dy;
        if (this.fb.result === "perfect") glow(ctx, col, 16, () => ctx.fillText(t, px, py));
        else ctx.fillText(t, px, py);
        ctx.globalAlpha = 1;
      }
    }

    // 키 힌트(차례면 강조). 동시 비트면 전원 강조 + 이미 누른 사람 ✓
    // 리드인 중에도 강조한다 — 첫 노트가 이미 다가오는데 담당을 안 알려주면 늦는다.
    // 키가 넷이면 담당만으로는 부족하다 — 지금 눌러야 하는 **그 키 하나**만 켠다.
    const started = !e.done, sync = e.currentPlayer() === -1;
    // 박스 폭도 레인 수에서 유도한다 — 키를 늘려도 640 을 넘지 않는다.
    const gap = 6, bw = Math.min(100, Math.floor((620 - (LANES - 1) * gap) / LANES));
    const total = LANES * bw + (LANES - 1) * gap, x0 = (640 - total) / 2;
    for (let p = 0; p < PLAYERS; p++) for (let l = 0; l < KEYS_PER_PLAYER; l++) {
      const i = laneIdx(p, l), bx = x0 + i * (bw + gap);
      // 동시류는 자기 키 아무거나 되므로 그 사람 키를 다 켠다.
      const turn = started && (sync || (e.currentPlayer() === p && e.laneOf(e.nextBeat) === l));
      ctx.fillStyle = turn ? COLORS[p] : C.slot;
      ctx.fillRect(bx, 428, bw, 44);   // 하이웨이가 y 416 까지 내려와 아래로 밀었다
      ctx.fillStyle = C.text; ctx.font = font(F.md); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const ok = sync && e.syncPressed[p] ? " ✓" : "";
      ctx.fillText(`P${p + 1} [${KEY_LABEL[p][l]}]${ok}`, bx + bw / 2, 450);
      ctx.textBaseline = "alphabetic";
    }

    if (this.h.phase !== "play") {
      const acc = e.accuracy();
      const livesOut = !e.solo && e.lives <= 0;
      ctx.fillStyle = withAlpha(C.scrim, 0.82); ctx.fillRect(0, 0, 640, 480);
      ctx.textAlign = "center"; ctx.font = font(F.huge);
      // 제목: 클리어 / 실패(정확도 부족 or 생명 소진)
      ctx.fillStyle = this.cleared ? C.success : C.danger;
      ctx.fillText(this.cleared ? `🎉 스테이지 ${this.stage + 1} 클리어!` : (livesOut ? "리듬 붕괴 — 생명 소진" : "스테이지 실패"), 320, 130);
      // 정확도(백분율) 크게
      const accColor = acc >= 90 ? C.success : C.accent;
      glow(ctx, accColor, 20, () => {
        ctx.font = font(F.hero); ctx.fillStyle = accColor;
        ctx.fillText(`정확도 ${acc.toFixed(1)}%`, 320, 185);
      });
      ctx.font = font(F.sm); ctx.fillStyle = C.textMuted;
      ctx.fillText(`판정한 비트 ${Math.min(e.nextBeat, this.opts.beats)}/${this.opts.beats} · 다음 스테이지 조건 90% 이상`, 320, 210);
      // 모드별 상세
      ctx.font = font(F.lg);
      if (e.solo) {
        // 승패는 적중률로 가린다. 담당 노트 수를 같이 보여줘 배분이 고르지 않았음을 드러낸다.
        const w = e.winner();
        const line = [0, 1].map(i => `P${i + 1} ${e.paccuracy(i).toFixed(1)}%`).join(" · ");
        ctx.fillStyle = w === -1 ? C.textMuted : COLORS[w];
        ctx.fillText(w === -1 ? `무승부 (${line})` : `🏆 P${w + 1} 승 (${line})`, 320, 246);
        ctx.font = font(F.sm); ctx.fillStyle = C.textMuted;
        ctx.fillText(`담당 노트 P1 ${e.pjudged[0]}개 · P2 ${e.pjudged[1]}개 (점수 ${e.pscore[0]} · ${e.pscore[1]})`, 320, 268);
      } else {
        ctx.fillStyle = C.text;
        ctx.fillText(`점수 ${e.score} · 최대 콤보 ${e.maxCombo}`, 320, 246);
      }
      // 다음/재도전 안내
      ctx.font = font(F.lg); ctx.fillStyle = C.text;
      if (this.cleared) ctx.fillText(`클릭/스페이스 → 스테이지 ${this.stage + 2} (${BASE.bpm + (this.stage + 1) * 12}bpm, 더 복잡)`, 320, 292);
      else ctx.fillText("클릭 → 재도전", 320, 292);
      ctx.fillStyle = C.textFaint; ctx.font = font(F.sm);
      ctx.fillText("R 이 스테이지 다시 · Esc 메뉴", 320, 318);
    }
  }
}
