// 리허설3 "전력망" — 협동 기본, 트롤 가능(고의/실수). 로컬 핫시트 2인.
// 재사용: Harness. 신규: PowerGrid. 스펙트럼: 기계 5종 + 랜덤 이벤트 3종.
import { Harness, Scene, PointerState } from "../core/harness";
import { PowerGrid, Machine, GridOpts, ROLE, CROSS_PENALTY, EVENTS, EventKind } from "../systems/powergrid";
import { Sfx } from "../systems/sfx";
import { C, F, font, withAlpha } from "../ui/tokens";

// 튜닝 노브. seed는 reset마다 새로 뽑아 매 판 이벤트가 달라짐.
const BASE: Omit<GridOpts, "seed"> = { capacity: 130, quota: 1000, grace: 1.2, cooldown: 2.5 };
const TIME_LIMIT = 55;
// 기계 5종: 소·중·대(과욕) + 초효율(협동 친화, 저부하 고출력) + 불안정(고출력, 가끔 draw 급등)
const SPEC = [
  { draw: 18, output: 8 }, { draw: 32, output: 14 }, { draw: 55, output: 24 },
  { draw: 25, output: 22 }, { draw: 45, output: 28, volatile: true },
];
const NAMES = ["소", "중", "대", "초효율", "불안정"];
// P1: 1 2 3 4 5 (idx 0-4), P2: 6 7 8 9 0 (idx 5-9)
const KEYS: Record<string, number> = {
  Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4,
  Digit6: 5, Digit7: 6, Digit8: 7, Digit9: 8, Digit0: 9,
};
// 목표 = 도시 구역에 순차 급전. 바 대신 켜지는 소비자로 시각화(공동 스테이크↑).
const CITY = ["🏠", "🏠", "🏥", "🏭", "🏫", "🏢", "🏠", "🏬", "🏭", "🏥"];
const EVENT_LABEL: Record<string, [string, string]> = {
  storm: ["⚡ 정전폭풍 — 용량 급감", C.danger],
  shock: ["📈 수요쇼크 — 외부 부하 급증", C.demand],
  maint: ["🔧 정비 — 용량 일시 증가", C.success],
};

function makeMachines(): Machine[] {
  const m: Machine[] = [];
  for (const owner of [0, 1] as const)
    for (const s of SPEC) m.push({ on: false, owner, ...s });
  return m;
}

export class PowerScene implements Scene {
  private pg!: PowerGrid;
  private flash = 0; private prevBO = 0;
  private seed = 1;
  private sfx = new Sfx();
  private prevEvent: EventKind | null = null; private prevSpiking = false; private prevOver = false;
  private p: PointerState = { x: 0, y: 0, down: false, justDown: false, justUp: false };

  constructor(private h: Harness) { this.reset(); }

  private reset() {
    this.seed = (this.seed * 48271 + Math.floor(this.h.clock * 1000) + 12345) >>> 0 || 7;
    this.pg = new PowerGrid(makeMachines(), { ...BASE, seed: this.seed });
    this.flash = 0; this.prevBO = 0;
    this.prevEvent = null; this.prevSpiking = false; this.prevOver = false;
    this.h.score = 0;
    this.h.to("play");
    this.h.record("reset");
  }

  enter() { this.reset(); }
  pointer(p: PointerState) { this.p = p; }

  key(code: string, down: boolean) {
    if (!down) return;
    if (code === "KeyR") return this.reset();
    if (code === "KeyM") { this.sfx.toggleMute(); return; }
    if (this.h.phase !== "play") return;
    if (code in KEYS) {
      const i = KEYS[code]; this.pg.toggle(i);
      this.sfx.toggle(!!this.pg.machines[i]?.on); this.h.record("toggle", { i });
    } else if (code === "KeyQ") { if (this.pg.shed()) { this.sfx.role(); this.h.record("shed"); } }
    else if (code === "KeyP") { if (this.pg.boost()) { this.sfx.role(); this.h.record("boost"); } }
  }

  private roleTag(name: string, cd: number, key: string, color: string) {
    const ready = cd <= 0;
    return `<span style="color:${ready ? color : C.textFaint}">${name}[${key}] ${ready ? "준비" : "⏳" + cd.toFixed(0) + "s"}</span>`;
  }

