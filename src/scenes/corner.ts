// 리허설8 "코너킥" — 올린 공이 나빴나, 못 넣은 놈이 나빴나.
// 재사용: Harness, Sfx, 토큰. 신규: systems/corner.
//
// 화면의 핵심은 **낙하 원**이다. 중심이 조준점에서 실제 낙하점으로 미끄러지며 반경이 줄고,
// 그 수축 속도와 뛰어가는 속도의 경주가 이 게임의 전부다.
//
// 높이는 **공과 그림자의 거리**로만 표현한다. 이게 안 읽히면 게임이 안 읽히므로
// 단서를 셋 겹쳤다 — 그림자, 둘을 잇는 점선, 그리고 높을수록 커지는 공.
import { Harness, Scene, PointerState } from "../core/harness";
import { Sfx } from "../systems/sfx";
import {
  CornerKick, CornerOpts, K, FIELD, GOAL, GOAL_MID, GK_ZONE, CORNER, AIM_ZONE, OUTCOME,
  type Pt,
} from "../systems/corner";
import { C, F, font, withAlpha, sigGradient, glow } from "../ui/tokens";

const COLORS = C.player;
const OPTS: CornerOpts = { corners: 6 };

// ── 정적 배치 ──────────────────────────────────────────────────────────────
// 필드가 60~420 이라 아래 60px 이 남는다. 게이지와 상태줄을 여기 나눠 넣는다.
export const TURN_Y = 34;                                   // 차례 줄 baseline (F.lg)
export const GAUGE = { x: 170, y: 428, w: 300, h: 16 };     // 파워 게이지
// 판정 이름(F.xxl)은 위로 22.4px 뻗는다 — 444 여야 필드 아래끝(420)을 안 넘는다.
export const RESULT_Y = 444;
export const STATUS_Y = 468;                                // 상태·근거 줄 baseline (F.sm)
/** 결산 오버레이 — 결과 3개 · 결과 3개 · 범인 집계. 전부 F.sm. */
export const RECAP_Y = [288, 308, 332] as const;
/** 결산 오버레이의 큰 글자들 — 총 골(F.hero) · 키커별(F.xl) 두 줄 · 안내(F.lg). */
export const RECAP_TOP = { total: 150, kicker: [200, 232] as const, restart: 400 };
export const TITLE = { x: 16, y: 32, right: 96 };           // 제목은 왼쪽, 차례 줄과 가로로 갈린다
/** 공이 뜨는 최대 높이(px). 그림자와의 거리가 곧 높이다. */
const ARC = 92;
const NET = 16;   // 골라인 위 골망 깊이. 차례 줄 아래(37.6)와 골라인(60) 사이에 든다

export class CornerScene implements Scene {
  private eng!: CornerKick;
  private sfx = new Sfx();
  private cursor: Pt = { x: GOAL_MID, y: 200 };
  private shake = 0;

  constructor(private h: Harness) { this.reset(); }
  enter() { this.reset(); }

  private reset() {
    this.eng = new CornerKick(OPTS);
    this.shake = 0;
    this.h.score = 0;
    this.h.to("play");
    this.h.record("cor:reset", { corners: OPTS.corners });
  }

  // ── 입력 ────────────────────────────────────────────────────────────────
  // 키커 = 마우스 + 스페이스, 헤더 = WASD/방향키 + 스페이스. 각자 조작 2종.
  // 스페이스를 둘이 함께 쓰지만 단계가 갈려 있어 부딪히지 않는다(파워 vs 점프).
  pointer(p: PointerState) {
    const e = this.eng;
    if (this.h.phase !== "play") { if (p.justDown) this.reset(); return; }
    this.cursor = {
      x: Math.min(Math.max(p.x, AIM_ZONE.x0), AIM_ZONE.x1),
      y: Math.min(Math.max(p.y, AIM_ZONE.y0), AIM_ZONE.y1),
    };
    if (!p.justDown) return;
    if (e.stage === "aim") { e.aimAt(this.cursor.x, this.cursor.y); this.sfx.tick(); }
    else if (e.stage === "result") this.advance();
  }

