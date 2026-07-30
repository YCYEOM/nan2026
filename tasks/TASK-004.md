---
id: TASK-004
title: 네온 시그니처 디자인 적용 + design critic finding 해소
status: DONE
type: feature
profile: nan2026

risk:
  level: medium
  reasons:
    - 색 체계를 전면 교체한다. 되돌리려면 토큰과 씬을 함께 돌려야 한다
    - 리듬 씬 렌더링을 전면 개편한다 — 판정 로직은 건드리지 않지만 화면은 전부 바뀐다
    - design critic 의 확인된 high/medium 4건을 함께 닫는다

human:
  owner: user
  reviewer_required: true
---

## Problem

디자인이 "구리다"는 사용자 판단이 있었고, 시그니처 컬러가 없다는 지적이 구체적이었다.
현재 팔레트는 리허설 중 코드에 박힌 값을 사후 정리한 것이라 정체성이 없다.
`#141821` 바탕에 파랑·주황·노랑·초록·빨강이 역할별로 흩어져 있을 뿐, 이 게임이
무엇인지 말하는 색이 없다.

사용자 확인 사항(2026-07-29):
- `bass-platform` 에 최신 트렌드 디자인 정의가 있는지 전수 확인 → **없다.**
  `templates/DESIGN.md`(빈 골격), `prompt-library/critics/design.md`(검토 체크리스트),
  `examples/fixture-web`(색 4개짜리 동작 검증 픽스처)뿐이다. BASS 는 "규칙을 어떻게
  강제하는가"의 기계이고 "무엇이 좋은 디자인인가"는 담고 있지 않다.