  hud() {
    const [a, b] = this.pg.contrib;
    return `<b>전력망</b> 팀 ${Math.floor(this.pg.produced)}/${BASE.quota}` +
      ` &nbsp; <span style="color:${C.player[0]}">P1 ${Math.floor(a)}</span>·<span style="color:${C.player[1]}">P2 ${Math.floor(b)}</span>` +
      ` &nbsp; 정전 ${this.pg.blackouts} &nbsp; ${Math.max(0, TIME_LIMIT - this.h.clock).toFixed(0)}s` +
      ` &nbsp; ${this.roleTag("차단", this.pg.shedCool, "Q", C.player[0])}` +
      ` ${this.roleTag("증설", this.pg.boostCool, "P", C.player[1])}` +
      ` &nbsp; <span style="color:${C.success}">${this.pg.synergyOn() ? "🤝" : ""}×${this.pg.teamMult().toFixed(2)}</span>` +
      ` &nbsp; <span style="opacity:.6">P1:1-5 · P2:6-0 · 음소거[M] ${this.sfx.muted ? "🔇" : "🔊"}</span>`;
  }

  update(dt: number) {
    if (this.h.phase !== "play") { if (this.p.justDown) this.reset(); return; }
    this.pg.step(dt);
    if (this.pg.blackouts > this.prevBO) { this.flash = 0.6; this.prevBO = this.pg.blackouts; this.sfx.trip(); }
    this.flash = Math.max(0, this.flash - dt);
    // 상태 전환 효과음
    if (this.pg.event && this.pg.event !== this.prevEvent) this.sfx.event();
    this.prevEvent = this.pg.event;
    const spiking = this.pg.machines.some((m) => m.spiking);
    if (spiking && !this.prevSpiking) this.sfx.spike();
    this.prevSpiking = spiking;
    const over = this.pg.overFor > 0;
    if (over && !this.prevOver) this.sfx.warn();
    this.prevOver = over;
    this.h.score = Math.floor(this.pg.produced);
    if (this.pg.done()) { this.h.to("win"); this.sfx.win(); this.h.record("win"); }
    else if (this.h.clock >= TIME_LIMIT) { this.h.to("lose"); this.sfx.lose(); this.h.record("lose"); }
  }

