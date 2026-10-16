---
id: 016-T04
status: done           # todo | doing | blocked | done
depends_on: [016-T01]
covers: [AC-3, AC-4, AC-7, AC-8]
---

# 016-T04 — asyncapi.yaml completo y validación de mensajes en e2e de ingesta

## Contexto (leer SOLO esto)
- `docs/specs/016-published-contracts/design.md`

## Verificación
```bash
pnpm check
pnpm test:e2e
```

## Handoff
- `asyncapi.yaml` 1.0.0: 3 canales (subjects de ADR-0004) con `x-jetstream`, mensajes con headers y payload,
  garantías y versionado en `info.description`.
- `test/support/event-contract.ts`: `checkMessageContract` y `checkStreamsContract` (valida **todos** los mensajes de
  ambos streams en `afterEach`, incluido `Nats-Msg-Id = id` y `x-correlation-id = correlationId`).
- Instalado en `ingest-to-jetstream`, `ingest-to-deadletter` y `outbox`. No en `jetstream-publisher`: publica
  payloads arbitrarios para probar el publisher genérico, no mensajes del contrato.
- Nuevo e2e: un evento de Traccar llega a `telemetry.events.device-event` (no había ninguno que lo publicara en NATS).
- Mutación comprobada en los tres esquemas (position, device event, dead-letter).
