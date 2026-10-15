---
spec: 009-jetstream-publish
---

# 009 — Tasks

> Los tasks T03-T05 necesitan Docker (`pnpm test:infra:up`).

| Task | Título | Depende de | Estado |
|------|--------|-----------|--------|
| T01 | Add NATS config section and stream definitions | 002-T01 | done |
| T02 | Add NATS test infrastructure and testing recipe | — | done |
| T03 | Add NatsConnectionManager | T01, T02, 003-T05 | todo |
| T04 | Add JetStreamPublisher | T03, 003-T02 | todo |
| T05 | Add JetStreamEventPublisher and bind it in IngestionModule | T04, 008-T06 | todo |

Paralelizables: T01 y T02.

## Cobertura AC → tasks
| AC | Tasks |
|----|-------|
| AC-1 | T01, T03 |
| AC-2 | T04, T05 |
| AC-3 | T04, T05 |
| AC-4 | T04 |
| AC-5 | T03 |
| AC-6 | T03 |
| AC-7 | T03 |
| AC-8 | T04 |

## Checklist de cierre del spec
- [ ] Todos los tasks en `done` con `## Handoff` relleno
- [ ] Cada AC del spec tiene al menos un test `it('AC-n: …')` en verde
- [ ] `pnpm check` y `pnpm test:e2e` en verde, con `pnpm test:infra:up`
- [ ] Variables `NATS_*` documentadas en el README y en `test/support/test-env.ts`
- [ ] Skill `automated-testing` §7 completado y sincronizado (`pnpm sdd:sync`)
- [ ] Prueba manual: con NATS caído el servicio arranca, `/health/ready` da 503 y el webhook 503; al levantar NATS se recupera sin reiniciar
- [ ] `spec.md` → `status: done` y fila del `ROADMAP.md` actualizada
- [ ] PR abierto con la lista de tasks y la matriz AC → tasks