- 방향: 네온 핑크(#FF2E97) → 사이언(#00E5FF) 시그니처, 어두운 배경.
- 범위: 리듬 씬 집중. 메뉴·전력망은 토큰만 따라간다.

동시에 `critiques/TASK-002/design-1.yaml` 의 확인된 finding 8건이 열려 있고,
`bass critique stop` 이 high/medium 4건을 이유로 `stop: false` 를 낸다.

## What we are shipping

- `src/ui/tokens.ts` 전면 재설계: 네온 시그니처 팔레트 + `withAlpha()` 헬퍼 + `C.scrim`.
- `src/scenes/rhythm.ts` 렌더링 전면 개편: 네온 레인·글로우 판정선·노트·HUD·종료 화면.
  판정 로직(`src/systems/rhythm.ts`)은 건드리지 않는다.
- `DESIGN.md` 갱신: 시그니처 정의, 실측 대비값, 그라데이션 사용 범위 규칙.
- critic finding 해소 4건:
  1. (high) 메뉴 hover 테두리의 P1 색 → `C.accent`
  2. (medium) 팀 정확도에 모수 병기
  3. (medium) `rgb()/rgba()` 리터럴 7곳 → `withAlpha()` / `C.scrim`
  4. (medium) `C.player[2]` 와 `C.success` 색 충돌 → 플레이어 색을 2개로 축소
- `menu.ts`·`power.ts` 는 새 토큰을 따라가되 구성은 유지.

## What we are not shipping

- 판정 로직·점수·적중률 계산 변경 없음. `src/systems/rhythm.ts` 는 건드리지 않는다.
- 전력망·메뉴 씬의 화면 구성 개편 없음. 색만 새 토큰을 따라간다.
- 폰트 패밀리 변경 없음. `sans-serif` 유지 — 웹폰트를 넣으면 오프라인 시연에서 깨진다.
- P3·P4 색 신설 안 함. 지금 정하면 또 충돌한다. 확장 시점에 제약 조건을 보고 정한다.
- critic 의 low/note 4건(대비, power 미터 트랙, P1↔P4, focus·reduced-motion)은 이번에
  닫지 않는다. 별도 판단이 필요하고 이번 팔레트 교체로 일부는 자동 해소된다.

## Facts

- 실측 대비(WCAG 2.1, 새 `C.bg` #0A0612 기준):
  text 20.04 / textMuted #B9A8D4 9.18 / textFaint #7A6A96 4.13 / signature #FF2E97 5.81 /
  success #3DFF9E 15.27 / danger #FF5252 6.28 / demand #C77DFF 7.45 /
  P1 #00E5FF 13.03 / P2 #FFB300 11.17.
  기존 팔레트 대비 전반 상승(textMuted 7.35→9.18, P1 6.69→13.03).
- `warn`(#FF7A00)과 P2(#FFB300)의 상호대비가 1.46 으로 인접하다 → `warn` 토큰을 없애고
  `withAlpha(C.danger, …)` 로 대체한다. rgba 우회 문제와 함께 닫힌다.
- 시그니처 그라데이션의 끝(#00E5FF)이 P1 색과 같다 → 원칙 1 위반이 된다.
- `bass design check` 의 token-consistency 는 hex 만 본다. rgb()/rgba() 는 못 잡는다.
- 현재 `PLAYERS = 2`. `KEYS`·`KEY_LABEL` 은 4개 항목을 갖지만 인덱스 2·3 은 쓰이지 않는다.

## Decisions

- 시그니처 그라데이션은 **정보를 전달하지 않는 장식**(타이틀, 레인 테두리)에만 쓴다.
  판정선 글로우는 현재 담당 플레이어 색으로 칠한다. 그래야 원칙 1이 유지되고
  "지금 누구 차례인가"가 가장 큰 시각 요소에 실린다.
- 메뉴 hover 는 새 토큰을 만들지 않고 `C.accent`(주목 역할)를 쓴다. 값이 같은 토큰을
  둘로 늘리면 어느 쪽을 고쳐야 하는지 모호해진다.
- 플레이어 색 배열을 2개로 줄인다. 확장 시 늘리라는 주석과 제약 조건을 남긴다.
  `C.success` 와 충돌하는 P3 를 미리 정해두는 것보다 없는 편이 정직하다.
- 웹폰트를 쓰지 않는다. 시연 안정성이 룩보다 우선이다(GAME_SPEC 제출 전 잠금 체크).

## Assumptions

없음. 방향·범위·시그니처 색은 2026-07-29 사용자 확인.

## Relevant context

- `src/ui/tokens.ts`, `DESIGN.md` — 재설계 대상
- `src/scenes/rhythm.ts` — 전면 개편 대상
- `src/scenes/menu.ts`, `src/scenes/power.ts` — 토큰 반영만
- `critiques/TASK-002/design-1.yaml` — 닫을 finding 목록
- `src/systems/rhythm.ts` — 참조만. 수정 금지

## Allowed scope

- `src/ui/tokens.ts`, `src/scenes/rhythm.ts`, `src/scenes/menu.ts`, `src/scenes/power.ts`
- `DESIGN.md`, `index.html`
- `docs/GAME_SPEC.md`, `docs/DECISIONS.md`
- `tasks/TASK-004.md`, `records/TASK-004.json`, `critiques/TASK-002/design-2.yaml`

## Forbidden scope

- `src/systems/**` — 판정 로직. 이번 작업은 렌더링만 다룬다
- `src/*.test.ts` — 테스트가 바뀌어야 한다면 렌더링만 바꾼 게 아니라는 뜻이다
- `AGENTS.md`, `CLAUDE.md`, `nan/gates.yaml`, `nan/acceptance.yaml` (protection baseline)
- `nan/concepts/CON-001.yaml`, `nan/trace.yaml`, `nan2026.yaml`

## Acceptance criteria

1. 시그니처 색이 `DESIGN.md` 에 역할과 사용 범위와 함께 정의돼 있다.
2. 플레이어 색이 시그니처 그라데이션·상태 색 어느 것과도 같지 않다.
3. `src/scenes/` 에 hex·`rgb()`·`rgba()`·폰트 크기 리터럴이 없다.
4. `npx --no-install bass design check` 3개 항목 PASS.
5. `critiques/TASK-002/design-1.yaml` 의 high 1건·medium 3건이 코드에서 해소된다.
6. `npm test` 41개 그대로 통과 (판정 로직 무변경 확인), `npm run build` 통과.
7. `npx --no-install bass nan protect verify` 전부 pass.

## Human judgment

- 실제 화면이 "구리지 않은지"는 사람만 판단할 수 있다. 이번 작업의 성패 기준이다.
- 네온 룩이 흔한 리듬게임 클리셰로 보이는지.
- 판정선 글로우를 플레이어 색으로 칠한 판단이 시그니처를 약하게 만드는지.

## Verification

```bash
npx --no-install bass design check
npx --no-install bass nan protect verify
npm test
npm run build
grep -rE '#[0-9a-fA-F]{3,6}|rgba?\(|[0-9]+px sans-serif' src/scenes/   # 결과 없어야 함
npx --no-install bass critique validate critiques/TASK-002/design-2.yaml
```

사람 확인: `npm run dev` → 메뉴 → 리듬 릴레이/대결 각 1판.

## Rollback

`src/ui/tokens.ts` 와 `src/scenes/rhythm.ts` 를 함께 되돌려야 한다. 색 체계와 렌더링이
서로를 전제하므로 한쪽만 되돌리면 화면이 깨진다. `menu.ts`·`power.ts` 는 토큰 이름만
쓰므로 토큰을 되돌리면 함께 복구된다. `DESIGN.md` 는 시그니처 절을 제거한다.
git 이 없는 저장소라 파일별 수동 환원이다.
