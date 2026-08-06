// 총알피하기 3D 씬 검사 (DGE-003).
//
// **이 검사가 무엇을 못 보는지가 무엇을 보는지만큼 중요하다.**
// 원근투영 아래에서 움직이는 물체(사람 둘 · 총알 여럿 · 조각 14개)의 겹침은
// 산술로 못 잡는다. 여기서 막을 수 있는 것은 넷뿐이다 —
//   1) **조작 방향** (누른 대로 움직이는가) ← 카메라를 반대편에 놓고 12개를 통과시킨 뒤 추가했다
//   2) 몸통 폭 = 판정 지름 (요격이 거짓말을 안 하는가)
//   3) 2D 오버레이 스택 (제목·상태줄·결산은 3D 가 아니다)
//   4) 투영된 판이 캔버스 안인가
// 나머지는 사람이 본다.
import { describe, it, expect } from "vitest";
import { K, ARENA, PLATE_LV, TOP_LV } from "./systems/dodge";
import { project, world, bodyScale, boardBounds, SUIT_HALF, CAM, TURN_Y, STATUS_Y, RECAP } from "./scenes/dodge3d";
import { textBand, checkStack } from "./kits/layout";
import { F } from "./ui/tokens";

/** 판 위 여러 자리 — 가깝고 먼 곳을 섞는다. 원근이라 자리마다 배율이 다르다. */
const SPOTS = [
  { x: ARENA.x, y: ARENA.y },
  { x: ARENA.x, y: ARENA.y + 150 },   // 가까운 쪽 (카메라는 엔진 y 큰 쪽에 있다)
  { x: ARENA.x, y: ARENA.y - 150 },   // 먼 쪽
  { x: ARENA.x - 150, y: ARENA.y },
  { x: ARENA.x + 150, y: ARENA.y },
];

/**
 * **조작 방향 — 이 검사가 없어서 카메라를 반대편에 놓고도 12개 검사가 다 통과했다.**
 *
 * 투영이 기하학적으로 맞아도 카메라가 판 반대편에 있으면 엔진 +x 가 화면 왼쪽,
 * 엔진 +y 가 화면 위로 간다. 즉 **가로·세로 조작이 둘 다 뒤집힌다.**
 * 판 경계도, 몸통 폭도, 원근도 전부 정상이라 어느 검사도 안 걸렸다 —
 * 사람이 방향키를 눌러보고서야 알았다.
 *
 * 화면과 입력이 맞는지는 **투영의 내부 성질이 아니라 축의 방향**이다. 그것만 본다.
 */
describe("조작 방향 — 누른 대로 움직인다", () => {
  const C0 = { x: ARENA.x, y: ARENA.y };
  const at = (dx: number, dy: number) => world({ x: C0.x + dx, y: C0.y + dy })!;

  it("오른쪽 키(엔진 +x)는 화면 오른쪽이다", () => {
    expect(at(100, 0).x).toBeGreaterThan(at(0, 0).x);
    expect(at(-100, 0).x).toBeLessThan(at(0, 0).x);
  });

  it("아래쪽 키(엔진 +y)는 화면 아래다", () => {
    expect(at(0, 100).y).toBeGreaterThan(at(0, 0).y);
    expect(at(0, -100).y).toBeLessThan(at(0, 0).y);
  });

  it("카메라가 엔진 y 큰 쪽에 선다 — 반대편이면 두 축이 다 뒤집힌다", () => {
    expect(CAM.eye[2]).toBeGreaterThan(0);
  });
});

describe("투영", () => {
  it("카메라 뒤는 안 그린다", () => {
    // 카메라는 z 양수 쪽에서 -z 를 본다 — 뒤로 더 가면 시야 밖이다
    expect(project(0, 0, -100000)).not.toBeNull();   // 앞쪽 먼 곳은 그린다
    expect(project(0, 0, 100000)).toBeNull();        // 카메라 뒤는 없다
  });

  it("멀수록 작아진다 — 원근이 실제로 든다", () => {
    const near = world({ x: ARENA.x, y: ARENA.y + 150 })!;
    const far = world({ x: ARENA.x, y: ARENA.y - 150 })!;
    expect(far.s).toBeLessThan(near.s);
    expect(far.y).toBeLessThan(near.y);              // 먼 쪽이 화면 위다
  });

  it("높이가 있으면 화면에서 위로 간다", () => {
    const foot = world({ x: ARENA.x, y: ARENA.y })!;
    const head = world({ x: ARENA.x, y: ARENA.y }, 50)!;
    expect(head.y).toBeLessThan(foot.y);
  });
});

