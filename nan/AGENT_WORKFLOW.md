# NAN 2026 agent workflow

This file is the shared entry point for Codex, Cursor, Claude, and other agents.

1. Read `nan2026.yaml`, `nan/gates.yaml`, the active concept, and `nan/team.yaml`.
2. Do not finalize a concept or runtime without a named human approval.
3. Use `bass nan runtime recommend`, then doctor and certify before apply.
4. Never claim an unexecuted target build; keep it `not-verified`.
5. Link theme → concept → decision → requirement → scenario → test → evidence.
6. Turn accepted critic findings into regression tests.
7. Preserve user files. A managed-file conflict requires human resolution.
8. Record failed attempts; two consecutive failures are BLOCKED and the fourth failed
   rework requires human judgment.
9. Do not weaken gates, shims, or acceptance checks after `bass nan session lock`.
10. Before handoff run trace, protection, relevant tests/builds, and evidence report.
