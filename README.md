# NAN2026 Theme-to-Prototype Harness

특정 게임이 아니라 **제작 시스템**을 미리 만든다. 본선에서 주제를 받으면
Scene 하나를 얹어 게임을 붙인다 — 하네스·키트·디자인 토큰·검증 파이프라인은 그대로 쓴다.

**규칙·워크플로 원문은 이 저장소에 없다.** 별도 repo `../bass-platform`
(BASS 0.2.0, NAN Edition)에 있고 여기에는 `tools/bass-platform-0.2.0.tgz` 로 고정
설치되어 있다. 구현과 판단 기록만 여기서 한다.

## 실행

```bash
npm install
npm run dev      # 시작 화면에서 게임 선택 (Esc 로 메뉴 복귀)
npm test         # 시스템 로직 검증 (131개)
npm run build    # 정적 빌드 (dist/)
```

## 지금 들어 있는 것 — 리허설 게임 5종

주제를 갈아끼우는 연습으로 만든 것들이다. 전부 에셋 0(도형 렌더 + Web Audio 신스),
콘텐츠는 절차 생성이다.

| 게임 | 주제 | 상태 |
|---|---|---|
| **전력망** | 협동 + 트롤. 공유 전력을 나눠 도시에 급전 | 동작 |
| **리듬 릴레이** (팀전/개인전) | 박자에 맞춰 번갈아. 키 3개씩 6레인 + 반전 노트 | 동작 |
| **사라지는 선** | 모방. 원본을 보고 그리면 그 선이 사라진다 | **취소** — 재미 판정 실패, 코드만 존치 |
| **떠넘기기** | 주사위 푸시 유어 럭. 터지기 전에 상대에게 밀어넣는다 | 동작, 검토 대기 |
| **제로섬** | 영토. 내가 얻은 칸은 반드시 네가 잃은 칸이다 | 동작, 검토 대기 |

취소된 게임을 지우지 않고 두는 이유는 판단 기록이기 때문이다. 실패 원인은
`records/MIM-001.json` 과 `nan/concepts/CON-003.yaml` 에 적혀 있고, 그 진단이
다음 컨셉의 설계 근거가 됐다.

## 세션 시작 (BASS)

```bash
npx --no-install bass doctor
npx --no-install bass nan trace validate
npx --no-install bass nan protect verify
```

작업 게이트: `bass gate pre-task <ID>` → 구현 → run record → `bass gate pre-complete <ID>`.
컨셉은 `bass nan concept gate <CON-ID>` 로 검증하고 **사람 승인 없이는 통과하지 않는다.**
규칙 전문이 필요하면 `bass compose --role <role>`. 절차는 `AGENTS.md`, `nan/AGENT_WORKFLOW.md`.

작업 ID 는 게임별로 계열을 나눈다 — `TASK-`(하네스·전력망·리듬), `MIM-`(모방),
`PSH-`(떠넘기기), `ZRO-`(제로섬). 한 저장소에서 병행하므로 접두사로 가른다.

## 구조

```
src/core/harness.ts       공통 커널: 상태·타이머·점수·루프·입력·플레이 로그
src/kits/                 공통 부품 (rng ← 게임 5종이 쓴다 / Grid, DragDrop 은 실사용자 없음)
src/ui/tokens.ts          디자인 토큰 (값). 의미는 DESIGN.md
src/systems/              게임별 판정 엔진 (rhythm, powergrid, mimicry, pushluck, zerosum)
src/scenes/               화면 (menu, rhythm, power, mimicry, pushluck, zerosum)
src/main.ts               게임 등록 — 새 게임은 GAMES 배열에 한 줄
DESIGN.md                 디자인 정체성·원칙 (색·타이포·모션·접근성)
docs/GAME_SPEC.md         게임 명세 (변경 시 항상 갱신)
docs/DECISIONS.md         판단·폐기 근거
docs/MODULE_CATALOG.md    미구현 키트 목록
nan/                      BASS nan2026 preset: gates, acceptance, trace, concepts
tasks/ records/ critiques/ evidence/   BASS 작업 산출물
```

## 규정 안전 — 읽어야 할 것

**이 저장소에는 완성된 게임 루프가 들어 있다.** 리허설로 만든 5종이고 특정 주제
콘텐츠도 포함된다. 본선 반입 가능 여부는 운영진 확인이 필요하다 — 하네스·키트만
반입 가능한 규정이라면 `src/scenes/`·`src/systems/` 의 게임별 파일과
`docs/GAME_SPEC.md` 리허설 절을 걷어내야 한다.

(이전 README 는 "완성된 게임 루프가 없다"고 적고 있었다. 리허설을 쌓는 동안 사실이
바뀌었는데 문구가 따라오지 않았다.)

## 재현성

- 랜덤을 쓰는 시스템은 전부 `kits/rng`(splitmix32) 를 쓴다. 앱은 매 판 새 시드, 테스트는 고정 시드.
  `seed` 를 안 주면 결정적 기본 동작으로 떨어져 기존 테스트가 보존된다.
- CI(`.github/workflows/nan2026.yml`)가 `npm ci` → trace validate → protect verify →
  test → build 를 돌린다.

```
skipped: 나머지 키트 14종, 네트워크 멀티, prefers-reduced-motion. 필요해지면 그때.
```