  key(code: string, down: boolean) {
    if (!down) return;
    const e = this.eng;
    if (code === "KeyM") { this.sfx.toggleMute(); return; }
    if (code === "KeyR") return this.reset();
    if (this.h.phase !== "play") { if (code === "Space" || code === "Enter") this.reset(); return; }
    if (code !== "Space" && code !== "Enter") return;
    if (e.stage === "power") { e.stopPower(); this.sfx.spike(); }
    else if (e.stage === "flight") { e.jump(); this.sfx.tick(); }
    else if (e.stage === "result") this.advance();
  }

  /** 결과를 닫고 다음 코너로. 마지막이면 결산으로 넘어간다. */
  private advance() {
    this.eng.next();
    if (!this.eng.done) return;
    this.h.score = this.eng.goals;
    this.h.to("win");
    this.sfx.win();
    this.h.record("cor:match", { goals: this.eng.goals, byKicker: this.eng.byKicker });
  }

  /** 헤더의 이동 방향. `key` 는 눌린 순간만 오므로 연속 이동은 폴링해야 한다. */
  private moveDir(): Pt {
    const d = (a: string, b: string) => (this.h.isDown(a) || this.h.isDown(b) ? 1 : 0);
    return {
      x: d("KeyD", "ArrowRight") - d("KeyA", "ArrowLeft"),
      y: d("KeyS", "ArrowDown") - d("KeyW", "ArrowUp"),
    };
  }

  update(dt: number) {
    const e = this.eng;
    const before = e.stage;
    e.update(dt, this.moveDir());
    if (before === "flight" && e.stage === "result") this.onJudged();
    this.shake = Math.max(0, this.shake - dt * 30);
  }

  private onJudged() {
    const j = this.eng.last!;
    this.shake = j.outcome === "goal" ? 9 : 3;
    j.outcome === "goal" ? this.sfx.win() : this.sfx.missHit();
    this.h.record("cor:judge", j);
  }

  hud() {
    const e = this.eng;
    if (e.done) {
      return `<b>코너킥</b> &nbsp; <b>${e.goals}골 / ${OPTS.corners}코너</b>` +
        ` &nbsp; <span style="color:${COLORS[0]}">P1 올림 ${e.byKicker[0][1]}/${e.byKicker[0][0]}</span>` +
        ` &nbsp; <span style="color:${COLORS[1]}">P2 올림 ${e.byKicker[1][1]}/${e.byKicker[1][0]}</span>` +
        ` &nbsp; <span style="opacity:.6">클릭/스페이스 다시 · Esc 메뉴</span>`;
    }
    const who = e.stage === "flight" || e.stage === "power"
      ? `<b style="color:${COLORS[e.header]}">P${e.header + 1} 헤더</b>`
      : `<b style="color:${COLORS[e.kicker]}">P${e.kicker + 1} 키커</b>`;
    return `<b>코너킥</b> &nbsp; 코너 ${e.corner + 1}/${OPTS.corners} &nbsp; ${who}` +
      ` &nbsp; <span style="color:${COLORS[e.kicker]}">P${e.kicker + 1} 올림</span>` +
      `<span style="opacity:.6">(${e.byKicker[e.kicker][1]}/${e.byKicker[e.kicker][0]})</span>` +
      ` &nbsp; 팀 ${e.goals}골` +
      ` &nbsp; <span style="opacity:.6">키커 클릭→스페이스 · 헤더 WASD→스페이스 · R 처음부터 · 음소거[M] ${this.sfx.muted ? "🔇" : "🔊"}</span>`;
  }

  // ── 그리기 ──────────────────────────────────────────────────────────────

