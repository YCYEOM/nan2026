---
id: TASK-001
title: CON-001을 현재 리듬 릴레이 게임 내용으로 채운다
status: DONE

type: feature
profile: nan2026

risk:
  level: medium
  reasons:
    - nan/concepts 는 trace·gates·submission 이 모두 참조하는 상류 문서다
    - nan2026.yaml 이 concept 에 사람 승인을 요구한다

human:
  owner: user
  reviewer_required: true
---

## Problem

BASS nan2026 preset 을 설치했지만 `nan/concepts/CON-001.yaml` 이 `bass init` 이
넣어준 플레이스홀더 그대로다. 6축이 "connect / cascading response" 같은 예시 값이고,
7개 하드게이트가 전부 `false`, 점수는 전부 0이다. `nan/trace.yaml` 은 THEME-001 →
CON-001 → … → EVD-001 로 연결되어 있으므로, CON-001 이 허구인 동안에는 trace 도
`bass nan evidence report` 도 실제와 무관한 값을 낸다.

정작 저장소에는 이미 동작하는 리허설4 "리듬(협동 릴레이)" 구현이 있다
(`src/systems/rhythm.ts`, `src/scenes/rhythm.ts`, 37개 테스트 통과).

## What we are shipping

- `nan/concepts/CON-001.yaml` 을 리허설4 리듬 릴레이의 실제 내용으로 교체:
  6축, `representativeScene`, `newCoreSystems`, 7개 하드게이트 판정(근거 있는 것만 true),
  5개 항목 점수.
- `bass nan concept gate CON-001` 통과.
- 사람 승인(`approvedBy`)은 사용자가 직접 지정 — 내가 임의로 채우지 않는다.

## What we are not shipping

- 게임 코드 변경 없음. `src/` 는 건드리지 않는다.
- 본선 주제용 신규 컨셉 발굴 없음. CON-001 은 어디까지나 **리허설** 컨셉이고,
  본선 주제가 나오면 CON-002 로 새로 만든다.
- `nan/trace.yaml` 의 THEME/DEC/REQ/SCN/TEST/EVD 항목 채우기는 이 작업 범위 밖(후속 작업).
- `docs/GAME_SPEC.md` 재작성 없음. CON-001 이 GAME_SPEC 을 참조하는 방향이다.

## Facts

- `docs/GAME_SPEC.md` 리허설4 절: 한 줄 규칙 = 공통 박자에 맞춰 한 명씩 돌아가며
  자기 차례 비트를 정확히 눌러 팀 콤보를 잇는다. 조작 P1 `F` / P2 `J`.
- 승리 = 전 비트(32) 완주 시 생명>0, 실패 = 팀 생명(4) 소진.
- 6축 기록값: Lane / Timing Input / Oscillate / Time+SharedConsequence /
  Synchronization+턴 릴레이 / ChainReaction.
- 신규 코어 시스템은 `RhythmEngine` 1개. Grid·DragDrop·Harness 는 재사용.
- 테스트: `npm test` 37개 통과 (`src/rhythm.test.ts` 15개 포함).
- `nan2026.yaml` → `humanApprovalRequired: [concept, runtime]`.
- `bass route TASK-001 --role worker` → `balanced`, `approvalsRequired: []`.
- `bass nan concept gate` (bass-platform `src/nan/cli.ts:163`) 통과 조건:
  하드게이트 7개 전부 true + `approvedBy` 비어있지 않음 + 점수합 ≤ 100.
- 리허설4가 현재 저장소의 대표 컨셉이다 — 사용자 확인 (2026-07-29).
  리허설1·2는 GAME_SPEC 에 "제거됨"으로 표시, 리허설3(전력망)은 별도 씬으로 남아 있음.
- 본선 주제는 아직 공개되지 않았다 — 사용자 확인 (2026-07-29).
- 승인자: `yeomyooncheol` — 사용자가 본인으로 지정 (2026-07-29).

## Decisions

- CON-001 을 새로 만들지 않고 **덮어쓴다**. 플레이스홀더는 보존 가치가 없다.
- 하드게이트는 코드·테스트로 뒷받침되는 항목만 `true` 로 둔다. 근거 없는 항목이
  하나라도 있으면 게이트를 억지로 통과시키지 않고 `false` 로 남긴다.
- `shippable-evidence` 는 원문 게이트7("대량의 수작업 콘텐츠가 필요한가")에 대응한다.
  리듬 릴레이는 차트를 절차 생성하고 에셋이 없으므로(Web Audio 신스 + 도형 렌더) true.
- 점수는 리허설 자체 평가이며 대회 채점이 아니다. 원문 8항목 100점 배점을
  CON 스키마의 5개 필드로 압축한다.

## Assumptions

없음. 2026-07-29 사용자 확인으로 두 가정을 Facts 로 옮겼다.

## Relevant context

- `nan/concepts/CON-001.yaml` — 대상 파일
- `docs/GAME_SPEC.md` 157행 이후 — 리허설4 리듬 명세
- `docs/DECISIONS.md` — 홀드/합주/스테이지/매시 판단 기록
- `src/systems/rhythm.ts` — RhythmEngine (판정·차트·정확도)
- `nan/gates.yaml` — 7개 하드게이트 정의
- `nan/AGENT_WORKFLOW.md` 2번 — concept 확정에 사람 승인 필요

## Allowed scope

- `nan/concepts/CON-001.yaml`
- `tasks/TASK-001.md`, `records/TASK-001-*.md` (작업 산출물)

## Forbidden scope

- `src/**`, `docs/GAME_SPEC.md`, `docs/DECISIONS.md`
- `AGENTS.md`, `CLAUDE.md`, `nan/gates.yaml`, `nan/acceptance.yaml`
  (session protection baseline 으로 잠김)
- `nan/trace.yaml`

## Acceptance criteria

1. `nan/concepts/CON-001.yaml` 의 모든 필드가 플레이스홀더 문구를 포함하지 않는다.
2. 6축 값이 `docs/GAME_SPEC.md` 리허설4 표와 일치한다.
3. `true` 로 표시한 하드게이트마다 GAME_SPEC 또는 테스트에 근거가 있다.
4. `npx --no-install bass nan concept gate CON-001` 이 PASS 하거나,
   FAIL 이면 남은 원인이 오직 미승인(`approvedBy`)임이 출력으로 확인된다.
5. `npm test` 37개, `npm run build` 그대로 통과 (코드 무변경 확인).
6. `npx --no-install bass nan protect verify` 전부 pass.

## Human judgment

- `approvedBy` 에 들어갈 최종 승인자 이름은 사용자가 정한다. 내가 채우지 않는다.
- 점수 5개 항목의 값은 자기평가라 사용자가 조정할 수 있다.

## Verification

```bash
npx --no-install bass nan concept gate CON-001
npx --no-install bass nan protect verify
npm test
npm run build
```

## Rollback

`nan/concepts/CON-001.yaml` 한 파일만 바뀐다. 되돌리려면 해당 파일을 지운 뒤
`npx --no-install bass init --preset nan2026` 을 다시 실행하면 플레이스홀더가
재생성된다 (다른 파일은 conflict preserved 로 보존됨).
