---
spec: 006-device-status
---

# 006 — Tasks

| Task | Título | Depende de | Estado |
|------|--------|-----------|--------|
| T01 | Add isRetired and DeviceNotFound/DeviceRetired errors (404/409) | 005-T01 | done |
| T02 | Add TraccarDeviceStatusPort with structural type test | T01 | done |
| T03 | Add SetDeviceStatusUseCase | T02 | done |
| T04 | Extract device mapper and add TraccarDeviceStatusHttpAdapter | T02, 005-T04 | done |
| T05 | Add DeviceStatusController with param/body validation and audit log | T03, 004-T01, 002-T04 | done |
| T06 | Wire device status into DeviceModule and route allowlist | T04, T05, 005-T07 | done |
| T07 | Add device-status e2e suite | T06, 005-T08 | done |

## Cobertura AC → tasks
| AC | Tasks |
|----|-------|
| AC-1 | T03, T04, T07 |
| AC-2 | T03, T07 |
| AC-3 | T03, T04, T07 |
| AC-4 | T03, T07 |
| AC-5 | T01, T03, T07 |
| AC-6 | T01, T03, T04, T05, T07 |
| AC-7 | T02, T04, T07 |
| AC-8 | T03, T04, T07 |
| AC-9 | T05, T06, T07 |
| AC-10 | T05 |

## Checklist de cierre del spec
- [x] Todos los tasks en `done` con `## Handoff` relleno
- [x] Cada AC del spec tiene al menos un test `it('AC-n: …')` en verde
- [x] `pnpm check` y `pnpm test:e2e` en verde
- [x] Variables de entorno nuevas documentadas (README) y añadidas a `test/support/test-env.ts` (este spec no añade ninguna)
- [x] ADRs/skills afectados actualizados (`pnpm sdd:sync` si cambió un skill)
- [x] `spec.md` → `status: done` y fila del `ROADMAP.md` actualizada
- [ ] PR abierto con la lista de tasks y la matriz AC → tasks
