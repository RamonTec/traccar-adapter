---
id: 009-T05
status: todo           # todo | doing | blocked | done
depends_on: [009-T04, 008-T06]
covers: [AC-2, AC-3]
---

# 009-T05 — Add JetStreamEventPublisher and bind it in IngestionModule

## Objetivo
Cerrar el flujo **Traccar → webhook → JetStream**: los eventos normalizados se publican de verdad, y los reintentos de Traccar se deduplican.

## Contexto (leer SOLO esto)
- `src/modules/ingestion/ingestion.module.ts`
- `src/modules/ingestion/application/ports/event-publisher.port.ts`
- `src/shared/infrastructure/nats/jetstream.publisher.ts` (solo exports)
- `src/shared/infrastructure/nats/stream-definitions.ts` (solo `SUBJECTS`)
- `test/webhook.e2e-spec.ts`

## Contrato
```ts
// src/modules/ingestion/infrastructure/outbound/jetstream-event.publisher.ts
export class JetStreamEventPublisher implements EventPublisherPort {
  constructor(private readonly publisher: JetStreamPublisher) {}
  async publish(event: TelemetryEvent): Promise<void>;
  // subject = event.type === 'position.reported' ? SUBJECTS.position : SUBJECTS.deviceEvent
  // await publisher.publish(subject, event, { msgId: event.id, correlationId: event.correlationId })
}
// ingestion.module.ts: default de EVENT_PUBLISHER_PORT → useFactory (p: JetStreamPublisher) => new JetStreamEventPublisher(p)
//   (el override de tests tiene prioridad; DEAD_LETTER sigue con UnconfiguredPublisher hasta 010)
```

## Archivos a crear/modificar
- [ ] `src/modules/ingestion/infrastructure/outbound/jetstream-event.publisher.ts` (nuevo) + `.spec.ts` (unit con un `JetStreamPublisher` fake)
- [ ] `src/modules/ingestion/ingestion.module.ts` (modificar)
- [ ] `test/ingest-to-jetstream.e2e-spec.ts` (nuevo: app in-process **sin** override de eventos, NATS real y `TEST_ENV.WEBHOOK_TOKEN`)

## Criterios de aceptación
- [ ] **AC-2a** — Unit: `position.reported` → `telemetry.events.position`; `device.event` → `telemetry.events.device-event`; `msgId = event.id`.
- [ ] **AC-2b** — E2E: `POST /webhooks/traccar/positions` con el fixture → 200, y `TELEMETRY_EVENTS` contiene el envelope ADR-0004 (`type`, `version: 1`, `data.speedKmh`) con `Nats-Msg-Id = traccar-position-<deviceId>-<fixTime epoch ms>`.
- [ ] **AC-3** — E2E: el mismo POST dos veces (simula un reintento de Traccar) → las dos respuestas son 200 y el stream tiene **1** mensaje.
- [ ] E2E: con NATS caído → el webhook responde 503 (Traccar reintentará).

## Fuera de alcance
- Dead-letter real (010).

## Verificación
```bash
pnpm test:infra:up && pnpm test:e2e
pnpm check
```

## Handoff
