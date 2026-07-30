---
id: TASK-005
title: 홀드 꼬리 물결 · 리듬 모드 하위 메뉴 · 판정 등급별 피드백
status: DONE

type: feature
profile: nan2026

risk:
  level: low
  reasons:
    - 렌더링과 메뉴 구성만 다룬다. 판정 엔진은 건드리지 않는다
    - 사후 기록이라 pre-task 게이트가 구현을 막지 못했다

human:
  owner: user
  reviewer_required: true
---

## Problem

**이 명세는 사후 기록이다.** 세 건 모두 사용자가 플레이하며 그 자리에서 요청·지적했고,
`bass gate pre-task` 를 통과한 뒤 구현된 것이 아니다. 순서를 지킨 척하지 않는다.

1. 홀드 꼬리가 굽이치지 않는다. 사용자 관찰: "막대가 위아래로 움직이긴 하지만 1자로만
   되어 있다." 원인 둘 — 꼬리를 머리·끝 두 점만 잇는 직선(`moveTo`→`lineTo`)으로 그려
   웨이브 노트에서도 궤도를 벗어났고, `wavy(k) = k % 3 === 1` 이라 홀드의 약 2/3은
   애초에 직선 궤도였다.
2. 최상위 메뉴에 리듬 항목이 둘(팀전·개인전)이라 목록이 늘어진다. 모드는 게임을 고른
   뒤에 정하는 것이 자연스럽다.
3. perfect 와 good 의 피드백이 **파티클까지 완전히 동일**했다. 화면 흔들림만 2.5 대 0으로
   달랐다. 사용자 요청: "퍼펙트와 굿과 베드가 다 다르게."
   추가로 `step()` 경로(홀드 완주 성공)는 흔들림이 아예 없어 press 경로와도 달랐다.

## What we are shipping

- 홀드 꼬리를 `pathX`/`pathY` 16구간 샘플링으로 궤도 위에 얹는다(`TAIL_SEGMENTS`).
  `wavy(k)` 가 홀드에 항상 참이 되도록 확장한다(탭은 1/3 규칙 유지, 연타는 제외).
- `MenuScene` 에 `title`·`hint` 매개변수를 추가해 하위 메뉴로 재사용.
  `main.ts` 의 `RHYTHM_MODES` 로 게임 선택 → 모드 선택 2단계.
- 판정 등급별 피드백 `feedback(result, player)` 신설. 충격파 링(`rings`)과
  붉은 화면 가장자리(`missFlash`)를 추가하고 press·release·step 세 경로를 통합.
- 판정 팝업을 등급별로 차등(크기·이동 방향·글로우).

## What we are not shipping

- 판정 로직 변경 없음. `src/systems/rhythm.ts` 는 건드리지 않는다 — 41개 테스트가
  그대로 통과하는 것이 그 근거다.
- 새 노트 종류 없음. `prefers-reduced-motion` 대응 없음(critic note 로 계속 열려 있다).
- 재미 요소 추가 없음. 별도로 검토했고(패스·견제·콤보 위험보상·생명 회복)
  사용자 판단을 기다리는 중이다.
- 메뉴 키보드 focus 표시 없음. 하위 메뉴가 생겨 필요성이 커졌지만 이번 범위 밖이다.

## Facts

- 꼬리 렌더는 `hold > 0 && mash === 0` 분기에서만 그린다. 연타는 `hold` 를 창 길이로
  재사용할 뿐 꼬리가 없어 `wavy` 확장에서 제외했다.
- 물결은 y축만이고 x는 등속이다. 판정은 시간 기준이라 영향이 없고 `p=0`(판정선)에서
  `sin(0)=0` 으로 정확히 수렴한다. 07-27 에 x 변속을 롤백한 이유가 이것이다.
- 레인은 y 200~290. 진폭 26 + 선 굵기 16 → 최대 y 211~279 로 레인 안에 들어온다.
- `Esc` 는 기존 핸들러가 최상위 메뉴로 복귀시킨다. 하위 메뉴에서는 그대로 "뒤로"가 된다.
- 개인전 설명이 "각자 점수·콤보로 점수 레이스"였다. 승패 기준은 TASK-002 에서
  적중률로 바뀌었으므로 메뉴가 옛말을 하고 있었다.
