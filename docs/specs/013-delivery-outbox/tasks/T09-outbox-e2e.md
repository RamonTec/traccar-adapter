---
id: 013-T09
status: todo           # todo | doing | blocked | done
depends_on: [013-T08]
covers: [AC-1, AC-2, AC-3, AC-5, AC-8, AC-9, AC-12]
---

# 013-T09 — Add outbox e2e suite and webhook buffered logging

## Objetivo
Demostrar de punta a punta que con NATS caído nada se pierde y que, al volver, todo llega una sola vez y en orden.

## Contexto (leer SOLO esto)
- `src/modules/ingestion/infrastructure/inbound/traccar-webhook.controller.ts`
- `test/ingest-to-jetstream.e2e-spec.ts` (patrón)
- `test/support/nats.ts`
- `test/webhook.e2e-spec.ts`
- `test/ingest-to-deadletter.e2e-spec.ts`

## Contrato
- Controller: `outcome: 'buffered'` → `logger.warn({ msg: 'webhook.ingest', kind, outcome, eventId?, reason?, durationMs })`.
- E2E con `OUTBOX_PATH` en un directorio temporal: app A con `nats: { servers: ['nats://127.0.0.1:1'] }` → posts → 200 `buffered`; `app.close()`; app B, mismo path, NATS real → `vi.waitFor` hasta que el stream tenga los mensajes.
- Los tests de 008/009/010 que esperaban **503 con NATS caído** pasan a esperar **200 `buffered`** (ese es el cambio de contrato de 013); el 503 queda para outbox lleno.

## Archivos a crear/modificar
- [ ] `traccar-webhook.controller.ts` (modificar)
- [ ] `test/outbox.e2e-spec.ts` (nuevo)
- [ ] `test/webhook.e2e-spec.ts`, `test/ingest-to-jetstream.e2e-spec.ts`, `test/ingest-to-deadletter.e2e-spec.ts` (ajustar los casos de NATS caído)

## Criterios de aceptación
- [ ] **AC-1/AC-2** — NATS caído: una posición y un JSON inválido → 200 `buffered`; `/health/ready` 200 con `nats: 'down'` y `outbox.pending: 2` (**AC-12**).
- [ ] **AC-8/AC-5** — Reinicio con NATS disponible: `TELEMETRY_EVENTS` y `TELEMETRY_DEADLETTER` reciben los mensajes con su `Nats-Msg-Id`, en orden, y `outbox.pending` vuelve a 0.
- [ ] **AC-9** — Un pendiente cuyo `msgId` ya estaba publicado no crea un segundo mensaje.
- [ ] **AC-3/AC-4** — Con `outbox: { maxBytes: 1_048_576 }` lleno → 503.
- [ ] La suite e2e completa en verde.

## Fuera de alcance
- Reconciliación (011).

## Verificación
```bash
pnpm test:infra:up && pnpm test:e2e
pnpm check
```

## Handoff
