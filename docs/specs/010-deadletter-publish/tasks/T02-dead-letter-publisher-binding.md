---
id: 010-T02
status: todo           # todo | doing | blocked | done
depends_on: [010-T01, 009-T04, 008-T06]
covers: [AC-1, AC-2, AC-3, AC-5, AC-6]
---

# 010-T02 — Add JetStreamDeadLetterPublisher and bind it in IngestionModule

## Objetivo
Persistir en `TELEMETRY_DEADLETTER` todo payload que no se pudo procesar, y con eso cerrar FR10 de extremo a extremo.

## Contexto (leer SOLO esto)
- `src/modules/ingestion/ingestion.module.ts`
- `src/modules/ingestion/infrastructure/outbound/dead-letter-message.ts` (solo exports)
- `src/shared/infrastructure/nats/jetstream.publisher.ts` (solo exports)
- `src/shared/infrastructure/nats/stream-definitions.ts` (solo `SUBJECTS`)
- `test/support/nats.ts`

## Contrato
```ts
// src/modules/ingestion/infrastructure/outbound/jetstream-dead-letter.publisher.ts
export class JetStreamDeadLetterPublisher implements DeadLetterPublisherPort {
  private readonly logger = new Logger(JetStreamDeadLetterPublisher.name);
  constructor(private readonly publisher: JetStreamPublisher) {}
  async publish(req: DeadLetterRequest): Promise<void>;
  // msg = buildDeadLetterMessage(req)
  // await publisher.publish(SUBJECTS.deadLetter, msg, { msgId: msg.id, correlationId: req.correlationId })
  // logger.error({ reason: msg.reason, kind: msg.kind, id: msg.id }, 'Payload dead-lettered')   ← nunca rawPayload
}
// ingestion.module.ts: default de DEAD_LETTER_PUBLISHER_PORT → useFactory (p: JetStreamPublisher) => new JetStreamDeadLetterPublisher(p)
// Si UnconfiguredPublisher deja de usarse en todos los bindings, se borra (junto a su import).
```

## Archivos a crear/modificar
- [ ] `src/modules/ingestion/infrastructure/outbound/jetstream-dead-letter.publisher.ts` (nuevo) + `.spec.ts` (unit con un publisher fake)
- [ ] `src/modules/ingestion/ingestion.module.ts` (modificar)
- [ ] `test/ingest-to-deadletter.e2e-spec.ts` (nuevo: app in-process sin overrides y NATS real)

## Criterios de aceptación
- [ ] **AC-1** — E2E: `POST /webhooks/traccar/positions` con el body `{"position":` → 200, y `TELEMETRY_DEADLETTER` tiene un mensaje con `reason: 'INVALID_JSON'`, `kind: 'position'`, `correlationId` y `Nats-Msg-Id` igual a `id`.
- [ ] **AC-3** — E2E: el `rawPayload` del mensaje es exactamente el body enviado.
- [ ] **AC-2** — E2E: repetir el mismo body inválido → el stream sigue con **1** mensaje.
- [ ] **AC-5** — E2E: con NATS caído, el body inválido → 503 (Traccar reintenta; nada se pierde en silencio).
- [ ] **AC-6** — Unit: hay un log `error` con `reason`, `kind` e `id`, y ninguna línea contiene el `rawPayload`.
- [ ] E2E de extremo a extremo de MISSING_GROUP: el fixture `position-no-group.json` → dead-letter con `MISSING_GROUP`.

## Fuera de alcance
- Consumir el dead-letter (telemetry-service).

## Verificación
```bash
pnpm test:infra:up && pnpm test:e2e
pnpm check
```

## Handoff
