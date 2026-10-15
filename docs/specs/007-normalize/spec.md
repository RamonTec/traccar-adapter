---
id: 007-normalize
status: approved       # draft | approved | in-progress | done
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
  - `id` = `traccar-position-<device.id>-<fixTime en epoch ms>` (ADR-0004, enmienda 2026-10-15);
  - `data.positionId` = `null` si Traccar envía `0` (siempre en el forward de posiciones);
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
**Q1 (2026-10-15, resuelta 2026-10-15)** — En las capturas reales de Traccar 6.15.3 (007-T01), el forward de **posiciones** llega con `position.id = 0` siempre: se reenvía antes de persistir. Los eventos sí traen `event.id` y `positionId` reales. Con AC-1 (`id = traccar-position-<position.id>`) todas las posiciones tendrían el `id` `traccar-position-0`. Como ADR-0004 usa ese `id` como `Nats-Msg-Id`, JetStream descartaría como duplicada cada posición tras la primera, dentro de su ventana de deduplicación.
Propuesta: `id = traccar-position-<deviceId>-<fixTime en epoch ms>` (clave natural; un reintento del mismo fix sigue deduplicándose) y `data.positionId: number | null` (`0` → `null`). Requiere enmendar ADR-0004 y AC-1, y ajustar 007-T02 (tipo) y 007-T03.
→ **Aprobada** por el usuario: ADR-0004 enmendado, AC-1 actualizado, `PositionData.positionId: number | null`.

Resueltas 2026-10-14:
1. `attributes` se copian sin transformar en v1; ningún atributo se promueve a campo de primer nivel.
