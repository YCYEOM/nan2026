---
id: TASK-003
title: nan/trace.yaml 실체화 + evidence report 생성
status: DONE

type: feature
profile: nan2026

risk:
  level: low
  reasons:
    - 코드 변경 없음. 추적 문서와 생성물만 다룬다
    - trace 는 제출 심사에서 "판단을 통제했다"는 근거로 쓰인다

human:
  owner: user
  reviewer_required: true
---

## Problem

`nan/trace.yaml` 이 `bass init` 이 넣은 플레이스홀더 그대로다. THEME-001 → CON-001 →
DEC-001 → REQ-001 → SCN-001 → TEST-001 → EVD-001 로 한 줄만 이어져 있고, CON-001 을
빼면 나머지 6개는 가리키는 대상이 없는 빈 ID 다.

`bass nan trace validate` 는 **PASS 한다.** 중복·죽은 링크·고아만 검사하고 ID 가 실제
무언가를 가리키는지는 보지 않기 때문이다(`src/nan/domain/trace.ts`). 즉 지금의 PASS 는
아무것도 보장하지 않는다. TASK-001·TASK-002 가 연속으로 이 문제를 out_of_scope 로 남겼다.

`evidence/` 에는 07-29 플레이테스트 문서 1개가 있지만 `bass nan evidence report` 를
한 번도 돌리지 않아 `evidence/report.json` 이 없다.

## What we are shipping

- `nan/trace.yaml` 을 실제 대상을 가리키는 ID 로 교체. 각 ID 옆에 YAML 주석으로
  가리키는 파일·절·테스트 이름을 적는다.
- 주제 → 컨셉 → 결정 → 요구 → 시나리오 → 테스트 → 증거 사슬을 실제 관계대로 연결.
- `bass nan evidence report` 실행 → `evidence/report.json`.
- 리드인 담당 표시 수정(플레이테스트 발견분)을 사슬에 포함. 그 수정 자체는 이미
  반영돼 있고 어느 task 에도 속해 있지 않았다.

## What we are not shipping

- 코드 변경 없음. `src/` 는 건드리지 않는다.
- 전력망(리허설3) 은 trace 에 넣지 않는다. CON-001 이 리듬 컨셉이라 사슬이 갈라진다.
  본선에서 컨셉이 정해지면 그때 하나로 정리한다.
- `nan2026.yaml` 의 `runtime.selected: null` 은 그대로 둔다. 런타임 선택은 사람 승인
  대상이고 별도 판단이 필요하다.
- trace ID 를 자동 생성하거나 코드에서 추출하는 도구는 만들지 않는다.

## Facts

- `bass nan trace validate` 규칙(`src/nan/domain/trace.ts` `validateTrace`):
  중복 ID 금지 / 링크 양끝이 정의된 ID 여야 함 / 모든 ID 가 최소 1개 링크에 등장해야 함.
  내용 검증은 없다.
- `traceSchema`(`src/nan/project.ts:327`)는 zod 비-strict object 라 최상위 추가 키가
  허용되고, YAML 주석은 파싱에 영향이 없다.
- 사슬에 넣을 실물: CON-001(승인 88/100), `docs/DECISIONS.md` 07-27~07-29 항목,
  `docs/GAME_SPEC.md` 리허설4 절, `src/rhythm.test.ts` 19개,
  `evidence/playtest-2026-07-29-mash.md`.
- `.github/workflows/nan2026.yml` 이 CI 에서 `trace validate` 와 `protect verify` 를 돌린다.

## Decisions

- ID 는 번호가 아니라 의미로 짓는다(`DEC-MASH-EASE` 형태). `DEC-001` 은 무엇을 가리키는지
  파일을 열어야 알 수 있고, 그게 지금 문제의 원인이다.
- 대상 경로는 YAML 주석에 적는다. 스키마에 없는 키를 새로 만들면 BASS 가 바뀔 때 깨진다.
- 사슬은 실제 관계만 잇는다. 링크를 채우려고 없는 관계를 만들지 않는다.

## Assumptions

없음.

## Relevant context

- `nan/trace.yaml` — 대상 파일
- `docs/DECISIONS.md`, `docs/GAME_SPEC.md`, `src/rhythm.test.ts`
- `evidence/playtest-2026-07-29-mash.md`, `evidence/README.md`
- `nan/concepts/CON-001.yaml` — 승인된 컨셉(수정 금지)

## Allowed scope

- `nan/trace.yaml`
- `evidence/report.json` (`bass nan evidence report` 생성물)
- `tasks/TASK-003.md`, `records/TASK-003.json`

## Forbidden scope

- `src/**`, `DESIGN.md`, `index.html`, `bass.yaml`
- `AGENTS.md`, `CLAUDE.md`, `nan/gates.yaml`, `nan/acceptance.yaml` (protection baseline)
- `nan/concepts/CON-001.yaml` (TASK-001 에서 승인 완료)
- `nan2026.yaml`

## Acceptance criteria

1. `nan/trace.yaml` 에 `THEME-001`~`EVD-001` 형태의 플레이스홀더 ID 가 남아 있지 않다.
2. 모든 ID 옆에 가리키는 대상(파일 경로·절 제목·테스트 이름)이 주석으로 적혀 있고,
   그 대상이 실재한다.
3. `npx --no-install bass nan trace validate` PASS.
4. `npx --no-install bass nan evidence report` 가 `evidence/report.json` 을 만든다.
5. `npx --no-install bass nan protect verify` 전부 pass.
6. `npm test` 41개, `npm run build` 통과 (코드 무변경 확인).

## Human judgment

- 사슬에 넣을 결정·요구의 취사선택. 전부 넣으면 추적이 아니라 목록이 된다.
- 리허설3(전력망)을 trace 에서 뺀 판단이 맞는지.

## Verification

```bash
npx --no-install bass nan trace validate
npx --no-install bass nan evidence report
npx --no-install bass nan protect verify
npm test
npm run build
grep -nE 'THEME-001|DEC-001|REQ-001|SCN-001|TEST-001|EVD-001' nan/trace.yaml   # 결과 없어야 함
```

## Rollback

`nan/trace.yaml` 을 삭제하고 `npx --no-install bass init --preset nan2026` 을 다시 실행하면
플레이스홀더가 재생성된다(다른 파일은 conflict preserved). `evidence/report.json` 은
생성물이라 삭제하면 된다.
