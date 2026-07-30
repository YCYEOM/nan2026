// 디자인 토큰. DESIGN.md 가 의미를 정의하고 여기가 값을 가진다.
// 씬은 색·크기 리터럴을 직접 쓰지 않는다 — rgb()/rgba() 도 마찬가지다(withAlpha 를 쓴다).
// 새 값이 필요하면 먼저 DESIGN.md 에 역할을 정한다.

export const C = {
  // 시그니처. 정체성을 말하는 색이고 정보를 전달하지 않는 장식에만 쓴다
  // (타이틀, 레인 테두리). 판정선처럼 상태를 알리는 요소에는 쓰지 않는다 — DESIGN.md 원칙 1.
  sig: "#FF2E97",       // 네온 핑크 — 그라데이션 시작
  sigEnd: "#00E5FF",    // 사이언 — 그라데이션 끝. player[0] 과 같은 값이라 장식 전용이다

  bg: "#0A0612",        // 화면 바탕 (보랏빛 흑)
  surface: "#150E24",   // 바탕 위 판(레인, 카드)
  surfaceAlt: "#1D1330",// 판 위 항목(메뉴 행)
  surfaceHi: "#2A1B45", // 항목 hover
  slot: "#241A38",      // 비활성 슬롯·꺼진 상태
  line: "#3D2A5C",      // 테두리·구분선

  text: "#FFFFFF",      // 본문 (bg 대비 20.04)
  textMuted: "#B9A8D4", // 보조 설명 (9.18)
  textFaint: "#7A6A96", // 비활성·부가 정보 (4.13 — 작은 텍스트 AA 미달, 판단에 불필요한 것만)

  accent: "#FF2E97",    // 주목: 콤보, 번호, hover 강조. 시그니처와 같은 값이지만 역할이 다르다
  accentHi: "#FFD166",  // 주목의 강한 변형 (연타 링, 급등 테두리)
  success: "#3DFF9E",   // 성공·달성·켜짐 (15.27)
  danger: "#FF5252",    // 실패·미스·경고 (6.28)
  demand: "#C77DFF",    // 외부 수요·부하 (7.45)

  scrim: "#000000",     // 오버레이 바탕. 항상 withAlpha 와 함께 쓴다

  // 플레이어 색. 인덱스가 곧 플레이어 번호다. 씬이 달라도 P1 은 항상 같은 색.
  // 2인만 정의한다. P3·P4 를 추가할 때는 success/danger/accent/demand 어느 것과도
  // 겹치지 않고 서로 밝기가 다른 값을 골라야 한다 (DESIGN.md 원칙 1·2).
  player: ["#00E5FF", "#FFB300"],
} as const;

// 타이포 단계. 캔버스라 px 고정. 단계 사이 값을 쓰지 않는다.
export const F = {
  xs: 12, sm: 14, md: 16, lg: 18, xl: 22, xxl: 28, huge: 34, hero: 44,
} as const;

export const font = (size: number) => `${size}px sans-serif`;

/** 토큰 색에 알파를 입힌다. rgba() 리터럴을 쓰면 토큰을 바꿔도 따라오지 않는다. */
export function withAlpha(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** 시그니처 그라데이션. 장식 전용 — 상태를 알리는 요소에 쓰지 않는다. */
export function sigGradient(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, C.sig);
  g.addColorStop(1, C.sigEnd);
  return g;
}

/** 네온 글로우를 켠 채로 draw 를 실행하고 원상복구한다. */
export function glow(ctx: CanvasRenderingContext2D, color: string, blur: number, draw: () => void) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  draw();
  ctx.restore();
}
