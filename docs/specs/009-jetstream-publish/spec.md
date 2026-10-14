---
id: 009-jetstream-publish
status: draft          # draft | approved | in-progress | done
requirements: [FR9, NFR6]
adrs: [ADR-0002, ADR-0004]
---

# 009 — JetStream publish: streams persistentes y publicación deduplicada

## Problema
Los eventos normalizados tienen que llegar a JetStream de forma persistente (NFR6). Los reintentos de reenvío de Traccar se deduplican con `Nats-Msg-Id`, sin lógica propia (FR9).

## Alcance
- Incluye: conexión a NATS; asegurar al arrancar que existen los streams `TELEMETRY_EVENTS` y `TELEMETRY_DEADLETTER` con la configuración de ADR-0004; publicar eventos normalizados esperando la confirmación (PubAck); readiness de NATS; cierre ordenado.
- **No incluye**: el publisher del dead-letter (010), consumidores ni consumer groups (son de telemetry-service).

## Comportamiento (criterios de aceptación)
- **AC-1** — Al arrancar, el sistema DEBE crear los streams si no existen, o actualizarlos si su configuración difiere en algún parámetro modificable, según ADR-0004 (almacenamiento `file`, `max_age`, `duplicate_window`).
- **AC-2** — CUANDO se publica un `position.reported` o un `device.event`, el sistema DEBE:
  - enviarlo a `telemetry.events.position` o `telemetry.events.device-event`;
  - con los headers `Nats-Msg-Id` = `id` del evento y `x-correlation-id`;
  - y esperar el PubAck.
- **AC-3** — SI el PubAck indica `duplicate: true`, ENTONCES la publicación DEBE considerarse exitosa y loguearse en `debug`.
- **AC-4** — SI no hay conexión o no llega el PubAck en `NATS_PUBLISH_TIMEOUT_MS` (por defecto 2000), ENTONCES la publicación DEBE fallar (el webhook responde `503`, spec 008 AC-6).
- **AC-5** — SI NATS no está disponible al arrancar, el servicio DEBE arrancar igualmente, reintentar la conexión con backoff y reportar `"nats":"error"` en `/health/ready` hasta conectar.
- **AC-6** — `GET /health/ready` DEBE incluir el check `nats`.
- **AC-7** — Al recibir `SIGTERM`, el sistema DEBE vaciar (drain) la conexión NATS antes de salir.
- **AC-8** — Cada publicación DEBE loguearse con `subject`, `msgId`, `duplicate`, `durationMs` y `correlationId`.

## Contratos externos
Streams, subjects, headers y formato: ADR-0004. Env: `NATS_SERVERS` (obligatoria), `NATS_PUBLISH_TIMEOUT_MS` (opcional), retenciones (opcionales).

## Preguntas abiertas
1. ¿Cómo se autentica NATS en la plataforma (usuario/contraseña, NKey o archivo `.creds`)? *Propuesta: archivo `.creds` (NKey/JWT) por servicio, en `NATS_CREDS_FILE`.*
2. ¿Quién crea los streams? *Propuesta: traccar-adapter, por ser el productor; los consumidores solo crean sus propios consumers.*
