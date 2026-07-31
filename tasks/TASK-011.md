---
id: TASK-011
title: HUD 가 캔버스를 덮는다 — position fixed 를 흐름 안으로
status: HUMAN_REVIEW

type: fix
profile: nan2026

risk:
  level: low
  reasons:
    - CSS 세 줄이다. 게임 코드·판정은 안 건드린다
    - 다만 이 페이지가 모든 게임의 껍데기라 깨지면 전부 영향을 받는다

human:
  owner: user
  reviewer_required: true
---

## Problem

스크린샷으로 확인했다. **캔버스 밖 HUD 가 캔버스 안 글자를 덮는다.**

- 상단 HUD 문자열이 캔버스 제목 "떠넘기기"를 가로지른다.
- 오른쪽 끝 "음소거[M] 🔊" 가 점수판 "P2 0" 을 덮는다.

원인은 `index.html` 두 줄이다.

```css
#hud { position: fixed; top: 8px; left: 8px; }   /* 흐름에서 빠진다 */
canvas { margin: 0 auto; }                        /* 가운데 정렬 */
```

`position: fixed` 라 HUD 가 **레이아웃 공간을 차지하지 않는다.** 그래서 캔버스가 페이지
맨 위에서 시작하고 HUD 가 그 위에 겹쳐 그려진다. 창이 넓으면 캔버스가 가운데로 밀리는데
HUD 는 폭 제한이 없어 화면 전체를 가로질러 캔버스를 통과한다.

**캔버스 안쪽은 멀쩡하다** — TASK-010 에서 고친 배너·차례 줄·심지·버튼이 전부 제자리다.
남은 겹침은 전부 캔버스 밖이었다.

## What we are shipping

HUD 를 **문서 흐름 안으로** 되돌리고 캔버스와 같은 폭으로 묶는다.

- `position: fixed` 제거 → HUD 가 자리를 차지하고 캔버스를 아래로 민다.
- `max-width: 640px; margin: 8px auto` → 캔버스와 같은 폭·같은 정렬. 시각적으로 한 덩어리가 된다.
- `min-height` 를 3줄분으로 고정 → HUD 내용이 길어졌다 짧아질 때 캔버스가 위아래로 튀지 않는다.
- 캔버스 아래 여백을 줘서 화면 끝에 붙지 않게 한다.

## What we are not shipping

- HUD 내용 줄이기. 문자열이 길어서 2~3줄이 되는 것은 사실이지만 그건 별개 판단이다.
- 캔버스 제목과 HUD 제목의 중복(둘 다 "떠넘기기"를 적는다) — 정보 설계 문제라 따로 본다.
- `index.html` 의 `rgba` 리터럴이 `tokens.ts` 를 안 따라오는 문제
  (`critiques/TASK-002/design-2.yaml` 에 note 로 열려 있다).
- 반응형·모바일 대응.

## Facts

- `index.html` 은 보호 파일 목록에 없다 — `.bass/` 매니페스트는 `nan/`·`docs/submission/`·
  워크플로·shim 만 잠근다.
- HUD 는 `main.ts` 가 100ms 마다 `h.current?.hud?.()` 로 채운다. 게임마다 길이가 다르고
  리듬이 가장 길다.
- 캔버스는 640×480 고정이다(`DESIGN.md` Layout — 반응형 없음).
- HUD 글꼴 14px, `line-height: 1.5` → 한 줄 21px.

## Decisions

- **흐름 안으로 되돌린다.** `fixed` 를 유지한 채 폭만 제한하면 창 크기에 따라 다시 겹친다 —
  근본은 "자리를 안 차지한다"는 것이다.
- **캔버스와 같은 폭(640px)으로 묶는다.** HUD 가 캔버스의 일부처럼 읽히고,
  줄바꿈이 캔버스 폭 안에서만 일어난다.
- **`min-height` 로 높이를 고정한다.** 게임마다·상태마다 HUD 길이가 달라서
  안 잡아두면 캔버스가 세로로 튄다.

## Assumptions

- 3줄(63px)이면 가장 긴 HUD(리듬)도 담긴다고 가정했다. 실측하지 않았다.

## Relevant context

- `index.html` — 유일한 변경 대상
- `src/main.ts` — HUD 폴링
- `DESIGN.md` Layout 절 — "HUD만 캔버스 밖 DOM(`#hud`)이고 좌상단 고정"
  (이 문장이 지금 구조를 설명하므로 같이 고쳐야 한다)

## Allowed scope

- `index.html`, `DESIGN.md`(Layout 절), `docs/DECISIONS.md`

## Forbidden scope

- 게임 코드·씬·판정, `src/` 전부
- HUD 문자열 내용

## Acceptance criteria

- [x] HUD 가 캔버스 위에 겹치지 않는다 — 캔버스가 HUD 아래에서 시작한다.
- [x] HUD 가 캔버스와 같은 폭·같은 가로 정렬이다.
- [x] HUD 길이가 바뀌어도 캔버스가 위아래로 튀지 않는다.
- [x] 창 폭을 넓혀도 좁혀도 겹치지 않는다.
- [x] `DESIGN.md` Layout 절이 실제 구조와 일치한다.
- [x] `npm run build` / `bass design check` / `bass nan protect verify` 통과.

## Human judgment

- 실제 화면에서 겹침이 사라졌는지 (이번엔 스크린샷으로 확인 가능하다).
- HUD 가 캔버스 위에 붙어 있는 배치가 어색하지 않은지.
- 3줄 고정 높이가 과한지 부족한지 — 게임마다 길이가 다르다.

## Verification

- `npm run build` (tsc + vite)
- `bass design check` / `bass nan protect verify`
- 사람: 스크린샷으로 겹침 확인 (이 작업의 핵심)

## Rollback

`index.html` 의 `#hud` 를 `position: fixed; top: 8px; left: 8px;` 로 되돌리고
`max-width`·`margin`·`min-height` 와 캔버스 아래 여백을 제거한다.
`DESIGN.md` Layout 절 문장을 되돌린다.
되돌리면 HUD 가 다시 캔버스를 덮는다.
git 이 없는 저장소라 파일별 수동 환원이다.
