---
id: 013-T07
status: done           # todo | doing | blocked | done
depends_on: []
covers: [AC-1, AC-2]
---

# 013-T07 — Return Delivery from ingestion ports and add buffered outcome

## Objetivo
El use case de ingesta distingue `published`/`deadlettered` de `buffered` según lo que digan los publishers.

## Contexto (leer SOLO esto)
- `src/modules/ingestion/application/ports/event-publisher.port.ts`
- `src/modules/ingestion/application/ports/dead-letter-publisher.port.ts`
- `src/modules/ingestion/application/use-cases/ingest-traccar-payload.use-case.ts` (+ spec)
- `src/modules/ingestion/application/ports/__fakes__/` (los dos fakes)

## Contrato
```ts
// event-publisher.port.ts
export type Delivery = 'published' | 'buffered';
export interface EventPublisherPort { publish(event: TelemetryEvent): Promise<Delivery> }
// dead-letter-publisher.port.ts (importa Delivery)
export interface DeadLetterPublisherPort { publish(req: DeadLetterRequest): Promise<Delivery> }
// use case
export type IngestOutcome =
  | { outcome: 'published'; eventId: string }
  | { outcome: 'deadlettered'; reason: DeadLetterReason }
  | { outcome: 'buffered'; eventId?: string; reason?: DeadLetterReason };
// evento: delivery === 'buffered' ? { outcome: 'buffered', eventId } : { outcome: 'published', eventId }
// dead-letter: delivery === 'buffered' ? { outcome: 'buffered', reason } : { outcome: 'deadlettered', reason }
// Fakes: devuelven `delivery` (propiedad, default 'published')
```

## Archivos a crear/modificar
- [ ] `event-publisher.port.ts`, `dead-letter-publisher.port.ts`, `ingest-traccar-payload.use-case.ts` (+ spec)
- [ ] `__fakes__/event-publisher.fake.ts`, `__fakes__/dead-letter-publisher.fake.ts` (+ `fakes.spec.ts`)

## Criterios de aceptación
- [ ] **AC-1** — Fake de eventos con `delivery = 'buffered'` → `{ outcome: 'buffered', eventId }`.
- [ ] **AC-2** — Fake de dead-letter `buffered` con JSON inválido → `{ outcome: 'buffered', reason: 'INVALID_JSON' }`.
- [ ] Los tests actuales del use case siguen en verde.

## Fuera de alcance
- Implementaciones (T08).

## Verificación
```bash
pnpm vitest run src/modules/ingestion/application
pnpm check
```

## Handoff
- `EventPublisherPort`/`DeadLetterPublisherPort.publish` → `Delivery` ('published' | 'buffered'); `IngestOutcome` += `buffered` (con eventId o reason).
- Fakes con propiedad `delivery` (default 'published').
- Desviación: los dos publishers de JetStream devuelven 'published' de forma provisional para compilar; T08 los pasa a `ReliablePublisher`.
