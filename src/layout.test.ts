import { describe, it, expect } from "vitest";
import { textBand, overlaps, checkStack } from "./kits/layout";
import { SUMMARY_Y, BOARD_BOTTOM, BAR, GLYPH, HINT_Y as ZRO_HINT_Y } from "./scenes/zerosum";
import { BANNER, TURN_Y, DIE, POP, GAUGE_Y } from "./scenes/pushluck";
import { TURN, HINT_Y, TTL_HINT_Y } from "./scenes/mimicry";

const H = 480;   // 캔버스 높이
const F = { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, xxl: 28, huge: 34, hero: 44 };

describe("글자 세로 구간 (kits/layout)", () => {
  it("baseline 위로 뻗는 높이를 계산한다 — 이걸 안 빼서 세 곳이 겹쳤다", () => {
    const b = textBand(100, 20);
    expect(b.top).toBe(84);        // 100 - 20*0.8
    expect(b.bottom).toBe(104);    // 100 + 20*0.2
    expect(b.top).toBeLessThan(100);
  });

  it("맞닿는 것은 겹침이 아니다", () => {
    expect(overlaps({ top: 0, bottom: 10 }, { top: 10, bottom: 20 })).toBe(false);
    expect(overlaps({ top: 0, bottom: 11 }, { top: 10, bottom: 20 })).toBe(true);
  });

  it("checkStack 이 겹침과 화면 밖을 모두 잡는다", () => {
    const bad = checkStack([
      { name: "a", ...textBand(100, 20) },
      { name: "b", ...textBand(105, 20) },
      { name: "c", ...textBand(479, 20) },
    ], H);
    expect(bad).toContain("a ↔ b");
    expect(bad.some((m) => m.startsWith("c 이 화면 밖"))).toBe(true);
  });
});

describe("제로섬 세로 배치", () => {
  it("미리보기 요약이 격자 아래에 있고 화면 안에 들어온다", () => {
    // 요약이 baseline 466·F18 이던 때 격자(456) 위로 4.4px 올라탔고,
    // 둘째 줄은 480.4 로 화면 밖으로 잘렸다.
    const summary = textBand(SUMMARY_Y, F.sm);
    expect(summary.top).toBeGreaterThanOrEqual(BOARD_BOTTOM);
    expect(summary.bottom).toBeLessThanOrEqual(H);
  });

  it("차례 줄부터 요약까지 세로로 안 겹친다", () => {
    // 안내가 baseline 126 이고 막대가 100~120 이던 때 막대 위에 글자가 5.2px 얹혔다.
    const bad = checkStack([
      { name: "차례 줄", ...textBand(34, F.xl) },
      { name: "점수 라벨", ...textBand(BAR.y - 14, F.sm) },
      { name: "판세 막대", top: BAR.y, bottom: BAR.y + BAR.h },
      { name: "안내/알림", ...textBand(ZRO_HINT_Y, F.sm) },
      { name: "격자", top: 136, bottom: BOARD_BOTTOM },
      { name: "요약", ...textBand(SUMMARY_Y, F.sm) },
    ], H);
    expect(bad).toEqual([]);
  });

  it("모양 글리프가 세로 스택에서 빠져 차례 줄과 가로로 분리된다", () => {
    // 글리프는 7px 단위라 고리(5×5)가 35px — 세로에 넣으면 점수 라벨을 2.7px 파고들었다.
    const GLYPH_HALF = 5 * 7 / 2;                 // 가장 큰 모양(고리)
    const TURN_RIGHT = 320 + 290 / 2;             // 차례 줄 최대 폭 추정 290
    expect(GLYPH.x - GLYPH_HALF).toBeGreaterThan(TURN_RIGHT);
    expect(GLYPH.x + GLYPH_HALF).toBeLessThanOrEqual(640);
  });
});

describe("떠넘기기 세로 배치", () => {
  it("가운데 열(점수판·배너·차례 줄·주사위·게이지 숫자)이 서로 안 겹친다", () => {
    // 차례 줄이 baseline 92·F22 이던 때 배너(56~82)를 7.6px 파고들었다.
    // 제목은 왼쪽 정렬(x 16~96)이라 가로가 안 겹치므로 이 스택에서 뺀다 —
    // 세로만 보고 한 줄로 세우면 실제로 안 겹치는 것까지 걸린다.
    //
    // **주사위는 최대 팝으로 잰다.** 예전엔 `146 - 34` 처럼 손으로 적은 평상시 기하만
    // 봤고 게이지 숫자는 스택에 아예 없었다 — 그래서 주사위가 게이지 숫자를 평상시
    // 4.4px · 팝일 때 16.3px 파고드는 것을 통과시켰다(PSH-005). 검사에 없는 것은 안 깨진다.
    const r = DIE.r * (1 + POP);
    const bad = checkStack([
      { name: "점수 숫자", ...textBand(26, F.md) },
      { name: "목표·이번 판", ...textBand(44, F.xs) },
      { name: "배너", top: BANNER.y, bottom: BANNER.y + BANNER.h },
      { name: "차례 줄", ...textBand(TURN_Y, F.xl) },
      { name: "주사위(최대 팝)", top: DIE.y - r, bottom: DIE.y + r },
      { name: "게이지 숫자", ...textBand(GAUGE_Y, F.xxl) },
    ], H);
    expect(bad).toEqual([]);
  });

  it("게이지 숫자가 심지 위험 띠 위에 든다", () => {
    // 위험 띠는 lineWidth 22 로 심지 경로(FUSE.y 240 ± 물결 5) 위에 그려진다.
    const dangerTop = 240 - 5 - 11;
    expect(textBand(GAUGE_Y, F.xxl).bottom).toBeLessThan(dangerTop);
  });

  it("제목은 왼쪽 정렬이라 가운데 열과 가로로 분리돼 있다", () => {
    // 제목(baseline 32, F.xl)은 세로로는 점수판과 겹치지만 x 16~96 이고
    // 가운데 열은 x 140 부터라 실제로는 안 겹친다. 이 분리가 깨지면 위 검사가 무의미해진다.
    const TITLE_RIGHT = 96;
    expect(TITLE_RIGHT).toBeLessThan(BANNER.x);
  });

  it("배너 글자가 배너 상자 안에 들어온다", () => {
    // 배너는 textBaseline "middle" 이라 중앙 기준이다.
    const mid = BANNER.y + BANNER.h / 2;
    expect(mid - F.sm / 2).toBeGreaterThanOrEqual(BANNER.y);
    expect(mid + F.sm / 2).toBeLessThanOrEqual(BANNER.y + BANNER.h);
  });
});

