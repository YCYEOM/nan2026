# MODULE_CATALOG

> 재사용 가능한 부품 목록. 새 시스템 만들기 전 여기부터 검색(PROJECT_RULES).

## 공통 커널 (`src/core/harness.ts`)

- Harness: 상태 전환(menu/play/win/lose/paused), 타이머(clock), 점수, 라운드, 루프, 입력 위임, 플레이 로그
- Scene 인터페이스: enter / update(dt) / draw(ctx) / pointer / key

## 상호작용 키트 (`src/kits/`)

- `grid.ts` — Grid Placement Kit: 픽셀↔셀, 점유, 4방향 이웃
- `dragdrop.ts` — Drag & Drop Kit: 포인터로 아이템 집기/놓기, 드롭 이벤트

## 시스템 동작 키트 (`src/systems/behaviors.ts`)

- `decay(value, rate, dt, min)` — Decay / Growth
- `chainReact(grid, seed, match)` — Chain Reaction (flood fill, 방문 순서 반환)

## 미구현 (문서 10.2~10.4, 필요 시 추가)

Movement / Connect / Selection / Timing Input / Resource Transfer / State Switch Kit,
Spawner / Propagation / Queue / Graph Network / Delayed Action / Replay / Rule Modifier,
Tween / Hit Stop / Screen Shake / Flash / Particle / Warning Telegraph / Result Reveal
