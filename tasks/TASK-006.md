---
id: TASK-006
title: 반전 노트 — 남의 색 노트를 내가 눌러준다
status: DONE

type: feature
profile: nan2026

risk:
  level: low
  reasons:
    - 차트 생성에 필드 하나를 더한다. 판정·점수·적중률 경로는 건드리지 않는다
    - 색이 담당을 말한다는 DESIGN.md 원칙 1과 정면으로 부딪힌다 — 예외를 명시해야 한다

human:
  owner: user
  reviewer_required: true
---

## Problem

지금 게임에 "쇼츠각"이 되는 순간이 하나뿐이다. 협동 홀드가 깨질 때다. 나머지 시간은
릴레이라서 한 순간에 한 명만 움직이고, 둘 사이에 아무 일도 일어나지 않는다.
개인전은 더 심하다 — `buildChart` 가 solo 면 동시류를 아예 만들지 않아서
플레이어 간 상호작용이 0이다.

클립이 되는 조건은 셋이다. (1) 두 사람이 같은 순간에 서로를 의식한다,
(2) 실패의 원인이 숫자가 아니라 사람으로 특정된다, (3) 소리가 난다.
정확도 87.3% 는 아무도 못 읽지만 "네 걸 왜 안 눌러!" 는 읽힌다.

## What we are shipping

노트 일부를 **반전**시킨다. 화면에는 P1 색으로 오지만 눌러야 하는 사람은 P2다.
반사는 색을 따라가고 색이 거짓말을 하므로, 글로 알려줘도 손이 먼저 틀린다.

핵심은 **책임과 표시를 분리**하는 것이다.

- `Note.swap` 을 둔다. `swap` 이면 **표시 색만** 상대 색으로 바꾼다.
- `ownerOf(k)` 는 계속 "눌러야 하는 사람"을 뜻한다. 따라서 `press`·`release`·
  `tally`·`missAt`·`winner` 는 **한 줄도 바뀌지 않는다.** 적중률도 실제로 누른
  사람에게 정확히 붙는다. 표시를 바꿨을 뿐이라 판정 정합성이 공짜로 따라온다.
- 동시류(`owner === -1`)에는 반전을 걸지 않는다. 전원 담당이라 "상대"가 없다.
- 스테이지 2부터 등장한다(`stage >= 1`). 1스테이지는 규칙을 배우는 자리다.
- 개인전에도 나온다. 상호작용 0 문제에 첫 구멍을 낸다.

## What we are not shipping

- 네트워크·시점 분리. 반전은 단일 화면에서도 성립하므로 선행 조건이 아니다.
- 마우스 기믹. 각자 마우스·각자 화면이 전제라서 네트워크 다음이다.
- 협동 홀드 브레이크 시 범인 이름 표시. 별개로 가치가 크지만 이 작업과 무관하다.
- 보이다 안 보이는 노트. 플레이어만 힘들고 시청자는 난이도를 읽지 못한다.

## Facts

- `systems/rhythm.ts:206,215` 두 곳에서만 `player !== this.ownerOf(k)` 를 비교한다.
  담당 판정이 `ownerOf` 한 곳으로 모여 있어 표시만 바꾸면 로직이 따라올 필요가 없다.
- `release()` 는 `holdPlayer`(실제로 누른 사람)를 기준으로 하므로 반전과 무관하다.
- `buildChart` 의 `team = !this.solo` 때문에 개인전에는 `owner === -1` 노트가 없다.
  따라서 개인전에서는 모든 노트가 반전 대상이 될 수 있다.
- 판정선 색은 `scenes/rhythm.ts:200` 에서 `e.currentPlayer()` = `ownerOf` 로 정해진다.
  손대지 않으면 자동으로 "눌러야 하는 사람"의 색을 유지한다.

## Decisions

- **표시만 반전한다.** 책임을 반전시키는 쪽(표시는 그대로, 담당만 상대에게)도 가능하지만
  그러면 `tally`·`winner` 가 엉뚱한 사람에게 적중률을 붙인다. 표시 반전은 판정 경로를
  건드리지 않아 정합성이 공짜다.
