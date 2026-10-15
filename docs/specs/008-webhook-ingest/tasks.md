---
spec: 008-webhook-ingest
---

# 008 — Tasks

> T07 necesita a una persona para el experimento de caída (detener el adapter mientras llegan posiciones).

| Task | Título | Depende de | Estado |
|------|--------|-----------|--------|
| T01 | Add webhook config section | 002-T01 | done |
| T02 | Add ingestion publisher ports and fakes | 007-T02 | done |
| T03 | Add IngestTraccarPayloadUseCase | T02, 007-T04 | done |
| T04 | Add bounded raw body capture for webhook routes | T01 | todo |
| T05 | Add WebhookTokenGuard | T01 | todo |
| T06 | Add webhook controller and IngestionModule wiring | T03, T04, T05, 002-T04 | todo |
| T07 | Document required Traccar configuration | T06 | todo |

Paralelizables: T02 con T04 y T05.

## Cobertura AC → tasks
| AC | Tasks |
|----|-------|
| AC-1 | T05, T06 |
| AC-2 | T03, T06 |
| AC-3 | T03, T04, T06 |
| AC-4 | T03 |
| AC-5 | T03, T04, T06 |
| AC-6 | T03, T06 |
| AC-7 | T03, T06 |
| AC-8 | T03 |
| AC-9 | T06 |
| AC-10 | T06 |
| AC-11 | T07 |

## Checklist de cierre del spec
- [ ] Todos los tasks en `done` con `## Handoff` relleno
- [ ] Cada AC del spec tiene al menos un test `it('AC-n: …')` en verde
- [ ] `pnpm check` y `pnpm test:e2e` en verde
- [ ] `WEBHOOK_TOKEN` y `WEBHOOK_MAX_BODY_BYTES` documentadas en el README y en `test/support/test-env.ts`
- [ ] `docs/ops/traccar-config.md` revisado por una persona
- [ ] Ningún log de test contiene el token del webhook ni el body
- [ ] `spec.md` → `status: done` y fila del `ROADMAP.md` actualizada
- [ ] PR abierto con la lista de tasks y la matriz AC → tasks
