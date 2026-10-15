---
id: 008-T03
status: done           # todo | doing | blocked | done
depends_on: [008-T02, 007-T04]
covers: [AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8]
---

# 008-T03 — Add IngestTraccarPayloadUseCase

## Objetivo
Garantizar que cada payload acaba **publicado o en el dead-letter**, y que los fallos de transporte se propagan para que Traccar reintente (FR10).

## Contexto (leer SOLO esto)
- `src/modules/ingestion/application/ports/event-publisher.port.ts`
- `src/modules/ingestion/application/ports/dead-letter-publisher.port.ts`
- `src/modules/ingestion/application/ports/__fakes__/` (los dos fakes)
- `src/modules/ingestion/domain/normalize.ts` (solo firmas)
- `test/fixtures/traccar/position.json`

## Contrato
```ts
// src/modules/ingestion/application/use-cases/ingest-traccar-payload.use-case.ts  (clase plana, sin @nestjs)
export interface IngestCommand {
  readonly kind: PayloadKind; readonly rawBody: Uint8Array; readonly oversized: boolean;
  readonly receivedAt: Date; readonly correlationId: string;
}
export type IngestOutcome =
  | { outcome: 'published'; eventId: string }
  | { outcome: 'deadlettered'; reason: DeadLetterReason };
export class IngestTraccarPayloadUseCase {
  constructor(private readonly events: EventPublisherPort, private readonly deadLetters: DeadLetterPublisherPort) {}
  execute(cmd: IngestCommand): Promise<IngestOutcome>;
}
```
Orden:
1. `oversized` → dead-letter `PAYLOAD_TOO_LARGE` (detail `"body exceeds WEBHOOK_MAX_BODY_BYTES"`).
2. `new TextDecoder('utf-8', { fatal: true }).decode(rawBody)`, luego `JSON.parse`; si falla → `INVALID_JSON` (detail `"invalid utf-8"` o `"invalid json"`).
3. `kind === 'position' ? normalizePosition : normalizeEvent` con `{ receivedAt, correlationId }`; si rechaza → dead-letter con `rejection.reason` y `rejection.detail`.
4. `events.publish(event)` → `{ outcome: 'published', eventId: event.id }`.

Las excepciones inesperadas en 2-3 (que no sean de parseo) → `PROCESSING_ERROR`, con detail = `error.name`. Las excepciones de `events.publish` y `deadLetters.publish` **se propagan sin capturar**. El dead-letter siempre recibe el `rawBody` **original** (mismos bytes).

## Archivos a crear/modificar
- [ ] `src/modules/ingestion/application/use-cases/ingest-traccar-payload.use-case.ts` (nuevo)
- [ ] `src/modules/ingestion/application/use-cases/ingest-traccar-payload.use-case.spec.ts` (nuevo)

## Criterios de aceptación
- [ ] **AC-2** — El fixture `position.json` → un evento publicado y el resultado `published` con `eventId = 'traccar-position-<deviceId>-<fixTime epoch ms>'`; el dead-letter está vacío.
- [ ] **AC-3** — Body `{"position":` (truncado) → `INVALID_JSON`, y el `rawBody` del dead-letter es **idéntico byte a byte** (`Buffer.compare === 0`). Bytes `0xff 0xfe` → `INVALID_JSON` (`invalid utf-8`).
- [ ] **AC-4** — Un fixture con `groupId: 0` → `MISSING_GROUP` en el dead-letter, con `kind: 'position'`.
- [ ] **AC-5** — `oversized: true` → `PAYLOAD_TOO_LARGE` sin intentar parsear.
- [ ] **AC-6** — Si el `FakeEventPublisher` tiene `failWith = new UpstreamUnavailableError('nats')` → el use case lanza ese error, y el dead-letter queda vacío.
- [ ] **AC-7** — Si el dead-letter falla en un caso `INVALID_JSON` → el error se propaga.
- [ ] **AC-8** — Si la normalización lanza un `TypeError` (forzado con `vi.spyOn` del módulo de normalización o con un payload que lo provoque) → `PROCESSING_ERROR` con detail `TypeError`.

## Fuera de alcance
- HTTP, el token y el body crudo (T04-T06).

## Verificación
```bash
pnpm vitest run src/modules/ingestion
pnpm check
```

## Handoff
- Orden: oversized → utf-8 → JSON → normalize (por `kind`) → publish; cualquier rechazo va al dead-letter con el `rawBody` original.
- Errores inesperados de normalización → `PROCESSING_ERROR` (detail = `error.name`); los errores de ambos publishers se propagan sin capturar (las publicaciones están fuera de los try).
