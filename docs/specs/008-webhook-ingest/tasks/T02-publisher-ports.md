---
id: 008-T02
status: todo           # todo | doing | blocked | done
depends_on: [007-T02]
covers: []
---

# 008-T02 — Add ingestion publisher ports and fakes

## Objetivo
Definir las dos salidas de la ingesta (eventos y dead-letter) como ports de aplicación, con fakes reutilizables para 008, 009 y 010.

## Contexto (leer SOLO esto)
- `src/modules/ingestion/domain/telemetry-event.ts` (solo `TelemetryEvent`)
- skill `automated-testing` (`recipes.md` §3)

## Contrato
```ts
// src/modules/ingestion/application/ports/event-publisher.port.ts
import type { TelemetryEvent } from '../../domain/telemetry-event.js';
export interface EventPublisherPort { publish(event: TelemetryEvent): Promise<void> } // fallo → UpstreamUnavailableError
export const EVENT_PUBLISHER_PORT = Symbol('EventPublisherPort');

// src/modules/ingestion/application/ports/dead-letter-publisher.port.ts
export type DeadLetterReason = 'INVALID_JSON' | 'SCHEMA_MISMATCH' | 'MISSING_GROUP' | 'PAYLOAD_TOO_LARGE' | 'PROCESSING_ERROR';
export type PayloadKind = 'position' | 'event';
export interface DeadLetterRequest {
  readonly kind: PayloadKind; readonly reason: DeadLetterReason; readonly detail: string;
  readonly rawBody: Uint8Array; readonly receivedAt: Date; readonly correlationId: string;
}
export interface DeadLetterPublisherPort { publish(req: DeadLetterRequest): Promise<void> }
export const DEAD_LETTER_PUBLISHER_PORT = Symbol('DeadLetterPublisherPort');

// src/modules/ingestion/application/ports/__fakes__/event-publisher.fake.ts
export class FakeEventPublisher implements EventPublisherPort { readonly published: TelemetryEvent[]; failWith?: Error; publish(...) }
// src/modules/ingestion/application/ports/__fakes__/dead-letter-publisher.fake.ts
export class FakeDeadLetterPublisher implements DeadLetterPublisherPort { readonly published: DeadLetterRequest[]; failWith?: Error; publish(...) }
```

## Archivos a crear/modificar
- [ ] `src/modules/ingestion/application/ports/event-publisher.port.ts` (nuevo)
- [ ] `src/modules/ingestion/application/ports/dead-letter-publisher.port.ts` (nuevo)
- [ ] `src/modules/ingestion/application/ports/__fakes__/event-publisher.fake.ts` + `dead-letter-publisher.fake.ts` (nuevos)
- [ ] `src/modules/ingestion/application/ports/__fakes__/fakes.spec.ts` (nuevo, mínimo)

## Criterios de aceptación
- [ ] Cada fake guarda lo publicado en orden y, si tiene `failWith`, lanza ese error **sin** guardar nada.
- [ ] Los fakes implementan la interfaz (`implements`), de modo que TypeScript falla si el port cambia.
- [ ] Ningún archivo importa `@nestjs/*` ni `infrastructure` (`pnpm lint`).

## Fuera de alcance
- Use case (T03). Implementaciones reales (009, 010).

## Verificación
```bash
pnpm vitest run src/modules/ingestion/application
pnpm check
```

## Handoff
