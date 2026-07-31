---
id: TASK-014
title: (버그) 메뉴 7항목에서 이름·설명이 겹친다 — 비율 배치를 스택 배치로
status: HUMAN_REVIEW

type: bugfix
profile: nan2026

risk:
  level: low
  reasons:
    - 메뉴 한 파일. 게임 로직을 안 건드린다
    - 다만 히트박스가 같은 `layout()` 을 쓰므로 행 기하를 바꾸면 클릭 위치도 같이 움직인다

human:
  owner: user
  reviewer_required: true
---

## Problem

7번째 게임(총알피하기)을 넣은 뒤 배포 화면에서 **글자가 칸을 넘는다**(사용자 스크린샷).

계산하면 실재한다. n=7 에서 행 높이가 36px 이고,

```
이름  (F.lg 18, baseline h*0.45=16.2)   band  1.80 ~ 19.80
설명  (F.xs 12, baseline h*0.78=28.08)  band 18.48 ~ 30.48
```

**이름 아래끝을 설명이 1.32px 파고든다.**

원인은 **비율 배치**다. `0.45 / 0.62 / 0.78` 은 행이 70px 이던 시절에 맞춘 값인데
폰트 크기는 고정이고 행만 줄어든다. TASK-008 이 행 높이를 항목 수에서 유도하도록
고치면서 `ponytail:` 주석으로 "하한 34 → 7항목까지"라고 적었지만, **그 하한이
글자가 들어가는지를 근거로 정해진 값이 아니었다.**

**테스트가 이걸 놓친 이유가 더 중요하다.**

```js
expect(h * 0.78 + 4).toBeLessThanOrEqual(h);   // F.xs baseline 아래 여유
```

baseline 에 **손으로 고른 4** 를 더해 검사했다. 글자가 실제로 차지하는 구간을 보지
않았고, 이름과 설명이 서로 겹치는지는 아예 검사 대상이 아니었다.
`kits/layout` 의 `textBand`·`checkStack` 이 정확히 이걸 위해 있는데 안 썼다 —
**이 저장소가 같은 종류의 실수를 하는 다섯 번째 자리다**(TASK-010~013).

## What we are shipping

**행 안 글자를 비율이 아니라 스택으로 배치한다.**

- 이름·설명을 한 덩어리로 보고 **행 안에서 세로 중앙**에 놓는다.
  `blockH = F.lg + LINE_GAP + F.xs`
- 번호는 `textBaseline = "middle"` 로 행 한가운데 그린다 — 비율이 필요 없어진다.
- 배치 계산을 `rowText(h)` 로 **export** 해서 테스트가 실제 baseline 을 검사한다.

**행 높이 하한을 글자 기준으로 다시 정한다.**

- `ROW_MIN` 34 → **40**. 두 줄 스택(33px)과 위아래 여백이 들어가는 최소치다.
- 자리를 만들려고 밴드를 넓히고 간격을 줄인다: `LIST_TOP` 140 → **132**,
  `LIST_BOT` 470 → **476**, `GAP` 12 → **8**.
- 결과: n=7 에서 행 42px, 마지막 행 아래끝 475 (캔버스 480 안).

**천장을 정직하게 다시 적는다.** 새 값으로 `n*40 + (n-1)*8 ≤ 344` 를 풀면 **7이 상한**이다.
8번째 게임은 스크롤 없이 못 들어간다 — `ponytail:` 주석을 근거 있는 수치로 고친다.

## What we are not shipping

- **메뉴 스크롤.** 8번째 게임이 실제로 생길 때 별도 작업으로 한다. 지금 7종이다.
- 폰트 크기 축소. 설명이 F.xs(12)라 더 줄이면 시연 화면에서 안 읽힌다.
- 설명을 행에서 빼는 것(hover 시에만 표시 등). 목록에서 게임을 고르려면 설명이 필요하다.
- 취소된 게임("사라지는 선") 제거 — 별개 판단이고 사용자 지시 대기 중이다.

## Facts

- `layout(n)` 은 그리기와 **히트박스가 같이** 쓴다. 갈라지면 눌리는 곳과 보이는 곳이 어긋난다.
- 제목 baseline 90 (F.huge 34) → band 62.8~96.8. 힌트 baseline 118 (F.sm 14) → band 107.2~120.4.
  따라서 `LIST_TOP` 132 는 힌트 아래 11.6px 여유가 있다.
- 테두리는 `lineWidth 2` 로 사각형 경계 위에 그려져 안팎으로 1px 씩 걸친다.
- `kits/layout` 의 `textBand(baseline, size)` 는 위 0.8배·아래 0.2배 근사다.
  근사라는 사실은 그대로이고 이 작업이 그것을 바꾸지 않는다.
