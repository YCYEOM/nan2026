---
id: TASK-009
title: 시드 난수를 kits/rng 로 뽑고 5개 복사본을 전부 고친다
status: HUMAN_REVIEW

type: fix
profile: nan2026

risk:
  level: high
  reasons:
    - 게임 5종의 난수를 동시에 바꾼다. 시드 수열이 전부 달라져 기존 테스트가 깨질 수 있다
    - 깨진 테스트가 "수열이 달라져서"인지 "동작이 달라져서"인지 하나씩 구분해야 한다
    - 판정·규칙은 안 건드리지만 판정에 들어가는 값의 출처를 바꾸는 일이다

human:
  owner: user
  reviewer_required: true
---

## Problem

같은 LCG 가 **5개 파일에 복사**돼 있다(`rhythm`·`mimicry`·`powergrid`·`pushluck`·`zerosum`).
지금까지 네 번 "뽑을 때가 됐다"고 기록만 하고 안 뽑았는데, 그 사이 **결함이 두 개
드러났고 둘 다 복사본 수만큼 존재한다.**

**1. 이웃 시드끼리 첫 출력이 거의 같다.** 제로섬 배치 추첨 테스트가 잡았다 —
시드 1~40 이 전부 같은 배치를 줬다. `1013904223 + seed*1664525` 를 2^32 로 나누면
0.236~0.252 라 5로 곱해도 항상 1이다. ZRO-003 에서 제로섬만 워밍업 16회로 완화했고
나머지 넷은 그대로다.

**2. `0xffffffff` 로 나누면 정확히 1.0 이 나올 수 있다.** `rhythm`·`mimicry`·`powergrid`
셋이 그렇다. 그러면 `Math.floor(rnd() * n)` 이 `n` 을 돌려준다:

| 자리 | 1.0 일 때 |
|---|---|
| `rhythm` `gaps[Math.floor(rnd()*5)]` | `undefined` → 비트 시각이 전부 `NaN` |
| `rhythm` `Math.floor(rnd()*players)` | `owner = players` → 배열 범위 밖 |
| `mimicry` Fisher-Yates `idx[j]` | `j = i+1` → `undefined` 좌표 |

확률은 호출당 2^-32 라 실제로 본 적은 없지만 실재하는 결함이다.

## What we are shipping

- **신규 `src/kits/rng.ts`** — `rng(seed)` 하나. **splitmix32** 를 쓴다:
  이웃 시드가 즉시 갈라지므로 워밍업이 필요 없고, `2^32` 로 나누므로 `[0, 1)` 이 보장된다.
- **5개 게임이 전부 이걸 쓴다.** 각 파일의 인라인 LCG 를 지운다.
- 제로섬의 워밍업 16회와 그 `ponytail:` 주석을 지운다 — 완화가 필요 없어진다.
- `kits/rng` 테스트: 범위 `[0,1)` · 결정성 · **이웃 시드 분산** · 1.0 미출력.

## What we are not shipping

- 게임 규칙·판정·밸런스 변경.
- `kits/dragdrop`·`kits/grid` 정리(별개 판단).
- 시드를 실제로 쓰게 만드는 일(게임들이 `Math.random()` 시드를 쓰는 것은 그대로).

## Facts

- 5개 복사본의 나눗셈 상수가 갈린다 — `pushluck`·`zerosum` 은 `0x100000000`,
  `rhythm`·`mimicry`·`powergrid` 는 `0xffffffff`. 같은 코드인 줄 알았는데 아니었다.
- `powergrid` 는 클래스 필드(`rngState`)와 메서드(`rand()`)로 들고 있어 형태가 다르다.
- `rhythm`·`mimicry` 는 함수 안 지역 변수라 교체가 한 줄이다.
- **난수를 바꾸면 모든 시드 수열이 달라진다.** 시드에 의존하는 기존 테스트가 깨질 수 있고,
  그게 이 작업의 실제 비용이다.