- 피드백 수치: 링 2/1/0겹, 파티클 22/9/7, 흔들림 3.5/1/8, 붉은 가장자리 miss 만.

## Decisions

- 홀드만 항상 물결. 07-27 에 "모든 노트 굽이침도 과함"으로 롤백한 이력이 있어
  탭의 1/3 규칙은 유지한다. 홀드는 꼬리가 길어 모양이 실제로 읽히는 노트다.
- 하위 메뉴에 새 씬 클래스를 만들지 않는다. `MenuScene` 이 이미 범용이고
  하네스의 씬 교체가 이를 지원한다. 매개변수 둘에 기본값을 둬 기존 호출부를 보존했다.
- 등급 구분의 주된 신호를 파티클 수가 아니라 **링 겹수와 붉은 가장자리**로 삼는다.
  파티클 수 차이는 순간적으로 구분되지 않는다.
- 세 경로(press·release·step)를 한 함수로 모은다. 흩어져 있어서 step 경로에만
  흔들림이 빠지는 불일치가 생겼다.

## Assumptions

없음.

## Relevant context

- `src/scenes/rhythm.ts` — 꼬리 렌더, `wavy`, `feedback`, `rings`, `missFlash`, 판정 팝업
- `src/scenes/menu.ts` — `title`/`hint` 매개변수
- `src/main.ts` — `RHYTHM_MODES` 하위 메뉴
- `docs/GAME_SPEC.md` 리허설4 절, `DESIGN.md` Motion·success 절

## Allowed scope

- `src/scenes/rhythm.ts`, `src/scenes/menu.ts`, `src/main.ts`
- `DESIGN.md`, `docs/GAME_SPEC.md`, `docs/DECISIONS.md`
- `tasks/TASK-005.md`, `records/TASK-005.json`

## Forbidden scope

- `src/systems/**` — 판정 로직
- `src/*.test.ts` — 테스트가 바뀌어야 한다면 렌더링만 바꾼 게 아니라는 뜻이다
- `src/ui/tokens.ts` — 이번엔 새 색이 필요 없다
- `AGENTS.md`, `CLAUDE.md`, `nan/gates.yaml`, `nan/acceptance.yaml` (protection baseline)
- `nan/concepts/CON-001.yaml`, `nan/trace.yaml`, `nan2026.yaml`

## Acceptance criteria

1. 홀드 노트의 꼬리가 궤도를 따라 물결친다. 머리는 판정선에 정확히 붙는다.
2. 메뉴에서 리듬을 고르면 팀전/개인전 하위 메뉴가 나오고, `Esc` 로 최상위로 돌아온다.
3. perfect·good·miss 가 링 겹수·파티클·흔들림·화면 가장자리·팝업에서 모두 다르다.
4. `npm test` 41개 그대로 통과 (판정 엔진 무변경 확인), `npm run build` 통과.
5. `npx --no-install bass design check` 3개 항목 PASS, `src/scenes/` 리터럴 0건.
6. `npx --no-install bass nan protect verify` 전부 pass.

## Human judgment

- 물결의 진폭(26)과 주기(`2 + k % 3`)가 과한지.
- 판정 이펙트가 과해서 노트를 가리는지(DESIGN.md 원칙 5).
- 하위 메뉴 한 단계가 시연에서 번거로운지.

## Verification

```bash
npm test
npm run build
npx --no-install bass design check
npx --no-install bass nan protect verify
grep -rE '#[0-9a-fA-F]{3,6}|rgba?\(|[0-9]+px sans-serif' src/scenes/   # 결과 없어야 함
```

사람 확인: `npm run dev` → 메뉴 → 리듬 → 팀전·개인전 각 1판.

## Rollback

`src/scenes/rhythm.ts` 는 `TAIL_SEGMENTS`·`rings`·`missFlash`·`feedback` 제거 후 호출부
3곳을 이전 인라인 코드로 되돌린다. `wavy(k)` 를 `k % 3 === 1` 로 환원한다.
`main.ts` 는 `GAMES` 를 3항목 평면 목록으로, `menu.ts` 는 매개변수 둘을 제거한다
(기본값이 있어 호출부는 그대로 동작한다). 문서는 해당 절만 제거한다.
git 이 없는 저장소라 파일별 수동 환원이다.
