---
id: TASK-010
title: 겹치는 글자 고치기 — baseline 위로 뻗는 높이를 안 뺐다
status: HUMAN_REVIEW

type: fix
profile: nan2026

risk:
  level: low
  reasons:
    - 좌표와 그리는 조건만 바꾼다. 규칙·판정은 안 건드린다
    - 다만 세로가 빡빡해서 하나를 옮기면 다른 것과 부딪힌다

human:
  owner: user
  reviewer_required: true
---

## Problem

사용자 지적: "UI 컨셉은 좋은데 글자가 겹쳐서 못 읽겠다거나 하는 부분들이 존재해."

좌표를 뽑아 세로 구간을 계산해 보니 **실재하는 겹침이 셋** 있다(나머지는 if/else 라 오탐).

| 곳 | 증상 |
|---|---|
| 제로섬 | 미리보기 요약(baseline 466, F18 → 위쪽 451.6)이 **격자 하단 456 위로 4.4px 올라탄다** |
| 제로섬 | 깎인 이유 줄(baseline 478, F12 → 아래쪽 480.4)이 **캔버스 480 밖으로 잘린다** |
| 떠넘기기 | 차례 줄(baseline 92, F22 → 위쪽 74.4)이 **규칙 배너(56~82)를 7.6px 파고든다** |

그리고 떠넘기기에서 **터짐 문구와 넘기기 거절 문구가 동시에 뜰 수 있다**(터진 직후 넘기기를
시도하면 둘 다 활성) — 341~377 구간에서 겹친다.

원인이 매번 같다. **글자를 baseline 으로 놓고 위로 뻗는 높이를 안 뺐다.**
캔버스 `fillText` 의 y 는 글자 아래쪽 기준선이라 실제 글자는 `y − 0.8×크기` 부터 시작한다.
이 세션에서 세 번 이상 같은 실수를 했고 전부 "계산으로 배치하고 화면은 안 봤다"로
기록에 남아 있다.

## What we are shipping

**1. 제로섬** — 미리보기 요약 두 줄을 **한 줄로 합친다.**
   `9칸을 뺏는다 · 최대 25칸 · 판 밖 −9 · 내 칸 −7` (F14, baseline 472).
   격자 하단 456 아래로 완전히 내려가고 캔버스 안에 들어온다.

**2. 떠넘기기** — 세로를 다시 쌓는다.
   - 규칙 배너 `y 56, h 26` → `y 54, h 22` (54~76)
   - 차례 줄 baseline `92` → `96` (78.4~100.8)
   - 주사위 `DIE.y 138` → `146` (112~180)

**3. 떠넘기기** — 넘기기 거절 문구를 **터짐 문구가 떠 있을 때는 안 그린다.**
   좌표를 옮기는 대신 조건 하나를 더한다 — 세로가 이미 빡빡하다.

**4. 재발 방지** — `src/kits/layout.ts` 에 `textBand(baseline, size)` 하나.
   글자가 실제로 차지하는 세로 구간을 돌려준다. 겹침 판정을 한 곳에 모으고,
   이번에 고친 두 화면의 세로 스택을 테스트로 못 박는다.

## What we are not shipping

- 씬 전체의 좌표를 상수 테이블로 빼는 리팩터. 지금 깨진 곳만 고친다.
- 취소된 모방 게임의 배치(빌드에는 있지만 판정 대상이 아니다).
- 폰트·색·문구 변경.

## Facts

- 캔버스 `fillText(text, x, y)` 의 `y` 는 baseline 이다. 글자는 대략
  `y − 0.8×size` ~ `y + 0.2×size` 를 차지한다(한글·라틴 혼합 기준 근사).
- 제로섬 격자는 `BOARD.y 136 + 10×32 = 456` 에서 끝난다. 그 아래 캔버스까지 24px 뿐이다.
- 떠넘기기는 제목(32)·점수판(26·44)·배너(56~82)·차례(92)·주사위(138±34)가
  180px 안에 쌓여 있다. 하나를 옮기면 다른 것과 부딪힌다.
- 좌표 추출로 찾은 나머지 "겹침"은 전부 `if/else` 분기이거나 `textAlign` 이 좌/우로
  갈린 것이라 실제로는 안 겹친다.