describe("몸통 폭 = 판정 지름 — 요격이 거짓말을 하면 안 된다", () => {
  /**
   * 발밑 판정 링(`K.BODY` 반지름)의 화면 가로 반폭을 **투영 점에서 직접 재서**
   * 우주복 몸통 반폭과 맞는지 본다. 실루엣이 판정보다 크면
   * "안 맞았는데 맞았다"가 되고, 작으면 막았는데 안 막힌 것처럼 보인다.
   */
  function ringHalfWidth(p: { x: number; y: number }) {
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < 64; i++) {
      const t = (i / 64) * Math.PI * 2;
      const q = project(p.x - ARENA.x + Math.cos(t) * K.BODY, 0, p.y - ARENA.y + Math.sin(t) * K.BODY);
      if (!q) continue;
      min = Math.min(min, q.x); max = Math.max(max, q.x);
    }
    return (max - min) / 2;
  }

  it("어느 자리에서도 몸통 반폭이 판정 반지름과 같다", () => {
    for (const p of SPOTS) {
      const torso = SUIT_HALF * bodyScale(p);
      const judge = ringHalfWidth(p);
      expect(Math.abs(torso - judge) / judge).toBeLessThan(0.05);
    }
  });

  it("가까울수록 크게 그려진다 — 배율이 깊이를 따라간다", () => {
    const near = bodyScale({ x: ARENA.x, y: ARENA.y + 150 });
    const far = bodyScale({ x: ARENA.x, y: ARENA.y - 150 });
    expect(near).toBeGreaterThan(far);
  });

  it("실제 게임 크기가 뭉갤 만큼 작지 않다", () => {
    // 세로 약 66px(머리 위 이름 제외). 헬멧·바이저·어깨 띠 셋이 읽혀야 한다.
    const s = bodyScale({ x: ARENA.x, y: ARENA.y });
    expect(s * 66).toBeGreaterThan(30);
  });
});

describe("판이 캔버스 안에 든다", () => {
  it("가장 넓을 때도 화면 밖으로 안 나간다", () => {
    const b = boardBounds(TOP_LV);
    expect(b.minX).toBeGreaterThan(0);
    expect(b.maxX).toBeLessThan(640);
    expect(b.minY).toBeGreaterThan(0);
    expect(b.maxY).toBeLessThan(480);
  });

  it("위아래 2D 오버레이와 안 겹친다", () => {
    const b = boardBounds(TOP_LV);
    const title = textBand(TURN_Y, F.lg);
    const status = textBand(STATUS_Y, F.sm);
    expect(b.minY).toBeGreaterThan(title.bottom);
    expect(b.maxY).toBeLessThan(status.top);
  });

  it("조각이 무너지면 화면에서도 안으로 들어온다", () => {
    const wide = boardBounds(TOP_LV), narrow = boardBounds(0);
    expect(narrow.maxX - narrow.minX).toBeLessThan(wide.maxX - wide.minX);
    expect(PLATE_LV[0]).toBeLessThan(PLATE_LV[TOP_LV]);
  });

  it("카메라가 판을 내려다본다 — 기울기가 실제로 있다", () => {
    const pitch = Math.atan2(CAM.eye[1], Math.abs(CAM.eye[2])) * 180 / Math.PI;
    expect(pitch).toBeGreaterThan(20);   // 너무 눕히면 뒤가 안 보인다
    expect(pitch).toBeLessThan(70);      // 너무 세우면 그냥 2D 탑다운이다
  });
});

describe("정적 배치 — 2D 오버레이만 검사할 수 있다", () => {
  it("경기 화면 세로 스택", () => {
    const b = boardBounds(TOP_LV);
    const bands = [
      { name: "상태 줄", ...textBand(TURN_Y, F.lg) },
      { name: "판", top: b.minY, bottom: b.maxY },
      { name: "아래 줄", ...textBand(STATUS_Y, F.sm) },
    ];
    expect(checkStack(bands, 480)).toEqual([]);
  });

  it("결산 오버레이 세로 스택", () => {
    const bands = [
      { name: "버틴 시간", ...textBand(RECAP.time, F.hero) },
      { name: "P1 성적", ...textBand(RECAP.rows[0], F.xl) },
      { name: "P2 성적", ...textBand(RECAP.rows[1], F.xl) },
      { name: "사유", ...textBand(RECAP.why, F.sm) },
      { name: "재시작", ...textBand(RECAP.restart, F.lg) },
    ];
    expect(checkStack(bands, 480)).toEqual([]);
  });
});
