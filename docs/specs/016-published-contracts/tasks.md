---
spec: 016-published-contracts
---

# 016 — Tasks

| Task | Título | Depende de | Estado |
|------|--------|-----------|--------|
| T01 | Dependencias, cargador/validador de contratos y test de validez de documentos | — | done |
| T02 | `openapi.yaml` completo y test de rutas | T01 | done |
| T03 | Registro de respuestas en e2e y validación contra el OpenAPI | T02 | done |
| T04 | `asyncapi.yaml` completo y validación de mensajes en e2e de ingesta | T01 | todo |
| T05 | Guía de integración, política de versiones y enlace en README | T02, T04 | todo |

## Cobertura AC → tasks
| AC | Tasks |
|----|-------|
| AC-1 | T02 |
| AC-2 | T02 |
| AC-3 | T04 |
| AC-4 | T01, T02, T04 |
| AC-5 | T02 |
| AC-6 | T03 |
| AC-7 | T04 |
| AC-8 | T02, T04, T05 |
| AC-9 | T05 |

## Checklist de cierre del spec
- [ ] Todos los tasks en `done` con `## Handoff` relleno
- [ ] Cada AC del spec tiene al menos un test `it('AC-n: …')` en verde (AC-8/AC-9: revisión del documento)
- [ ] `pnpm check` y `pnpm test:e2e` en verde
- [ ] `spec.md` → `status: done` y fila del `ROADMAP.md` actualizada
- [ ] PR abierto con la lista de tasks y la matriz AC → tasks
