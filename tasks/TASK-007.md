---
id: TASK-007
title: 플레이어당 키 여러 개 — 레인 6줄
status: DONE

type: feature
profile: nan2026

risk:
  level: medium
  reasons:
    - press/release 시그니처가 바뀐다. 판정 진입점을 건드리는 첫 작업이다
    - 하이웨이 기하가 전면 재배치된다. y=245 하드코딩이 씬 전역에 흩어져 있었다
    - TASK-005 에서 승인받은 웨이브 진폭을 되돌린다 (26 → 6)

human:
  owner: user
  reviewer_required: true
---

## Problem

실력 축이 하나뿐이었다. 각 플레이어가 키 하나만 갖고 있어서 "언제 누르나"가 전부였고,
"무엇을 누르나"는 존재하지 않았다. 담당은 판정선 색이 이미 말해주므로 플레이어가 하는
판단은 타이밍 단 하나다.

리듬게임의 실제 깊이는 타이밍 × 선택이다. 키를 늘리면 축이 둘이 되고, 직전 작업의
반전(TASK-006)과 곱해진다 — 상대 색·상대 줄로 오는 노트를 **내 세 키 중 어느 것**으로
받아야 하는지가 동시에 걸린다.

## What we are shipping

플레이어당 키 `KEYS_PER_PLAYER`(3)개. P1 `S`/`D`/`F`, P2 `J`/`K`/`L`. 레인 6줄.
(처음 2개로 만든 뒤 사용자 요청으로 하나 더 늘렸다.)

- `Note.lane` = 담당자의 몇 번째 키. `press(player, lane)` 에서 담당과 키가 **둘 다**
  맞아야 판정된다. 틀린 키는 기존 `wrong` 을 재사용한다 — 새 `Result` 값을 만들지 않는다.
- `keysPerPlayer` 미지정이면 전 노트 lane 0 이고 `press(player)` 가 그대로 동작한다.
  `buildChart` 가 kpp=1 일 때 `rnd()` 를 소비하지 않아 기존 시드 차트도 보존된다
  (TASK-006 의 `swapChance` 와 같은 방식).
- **동시류는 레인을 따지지 않는다.** 전원이 함께 누르는 노트에 "몇 번째 키"는 의미가
  없다 → 자기 키 아무거나. lane 검사를 `owner >= 0` 분기에만 둬서 추가 코드가 없다.
- `holdLane` 을 둔다. 홀드 중 같은 사람의 **다른 키** keyup 은 무시한다.
- 화면: 하이웨이 6레인(`LANE_H` 43, y 158~416), 레인별 소유자 색 5% 바탕,
  플레이어 경계선은 진하게·같은 사람 키 사이는 흐리게, 판정선에 레인별 표적 원
  (다음 노트가 올 레인만 밝게), 노트 라벨을 담당 번호 → **키 글자**로,
  판정 팝업을 판정선 왼쪽·판정된 레인 높이로, 하단 키 힌트를 레인당 1박스(총 6개).
- **레인 기하를 유도식으로 둔다.** `LANE_H`·`RAD`·`WAVE`·힌트 박스 폭을 `LANES` 에서
  계산한다. 키를 늘릴 때마다 손으로 맞추면 하나를 놓친다(실제로 2→3 에서 키 힌트가
  하이웨이와 겹칠 뻔했다).

## What we are not shipping

- 플레이어 수 확장(3·4인). 색 제약(`C.success`·`C.danger`·`C.accent`·`C.demand` 충돌)을
  먼저 풀어야 하고, 네트워크 2인 계획과 방향이 다르다.
- 스테이지별 키 수 증가. 항상 3키다.
- 동시류에 레인 개념 도입.
- 마우스·시점 분리·네트워크. TASK-006 에서 판단한 순서 그대로 뒤에 남는다.

## Facts

- `press` 안에서 담당을 보는 곳은 두 군데(연타 분기, 탭·홀드 분기)뿐이고 둘 다
  `this.ownerOf(k)` 를 쓴다. 그래서 lane 조건을 두 줄에 더하면 끝난다.
- `release` 는 `holdPlayer` 만 봤다. 키가 둘이 되면 D 를 누른 채 F 를 떼는 일이 생기고,
  lane 을 안 보면 홀드가 조용히 끊겨 미스가 된다.
- 씬에 `y = 245` / `rad 22|18` / `26 * sin(...)` / `330`(팝업) 이 하드코딩돼 있었다.
  `burst`·`ring`·`fb` 가 전부 245 를 가정했다.
- 노트는 항상 `x >= HIT_X`(150)다 — `pathX(p) = HIT_X + p*span`, `p >= 0`.
  따라서 `x < 150` 구역에는 노트가 구조적으로 존재하지 않는다.

## Decisions

- **틀린 키 = `wrong`.** 새 Result 를 만들지 않았다. 이미 "지금 누를 게 아니다"를
  뜻하는 값이고 UI 처리(무판정)가 같다.
