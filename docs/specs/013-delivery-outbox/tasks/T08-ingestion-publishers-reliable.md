---
id: 013-T08
status: done           # todo | doing | blocked | done
depends_on: [013-T06, 013-T07]
covers: [AC-1, AC-2]
---

# 013-T08 — Publish ingestion events and dead-letters through ReliablePublisher

## Objetivo
Los publishers de ingestion usan `ReliablePublisher` y devuelven su `Delivery`.

## Contexto (leer SOLO esto)
- `src/modules/ingestion/infrastructure/outbound/jetstream-event.publisher.ts` (+ spec)
- `src/modules/ingestion/infrastructure/outbound/jetstream-dead-letter.publisher.ts` (+ spec)
- `src/modules/ingestion/ingestion.module.ts`
- `src/shared/infrastructure/outbox/reliable.publisher.ts` (solo exports)

## Contrato
```ts
// src/shared/infrastructure/outbox/reliable.publisher.ts
export type Delivery = 'published' | 'buffered';
@Injectable() export class ReliablePublisher {
  constructor(js: JetStreamPublisher, store: SqliteOutboxStore, drainer: OutboxDrainer);
  publish(subject: string, payload: unknown, opts: PublishOptions): Promise<Delivery>;  // PublishOptions = { msgId, correlationId? }
}
```
- `JetStreamEventPublisher(publisher: ReliablePublisher)` → `return publisher.publish(subject, event, {...})`.
- `JetStreamDeadLetterPublisher(publisher: ReliablePublisher)` → igual; el log `error 'Payload dead-lettered'` incluye `delivery`.
- `ingestion.module.ts`: las factories inyectan `ReliablePublisher` en vez de `JetStreamPublisher`.

## Archivos a crear/modificar
- [ ] `jetstream-event.publisher.ts` (+ spec)
- [ ] `jetstream-dead-letter.publisher.ts` (+ spec)
- [ ] `ingestion.module.ts`

## Criterios de aceptación
- [ ] Unit: ambos devuelven el `Delivery` del fake (`published` y `buffered`).
- [ ] El log del dead-letter incluye `delivery` y nunca `rawPayload`.
- [ ] `pnpm test` en verde.

## Fuera de alcance
- Respuesta HTTP y e2e (T09).

## Verificación
```bash
pnpm vitest run src/modules/ingestion
pnpm check
```

## Handoff
- `JetStreamEventPublisher` y `JetStreamDeadLetterPublisher` usan `ReliablePublisher` y devuelven su `Delivery`; el log del dead-letter incluye `delivery`.
- `IngestionModule` inyecta `ReliablePublisher`.
- Los e2e de NATS caído → 503 pasan a esperar 200 `buffered` en T09.