## Decisions

- **제로섬은 두 줄을 한 줄로 합친다.** 격자 아래 여유가 24px 뿐이라 두 줄이 물리적으로
  안 들어간다. 격자를 위로 올리면 판세 막대와 부딪힌다.
- **떠넘기기는 배너를 얇게 하고 전체를 다시 쌓는다.** 배너를 옮기면 점수판과 겹치고,
  차례 줄만 내리면 주사위와 겹친다 — 셋을 같이 움직여야 한다.
- **거절 문구는 조건으로 막는다.** 자리를 새로 찾는 것보다 싸고, 터진 순간에
  넘기기 거절이 같이 뜰 이유도 없다.
- **`textBand` 를 kits 에 둔다.** `rng` 와 같은 자리다 — 여러 씬이 쓰는 계산이고
  씬마다 `0.8` 을 다시 적으면 또 틀린다.

## Assumptions

- 글자 세로 비율 `0.8 / 0.2` 가 이 폰트에서 실측과 크게 다르지 않다고 가정했다.
  브라우저 `measureText` 로 재지 않았다.

## Relevant context

- `src/scenes/zerosum.ts` — 미리보기 요약(L241~250), `BOARD`
- `src/scenes/pushluck.ts` — 배너(L194~200), 차례 줄(L208), `DIE`, 거절 문구(L340), 터짐 문구(L350~354)
- `src/kits/rng.ts` — kits 의 선례
- `records/` — "세로 배치를 계산으로만 맞췄다" 가 반복해서 적혀 있다

## Allowed scope

- `src/scenes/zerosum.ts`, `src/scenes/pushluck.ts`
- 신규 `src/kits/layout.ts`, `src/layout.test.ts`
- `docs/DECISIONS.md`, `nan/trace.yaml`

## Forbidden scope

- 게임 규칙·판정·밸런스
- `src/core/harness.ts`, `src/ui/tokens.ts`, 다른 씬

## Acceptance criteria

- [x] 제로섬 미리보기 요약이 격자(하단 456) 아래에 있고 캔버스(480) 안에 들어온다.
- [x] 제로섬 요약이 한 줄이고 깎인 이유를 그대로 담는다.
- [x] 떠넘기기 배너·차례 줄·주사위가 서로 안 겹친다.
- [x] 떠넘기기 거절 문구가 터짐 문구와 동시에 안 뜬다.
- [x] `kits/layout.ts` 가 `textBand(baseline, size)` 를 내보낸다.
- [x] 두 화면의 세로 스택이 테스트로 검증된다 — 겹침 0, 캔버스 밖 0.
- [x] `npm test` / `npm run build` / `bass design check` / `bass nan protect verify` 통과.
- [x] 씬에 색·폰트 리터럴 0건 유지.

## Human judgment

- 실제로 겹침이 사라졌는지 (계산이 아니라 눈으로).
- 제로섬 요약 한 줄이 길어서 잘리지 않는지.
- 떠넘기기가 다시 쌓인 뒤 답답하지 않은지.
- 좌표 추출로 못 잡은 **가로 겹침**이 있는지 — 이번 검사는 세로만 봤다.

## Verification

- `npm test` — 신규 `layout.test.ts` + 전체
- `npm run build` (tsc + vite)
- `bass design check` / `bass nan protect verify` / `bass nan trace validate`
- 좌표 재추출 — 고친 두 화면에서 겹침 경고가 사라지는지
- 사람: 실제로 보고 읽히는지 (자동 검증 불가 — 이 작업의 핵심)

## Rollback

`src/kits/layout.ts` 와 `src/layout.test.ts` 를 삭제한다.
`src/scenes/zerosum.ts` 의 요약을 두 줄(baseline 466 F18 + 478 F12)로 되돌린다.
`src/scenes/pushluck.ts` 의 배너를 `y 56, h 26`, 차례 줄 baseline 을 `92`,
`DIE.y` 를 `138` 로 되돌리고 거절 문구의 `!this.boom` 조건을 뺀다.
문서는 DECISIONS 해당 행과 trace 항목을 제거한다.
되돌리면 겹침 셋이 복원된다.
git 이 없는 저장소라 파일별 수동 환원이다.