- **웨이브 26 → 6.** 제약은 `WAVE + RAD <= LANE_H/2`. 레인이 생기면서 ±26 웨이브가
  옆 레인을 침범해 "어느 키인가"를 못 읽게 만들었다. TASK-005 물결의 의도적 후퇴다 —
  레인 판독이 굽이침보다 먼저다. 조용히 줄이지 않고 제약식과 함께 문서에 적었다.
- **노트 라벨 = 키 글자.** P1 이 키를 여럿 가지면 `P1` 은 정보가 아니다.
- **판정 팝업을 `x < HIT_X` 로.** 하이웨이가 176px 로 커져서 기존 y 330 이 레인 안이
  됐다. 왼쪽 구역은 노트가 구조적으로 없으므로 원칙 5를 규칙이 아니라 좌표로 보장한다.
  덤으로 "어느 레인이 판정됐는가"를 함께 말한다.

## Assumptions

- 키 배치 `S D F` / `J K L` 가 한 키보드에서 2인이 쓸 때 손이 안 겹친다고 가정했다.
  홈 포지션 세 손가락이지만 검증하지 않았다. 네트워크로 옮기면 무의미해지는 가정이다.

## Relevant context

- `src/systems/rhythm.ts` — `Note`, `buildChart`, `press`, `release`
- `src/scenes/rhythm.ts` — 레인 기하 유도식, `laneAt`, `pathY`, `draw`, `key`
- `DESIGN.md` 원칙 2·5 / Motion / Accessibility
- `docs/GAME_SPEC.md` 리허설4 절

## Allowed scope

- `src/systems/rhythm.ts`, `src/scenes/rhythm.ts`, `src/rhythm.test.ts`
- `DESIGN.md`, `docs/GAME_SPEC.md`, `docs/DECISIONS.md`

## Forbidden scope

- `src/core/harness.ts`, `src/ui/tokens.ts`, 다른 씬
- 점수·적중률·승패 산식 (`applyHit`·`tally`·`winner`)

## Acceptance criteria

- [x] 담당이 맞아도 키가 틀리면 `wrong`, 둘 다 맞아야 판정된다.
- [x] 홀드 중 같은 사람의 다른 키 keyup 은 홀드를 끊지 않는다.
- [x] `keysPerPlayer` 미지정이면 전 노트 lane 0 이고 `press(player)` 가 그대로 동작한다.
- [x] 동시류는 레인을 따지지 않는다.
- [x] 웨이브가 옆 레인을 침범하지 않는다 (`WAVE + RAD <= LANE_H/2`).
- [x] 판정 이펙트·팝업이 판정된 레인 높이에서 난다.
- [x] `npm test` 통과(46개, 신규 3개), `npm run build`, `bass design check`,
      `bass nan protect verify`, 씬 리터럴 0건.

## Human judgment

- 레인 6줄이 640×480 에서 판독되는지. 레인 높이 43 과 노트 반지름 15 가 적절한지.
  6줄은 화면 세로의 54% 를 쓴다 — 한 판에 눈이 훑을 범위가 넓어졌다.
- 웨이브 6 이 너무 작아 물결이 사라진 것처럼 보이는지. TASK-005 의 성과를 얼마나 잃었는지.
- 키 3개가 2인 핫시트에서 손이 겹치지 않는지 (`S D F` / `J K L`).
  홈 포지션 세 손가락이라 이론상 맞지만 실제로 쳐봐야 안다.
- 반전 × 레인이 곱해져 난이도가 과해졌는지 — 두 축이 동시에 걸린다.

## Verification

- `npm test` — 46개(신규 3개: 틀린 키, 홀드 다른 키 keyup, kpp 미지정 보존)
- `npm run build` (tsc + vite)
- `bass design check` / `bass nan protect verify`
- grep — `src/scenes/` 색·폰트 리터럴 0건

## Rollback

`systems/rhythm.ts`: `lane` 필드·`laneOf`·`holdLane`·`keysPerPlayer` 제거,
`press`/`release` 의 lane 매개변수와 두 곳의 lane 조건 삭제.
`scenes/rhythm.ts`: `KEYS`/`KEY_LABEL` 을 1차원으로, `KEYMAP` 을 code→player 로,
레인 기하(`LANES`·`LANE_TOP`·`LANE_SPACE`·`LANE_H`·`LANE_BOT`·`MID_Y`·`HALF`·`RAD`·`WAVE`·
`laneIdx`·`laneY`) 제거, `laneAt` 삭제하고 `pathY` 를 `245 + 26*sin(...)` 로,
하이웨이를 `fillRect(0,200,640,90)`, 판정선을 단일 원(`arc(HIT_X,245,26)`)으로,
`burst`/`ring`/`fb`/`feedback` 의 y 매개변수 제거, 팝업을 `(HIT_X, 330)` `F.huge/F.xxl` 로,
키 힌트를 2박스(y 400)로, 노트 라벨을 `P{owner+1}` 로 환원.
`rhythm.test.ts` 의 신규 3건 삭제. 문서는 GAME_SPEC 레인 절, DESIGN.md Motion·Accessibility
추가분, DECISIONS 07-30 5행 제거. git 이 없는 저장소라 파일별 수동 환원이다.