  /** 경기장. 선으로만 그린다 — 위가 골문이다. */
  private pitch(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = C.surface;
    ctx.fillRect(FIELD.x, FIELD.y, FIELD.w, FIELD.h);

    ctx.strokeStyle = C.line; ctx.lineWidth = 2;
    ctx.strokeRect(FIELD.x + 1, FIELD.y + 1, FIELD.w - 2, FIELD.h - 2);
    // 페널티 박스 · 골 에어리어
    ctx.lineWidth = 1;
    ctx.strokeRect(150.5, FIELD.y, 340, 170);
    ctx.strokeRect(220.5, FIELD.y, 200, 60);
    // 코너 아크 — 공이 여기서 출발한다
    ctx.beginPath(); ctx.arc(CORNER.x, CORNER.y, 14, 0, Math.PI / 2); ctx.stroke();

    // GK 출동 존. 규칙이라 반드시 보여야 한다 — 이 사각형 하나가 딜레마의 전부다.
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = withAlpha(C.demand, 0.55);
    ctx.strokeRect(GK_ZONE.x0, GK_ZONE.y0, GK_ZONE.x1 - GK_ZONE.x0, GK_ZONE.y1 - GK_ZONE.y0);
    ctx.setLineDash([]);
    ctx.font = font(F.xs); ctx.fillStyle = withAlpha(C.demand, 0.8); ctx.textAlign = "right";
    ctx.fillText("GK 출동 존", GK_ZONE.x1 - 4, GK_ZONE.y1 - 5);

    // 골망 — 골라인 위쪽. 차례 줄(아래끝 37.6)과 골라인(60) 사이에 든다.
    ctx.fillStyle = withAlpha(C.text, 0.07);
    ctx.fillRect(GOAL.x0, GOAL.y - NET, GOAL.x1 - GOAL.x0, NET);
    ctx.strokeStyle = C.text; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(GOAL.x0, GOAL.y); ctx.lineTo(GOAL.x0, GOAL.y - NET);
    ctx.lineTo(GOAL.x1, GOAL.y - NET); ctx.lineTo(GOAL.x1, GOAL.y);
    ctx.stroke();
  }

  /**
   * 골라인 위 GK 커버 폭. **깊게 올릴수록 넓어진다** —
   * 조준 중에 이걸 보여줘야 "안전한 뒤쪽은 골도 안 된다"가 결정에 들어온다.
   */
  private cover(ctx: CanvasRenderingContext2D, at: Pt, gkx: number, strong: boolean) {
    const span = this.eng.coverSpan(at);
    const x0 = Math.max(GOAL.x0, gkx - span / 2), x1 = Math.min(GOAL.x1, gkx + span / 2);
    ctx.strokeStyle = withAlpha(C.demand, strong ? 0.9 : 0.45);
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(x0, GOAL.y - 3); ctx.lineTo(x1, GOAL.y - 3); ctx.stroke();
    return span;
  }

