---
spec: 003-traccar-client
---

# 003 — Tasks

> T01 necesita a una persona: crear el usuario de servicio y el token en Traccar.

| Task | Título | Depende de | Estado |
|------|--------|-----------|--------|
| T01 | Verify Traccar 6.15.3 API and write traccar-api skill | — | todo |
| T02 | Add request context (AsyncLocalStorage) for correlation ID | — | done |
| T03 | Add Traccar config section | 002-T01 | done |
| T04 | Add TraccarHttpClient and UpstreamUnavailableError | T02, T03 | done |
| T05 | Add readiness registry, /health/ready and TraccarModule wiring | T04, 002-T04 | todo |

Paralelizables: T01 y T02 (y T01 también con todo 002).

## Cobertura AC → tasks
| AC | Tasks |
|----|-------|
| AC-1 | T03, T04 |
| AC-2 | T04 |
| AC-3 | T04 |
| AC-4 | T04 |
| AC-5 | T04 |
| AC-6 | T02, T04, T05 |
| AC-7 | T05 |
| AC-8 | T01 |

## Checklist de cierre del spec
- [ ] Todos los tasks en `done` con `## Handoff` relleno
- [ ] Cada AC del spec tiene al menos un test `it('AC-n: …')` en verde (AC-8: skill revisado)
- [ ] `pnpm check` y `pnpm test:e2e` en verde
- [ ] `TRACCAR_BASE_URL`, `TRACCAR_API_TOKEN` y `TRACCAR_TIMEOUT_MS` documentadas en el README y en `test-env.ts`
- [ ] Skill `traccar-api` sincronizado (`pnpm sdd:sync`) y con permisos mínimos del usuario de servicio
- [ ] `spec.md` → `status: done` y fila del `ROADMAP.md` actualizada
- [ ] PR abierto con la lista de tasks y la matriz AC → tasks
