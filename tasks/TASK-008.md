---
id: TASK-008
title: 메뉴 행 기하를 유도식으로 — 5번째 게임이 화면 밖으로 나간다
status: HUMAN_REVIEW

type: fix
profile: nan2026

risk:
  level: low
  reasons:
    - 렌더·히트박스만 바꾼다. 씬 교체·게임 로직은 안 건드린다
    - 다만 이 화면이 모든 게임의 진입점이라 깨지면 전부 못 들어간다

human:
  owner: user
  reviewer_required: true
---

## Problem

게임 선택 화면에서 **5번째 항목이 안 보인다**(사용자 발견).

`src/scenes/menu.ts` 가 `ROW_Y = 150`, `ROW_H = 70`, `GAP = 16` 을 상수로 들고
`rowY(i) = 150 + i * 86` 으로 그린다. 캔버스는 480px 인데:

| i | y 범위 |
|---|---|
| 0 | 150~220 |
| 1 | 236~306 |
| 2 | 322~392 |
| 3 | 408~478 (간신히) |
| 4 | **494~564 — 화면 밖** |

지금 게임이 5종(전력망·리듬 릴레이·사라지는 선·떠넘기기·제로섬)이라 제로섬이 통째로
가려졌다. 클릭 히트박스도 같은 좌표를 쓰므로 **마우스로는 아예 접근할 수 없다**
(숫자키 `5` 로는 들어가진다 — 그래서 더 늦게 발견됐다).

리허설4 레인에서 같은 병을 겪고 "서로 물린 기하 값은 상수로 두지 말고 하나에서
유도한다"를 교훈으로 적어뒀는데(records/TASK-007.json) 여기에 적용하지 않았다.

## What we are shipping

행 높이·간격·시작 y 를 **항목 수에서 유도한다.** 항목이 늘어도 화면 안에 들어온다.

- 제목(90)·힌트(118) 아래 `LIST_TOP`~`LIST_BOT` 밴드를 정하고 그 안에서 계산한다.
- `rowH = min(ROW_MAX, ⌊(밴드 − 간격 총합) / N⌋)`, 항목 블록을 밴드 안에서 **세로 중앙 정렬**.
  항목이 적으면(하위 메뉴 2개) 가운데 모이고, 많으면 촘촘해진다.
- 행 안의 글자 위치도 `rowH` 비율로 잡는다 — 행이 낮아져도 설명이 잘리지 않는다.
- 히트박스는 그리는 좌표를 그대로 쓴다(지금도 같은 함수라 자동으로 따라온다).

## What we are not shipping

- 스크롤·페이지네이션. `rowH` 하한(34) 기준 7항목까지 들어간다 — 넘으면 그때.
- 키보드 focus 표시(계속 이월 중인 항목). 이 작업은 배치만 고친다.
- 메뉴 디자인 변경(색·테두리·hover 규칙).

## Facts

- `menu.ts` 는 최상위 목록과 리듬 하위 메뉴(2항목)를 **같은 씬으로 재사용**한다.
  그래서 항목 수가 2~7 사이에서 변한다 — 고정 배치가 애초에 맞지 않았다.
- `pointer` 와 `draw` 가 둘 다 `rowY(i)` 를 쓴다. 한 곳만 고치면 히트박스가 어긋난다.
- 숫자키는 `Digit1`~`Digit9` 를 받는다. 9항목까지는 키로 접근 가능하다.
- 제목 baseline 90(F.huge), 힌트 118(F.sm). 그 아래부터 캔버스 끝까지가 가용 공간이다.

## Decisions

- **유도식으로 바꾼다.** 상수 세 개를 손으로 맞추면 게임이 늘 때마다 또 놓친다.
  실제로 놓쳤고, 마우스 접근이 막힌 채로 배포까지 됐다.
- **세로 중앙 정렬.** 항목이 2개일 때 위로 몰리면 빈 화면이 커진다.
- **하한 34px + `ponytail:` 주석.** 7항목을 넘으면 스크롤이 필요하다는 천장을 코드에 남긴다.

## Assumptions

- 게임이 7종을 넘기 전에 스크롤을 만들 여유가 있다고 가정했다. 지금 5종이다.

## Relevant context

- `src/scenes/menu.ts` — 유일한 변경 대상
- `src/main.ts` — `GAMES` 5항목, `RHYTHM_MODES` 2항목
- `records/TASK-007.json` — 같은 병(레인 기하)과 그때 적은 교훈
- `DESIGN.md` — hover 는 `C.accent`(플레이어 색 금지), 타이포 단계 준수

## Allowed scope

- `src/scenes/menu.ts`
- `src/menu.test.ts`(신규), `docs/DECISIONS.md`

## Forbidden scope

- 게임 5종의 코드, `src/core/harness.ts`, `src/ui/tokens.ts`, `src/main.ts`
- 메뉴의 색·테두리·hover 규칙

## Acceptance criteria

- [x] 항목 5개가 전부 캔버스(480) 안에 그려진다.
- [x] 항목 2·5·7개 모두 마지막 행 하단이 480 이하다.
- [x] 히트박스가 그리는 좌표와 일치한다(같은 함수를 쓴다).
- [x] 항목이 적으면 세로 중앙에 모인다.
- [x] 행 안의 이름·설명이 `rowH` 가 줄어도 행 밖으로 나가지 않는다.
- [x] 배치 계산에 대한 테스트가 있다 — 렌더 없이 검증 가능한 형태로 분리한다.
- [x] `npm test` / `npm run build` / `bass design check` / `bass nan protect verify` 통과.
- [x] 씬에 색·폰트 리터럴 0건 유지.

## Human judgment

- 5항목일 때 행이 촘촘해 보이는지, 설명 글자가 읽히는지.
- 2항목(리듬 하위 메뉴)에서 중앙 정렬이 어색하지 않은지.

## Verification

- `npm test` — 신규: 항목 수별 마지막 행이 캔버스 안 / 중앙 정렬 / 히트박스 일치
- `npm run build` (tsc + vite)
- `bass design check` / `bass nan protect verify`
- grep — `src/scenes/menu.ts` 색·폰트 리터럴 0건
- 사람: 메뉴에서 5개가 다 보이고 마우스로 눌리는지

## Rollback

`src/scenes/menu.ts` 의 `layout()` 을 지우고 `OX/OW/ROW_Y/ROW_H/GAP` 상수와
`rowY(i) = ROW_Y + i * (ROW_H + GAP)` 로 되돌린다. 행 안 글자 위치를 고정값
(y+30 / y+42 / y+52)으로 환원한다. `src/menu.test.ts` 를 삭제하고 DECISIONS 해당 행을 제거한다.
git 이 없는 저장소라 파일별 수동 환원이다.