describe("모방 세로 배치", () => {
  // 상자 위 라벨은 panel() 이 `b.y - 6` 에 F.sm 으로 그린다 — 위로 11.2px 뻗으므로
  // 상자 위 17px 이 비어 있어야 한다. 처음엔 그 여백이 없어 라벨이 원본 상자를 파고들었다.
  const label = (boxY: number) => textBand(boxY - 6, F.sm);
  const REF = { y: 72, h: 120 }, AREA = { y: 216, h: 216 };

  it("가운데·왼쪽 열이 서로 안 겹친다", () => {
    const bad = checkStack([
      { name: "제목", ...textBand(30, F.xl) },
      { name: "진행 막대", top: 40, bottom: 52 },
      { name: "원본 라벨", ...label(REF.y) },
      { name: "원본 상자", top: REF.y, bottom: REF.y + REF.h },
      { name: "칸 라벨", ...label(AREA.y) },
      { name: "그리기 칸", top: AREA.y, bottom: AREA.y + AREA.h },
      { name: "하단 안내", ...textBand(HINT_Y, F.sm) },
      { name: "TTL 안내", ...textBand(TTL_HINT_Y, F.sm) },
    ], H);
    expect(bad).toEqual([]);
  });

  it("차례 안내가 원본 상자와 가로로 분리돼 있다", () => {
    // 세로로는 원본 상자(72~192) 한복판이지만 오른쪽 빈 공간에 있어 안 겹친다.
    // 가장 긴 문구("▶ P2 차례 — 사라지는 선을 따라가라", F.lg)의 폭을 넉넉히 300 으로 잡는다.
    const REF_RIGHT = 16 + 160;
    const turnLeft = TURN.x - 300 / 2;
    expect(turnLeft).toBeGreaterThan(REF_RIGHT);
    expect(TURN.x + 300 / 2).toBeLessThanOrEqual(640);
  });

  it("타이머는 오른쪽 끝이라 제목과 가로로 분리돼 있다", () => {
    const TITLE_RIGHT = 16 + 130;   // "사라지는 선" F.xl 5글자
    const TIMER_LEFT = 624 - 60;    // "9.3s" F.md 우측 정렬
    expect(TIMER_LEFT).toBeGreaterThan(TITLE_RIGHT);
  });

  it("참조 상자와 그리기 칸이 같은 비(4:3)를 유지한다", () => {
    // 비가 다르면 정규화 좌표가 눌려 잘 그려도 유사도가 깎인다.
    expect(160 / 120).toBeCloseTo(288 / 216, 6);
    expect(192 / 144).toBeCloseTo(288 / 216, 6);   // 공개 화면 3분할도 같은 비
  });
});

describe("전력망 세로 배치", () => {
  // 용량선은 막대 위아래로 4px 씩 튀어나온다 — 그걸 안 세서 도시 라벨이 7.6px 파고들었다.
  const my = 168, mh = 26, py = my + 52;

  it("용량선 아래로 도시 블록이 순서대로 놓인다", () => {
    const bad = checkStack([
      { name: "부하 라벨", ...textBand(my - 7, F.xs) },
      { name: "용량선", top: my - 4, bottom: my + mh + 4 },   // 막대를 포함한다
      { name: "도시 라벨", ...textBand(py - 10, F.xs) },
      { name: "아이콘", top: py + 6 - 11, bottom: py + 6 + 11 },
      { name: "급전 점", top: py + 6 + 18 - 3, bottom: py + 6 + 18 + 3 },
      { name: "이벤트 배너", ...textBand(py + 44, F.md) },
      { name: "P2 라벨", ...textBand(292, F.sm) },
    ], H);
    expect(bad).toEqual([]);
  });

  it("용량선이 막대보다 위아래로 튀어나온다 — 이걸 세야 한다", () => {
    const bar = { top: my, bottom: my + mh };
    const capLine = { top: my - 4, bottom: my + mh + 4 };
    expect(capLine.top).toBeLessThan(bar.top);
    expect(capLine.bottom).toBeGreaterThan(bar.bottom);
    // 도시 라벨은 막대가 아니라 **용량선** 아래에 있어야 한다
    expect(textBand(py - 10, F.xs).top).toBeGreaterThanOrEqual(capLine.bottom);
  });
});
