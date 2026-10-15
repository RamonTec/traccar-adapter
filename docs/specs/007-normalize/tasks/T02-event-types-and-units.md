---
id: 007-T02
status: done           # todo | doing | blocked | done
depends_on: []
covers: [AC-2]
---

# 007-T02 — Add telemetry event types and knots→km/h conversion

## Objetivo
Definir en el dominio de `ingestion` los tipos del contrato ADR-0004 y la conversión de unidades, sin lógica de parseo todavía.

## Contexto (leer SOLO esto)
- `docs/standards/architecture.md` (sección Layout)
- skill `automated-testing` (`recipes.md` §1)

## Contrato
```ts
// src/modules/ingestion/domain/telemetry-event.ts
interface Envelope<T extends string, D> {
  readonly id: string; readonly type: T; readonly version: 1; readonly source: 'traccar';
  readonly occurredAt: string; readonly receivedAt: string; readonly correlationId: string; readonly data: D;
}
export interface PositionData {
  positionId: number; deviceId: number; groupId: number; fixTime: string; deviceTime: string; serverTime: string;
  valid: boolean; latitude: number; longitude: number; altitude: number; speedKmh: number; course: number;
  accuracy: number; attributes: Record<string, unknown>;
}
export interface DeviceEventData {
  eventId: number; eventType: string; deviceId: number; groupId: number; eventTime: string;
  positionId: number | null; attributes: Record<string, unknown>;
}
export type PositionReported = Envelope<'position.reported', PositionData>;
export type DeviceEvent = Envelope<'device.event', DeviceEventData>;
export type TelemetryEvent = PositionReported | DeviceEvent;
export type RejectionReason = 'MISSING_GROUP' | 'SCHEMA_MISMATCH';
export interface NormalizationRejection { readonly reason: RejectionReason; readonly detail: string }
export type NormalizeResult = { ok: true; event: TelemetryEvent } | { ok: false; rejection: NormalizationRejection };
export interface NormalizeContext { readonly receivedAt: Date; readonly correlationId: string }

// src/modules/ingestion/domain/units.ts
export const KNOTS_TO_KMH = 1.852;
export function knotsToKmh(knots: number): number; // Math.round(knots * 1.852 * 100) / 100
```

## Archivos a crear/modificar
- [ ] `src/modules/ingestion/domain/telemetry-event.ts` (nuevo, solo tipos)
- [ ] `src/modules/ingestion/domain/units.ts` (nuevo)
- [ ] `src/modules/ingestion/domain/units.spec.ts` (nuevo)

## Criterios de aceptación
- [ ] **AC-2a** — `knotsToKmh(0) === 0`, `knotsToKmh(10) === 18.52`, `knotsToKmh(1) === 1.85`, `knotsToKmh(5.4) === 10` (10.0008 redondeado).
- [ ] **AC-2b** — Resultado con como máximo 2 decimales para valores en 0..300 (test con `it.each` de varios valores).
- [ ] Los archivos no importan nada de `@nestjs/*`, `application` ni `infrastructure` (lo comprueba `pnpm lint`).

## Fuera de alcance
- Esquemas zod y normalización (T03, T04).

## Verificación
```bash
pnpm vitest run src/modules/ingestion
pnpm check
```

## Handoff
- `ingestion/domain/telemetry-event.ts`: tipos del contrato ADR-0004 (envelope, PositionData, DeviceEventData, NormalizeResult, NormalizeContext).
- `units.ts`: `knotsToKmh` redondea a 2 decimales.
