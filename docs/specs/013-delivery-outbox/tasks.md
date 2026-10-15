---
spec: 013-delivery-outbox
---

# 013 — Tasks

| Task | Título | Depende de | Estado |
|------|--------|-----------|--------|
| T01 | Add outbox config section | — | done |
| T02 | Add SqliteOutboxStore | T01 | done |
| T03 | Support non-critical checks and info in readiness | — | todo |
| T04 | Add ReliablePublisher | T02 | todo |
| T05 | Add OutboxDrainer | T02 | todo |
| T06 | Add OutboxModule, readiness wiring and non-critical NATS | T03, T04, T05 | todo |
| T07 | Return Delivery from ingestion ports and add buffered outcome | — | todo |
| T08 | Publish ingestion events and dead-letters through ReliablePublisher | T06, T07 | todo |
| T09 | Add outbox e2e suite and webhook buffered logging | T08 | todo |

## Cobertura AC → tasks
| AC | Tasks |
|----|-------|
| AC-1 | T04, T07, T08, T09 |
| AC-2 | T02, T04, T07, T08, T09 |
| AC-3 | T04, T09 |
| AC-4 | T02, T04, T09 |
| AC-5 | T05, T09 |
| AC-6 | T05 |
| AC-7 | T04 |
| AC-8 | T02, T05, T09 |
| AC-9 | T05, T09 |
| AC-10 | T01, T02 |
| AC-11 | T02, T04, T05, T06 |
| AC-12 | T03, T06, T09 |

## Checklist de cierre del spec
- [ ] Todos los tasks en `done` con `## Handoff` relleno
- [ ] Cada AC del spec tiene al menos un test `it('AC-n: …')` en verde
- [ ] `pnpm check` y `pnpm test:e2e` en verde, con `pnpm test:infra:up`
- [ ] `OUTBOX_PATH` y `OUTBOX_MAX_BYTES` documentadas en el README, con la nota de volumen persistente
- [ ] Prueba manual: con NATS caído, el webhook responde 200 `buffered`; al levantar NATS (sin reiniciar el adapter) los mensajes llegan y `outbox.pending` vuelve a 0
- [ ] `spec.md` → `status: done` y fila del `ROADMAP.md` actualizada
- [ ] PR abierto con la lista de tasks y la matriz AC → tasks