- **색을 거짓말시키는 대신 다른 세 신호는 사실을 말한다.** 판정선은 담당 색으로 빛나고
  (화면에서 가장 큰 요소), 차례 안내가 반전을 문장으로 명시하고, 노트에 `🔀` 표식을
  붙인다. 반사는 여전히 속지만 판단 정보는 다 준다.
- **DESIGN.md 원칙 1의 예외로 명문화한다.** 원칙을 조용히 깨지 않는다.

## Assumptions

- 2인 기준이다. `swap` 대상은 `(owner + 1) % players` — 3인 이상에서 "상대"가
  하나로 정해지지 않는 문제는 지금 풀지 않는다.

## Relevant context

- `src/systems/rhythm.ts` — `Note`, `buildChart`, `ownerOf`, `press`
- `src/scenes/rhythm.ts` — `optsForStage`, 노트 렌더링(211~269행), 차례 표시(308~322행)
- `DESIGN.md` 원칙 1 — 색이 담당을 말한다
- `docs/GAME_SPEC.md` — 노트 종류 절
- `critiques/TASK-002/design-2.yaml` — `C.sigEnd === C.player[0]` note 가 색 의미
  중복을 이미 지적하고 있다. 반전이 색 의미를 하나 더 얹으므로 같은 함정을 본다.

## Allowed scope

- `src/systems/rhythm.ts` — `swap` 필드, `swapOf()`, `swapChance` 옵션
- `src/scenes/rhythm.ts` — 표시 색 결정, `🔀` 표식, 차례 안내 문장, `optsForStage`
- `src/rhythm.test.ts` — 신규 테스트
- `DESIGN.md`, `docs/GAME_SPEC.md`, `docs/DECISIONS.md`

## Forbidden scope

- `press`·`release`·`applyHit`·`missAt`·`tally`·`winner` 의 판정 로직
- `src/core/harness.ts`, `src/ui/tokens.ts`
- 네트워크·마우스 관련 신규 파일

## Acceptance criteria

- [ ] `swapChance` 로 반전 비율을 조절한다. 스테이지 1(index 0)은 0이다.
- [ ] `owner === -1` 노트는 절대 `swap` 이 되지 않는다.
- [ ] `swapChance: 1` 이어도 판정·적중률 경로가 기존과 동일하게 동작한다(회귀 없음).
- [ ] 반전 노트는 상대 색 + `🔀` 로 그려지고, 판정선은 담당 색을 유지한다.
- [ ] 차례 안내가 반전을 문장으로 알린다.
- [ ] 개인전에서도 반전이 나온다.
- [ ] `npm test` 통과, 신규 테스트로 위 두 제약(동시류 제외·회귀 없음)을 잡는다.
- [ ] `npm run build`, `bass design check`, `bass nan protect verify` 통과.

## Human judgment

- 색이 거짓말하는 게 "속았다"가 아니라 "부당하다"로 느껴지는지. 세 정직 신호로
  충분한지는 사람이 플레이해봐야 안다.
- 반전 비율. 너무 낮으면 안 나오고 너무 높으면 색 체계 자체가 무의미해진다.
- 반전이 실제로 소리를 나게 하는지 — 이 작업의 목적이 난이도가 아니라 쇼츠각이다.

## Verification

- `npm test` — 신규 테스트 2건(동시류 반전 제외, `swapChance: 1` 회귀 없음)
- `npm run build` (tsc + vite)
- `bass design check`
- `bass nan protect verify`
- grep — `src/scenes/` 에 색·폰트 리터럴 잔존 0건 유지

## Rollback

`systems/rhythm.ts` 에서 `swap`·`swapOf`·`swapChance` 를 제거하고,
`scenes/rhythm.ts` 의 표시 색 결정을 `COLORS[owner]` 로 환원한 뒤 `🔀` 표식과
차례 안내 분기를 지운다. `optsForStage` 의 `swapChance` 한 줄을 뺀다.
신규 테스트를 삭제한다. 문서는 해당 절만 제거한다.
git 이 없는 저장소라 파일별 수동 환원이다.
