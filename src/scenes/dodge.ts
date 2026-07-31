// 리허설9 "총알피하기" — 네 색은 내가 막는다.
// 재사용: Harness, Sfx, 토큰. 신규: systems/dodge.
//
// 화면의 핵심은 **색**이다. 총알 색이 곧 주인이고 주인이 곧 생사라,
// 이 저장소에서 플레이어 색이 규칙 자체가 되는 첫 사례다(DESIGN.md 원칙 1).
// 색맹과 시연 화면에서도 읽혀야 하므로 **모양도 같이 바꾼다**(원칙 2) —
// 사이언은 원, 앰버는 네모, 주인 없는 탄은 가시 달린 마름모다.
import { Harness, Scene, PointerState } from "../core/harness";
import { Sfx } from "../systems/sfx";
import { Dodge, K, ARENA, NEUTRAL, fateText, type Bullet, type Pt, type Event } from "../systems/dodge";
import { C, F, font, withAlpha, sigGradient, glow } from "../ui/tokens";

const COLORS = C.player;

// ── 정적 배치 ──────────────────────────────────────────────────────────────
// 아레나가 y 50~430 을 쓴다(중앙 240 · 반지름 190). 아래 50px 을 상태줄에 먼저 준다 —
// 코너킥에서 통한 순서다. 다 그리고 옮기면 겹친다.
export const TITLE = { x: 16, y: 32, right: 96 };
export const TURN_Y = 34;      // 가운데 상태 줄 baseline (F.lg)
export const STATUS_Y = 466;   // 아래 안내·사연 줄 baseline (F.sm)
/** 결산 오버레이 — 버틴 시간(hero) · 각자 성적(xl) 두 줄 · 사유(sm) · 안내(lg). */
export const RECAP = { time: 150, rows: [206, 238] as const, why: 296, restart: 400 };
const FLASH = 0.9;   // 사연 문구가 남는 시간(초)

export class DodgeScene implements Scene {
  private eng!: Dodge;
  private sfx = new Sfx();
  /** 방금 일어난 일 — 핫시트에서 고개를 돌렸다 와도 따라잡힌다. */
  private note: { text: string; color: string; life: number } | null = null;
  private shake = 0;
  /** 피격/요격 자리에 남는 짧은 표식. */
  private marks: { x: number; y: number; color: string; life: number; kind: "block" | "hit" }[] = [];

  constructor(private h: Harness) { this.reset(); }
  enter() { this.reset(); }

  private reset() {
    this.eng = new Dodge();
    this.note = null; this.shake = 0; this.marks = [];
    this.h.score = 0;
    this.h.to("play");
    this.h.record("dge:reset", {});
  }

  // ── 입력 ────────────────────────────────────────────────────────────────
  // 둘이 **동시에** 움직인다. P1 = WASD, P2 = 방향키.
  // 코너킥은 단계가 갈려 스페이스를 공유했지만 여기는 동시라 키를 갈라야 한다.
  private dir(up: string, down: string, left: string, right: string): Pt {
    const d = (c: string) => (this.h.isDown(c) ? 1 : 0);
    return { x: d(right) - d(left), y: d(down) - d(up) };
  }

  private dirs(): Pt[] {
    return [
      this.dir("KeyW", "KeyS", "KeyA", "KeyD"),
      this.dir("ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"),
    ];
  }

  pointer(p: PointerState) {
    if (this.h.phase !== "play" && p.justDown) this.reset();
  }

  key(code: string, down: boolean) {
    if (!down) return;
    if (code === "KeyM") { this.sfx.toggleMute(); return; }
    if (code === "KeyR") return this.reset();
    if (this.h.phase !== "play" && (code === "Space" || code === "Enter")) this.reset();
  }

  update(dt: number) {
    const e = this.eng;
    e.update(dt, this.dirs());
    for (const ev of e.drainEvents()) this.onEvent(ev);
    if (this.note) { this.note.life -= dt; if (this.note.life <= 0) this.note = null; }
    this.marks = this.marks.filter((m) => (m.life -= dt) > 0);
    this.shake = Math.max(0, this.shake - dt * 30);
    if (e.over && this.h.phase === "play") {
      this.h.score = Math.round(e.t);
      this.h.to("win");
      this.sfx.lose();
      this.h.record("dge:match", { t: e.t, blocked: e.blocked, leaked: e.leaked, fallen: e.fallen() });
    }
  }

  /** 총알 색 — 주인이 곧 색이다. 주인이 없으면 danger. */
  private shotColor(owner: number) { return owner === NEUTRAL ? C.danger : COLORS[owner]; }

