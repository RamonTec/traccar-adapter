---
spec: 010-deadletter-publish
---

# 010 — Tasks

| Task | Título | Depende de | Estado |
|------|--------|-----------|--------|
| T01 | Add buildDeadLetterMessage | 008-T02 | done |
| T02 | Add JetStreamDeadLetterPublisher and bind it in IngestionModule | T01, 009-T04, 008-T06 | todo |

T01 es paralelizable con todo 009.

## Cobertura AC → tasks
| AC | Tasks |
|----|-------|
| AC-1 | T02 |
| AC-2 | T01, T02 |
| AC-3 | T01, T02 |
| AC-4 | T01 |
| AC-5 | T02 |
| AC-6 | T02 |

## Checklist de cierre del spec
- [ ] Todos los tasks en `done` con `## Handoff` relleno
- [ ] Cada AC del spec tiene al menos un test `it('AC-n: …')` en verde
- [ ] `pnpm check` y `pnpm test:e2e` en verde, con `pnpm test:infra:up`
- [ ] Ya no queda `UnconfiguredPublisher` como binding por defecto (se puede borrar si nada lo usa)
- [ ] Prueba manual: un body inválido en el webhook aparece en `TELEMETRY_DEADLETTER` con los bytes originales
- [ ] `spec.md` → `status: done` y fila del `ROADMAP.md` actualizada
- [ ] PR abierto con la lista de tasks y la matriz AC → tasks
