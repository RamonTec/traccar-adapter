---
spec: 004-group-create
---

# 004 — Tasks

| Task | Título | Depende de | Estado |
|------|--------|-----------|--------|
| T01 | Add ValidationError, ZodValidationPipe and error details in filter | 001 | done |
| T02 | Add Group domain type and GroupNameAmbiguousError (409) | 001 | done |
| T03 | Add TraccarGroupPort and CreateGroupUseCase | T02 | done |
| T04 | Add TraccarGroupHttpAdapter | T03, 003-T04 | done |
| T05 | Add CreateGroup DTO and GroupController with audit log | T01, T03, 002-T04 | done |
| T06 | Wire GroupModule into AppModule | T04, T05 | done |
| T07 | Add group-create e2e suite | T06 | done |

## Cobertura AC → tasks
| AC | Tasks |
|----|-------|
| AC-1 | T03, T04, T07 |
| AC-2 | T03, T07 |
| AC-3 | T02, T03, T07 |
| AC-4 | T01, T05, T07 |
| AC-5 | T03, T04, T07 |
| AC-6 | T05, T07 |
| AC-7 | T05, T06 |
| AC-8 | T05, T07 |

## Checklist de cierre del spec
- [x] Todos los tasks en `done` con `## Handoff` relleno
- [x] Cada AC del spec tiene al menos un test `it('AC-n: …')` en verde
- [x] `pnpm check` y `pnpm test:e2e` en verde
- [x] Variables de entorno nuevas documentadas (README) y añadidas a `test/support/test-env.ts` (este spec no añade ninguna)
- [x] ADRs/skills afectados actualizados (`pnpm sdd:sync` si cambió un skill)
- [x] `spec.md` → `status: done` y fila del `ROADMAP.md` actualizada
- [ ] PR abierto con la lista de tasks y la matriz AC → tasks
