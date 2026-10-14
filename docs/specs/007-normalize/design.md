---
spec: 007-normalize
status: draft          # draft | approved
---

# 007 — Diseño

## Componentes
| Capa | Archivo | N/M | Responsabilidad |
|------|---------|-----|-----------------|
| tooling | `scripts/capture-traccar-forward.mjs` | N | Receptor temporal que guarda lo que reenvía Traccar (sin headers de auth) |
| test | `test/fixtures/traccar/*.json` + `README.md` | N | Payloads reales anonimizados y cómo se capturaron |
| ingestion/domain | `src/modules/ingestion/domain/telemetry-event.ts` | N | Tipos de evento ADR-0004 + resultado de la normalización |
| ingestion/domain | `src/modules/ingestion/domain/units.ts` | N | Conversión nudos → km/h |
| ingestion/domain | `src/modules/ingestion/domain/traccar-payload.schema.ts` | N | Esquemas zod de los payloads de Traccar (verificados contra los fixtures) |
| ingestion/domain | `src/modules/ingestion/domain/normalize.ts` | N | `normalizePosition`, `normalizeEvent` (puras) |

Primer código del módulo `ingestion`. Sin dependencias nuevas.

## Contratos internos
```ts
// telemetry-event.ts
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

// units.ts
export function knotsToKmh(knots: number): number;          // round(knots * 1.852, 2)

// normalize.ts
export function normalizePosition(payload: unknown, ctx: NormalizeContext): NormalizeResult;
export function normalizeEvent(payload: unknown, ctx: NormalizeContext): NormalizeResult;
```

## Flujo
1. `safeParse` con el esquema zod del tipo correspondiente. Un fallo → `SCHEMA_MISMATCH` con `detail` = `"<ruta>: <issue.code>"`, separados por `; ` y con un máximo de 5 issues. **Nunca valores.**
2. `device.groupId` ausente, `null` o `0` → `MISSING_GROUP` (se evalúa **antes** que el resto del esquema, para que el motivo sea preciso).
3. Comprobar que `deviceId` coincide con `device.id` → si no, `SCHEMA_MISMATCH` con detail `"deviceId: mismatch"`.
4. Construir el envelope: fechas con `new Date(x).toISOString()`, `speedKmh = knotsToKmh(speed)`, `positionId` del evento `0` → `null`, `receivedAt = ctx.receivedAt.toISOString()`.

## Decisiones
- **zod en el dominio**: es una librería pura (sin I/O ni framework) y la regla de lint de ADR-0001 lo permite. Evita escribir a mano un validador de unos 20 campos.
- `normalizePosition` y `normalizeEvent` van separadas, porque el tipo lo decide la ruta del webhook (008), no el contenido.
- Los esquemas se escriben **a partir de los fixtures reales** (T01), no de memoria. Los campos desconocidos se ignoran: zod `object` sin `strict`.

## Mapa AC → componentes
| AC | Componentes |
|----|-------------|
| 1, 2 | normalize (`normalizePosition`), units |
| 3 | normalize (`normalizeEvent`) |
| 4, 5, 6, 7 | traccar-payload.schema, normalize |
| 8, 9 | normalize, telemetry-event |
| 10 | fixtures + capture script |
