---
id: 007-normalize
status: draft          # draft | approved | in-progress | done
requirements: [FR6]
adrs: [ADR-0004]
---

# 007 — Normalize: convertir los payloads de Traccar al formato de evento de la plataforma

## Problema
Traccar reenvía posiciones y eventos en su propio formato JSON. Los consumidores tienen que recibir el formato de ADR-0004, con unidades homogéneas, y cualquier payload que no encaje debe rechazarse con un motivo claro para mandarlo al dead-letter.

## Alcance
- Incluye: una regla de dominio **pura** que recibe un payload ya parseado, su tipo (`position|event`), `receivedAt` y `correlationId`, y devuelve un evento normalizado o un rechazo `{reason, detail}`; fixtures reales capturados de Traccar 6.15.3.
- **No incluye**: HTTP, autenticación, parseo del JSON crudo (008) ni publicación (009/010).

## Comportamiento (criterios de aceptación)
- **AC-1** — CUANDO un payload de posición es válido, el resultado DEBE ser un `position.reported` (`version: 1`) con:
  - `id` = `traccar-position-<position.id>`;
  - `occurredAt` = `fixTime`;
  - `groupId` tomado de `device.groupId`;
  - los campos de `data` que define ADR-0004.
- **AC-2** — `speedKmh` DEBE ser la velocidad de Traccar (en nudos) × 1.852, redondeada a 2 decimales.
- **AC-3** — CUANDO un payload de evento es válido, el resultado DEBE ser un `device.event` con:
  - `id` = `traccar-event-<event.id>`;
  - `eventType` igual al tipo de Traccar sin modificar;
  - `positionId` = `null` si Traccar envía `0` o no lo envía.
- **AC-4** — SI falta `device.groupId`, es `null` o vale `0`, ENTONCES rechazo con `MISSING_GROUP`.
- **AC-5** — SI falta un campo obligatorio o tiene un tipo incorrecto, ENTONCES rechazo con `SCHEMA_MISMATCH` y un `detail` que nombra la ruta del campo, sin incluir valores.
- **AC-6** — SI la latitud está fuera de [-90, 90], la longitud fuera de [-180, 180] o una fecha no se puede parsear, ENTONCES `SCHEMA_MISMATCH`.
- **AC-7** — SI `position.deviceId` ≠ `device.id` (o `event.deviceId` ≠ `device.id`), ENTONCES `SCHEMA_MISMATCH`.
- **AC-8** — Las fechas de salida DEBEN ser ISO-8601 en UTC. Los campos desconocidos se ignoran y `attributes` se copia sin cambios.
- **AC-9** — La regla DEBE ser determinista y sin I/O: la misma entrada (incluido `receivedAt`) produce la misma salida.
- **AC-10** — Los tests DEBEN usar fixtures **reales**, capturados del reenvío de la instancia 6.15.3, para al menos una posición y un evento de alarma.

## Contratos externos
Salida según ADR-0004 (`position.reported`, `device.event`; motivos de rechazo `MISSING_GROUP`, `SCHEMA_MISMATCH`).

## Preguntas abiertas
1. ¿Hay que transformar algún atributo de `attributes` (p.ej. `ignition`, `batteryLevel`) en un campo de primer nivel? *Propuesta: no en v1; se copian sin transformar.*
