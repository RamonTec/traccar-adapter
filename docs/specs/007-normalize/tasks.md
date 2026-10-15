---
spec: 007-normalize
---

# 007 — Tasks

> T01 necesita a una persona para asignar un group desde la web de Traccar, solo en la instancia local de pruebas.

| Task | Título | Depende de | Estado |
|------|--------|-----------|--------|
| T01 | Capture real Traccar forward fixtures | — | done |
| T02 | Add telemetry event types and knots→km/h conversion | — | done |
| T03 | Add normalizePosition | T01, T02 | todo |
| T04 | Add normalizeEvent | T03 | todo |

Paralelizables: T01 y T02. Todo el spec es paralelizable con 002 y 003.

## Cobertura AC → tasks
| AC | Tasks |
|----|-------|
| AC-1 | T03 |
| AC-2 | T02, T03 |
| AC-3 | T04 |
| AC-4 | T03, T04 |
| AC-5 | T03, T04 |
| AC-6 | T03 |
| AC-7 | T03, T04 |
| AC-8 | T03, T04 |
| AC-9 | T03, T04 |
| AC-10 | T01, T03, T04 |

## Checklist de cierre del spec
- [ ] Todos los tasks en `done` con `## Handoff` relleno
- [ ] Cada AC del spec tiene al menos un test `it('AC-n: …')` en verde
- [ ] Los tests usan los fixtures reales de `test/fixtures/traccar/` (no payloads inventados en el happy path)
- [ ] Ningún IMEI, nombre real ni token en los fixtures
- [ ] `pnpm check` en verde (el lint confirma que `ingestion/domain` no importa Nest ni infraestructura)
- [ ] `spec.md` → `status: done` y fila del `ROADMAP.md` actualizada
- [ ] PR abierto con la lista de tasks y la matriz AC → tasks
