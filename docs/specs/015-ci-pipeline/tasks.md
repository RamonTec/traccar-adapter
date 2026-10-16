---
spec: 015-ci-pipeline
---

# 015 — Tasks

| Task | Título | Depende de | Estado |
|------|--------|-----------|--------|
| T01 | `.node-version` como fuente única de la versión de Node | — | done |
| T02 | Workflow `ci.yml` con jobs `check`, `e2e`, `image` | T01 | done |
| T03 | README: integración continua y checks obligatorios | T02 | done |

## Cobertura AC → tasks
| AC | Tasks |
|----|-------|
| AC-1 | T02 |
| AC-2 | T02 |
| AC-3 | T01, T02 |
| AC-4 | T02 |
| AC-5 | T02 |
| AC-6 | T02, T03 |
| AC-7 | T02 |

## Checklist de cierre del spec
- [x] Todos los tasks en `done` con `## Handoff` relleno
- [x] Checks `check`, `e2e` e `image` en verde en el PR
- [x] `pnpm check` en verde en local
- [x] `spec.md` → `status: done` y fila del `ROADMAP.md` actualizada
- [x] PR abierto con la lista de tasks y la matriz AC → tasks
