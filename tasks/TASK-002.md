---
id: TASK-002
title: 연타 판정 표시 분리 · 개인 적중률 도입 · 디자인 토큰화
status: DONE

type: feature
profile: nan2026

risk:
  level: medium
  reasons:
    - 판정 엔진의 점수·승패 기준을 바꾼다
    - 씬 3개의 색·폰트를 일괄 치환한다
    - 사후 기록이라 pre-task 게이트가 구현을 막지 못했다

human:
  owner: user
  reviewer_required: true
---

## Problem

**이 명세는 사후 기록이다.** 아래 세 건은 플레이테스트 중 발견돼 그 자리에서 고쳐졌고,
`bass gate pre-task` 를 통과한 뒤 구현된 것이 아니다. 순서를 지킨 척하지 않는다.

1. 연타(mash) 노트에서 "홀드를 유지해주세요"가 떴다. 엔진이 연타 진행 중에도
   `result: "hold"` 를 돌려주고 씬이 그걸 홀드 문구로 찍었다. 연타 노트는 `hold` 필드를
   창 길이로 재사용하므로 result 까지 공유하면 UI가 구분할 수 없다.
2. 개인 점수 비교가 무의미했다. 변칙 차트는 담당을 `Math.floor(rnd()*players)` 로 뽑아
   P1/P2 노트 수가 다르고(32비트에서 ±3 흔함), 연타(×2.2~2.6)·홀드(×holdBeats) 보너스가
   누구에게 가는지도 랜덤이다. 점수 비교는 실력이 아니라 차트 운을 쟀다.
3. 디자인 규칙이 어디에도 정의돼 있지 않았다. `bass design check` 는 `[FAIL]
   design-md-exists`, 코드에는 배경 4종·보조텍스트 7종·성공 3종·실패 3종·폰트 17단계가
   혼재했다.

## What we are shipping

- `Result` 에 `"mash"` 추가, 연타 진행 중 판정을 `hold` 와 분리. 씬 판정 텍스트 "연타!".
- 개인 적중률 `pacc/pjudged`(perfect 1 / good 0.6 / miss 0)와 `paccuracy(i)`.
  `winner()` 를 점수 → 적중률 기준으로 교체. HUD·인게임·종료 화면에 모수 병기.
- 동시류를 개인 집계에 포함하고, 팀이 깨지면 `tally(k, ok, did)` 의 `did` 로
  귀책자만 실패 처리 (동시 탭 = `syncPressed`, 협동 홀드 조기 뗌 = 먼저 뗀 `player`).
- `DESIGN.md`(의도·원칙 6개·색 역할표·타이포 위계·상태·Voice·접근성·Do/Do not),
  `src/ui/tokens.ts`(`C`·`F`·`font()`), 씬 3개 + `index.html` 리터럴 치환.
- `bass.yaml` 에 `web` 프로파일 추가 → `DESIGN.md` 필수 · design critic · 상태 체크리스트.

## What we are not shipping

- 연타 난이도 재조정 없음. 07-27 완화(3~4회/1.6박) 이후 사용자 플레이테스트가 아직
  끝나지 않았다. 표시만 고쳤고 판정 수치는 그대로다.
- 차트 담당 균등 배분 안 함. 적중률로 비교하면 불균등이 불공정하지는 않다.
  다만 한쪽이 4노트만 받으면 표본이 작다 — 별도 판단 필요.
- 팀전 종료 화면에 개인 적중률 미노출. 협동 게임에서 개인 책임을 어디까지 드러낼지는
  취향 문제라 건드리지 않았다.
- P3 색 변경 안 함. `C.player[2]` 가 `C.success` 와 같은 초록이라 DESIGN.md 원칙 1과
  충돌하지만, 3인 확장 전에는 드러나지 않는다.

## Facts

- 변칙 차트 담당 배정: `src/systems/rhythm.ts` `buildChart()` — `owner = Math.floor(rnd() * players)`.
- 씬은 항상 seed 를 넣는다(`optsForStage`: `Math.floor(Math.random() * 1e9)`) → 균일 차트는
  테스트에서만 쓰인다.