  /** 공과 그림자. 둘 사이 거리가 높이다 — 점선과 공 크기로 단서를 두 겹 더 준다. */
  private ball(ctx: CanvasRenderingContext2D) {
    const e = this.eng, k = e.k;
    const sx = CORNER.x + (e.land.x - CORNER.x) * k;
    const sy = CORNER.y + (e.land.y - CORNER.y) * k;
    const hgt = ARC * 4 * k * (1 - k);

    ctx.fillStyle = withAlpha(C.scrim, 0.5);
    ctx.beginPath(); ctx.ellipse(sx, sy, 7, 3.5, 0, 0, Math.PI * 2); ctx.fill();

    if (hgt > 2) {
      ctx.strokeStyle = withAlpha(C.text, 0.25); ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - hgt); ctx.stroke();
      ctx.setLineDash([]);
    }
    glow(ctx, C.text, 10, () => {
      ctx.fillStyle = C.text;
      ctx.beginPath(); ctx.arc(sx, sy - hgt, 5 + hgt * 0.03, 0, Math.PI * 2); ctx.fill();
    });
  }

  /** 낙하 원 — 이 게임의 얼굴. 중심이 미끄러지고 반경이 0으로 준다. */
  private ring(ctx: CanvasRenderingContext2D) {
    const c = this.eng.circle();
    ctx.fillStyle = withAlpha(C.text, 0.07);
    ctx.beginPath(); ctx.arc(c.x, c.y, Math.max(c.r, 1), 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = withAlpha(C.text, 0.85); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(c.x, c.y, Math.max(c.r, 1), 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = withAlpha(C.text, 0.6); ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(c.x - 6, c.y); ctx.lineTo(c.x + 6, c.y);
    ctx.moveTo(c.x, c.y - 6); ctx.lineTo(c.x, c.y + 6);
    ctx.stroke();
  }

  private actor(ctx: CanvasRenderingContext2D, p: Pt, color: string, r: number, label: string) {
    glow(ctx, color, 8, () => {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.font = font(F.xs); ctx.fillStyle = C.bg; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label, p.x, p.y);
    ctx.textBaseline = "alphabetic";
  }

  /** 파워 게이지. 가운데가 스위트존이고, 정확할수록 낙하 원이 작아진다. */
  private gauge(ctx: CanvasRenderingContext2D) {
    const e = this.eng, g = GAUGE;
    ctx.fillStyle = C.slot; ctx.fillRect(g.x, g.y, g.w, g.h);
    // 스위트존 — 여기서 멈추면 원이 R_MIN 이다
    ctx.fillStyle = withAlpha(C.success, 0.35);
    ctx.fillRect(g.x + g.w * 0.44, g.y, g.w * 0.12, g.h);
    const px = g.x + e.power * g.w;
    glow(ctx, COLORS[e.kicker], 10, () => {
      ctx.fillStyle = COLORS[e.kicker];
      ctx.fillRect(px - 2, g.y - 4, 4, g.h + 8);
    });
    ctx.strokeStyle = C.line; ctx.lineWidth = 1;
    ctx.strokeRect(g.x + 0.5, g.y + 0.5, g.w - 1, g.h - 1);
  }

  /** 판정 근거 한 줄. 이름만 적으면 "왜"가 없어서 다음에 뭘 고칠지 모른다. */
  private why(): string {
    const j = this.eng.last!;
    const bits = [`원 ${Math.round(j.r0)}px`];
    if (j.outcome === "badBall" || j.outcome === "lateRun") bits.push(`헤더 ${Math.round(j.headDist)}px 밖`);
    // 경합은 거리가 아니라 도착 시각으로 갈린다 — 화면도 그렇게 말해야 판정과 안 어긋난다
    if (j.outcome === "defender") {
      bits.push(`수비 ${j.defAt!.toFixed(2)}s 도착`);
      bits.push(j.headAt === null ? "헤더 못 붙음" : `헤더 ${j.headAt.toFixed(2)}s`);
    }
    if (j.outcome === "keeperOut") bits.push(`GK 가 ${Math.round(j.gkDist)}px 까지 왔다`);
    if (j.outcome === "mistimed") bits.push(j.timingErr === Infinity ? "점프 안 함" : `점프 ${j.timingErr.toFixed(2)}s 어긋남`);
    if (j.outcome === "keeperSave") bits.push(`가운데로 갔다 · GK 커버 ${Math.round(j.gkSpan)}px`);
    if (j.outcome === "goal") bits.push(j.timingErr <= K.PERFECT ? "먼 포스트 정확히" : "빈 골문");
    return bits.join(" · ");
  }

  draw(ctx: CanvasRenderingContext2D) {
    const e = this.eng;
    ctx.clearRect(0, 0, 640, 480);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, 640, 480);

    ctx.save();
    if (this.shake > 0.1) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);

    this.pitch(ctx);

    // 조준 — 커서를 따라가는 십자와, 그 자리에서 GK 가 덮는 폭
    if (e.stage === "aim") {
      const c = this.cursor;
      const span = this.cover(ctx, c, e.gk.x, false);
      const risky = c.x >= GK_ZONE.x0 && c.x <= GK_ZONE.x1 && c.y >= GK_ZONE.y0 && c.y <= GK_ZONE.y1;
      ctx.strokeStyle = risky ? C.demand : COLORS[e.kicker]; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(c.x - 10, c.y); ctx.lineTo(c.x + 10, c.y);
      ctx.moveTo(c.x, c.y - 10); ctx.lineTo(c.x, c.y + 10);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(c.x, c.y, 14, 0, Math.PI * 2); ctx.stroke();
      // 코너에서 조준점까지 — 어디로 올리는지가 선으로 보인다
      ctx.strokeStyle = withAlpha(COLORS[e.kicker], 0.35); ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(CORNER.x, CORNER.y); ctx.lineTo(c.x, c.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = font(F.xs); ctx.textAlign = "center"; ctx.fillStyle = C.demand;
      ctx.fillText(`GK 커버 ${Math.round(span)}px`, GOAL_MID, GOAL.y - NET - 6);
    }

    // 조준이 끝나면 조준점이 고정 표식으로 남는다 — 실제 낙하점과 얼마나 어긋났는지가 보인다
    if (e.stage === "power" || e.stage === "flight" || e.stage === "result") {
      ctx.strokeStyle = withAlpha(COLORS[e.kicker], 0.5); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(e.aim.x, e.aim.y, 5, 0, Math.PI * 2); ctx.stroke();
    }

    if (e.stage === "flight") { this.ring(ctx); this.cover(ctx, e.circle(), e.gk.x, false); }

    if (e.stage === "result") {
      // 낙하점과 헤더를 잇는다 — "늦게 붙었다"가 그림으로 보인다
      const j = e.last!;
      ctx.strokeStyle = withAlpha(C.text, 0.45); ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(e.land.x, e.land.y); ctx.lineTo(e.head.x, e.head.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = C.text; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(e.land.x - 7, e.land.y - 7); ctx.lineTo(e.land.x + 7, e.land.y + 7);
      ctx.moveTo(e.land.x + 7, e.land.y - 7); ctx.lineTo(e.land.x - 7, e.land.y + 7);
      ctx.stroke();
      if (j.outcome !== "goal" && j.headDist > K.REACH) {
        ctx.font = font(F.xs); ctx.fillStyle = C.text; ctx.textAlign = "center";
        ctx.fillText(`${Math.round(j.headDist)}px`, (e.land.x + e.head.x) / 2, (e.land.y + e.head.y) / 2 - 5);
      }
    }

    // 사람 셋. 헤더만 플레이어 색이고 AI 는 danger·demand 를 쓴다 (DESIGN.md 원칙 1).
    if (e.stage !== "aim") e.defs.forEach((d) => this.actor(ctx, d, C.danger, 10, "D"));
    this.actor(ctx, e.gk, C.demand, 11, "GK");
    const jumping = e.stage === "flight" && e.jumpAt !== null && e.t - e.jumpAt < 0.35;
    this.actor(ctx, e.head, COLORS[e.header], jumping ? 15 : 10, "H");

    if (e.stage === "flight") this.ball(ctx);

    ctx.restore();

    // ── 제목 · 차례 ─────────────────────────────────────────
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = C.text; ctx.font = font(F.xl);
    ctx.fillText("코너킥", TITLE.x, TITLE.y);
    ctx.strokeStyle = sigGradient(ctx, TITLE.x, 36, 120, 36); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(TITLE.x, 37); ctx.lineTo(TITLE.right, 37); ctx.stroke();

    if (!e.done) {
      const acting = e.stage === "aim" ? e.kicker : e.stage === "power" ? e.kicker : e.header;
      const msg = e.stage === "aim" ? `P${e.kicker + 1} 키커 — 낙하점을 클릭한다`
        : e.stage === "power" ? `P${e.kicker + 1} 파워 — 스페이스로 멈춘다`
          : e.stage === "flight" ? `P${e.header + 1} 헤더 — WASD 로 붙고 스페이스로 점프`
            : `코너 ${e.corner + 1} 끝 — 클릭/스페이스로 다음`;
      ctx.textAlign = "center"; ctx.font = font(F.lg); ctx.fillStyle = COLORS[acting];
      glow(ctx, COLORS[acting], 10, () => ctx.fillText(`▶ ${msg}`, 320, TURN_Y));
    }

    // ── 게이지 · 상태줄 ──────────────────────────────────────
    ctx.textAlign = "center";
    if (e.stage === "power") this.gauge(ctx);

    ctx.font = font(F.sm);
    if (e.stage === "aim") {
      ctx.fillStyle = C.textMuted;
      ctx.fillText("골문 앞은 GK 가 나온다 · 깊게 올리면 안전하지만 커버가 넓어진다", 320, STATUS_Y);
    } else if (e.stage === "power") {
      ctx.fillStyle = C.textMuted;
      ctx.fillText("가운데서 멈출수록 낙하 원이 작아진다 — 키커의 정확도가 헤더의 난이도다", 320, STATUS_Y);
    } else if (e.stage === "flight") {
      ctx.fillStyle = C.textFaint;
      ctx.fillText(`낙하 원 ${Math.round(e.circle().r)}px — 좁혀지는 곳으로 뛴다`, 320, STATUS_Y);
    } else if (e.stage === "result") {
      const j = e.last!;
      const blame = OUTCOME[j.outcome].blame;
      const col = j.outcome === "goal" ? C.success : blame === "kicker" ? COLORS[j.kicker] : COLORS[1 - j.kicker];
      ctx.font = font(F.xxl); ctx.fillStyle = col;
      glow(ctx, col, 16, () => ctx.fillText(OUTCOME[j.outcome].name, 320, RESULT_Y));
      ctx.font = font(F.sm); ctx.fillStyle = C.textMuted;
      const who = blame === "none" ? "" : `${blame === "kicker" ? `P${j.kicker + 1} 키커` : `P${2 - j.kicker} 헤더`} · `;
      ctx.fillText(who + this.why(), 320, STATUS_Y);
    }

    // ── 결산 ────────────────────────────────────────────────
    if (e.done) {
      ctx.fillStyle = withAlpha(C.scrim, 0.86); ctx.fillRect(0, 0, 640, 480);
      ctx.textAlign = "center";
      glow(ctx, C.success, 20, () => {
        ctx.font = font(F.hero); ctx.fillStyle = C.success;
        ctx.fillText(`${e.goals}골 / ${OPTS.corners}코너`, 320, RECAP_TOP.total);
      });
      // 협동이지만 개인 기여는 남는다. 모수를 같이 적는다 (DESIGN.md 원칙 4).
      ctx.font = font(F.xl);
      e.byKicker.forEach(([tries, goals], i) => {
        ctx.fillStyle = COLORS[i];
        ctx.fillText(`P${i + 1} 이 올린 ${tries}개 중 ${goals}골`, 320, RECAP_TOP.kicker[i]);
      });
      // 코너 6개의 결과를 한 줄에 이으면 640px 을 넘는다 — 3개씩 두 줄로 끊는다.
      ctx.font = font(F.sm); ctx.fillStyle = C.textMuted;
      const names = e.history.map((j) => OUTCOME[j.outcome].name);
      ctx.fillText(names.slice(0, 3).join(" · "), 320, RECAP_Y[0]);
      if (names.length > 3) ctx.fillText(names.slice(3).join(" · "), 320, RECAP_Y[1]);
      const kickerFault = e.history.filter((j) => OUTCOME[j.outcome].blame === "kicker").length;
      const headerFault = e.history.filter((j) => OUTCOME[j.outcome].blame === "header").length;
      ctx.fillStyle = C.textFaint;
      ctx.fillText(`공 탓 ${kickerFault} · 머리 탓 ${headerFault}`, 320, RECAP_Y[2]);
      ctx.font = font(F.lg); ctx.fillStyle = C.text;
      ctx.fillText("클릭 / 스페이스 → 다시 · Esc 메뉴", 320, RECAP_TOP.restart);
    }
  }
}
