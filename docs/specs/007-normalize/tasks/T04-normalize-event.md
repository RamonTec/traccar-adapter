---
id: 007-T04
status: todo           # todo | doing | blocked | done
depends_on: [007-T03]
covers: [AC-3, AC-4, AC-5, AC-7, AC-8, AC-9, AC-10]
---

# 007-T04 — Add normalizeEvent

## Objetivo
Convertir un payload de evento de Traccar en un `device.event`, reusando el esquema de device y las reglas de rechazo de T03.

## Contexto (leer SOLO esto)
- `src/modules/ingestion/domain/normalize.ts`
- `src/modules/ingestion/domain/traccar-payload.schema.ts`
- `test/fixtures/traccar/README.md`
- `test/fixtures/traccar/event-alarm.json`

## Contrato
```ts
// traccar-payload.schema.ts (ampliar)
export const traccarEventSchema;        // id int>0, type string min 1, eventTime fecha parseable, deviceId int>0,
                                        // positionId int>=0 | null | ausente, attributes record (default {})
export const traccarEventPayloadSchema; // { event: traccarEventSchema, device: traccarDeviceSchema, position?: unknown (se ignora) }

// normalize.ts (ampliar)
export function normalizeEvent(payload: unknown, ctx: NormalizeContext): NormalizeResult;
```
Mismo orden que `normalizePosition`:
1. `MISSING_GROUP`.
2. `SCHEMA_MISMATCH` por esquema.
3. `event.deviceId !== device.id` → `SCHEMA_MISMATCH` (`event.deviceId: mismatch`).
4. Envelope:
   - `id = "traccar-event-" + event.id`, `type: 'device.event'`, `occurredAt = iso(eventTime)`;
   - `data`: `eventId`, `eventType = event.type` (sin modificar), `deviceId`, `groupId`, `eventTime` ISO, `positionId` (`0` o ausente → `null`) y `attributes`.

Extrae a funciones privadas compartidas lo que se repita con la posición (detail de issues, check de group, construcción del envelope).

## Archivos a crear/modificar
- [ ] `src/modules/ingestion/domain/traccar-payload.schema.ts` (ampliar)
- [ ] `src/modules/ingestion/domain/normalize.ts` (ampliar / refactorizar)
- [ ] `src/modules/ingestion/domain/normalize-event.spec.ts` (nuevo)

## Criterios de aceptación
- [ ] **AC-3/AC-10** — `event-alarm.json` → `ok: true`, `type: 'device.event'`, `id: 'traccar-event-<id>'` y `data.eventType` igual al `type` del fixture.
- [ ] **AC-3b** — `positionId: 0` y `positionId` ausente → `data.positionId === null`; `positionId: 12` → `12`.
- [ ] **AC-4** — Fixture con `device.groupId` en `0` → `MISSING_GROUP`.
- [ ] **AC-5** — `event.type: 42` → `SCHEMA_MISMATCH` con un detail que contiene `event.type` y no contiene `42`.
- [ ] **AC-7** — `event.deviceId` distinto de `device.id` → `SCHEMA_MISMATCH`.
- [ ] **AC-8/AC-9** — `eventTime` de salida en ISO UTC; determinista y sin mutar el input.
- [ ] Los tests de `normalize-position.spec.ts` siguen en verde tras el refactor.

## Fuera de alcance
- Decidir el tipo (posición o evento) a partir del contenido: lo decide la ruta del webhook (008).

## Verificación
```bash
pnpm vitest run src/modules/ingestion
pnpm check
```

## Handoff
