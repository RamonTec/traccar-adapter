---
spec: 012-audit-log-port
---

# 012 — Tasks

| Task | Título | Depende de | Estado |
|------|--------|-----------|--------|
| T01 | Add AuditLogPort, ClockPort and runAudited helper | — | done |
| T02 | Add PinoAuditLogAdapter and SystemClock | T01 | done |
| T03 | Add AuditModule and import it in AppModule | T02 | done |
| T04 | Move group.create audit into CreateGroupUseCase | T03 | done |
| T05 | Move device.register audit into RegisterDeviceUseCase | T03 | done |
| T06 | Move device.disable/enable audit into SetDeviceStatusUseCase | T05 | done |
| T07 | Add audit e2e suite across the four operations | T04, T05, T06 | done |

## Cobertura AC → tasks
| AC | Tasks |
|----|-------|
| AC-1 | T02, T03, T04, T05, T06, T07 |
| AC-2 | T04 |
| AC-3 | T05 |
| AC-4 | T06 |
| AC-5 | T01, T07 |
| AC-6 | T01, T02, T04 |
| AC-7 | T01, T02 |
| AC-8 | T01, T04, T05, T06 |
| AC-9 | T01, T02, T07 |
| AC-10 | T04, T05, T06, T07 |

## Checklist de cierre del spec
- [ ] Todos los tasks en `done` con `## Handoff` relleno
- [ ] Cada AC del spec tiene al menos un test `it('AC-n: …')` en verde
- [ ] `pnpm check` y `pnpm test:e2e` en verde, con `pnpm test:infra:up`
- [ ] Ningún controller importa `Logger` para auditar ni errores de dominio para clasificar resultados
- [ ] `spec.md` → `status: done` y fila del `ROADMAP.md` actualizada
- [ ] PR abierto con la lista de tasks y la matriz AC → tasks
