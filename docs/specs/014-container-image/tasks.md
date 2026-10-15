---
spec: 014-container-image
---

# 014 — Tasks

| Task | Título | Depende de | Estado |
|------|--------|-----------|--------|
| T01 | Acotar el drain de NATS en el apagado | — | done |
| T02 | Dockerfile, `.dockerignore` y scripts de build | T01 | done |
| T03 | Suite de imagen: build, arranque, config, usuario, contenido, healthcheck | T02 | todo |
| T04 | Suite de imagen: apagado y volumen del outbox; README | T03 | todo |

## Cobertura AC → tasks
| AC | Tasks |
|----|-------|
| AC-1 | T02, T03 |
| AC-2 | T03 |
| AC-3 | T03 |
| AC-4 | T02, T03 |
| AC-5 | T02, T03 |
| AC-6 | T02, T03 |
| AC-7 | T02, T03 |
| AC-8 | T01, T04 |
| AC-9 | T02, T04 |

## Checklist de cierre del spec
- [ ] Todos los tasks en `done` con `## Handoff` relleno
- [ ] Cada AC del spec tiene al menos un test `it('AC-n: …')` en verde
- [ ] `pnpm check`, `pnpm test:e2e` y `pnpm test:image` en verde
- [ ] README con la sección de imagen de contenedor
- [ ] `spec.md` → `status: done` y fila del `ROADMAP.md` actualizada
- [ ] PR abierto con la lista de tasks y la matriz AC → tasks