  private box(i: number) { return { x: 24 + (i % 5) * 120, y: i < 5 ? 48 : 300, w: 100, h: 92 }; }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.clearRect(0, 0, 640, 480);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, 640, 480);
    if (this.flash > 0) { ctx.fillStyle = withAlpha(C.danger, this.flash); ctx.fillRect(0, 0, 640, 480); }

    ctx.textAlign = "left"; ctx.font = font(F.sm);
    ctx.fillStyle = C.player[0]; ctx.fillText("P1 (키 1·2·3·4·5)", 24, 40);
    ctx.fillStyle = C.player[1]; ctx.fillText("P2 (키 6·7·8·9·0)", 24, 292);

    this.pg.machines.forEach((m, i) => {
      const b = this.box(i), name = NAMES[i % 5];
      // 꺼진 기계는 담당 색을 옅게. 예전엔 옛 플레이어 색 RGB 를 배열로 박아둬서
      // 토큰을 바꿔도 여기만 따라오지 않았다.
      ctx.fillStyle = m.spiking ? C.danger : withAlpha(C.player[m.owner], m.on ? 0.85 : 0.22);
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = m.spiking ? C.accentHi : m.on ? C.text : C.line;
      ctx.lineWidth = m.spiking ? 3 : 2; ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = C.text; ctx.font = font(F.sm);
      ctx.fillText(name + (m.volatile ? " ~" : ""), b.x + b.w / 2, b.y + 22);
      ctx.font = font(F.xs); ctx.fillStyle = C.textMuted;
      ctx.fillText(`▲${m.spiking ? m.draw + 40 : m.draw} ⚙${m.output}`, b.x + b.w / 2, b.y + 46);
      if (m.spiking) { ctx.fillStyle = C.accentHi; ctx.font = font(F.xs); ctx.fillText("⚡급등!", b.x + b.w / 2, b.y + 64); }
      ctx.fillStyle = m.on ? C.success : C.textFaint; ctx.font = font(F.xs);
      ctx.fillText(m.on ? "ON" : "off", b.x + b.w / 2, b.y + b.h - 12);
    });

    // 공유 부하 미터
    const mx = 40, my = 168, mw = 560, mh = 26;
    const scale = BASE.capacity + ROLE.BOOST_AMT + EVENTS.MAINT_CAP + 40;
    const px = (v: number) => mx + mw * Math.min(1, v / scale);
    const cap = this.pg.cap(), dem = this.pg.demand(), total = dem + this.pg.displayLoad;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = C.surface; ctx.fillRect(mx, my, mw, mh);
    ctx.fillStyle = withAlpha(C.danger, 0.35); ctx.fillRect(px(cap * 0.9), my, px(cap) - px(cap * 0.9), mh);
    ctx.fillStyle = C.demand; ctx.fillRect(mx, my, px(dem) - mx, mh);
    ctx.fillStyle = total > cap ? C.danger : C.accent;
    ctx.fillRect(px(dem), my, px(total) - px(dem), mh);
    const capX = px(cap);
    ctx.strokeStyle = this.pg.boostTimer > 0 ? C.success : this.pg.heat > 0.05 ? C.danger : C.text; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(capX, my - 4); ctx.lineTo(capX, my + mh + 4); ctx.stroke();
    ctx.fillStyle = C.text; ctx.font = font(F.xs); ctx.textAlign = "left";
    ctx.fillText(`부하(지연) ↕용량 ${cap}${this.pg.boostTimer > 0 ? " +증설" : ""}${this.pg.heat > 0.05 ? ` 🔥${Math.round(this.pg.heat * 100)}%` : ""}${dem > 0 ? "  ⚡수요" : ""}`, mx, my - 7);
    if (this.pg.efficiency < 1 && !this.pg.tripped) {
      ctx.fillStyle = withAlpha(C.danger, 0.8); ctx.textAlign = "right";
      ctx.fillText(`⚠ 브라운아웃 ${Math.round(this.pg.efficiency * 100)}%`, mx + mw, my - 7);
    }

    // 목표: 도시 구역 급전 — produced가 문턱을 넘을 때마다 소비자가 켜짐. 정전 세트백 시 다시 꺼짐.
    const py = my + 42, CN = CITY.length, sp = mw / CN;
    let lit = 0;
    for (let i = 0; i < CN; i++) {
      const on = this.pg.produced >= (BASE.quota * (i + 1)) / CN;
      if (on) lit++;
      const ix = mx + (i + 0.5) * sp, iy = py + 6;
      ctx.globalAlpha = on ? 1 : 0.22; ctx.font = font(F.xl);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(CITY[i], ix, iy);
      ctx.globalAlpha = 1;
      ctx.fillStyle = on ? C.success : C.slot;
      ctx.beginPath(); ctx.arc(ix, iy + 18, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = C.text; ctx.font = font(F.xs); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillText(`🏙️ 도시 전력 공급  ${lit}/${CN} 구역`, mx, py - 10);

    // 이벤트 배너
    if (this.pg.event && !this.pg.tripped) {
      const [label, color] = EVENT_LABEL[this.pg.event];
      ctx.fillStyle = color; ctx.font = font(F.md); ctx.textAlign = "center";
      ctx.fillText(`${label}  (${this.pg.eventTimer.toFixed(0)}s)`, 320, py + 30);
    }

    // 과부하 알람 텔레그래프 — 라인 넘긴 직후 grace 동안만.
    if (this.h.phase === "play" && !this.pg.tripped && this.pg.overFor > 0) {
      const t = Math.min(1, this.pg.overFor / BASE.grace);
      const pulse = 0.35 + 0.35 * Math.sin(this.h.clock * 16);
      ctx.strokeStyle = withAlpha(C.danger, pulse); ctx.lineWidth = 12; ctx.strokeRect(6, 6, 628, 468);
      ctx.fillStyle = C.surface; ctx.fillRect(mx, py + 44, mw, 6);
      ctx.fillStyle = C.danger; ctx.fillRect(mx, py + 44, mw * t, 6);
      ctx.fillStyle = C.danger; ctx.font = font(F.md); ctx.textAlign = "center";
      ctx.fillText("⚡ 과부하! 곧 정전 — 끄거나 P1 차단[Q] · P2 증설[P]", 320, py + 40);
    }

    if (this.pg.tripped) {
      ctx.fillStyle = C.danger; ctx.font = font(F.lg); ctx.textAlign = "center";
      ctx.fillText("⚡ 차단기 트립 — 전원 복구 중", 320, py + 30);
      if (this.pg.blameLog) {
        const [x, y] = this.pg.blameLog;
        ctx.font = font(F.sm); ctx.fillStyle = C.textMuted;
        ctx.fillText(`책임 로그(직전 초과, 지연됨): P1 ${x} · P2 ${y} … 누구 탓?`, 320, py + 54);
      }
      if (this.pg.penalized !== null) {
        ctx.font = font(F.sm); ctx.fillStyle = this.pg.penalized === 0 ? C.player[0] : C.player[1];
        ctx.fillText(`⚠ 라인을 먼저 넘긴 P${this.pg.penalized + 1} 점수 −${CROSS_PENALTY}`, 320, py + 74);
      }
    }

    if (this.h.phase !== "play") {
      ctx.fillStyle = withAlpha(C.scrim, 0.75); ctx.fillRect(0, 0, 640, 480);
      ctx.fillStyle = this.h.phase === "win" ? C.success : C.danger;
      ctx.font = font(F.huge); ctx.textAlign = "center";
      ctx.fillText(this.h.phase === "win" ? "🏙️ 도시 전체 급전 ✓" : "정전 도시 — 급전 실패", 320, 78);
      const [a, b] = this.pg.contrib.map(Math.floor);
      ctx.font = font(F.lg);
      if (this.h.phase === "win") {
        const mvp = this.pg.mvp();
        ctx.fillStyle = mvp === 0 ? C.player[0] : mvp === 1 ? C.player[1] : C.textMuted;
        ctx.fillText(mvp === -1 ? `무승부 MVP (P1 ${a} · P2 ${b})` : `👑 MVP: ${mvp === 0 ? "P1" : "P2"}  (P1 ${a} · P2 ${b})`, 320, 108);
      } else {
        ctx.fillStyle = C.textFaint; ctx.fillText(`MVP 없음 (팀이 져서) · P1 ${a} · P2 ${b}`, 320, 108);
      }

      // 라운드 정산 — 판 내내 애매했던 '누구 탓'을 여기서 공개
      ctx.fillStyle = C.success; ctx.font = font(F.md);
      ctx.fillText("── 라운드 정산 ──", 320, 148);
      if (this.pg.history.length === 0) {
        ctx.fillStyle = C.success; ctx.font = font(F.lg);
        ctx.fillText("🎉 무정전 클리어 — 완벽한 협동!", 320, 180);
      } else {
        ctx.font = font(F.sm); ctx.textAlign = "center";
        const shown = this.pg.history.slice(0, 7);
        shown.forEach((e, i) => {
          const who = e.crosser === null ? "환경(열·수요·급등)" : `P${e.crosser + 1}`;
          ctx.fillStyle = e.crosser === 0 ? C.player[0] : e.crosser === 1 ? C.player[1] : C.textMuted;
          ctx.fillText(`${e.t}s  ⚡정전 · 먼저 넘긴: ${who}  (초과기여 P1 ${e.blame[0]}·P2 ${e.blame[1]})`, 320, 176 + i * 22);
        });
        if (this.pg.history.length > 7) {
          ctx.fillStyle = C.textFaint; ctx.fillText(`…외 ${this.pg.history.length - 7}회`, 320, 176 + 7 * 22);
        }
      }

      ctx.fillStyle = C.textMuted; ctx.font = font(F.md);
      ctx.fillText(`정전 ${this.pg.blackouts}회 · 클릭 또는 R로 재시작`, 320, 452);
    }
  }
}