- 하위 메뉴(리듬 모드 선택)가 같은 씬을 n=2 로 재사용한다.

## Decisions

- **비율을 버리고 스택으로 간다.** 비율은 행 높이가 변할 때 폰트 크기와 무관하게
  움직여서, 어느 높이에서 깨지는지가 계산으로만 보이고 눈으로는 안 보인다.
- **덩어리를 세로 중앙에 놓는다.** 위에서부터 쌓으면 행이 클 때(n=2, h=70) 글자가
  위로 쏠려 빈 아래가 크게 남는다.
- **번호는 middle baseline.** 비율(0.62)로 잡던 것을 없앤다 — 계산이 하나 줄어든다.
- **하한을 40으로 올리고 밴드·간격으로 자리를 만든다.** 폰트를 줄이는 대신 공간을 넓혔다.
  판독성이 이 저장소의 최우선이다(DESIGN.md Purpose).
- **검사를 `checkStack` 으로 바꾼다.** 손으로 고른 여유값(`+4`)이 아니라 실제 band 로.

## Assumptions

- `LINE_GAP` 3px 이 이름과 설명 사이로 적절하다고 가정했다. 눈으로 확인 안 했다.
- 밴드를 위아래로 6px 씩 넓혀도 제목·힌트와 안 부딪힌다고 **계산으로** 확인했다.
  화면으로는 확인 안 했다.

## Relevant context

- `src/scenes/menu.ts` · `src/menu.test.ts`
- `src/kits/layout.ts` — `textBand`·`checkStack`. 이 작업이 메뉴에 처음 적용한다
- `records/TASK-008.json` — 행 높이를 유도식으로 바꾼 작업. 하한 34 가 여기서 나왔다
- `records/TASK-010.json` ~ `TASK-013.json` — 같은 종류(baseline 을 band 로 안 본 것) 네 건
- `DESIGN.md` — 판독성 최우선

## Allowed scope

- 수정: `src/scenes/menu.ts`, `src/menu.test.ts`, `docs/DECISIONS.md`
- 신규: 없음

## Forbidden scope

- 게임 씬·시스템 7종
- `src/kits/layout.ts` — 근사값(0.8/0.2)을 이 작업에서 바꾸지 않는다
- `src/ui/tokens.ts` — 폰트 단계를 새로 만들지 않는다
- 메뉴 스크롤 구현

## Acceptance criteria

- [x] n=1~7 에서 **이름과 설명 band 가 안 겹친다** (`checkStack` 으로 검사).
- [x] n=1~7 에서 이름·설명 band 가 **행 안에** 든다.
- [x] n=1~7 에서 마지막 행 아래끝이 캔버스(480) 안이고 첫 행이 힌트를 안 덮는다.
- [x] 행 높이 하한이 두 줄 스택이 들어가는 값(40)으로 근거를 갖는다.
- [x] 항목이 적으면(n=2) 여전히 세로 중앙에 모인다.
- [x] 그리기와 히트박스가 같은 `layout()` 을 계속 쓴다.
- [x] 천장(7)이 새 수치로 재계산돼 주석에 적힌다. **n=8 은 안 들어간다는 것도 테스트한다.**
- [x] `npm test` 통과 / `npm run build` / `bass design check` / `bass nan protect verify`

## Human judgment

- **화면에서 실제로 안 겹치는가.** 산술은 근사(0.8/0.2)라서 사람이 봐야 끝난다.
- 이름과 설명 사이 3px 이 답답하지 않은가.
- 행이 42px 로 낮아진 목록이 여전히 시연 화면에서 읽히는가.
- 7종이 화면을 꽉 채운 것이 답답한가 — 스크롤을 앞당길 이유가 되는가.

## Verification

- `npm test` — 겹침 없음(n=1~7)·행 안 포함·캔버스 안·중앙 정렬·하한·천장(n=8 불가)
- `npm run build` (tsc + vite)
- `bass design check` / `bass nan protect verify` / `bass nan trace validate`
- 사람: 배포본 또는 dev 에서 눈으로 확인 (자동 검증 불가 — 이 작업의 핵심)

## Rollback

`src/scenes/menu.ts` 의 `LIST_TOP`·`LIST_BOT`·`ROW_MIN`·`GAP` 을 140·470·34·12 로 되돌리고,
`rowText()` 를 지운 뒤 그리기를 `h*0.62`·`h*0.45`·`h*0.78` 비율로 환원한다.
`src/menu.test.ts` 의 신규 검사를 제거하고 이전 `h*0.78 + 4` 검사를 되살린다.
DECISIONS 해당 행을 지운다. 게임 파일을 안 건드리므로 되돌려도 영향이 없다.