## Decisions

- **splitmix32 를 쓴다.** LCG + 워밍업은 완화지 해결이 아니다 — 8회면 `0,2,0,2` 주기가
  남고 시드 섞기만 하면 주기 5가 생겼다. splitmix32 는 이웃 시드가 즉시 갈라져
  워밍업 상수를 눈으로 고를 필요가 없다.
- **`2^32` 로 나눈다.** `[0, 1)` 이 보장돼야 `Math.floor(rnd()*n) < n` 이 성립한다.
- **깨진 테스트를 고칠 때 원인을 구분해 기록한다.** 수열이 달라져서 깨진 것은 값을
  조정하고, 동작이 달라져서 깨진 것은 그 자체가 결함 발견이다.

## Assumptions

- 기존 테스트 대부분이 수열이 아니라 성질(범위·상대 비교·불변식)을 검사하므로
  깨지는 것이 소수일 것이라고 가정했다. 아니면 이 작업이 커진다.

## Relevant context

- `src/systems/{rhythm,mimicry,powergrid,pushluck,zerosum}.ts` — 복사본 5개
- `records/ZRO-003.json` — 초기 상관 버그와 워밍업 완화 기록
- `src/kits/` — `dragdrop`·`grid` 가 실사용자 없이 남아 있는 곳. 세 번째 키트가 된다

## Allowed scope

- 신규 `src/kits/rng.ts`, `src/rng.test.ts`
- `src/systems/{rhythm,mimicry,powergrid,pushluck,zerosum}.ts` — 난수 부분만
- 기존 테스트 파일 — 난수 변경으로 깨진 부분만
- `docs/DECISIONS.md`, `nan/trace.yaml`

## Forbidden scope

- 게임 규칙·판정·밸런스·화면
- `src/core/harness.ts`, `src/ui/tokens.ts`, 씬 파일 전부

## Acceptance criteria

- [x] `src/kits/rng.ts` 가 `rng(seed)` 하나를 내보낸다.
- [x] 게임 5종이 전부 `kits/rng` 를 쓰고 인라인 LCG 가 0개다.
- [x] 제로섬의 워밍업 루프와 `ponytail:` 주석이 사라진다.
- [x] 반환값이 항상 `[0, 1)` 이다 — 1.0 이 안 나온다.
- [x] 같은 시드는 같은 수열이다.
- [x] **이웃 시드(1~40)가 즉시 갈라진다** — 첫 출력만으로도 값이 흩어진다.
- [x] `npm test` 전부 통과. 깨진 테스트는 원인을 구분해 record 에 적는다.
- [x] `npm run build` / `bass design check` / `bass nan protect verify` / `trace validate` 통과.

## Human judgment

- 난수가 바뀌면서 게임 체감이 달라졌는지 (특히 리듬 차트와 전력망 이벤트).
- 깨진 테스트를 고친 방식이 타당한지 — 값 조정으로 덮은 것이 있는지.

## Verification

- `npm test` — 전체 + 신규 `rng.test.ts`
- `npm run build` (tsc + vite)
- `bass design check` / `bass nan protect verify` / `bass nan trace validate`
- grep — `1664525` 잔존 0건
- 검산 — 시드 1~40 첫 출력 분산

## Rollback

`src/kits/rng.ts` 와 `src/rng.test.ts` 를 삭제하고, 게임 5종에 각자의 인라인 LCG 를
되돌린다(나눗셈 상수도 원래대로: `pushluck`·`zerosum` 은 `0x100000000`,
`rhythm`·`mimicry`·`powergrid` 는 `0xffffffff`). 제로섬에 워밍업 16회 루프와 주석을
되살린다. 난수 변경으로 고친 테스트를 원래 값으로 되돌린다.
문서는 DECISIONS 해당 행과 trace 항목을 제거한다.
git 이 없는 저장소라 파일별 수동 환원이다.
