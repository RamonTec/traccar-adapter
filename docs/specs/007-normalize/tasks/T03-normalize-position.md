---
id: 007-T03
status: todo           # todo | doing | blocked | done
depends_on: [007-T01, 007-T02]
covers: [AC-1, AC-2, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10]
---

# 007-T03 — Add normalizePosition

## Objetivo
Convertir un payload de posición de Traccar (`unknown`) en un `position.reported`, o rechazarlo con un motivo preciso y sin valores en el `detail`.

## Contexto (leer SOLO esto)
- `src/modules/ingestion/domain/telemetry-event.ts`
- `src/modules/ingestion/domain/units.ts`
- `test/fixtures/traccar/README.md` (campos y tipos observados)
- `test/fixtures/traccar/position.json`, `position-no-group.json`

## Contrato
```ts
// src/modules/ingestion/domain/traccar-payload.schema.ts (zod; z.object sin strict: los campos desconocidos se ignoran)
export const traccarDeviceSchema;    // id int>0, groupId int|null opcional, (resto se ignora)
export const traccarPositionSchema;  // id int>=0 (Traccar envía 0 en el forward de posiciones), deviceId int>0, fixTime/deviceTime/serverTime string (fecha parseable),
                                     // valid boolean, latitude [-90,90], longitude [-180,180], altitude/speed/course number,
                                     // accuracy number (default 0), attributes record (default {})
export const traccarPositionPayloadSchema; // { position: traccarPositionSchema, device: traccarDeviceSchema }
// Ajustar nombres y tipos a lo que documenta el README de los fixtures. Si contradice esta lista, manda el README.

// src/modules/ingestion/domain/normalize.ts
export function normalizePosition(payload: unknown, ctx: NormalizeContext): NormalizeResult;
```
Orden:
1. Si `payload.device.groupId` es `0`, `null` o no existe → `MISSING_GROUP` (detail `"device.groupId: missing"`).
2. `safeParse` → si falla, `SCHEMA_MISMATCH` con detail = issues `"<ruta.con.puntos>: <issue.code>"`, unidos con `"; "`, máximo 5.
3. `position.deviceId !== device.id` → `SCHEMA_MISMATCH` con `"position.deviceId: mismatch"`.
4. Envelope:
   - `id = "traccar-position-" + device.id + "-" + Date.parse(fixTime)` (ADR-0004, enmienda 2026-10-15), `type: 'position.reported'`, `version: 1`, `source: 'traccar'`;
   - `occurredAt = iso(fixTime)`, `receivedAt = ctx.receivedAt.toISOString()`, `correlationId = ctx.correlationId`;
   - `data` según `PositionData`, con las fechas en ISO UTC, `speedKmh = knotsToKmh(speed)` y `positionId = position.id || null`.

## Archivos a crear/modificar
- [ ] `src/modules/ingestion/domain/traccar-payload.schema.ts` (nuevo)
- [ ] `src/modules/ingestion/domain/normalize.ts` (nuevo)
- [ ] `src/modules/ingestion/domain/normalize-position.spec.ts` (nuevo; carga los fixtures con `readFileSync`)

## Criterios de aceptación
- [ ] **AC-1/AC-10** — `position.json` → `ok: true`, con `id` (`traccar-position-<device.id>-<epoch ms de fixTime>`), `type`, `occurredAt`, `data.groupId` (de `device.groupId`) y `data.positionId === null` (el fixture trae `position.id: 0`).
- [ ] **AC-2** — `data.speedKmh === knotsToKmh(fixture.position.speed)`.
- [ ] **AC-4** — `position-no-group.json` → `MISSING_GROUP`; lo mismo con `groupId: null` y con `device` sin `groupId`.
- [ ] **AC-5** — `latitude: "x"` → `SCHEMA_MISMATCH` con un detail que contiene `position.latitude` y **no** contiene `"x"`; si falta `position.id` → detail con `position.id`.
- [ ] **AC-6** — `latitude: 91`, `longitude: -181` y `fixTime: "nope"` → `SCHEMA_MISMATCH`.
- [ ] **AC-7** — `position.deviceId` distinto de `device.id` → `SCHEMA_MISMATCH` (`position.deviceId: mismatch`).
- [ ] **AC-8** — Las fechas de salida terminan en `Z`; un campo extra `foo` se ignora; `attributes` es igual (`toEqual`) al del fixture.
- [ ] **AC-9** — Dos llamadas con la misma entrada y el mismo `ctx` → resultados `toEqual`; el input no se muta (`structuredClone` antes y comparar después).

## Fuera de alcance
- Eventos (T04).

## Verificación
```bash
pnpm vitest run src/modules/ingestion
pnpm check
```

## Handoff