  private onEvent(ev: Event) {
    if (ev.fate === "escaped") return;
    const e = this.eng;
    const p = ev.who >= 0 ? e.players[ev.who] : ARENA;
    const color = this.shotColor(ev.owner);
    this.marks.push({ x: p.x, y: p.y, color, life: 0.45, kind: ev.fate === "blocked" ? "block" : "hit" });
    if (ev.fate === "blocked") { this.sfx.toggle(true); return; }
    // 피격만 문구를 남긴다 — 요격은 자주 일어나서 문구가 계속 떠 있으면 판을 가린다
    this.note = { text: fateText(ev), color, life: FLASH };
    this.shake = 8;
    this.sfx.missHit();
    this.h.record("dge:hit", ev);
  }

  hud() {
    const e = this.eng;
    const life = (i: number) =>
      `<span style="color:${COLORS[i]}">P${i + 1}</span> ${"♥".repeat(Math.max(0, e.lives[i]))}` +
      `<span style="opacity:.35">${"♡".repeat(Math.max(0, K.LIVES - e.lives[i]))}</span>` +
      `<span style="opacity:.6">(막음 ${e.blocked[i]} · 샘 ${e.leaked[i]})</span>`;
    if (e.over) {
      const f = e.fallen();
      return `<b>총알피하기</b> &nbsp; <b>${e.t.toFixed(1)}초 버팀</b>` +
        ` &nbsp; <span style="color:${COLORS[Math.max(0, f)]}">P${f + 1} 이 먼저 쓰러졌다</span>` +
        ` &nbsp; ${life(0)} &nbsp; ${life(1)}` +
        ` &nbsp; <span style="opacity:.6">클릭/스페이스 다시 · Esc 메뉴</span>`;
    }
    return `<b>총알피하기</b> &nbsp; <b>${e.t.toFixed(1)}초</b>` +
      ` &nbsp; ${life(0)} &nbsp; ${life(1)}` +
      ` &nbsp; <span style="opacity:.6">내 색은 막고 · 남의 색은 피하고 · <span style="color:${C.danger}">붉은 탄</span>은 아무도 못 막는다</span>` +
      ` &nbsp; <span style="opacity:.6">P1 WASD · P2 방향키 · R 처음부터 · 음소거[M] ${this.sfx.muted ? "🔇" : "🔊"}</span>`;
  }

  // ── 그리기 ──────────────────────────────────────────────────────────────

  /** 총알과 예고선의 모양. **색만으로 구분하지 않는다**(DESIGN.md 원칙 2). */
  private shotShape(ctx: CanvasRenderingContext2D, b: Bullet, r: number) {
    ctx.beginPath();
    if (b.owner === 0) {                    // 사이언 — 원
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    } else if (b.owner === 1) {             // 앰버 — 네모
      ctx.rect(b.x - r, b.y - r, r * 2, r * 2);
    } else {                                // 주인 없음 — 가시 달린 마름모
      const s = r * 1.5;
      ctx.moveTo(b.x, b.y - s); ctx.lineTo(b.x + s, b.y);
      ctx.lineTo(b.x, b.y + s); ctx.lineTo(b.x - s, b.y);
      ctx.closePath();
    }
  }

  private arena(ctx: CanvasRenderingContext2D) {
    const e = this.eng;
    ctx.fillStyle = C.surface;
    ctx.beginPath(); ctx.arc(ARENA.x, ARENA.y, e.radius, 0, Math.PI * 2); ctx.fill();
    // 시작 크기를 옅게 남긴다 — 얼마나 좁아졌는지가 보여야 압박이 읽힌다
    ctx.strokeStyle = withAlpha(C.line, 0.5); ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.arc(ARENA.x, ARENA.y, K.R0, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = C.line; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(ARENA.x, ARENA.y, e.radius, 0, Math.PI * 2); ctx.stroke();
  }

  /** 예고선 — 총알 색으로. 없으면 요격이 불가능하다. */
  private telegraph(ctx: CanvasRenderingContext2D, b: Bullet) {
    const col = this.shotColor(b.owner);
    // 남은 예고가 짧을수록 진해진다 — "곧 온다"가 밝기로 읽힌다
    const urgency = 1 - Math.max(0, Math.min(1, b.wait / K.TELEGRAPH));
    ctx.strokeStyle = withAlpha(col, 0.25 + urgency * 0.55);
    ctx.lineWidth = 1 + urgency * 2;
    ctx.setLineDash([7, 6]);
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.aimX, b.aimY); ctx.stroke();
    ctx.setLineDash([]);
    // 도착점 표식
    ctx.strokeStyle = withAlpha(col, 0.5 + urgency * 0.4); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(b.aimX, b.aimY, 5 + (1 - urgency) * 6, 0, Math.PI * 2); ctx.stroke();
  }

