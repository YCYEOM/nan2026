<!-- bass-shim: agents v0.1.1 — 이 파일은 얇은 참조 shim 이다. 규칙 원문을 여기에 복사하지 마라. -->
# AGENTS.md — nan

이 프로젝트는 BASS (Behavior Architecture & System Supervisor) 워크플로를 따른다.

## 작업 규칙

1. 전체 행동 규칙은 `bass compose --role <role>` 출력이 기준이다.
   원문: bass-platform `prompt-library/` (복사본을 만들지 마라).
2. 작업은 `tasks/<ID>.md` 명세로 정의한다. 시작 전 `bass gate pre-task <ID>`,
   완료 전 run record 작성 후 `bass gate pre-complete <ID>` 를 통과해야 한다.
3. 모델 선택은 `bass route <ID> --role <role>` 권고를 따른다. 모델명을 하드코딩하지 마라.
4. 인증·권한·데이터 삭제·배포 등 승인 조건(`bass route` 출력의 approvals)이 있으면
   구현 전에 정지하고 인간 승인을 받는다.

프로젝트에 `nan2026.yaml`이 있으면 작업 전 `nan/AGENT_WORKFLOW.md`도 읽고,
concept/runtime 사람 승인, trace, evidence, session protection 규칙을 지킨다.

## 설정

- 프로젝트 설정: `bass.yaml` / 유효 설정 확인: `bass config explain`