- 조사된 색 리터럴 35종, 폰트 크기 17단계(11~44px). P1 `#5aa0ff`·P2 `#ff9a4a` 만 두 씬에서 일치.
- `profiles/web.yaml` 이 `design_profile: true` 와 design critic 을 정의한다. `common` 은 off.
- 폰트 스케일 밖 값(13/15/17/19/20/24/30/40)은 가장 가까운 단계로 올렸다 → 캔버스 텍스트가
  1~4px 이동한다. 대부분 중앙 정렬.
- 테스트 37 → 41개.

## Decisions

- 연타/홀드는 `Result` 값을 나눈다. 씬에서 `mashOf(beat)>0` 로 분기하는 방법도 있었지만,
  타입을 늘리면 `Record<Result, string>` 이 컴파일로 누락을 잡는다.
- 팀이 깨진 경로에서 자기 몫을 한 사람에게는 타이밍 등급과 무관하게 1을 준다.
  이 경로는 정밀도가 아니라 책임 소재를 재기 때문이다.
- `paccuracy` 는 담당이 0건이면 0을 준다. 100 을 주면 노트를 안 받은 쪽이 이긴다.
- `index.html` 은 CSS라 토큰을 import 할 수 없어 값을 복제하고 출처를 주석으로 달았다.

## Assumptions

없음.

## Relevant context

- `src/systems/rhythm.ts` — `Result`, `tally`, `applyHit`, `missAt`, `paccuracy`, `winner`
- `src/scenes/rhythm.ts` · `menu.ts` · `power.ts` — 토큰 참조로 치환
- `src/ui/tokens.ts` · `DESIGN.md` — 신규
- `bass.yaml` — profiles
- `docs/GAME_SPEC.md` 리듬 절 · `docs/DECISIONS.md`

## Allowed scope

- `src/systems/rhythm.ts`, `src/scenes/*.ts`, `src/ui/tokens.ts`, `src/rhythm.test.ts`
- `DESIGN.md`, `index.html`, `bass.yaml`
- `docs/GAME_SPEC.md`, `docs/DECISIONS.md`

## Forbidden scope

- `AGENTS.md`, `CLAUDE.md`, `nan/gates.yaml`, `nan/acceptance.yaml` (protection baseline)
- `nan/concepts/CON-001.yaml` (TASK-001 에서 승인 완료)
- `src/systems/powergrid.ts`, `src/core/harness.ts` — 이번 변경과 무관

## Acceptance criteria

1. 연타 노트 진행 중 화면에 "연타!"가 뜬다. "홀드 유지!"는 홀드에서만 뜬다.
2. `winner()` 가 점수가 아닌 적중률로 승자를 가린다.
3. 동시 탭·협동 홀드가 깨졌을 때 귀책자만 적중률이 하락한다.
4. `npx --no-install bass design check` 3개 항목 PASS.
5. 씬 코드에 색 hex·폰트 크기 리터럴이 남아 있지 않다.
6. `npm test` 41개, `npm run build` 통과.
7. `bass nan protect verify` 전부 pass.

## Human judgment

- 폰트 스케일 적용으로 화면이 1~4px 움직인다. 실제로 보고 괜찮은지는 사람이 판단해야 한다.
- 팀이 깨졌을 때 자기 몫을 한 사람에게 1을 주는 규칙(정밀도 무시)이 맞는지.
- 연타 난이도 자체는 아직 미검증 — 플레이테스트 필요.

## Verification

```bash
npx --no-install bass design check
npx --no-install bass nan protect verify
npm test
npm run build
grep -rE '#[0-9a-fA-F]{3,6}|[0-9]+px sans-serif' src/scenes/   # 결과 없어야 함
```

## Rollback

파일 단위로 되돌린다. `src/ui/tokens.ts` 와 `DESIGN.md` 는 삭제, `bass.yaml` 의 `web`
프로파일 한 줄 제거, 씬 3개와 `index.html` 은 리터럴로 환원. 엔진은 `Result` 의 `"mash"`
제거와 `tally`/`paccuracy` 제거 후 `winner()` 를 `pscore` 비교로 되돌린다.
`git` 이 없는 저장소라 파일별 수동 환원이다.