  private person(ctx: CanvasRenderingContext2D, p: Pt, i: number) {
    const col = COLORS[i];
    glow(ctx, col, 12, () => {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(p.x, p.y, K.BODY, 0, Math.PI * 2); ctx.fill();
    });
    ctx.font = font(F.xs); ctx.fillStyle = C.bg;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(`P${i + 1}`, p.x, p.y);
    ctx.textBaseline = "alphabetic";
    // 남은 생명을 몸 위 점으로 — HUD 를 안 봐도 급한지 알 수 있다
    const n = Math.max(0, this.eng.lives[i]);
    for (let k = 0; k < K.LIVES; k++) {
      ctx.fillStyle = k < n ? col : withAlpha(C.text, 0.18);
      ctx.beginPath(); ctx.arc(p.x - 8 + k * 8, p.y - K.BODY - 7, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const e = this.eng;
    ctx.clearRect(0, 0, 640, 480);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, 640, 480);

    ctx.save();
    if (this.shake > 0.1) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);

    this.arena(ctx);

    for (const b of e.bullets) if (b.wait > 0) this.telegraph(ctx, b);

    // 표식 — 막은 자리와 맞은 자리
    for (const m of this.marks) {
      const t = m.life / 0.45;
      ctx.strokeStyle = withAlpha(m.color, t); ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(m.x, m.y, K.BODY + (1 - t) * (m.kind === "hit" ? 26 : 14), 0, Math.PI * 2);
      ctx.stroke();
    }

    e.players.forEach((p, i) => this.person(ctx, p, i));

    // 날아가는 총알 — 색 + 모양
    for (const b of e.bullets) {
      if (b.wait > 0) continue;
      const col = this.shotColor(b.owner);
      glow(ctx, col, 8, () => {
        ctx.fillStyle = col;
        this.shotShape(ctx, b, K.SHOT);
        ctx.fill();
      });
    }

    ctx.restore();

    // ── 제목 · 상태 ─────────────────────────────────────────
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = C.text; ctx.font = font(F.xl);
    ctx.fillText("총알피하기", TITLE.x, TITLE.y);
    ctx.strokeStyle = sigGradient(ctx, TITLE.x, 36, 140, 36); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(TITLE.x, 37); ctx.lineTo(TITLE.right + 40, 37); ctx.stroke();

    if (!e.over) {
      ctx.textAlign = "center"; ctx.font = font(F.lg); ctx.fillStyle = C.text;
      ctx.fillText(`${e.t.toFixed(1)}초`, 320, TURN_Y);
      ctx.textAlign = "right"; ctx.font = font(F.sm); ctx.fillStyle = C.textFaint;
      ctx.fillText(`탄 ${e.bullets.length} · 동시 ${e.burst}발`, 624, TURN_Y);
    }

    // ── 아래 줄 — 사연 또는 규칙 ────────────────────────────
    ctx.textAlign = "center"; ctx.font = font(F.sm);
    if (this.note) {
      ctx.globalAlpha = Math.min(1, this.note.life / (FLASH * 0.6));
      ctx.fillStyle = this.note.color;
      ctx.fillText(this.note.text, 320, STATUS_Y);
      ctx.globalAlpha = 1;
    } else if (!e.over) {
      ctx.fillStyle = C.textMuted;
      ctx.fillText("내 색 탄은 몸으로 지운다 — 상대에게 가는 내 색을 막아라", 320, STATUS_Y);
    }

    // ── 결산 ────────────────────────────────────────────────
    if (e.over) {
      const f = e.fallen();
      ctx.fillStyle = withAlpha(C.scrim, 0.86); ctx.fillRect(0, 0, 640, 480);
      ctx.textAlign = "center";
      glow(ctx, C.text, 20, () => {
        ctx.font = font(F.hero); ctx.fillStyle = C.text;
        ctx.fillText(`${e.t.toFixed(1)}초 버팀`, 320, RECAP.time);
      });
      // 협동이지만 개인 기여는 남는다. 모수를 같이 적는다(DESIGN.md 원칙 4).
      ctx.font = font(F.xl);
      for (let i = 0; i < 2; i++) {
        ctx.fillStyle = COLORS[i];
        ctx.fillText(`P${i + 1} — 막은 ${e.blocked[i]} · 못 막고 샌 ${e.leaked[i]}`, 320, RECAP.rows[i]);
      }
      ctx.font = font(F.sm); ctx.fillStyle = C.textMuted;
      ctx.fillText(`P${f + 1} 이 먼저 쓰러졌다 · 아레나 ${Math.round(e.radius)}px 까지 좁아짐`, 320, RECAP.why);
      ctx.font = font(F.lg); ctx.fillStyle = C.text;
      ctx.fillText("클릭 / 스페이스 → 다시 · Esc 메뉴", 320, RECAP.restart);
    }
  }
}
