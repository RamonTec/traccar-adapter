---
spec: 002-service-auth
---

# 002 — Tasks

| Task | Título | Depende de | Estado |
|------|--------|-----------|--------|
| T01 | Add auth config section and shared test env helper | 001 | done |
| T02 | Add JwtVerifier with jose | T01 | done |
| T03 | Add auth decorators and ServiceAuthGuard | T02 | done |
| T04 | Wire global guard, public health and actor logging | T03 | done |

## Cobertura AC → tasks
| AC | Tasks |
|----|-------|
| AC-1 | T03, T04 |
| AC-2 | T02 |
| AC-3 | T02 |
| AC-4 | T02 |
| AC-5 | T03 |
| AC-6 | T03, T04 |
| AC-7 | T03, T04 |
| AC-8 | T02 |
| AC-9 | T02, T03 |
| AC-10 | T01 |
| AC-11 | T04 |

## Checklist de cierre del spec
- [ ] Todos los tasks en `done` con `## Handoff` relleno
- [ ] Cada AC del spec tiene al menos un test `it('AC-n: …')` en verde
- [ ] `pnpm check` y `pnpm test:e2e` en verde
- [ ] `KEYCLOAK_ISSUER_URL` y `KEYCLOAK_AUDIENCE` documentadas en el README y en `test/support/test-env.ts`
- [ ] Roles `groups:write` y `devices:write` documentados para configurar Keycloak (README)
- [ ] `spec.md` → `status: done` y fila del `ROADMAP.md` actualizada
- [ ] PR abierto con la lista de tasks y la matriz AC → tasks
