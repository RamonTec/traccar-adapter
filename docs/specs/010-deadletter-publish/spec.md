---
id: 010-deadletter-publish
status: approved       # draft | approved | in-progress | done
requirements: [FR10, NFR6]
adrs: [ADR-0004]
---

# 010 — Dead-letter publish: conservar los payloads que no se pudieron procesar

## Problema
FR10 exige no descartar nunca un payload en silencio. Los que fallan se persisten en `TELEMETRY_DEADLETTER` con el payload original y el motivo del fallo, para que telemetry-service los estudie.

## Alcance
- Incluye: construir el mensaje de dead-letter según ADR-0004 y publicarlo con deduplicación y confirmación (PubAck).
- **No incluye**: decidir *cuándo* se envía algo al dead-letter (eso es de 008), ni consumirlo o almacenarlo (telemetry-service).

## Comportamiento (criterios de aceptación)
- **AC-1** — CUANDO se envía un payload al dead-letter, el sistema DEBE publicar en `telemetry.deadletter.traccar` un mensaje con el formato de ADR-0004 y esperar el PubAck.
- **AC-2** — `id` y `Nats-Msg-Id` DEBEN ser `traccar-deadletter-<sha256 del body original>`. Si el mismo body se reintenta dentro de la ventana, no se duplica.
- **AC-3** — `rawPayload` DEBE reproducir el body byte a byte: en `rawEncoding: "utf8"` si es UTF-8 válido y en `"base64"` si no. Si el body supera 64 KiB (siempre con `PAYLOAD_TOO_LARGE`) se guardan los primeros 64 KiB y `truncated: true`.
- **AC-4** — `detail` DEBE tener como máximo 500 caracteres y no contener tokens ni valores de headers de autenticación.
- **AC-5** — SI la publicación falla o no se confirma en `NATS_PUBLISH_TIMEOUT_MS`, ENTONCES el error DEBE propagarse para que el webhook responda `503` (spec 008 AC-7).
- **AC-6** — Cada envío al dead-letter DEBE loguearse en nivel `error` con `reason`, `kind`, `id` y `correlationId`, nunca con `rawPayload`.

## Contratos externos
ADR-0004, sección "Dead-letter".

## Preguntas abiertas
_Ninguna._
