---
spec: NNN-slug
---

# NNN — Tasks

| Task | Título | Depende de | Estado |
|------|--------|-----------|--------|
| T01 | ... | — | todo |

## Cobertura AC → tasks
| AC | Tasks |
|----|-------|
| AC-1 | T01 |

## Checklist de cierre del spec
- [ ] Todos los tasks en `done` con `## Handoff` relleno
- [ ] Cada AC del spec tiene al menos un test `it('AC-n: …')` en verde
- [ ] `pnpm check` y `pnpm test:e2e` en verde
- [ ] Variables de entorno nuevas documentadas (README) y añadidas a `test/support/test-env.ts`
- [ ] ADRs/skills afectados actualizados (`pnpm sdd:sync` si cambió un skill)
- [ ] `spec.md` → `status: done` y fila del `ROADMAP.md` actualizada
- [ ] PR abierto con la lista de tasks y la matriz AC → tasks
