---
id: 008-webhook-ingest
status: approved       # draft | approved | in-progress | done
requirements: [FR5, FR10]
adrs: [ADR-0002, ADR-0004, ADR-0005]
---

# 008 — Webhook ingest: recibir el reenvío de Traccar sin perder payloads

## Problema
Traccar empuja posiciones y eventos por HTTP (FR5). Cada payload tiene que acabar publicado como evento o en el dead-letter, nunca descartado en silencio (FR10). Si el fallo es transitorio, hay que pedir a Traccar que reintente.

## Alcance
- Incluye: dos endpoints de webhook; token compartido; conservar el body crudo; límite de tamaño; orquestar parseo → normalización (007) → publicación (a través de interfaces; las implementaciones reales llegan en 009/010); códigos de respuesta según el resultado; documentar la configuración de `traccar.xml` necesaria.
- **No incluye**: conexión a JetStream (009/010); filtrar ruido; resolver tenants.

## Comportamiento (criterios de aceptación)
- **AC-1** — SI falta el header `Authorization: Bearer <WEBHOOK_TOKEN>` o no coincide (comparación en tiempo constante), ENTONCES `401`, sin publicar ni enviar al dead-letter, y un log `warn` sin el valor recibido.
- **AC-2** — CUANDO el token es válido y el payload se normaliza bien, el sistema DEBE publicar el evento y responder `200` **solo después** de que la publicación se confirme.
- **AC-3** — CUANDO el token es válido y el body no es JSON válido, el sistema DEBE enviar al dead-letter con `INVALID_JSON` y el body original intacto, y responder `200`. Nunca `400`, porque Traccar reintentaría indefinidamente.
- **AC-4** — CUANDO la normalización rechaza el payload, el sistema DEBE enviarlo al dead-letter con el `reason` del rechazo y responder `200`.
- **AC-5** — SI el body supera `WEBHOOK_MAX_BODY_BYTES` (por defecto 1 MiB), ENTONCES dead-letter con `PAYLOAD_TOO_LARGE`, conservando solo los primeros 64 KiB, y `200`.
- **AC-6** — SI la publicación del evento falla (transporte no disponible o sin confirmación), ENTONCES `503`. Así Traccar reintenta, y no se envía al dead-letter: es un fallo de transporte, no del payload.
- **AC-7** — SI falla también la publicación en el dead-letter, ENTONCES `503`.
- **AC-8** — SI ocurre un error inesperado durante el procesamiento, ENTONCES dead-letter con `PROCESSING_ERROR` y `200`. Si el dead-letter también falla, `503`.
- **AC-9** — Rutas: `POST /webhooks/traccar/positions` (tipo `position`) y `POST /webhooks/traccar/events` (tipo `event`). Están exentas del JWT de 002.
- **AC-10** — Cada webhook DEBE loguearse con `kind`, `positionId`/`eventId` (si se parseó), `outcome` (`published|deadlettered|unauthorized|failed`), `durationMs` y `correlationId`. Nunca se loguean el body ni el token.
- **AC-11** — `docs/ops/traccar-config.md` DEBE documentar la configuración requerida:
  - URLs de reenvío y headers (`forward.header`, `event.forward.header`);
  - `database.registerUnknown=false`;
  - los valores de `forward.retry.*` y la caída máxima tolerable que resulta de ellos (ADR-0005 §5).

## Contratos externos
```
POST /webhooks/traccar/positions   Authorization: Bearer <WEBHOOK_TOKEN>
POST /webhooks/traccar/events      Authorization: Bearer <WEBHOOK_TOKEN>
200 (publicado o enviado al dead-letter) · 401 · 503 (Traccar debe reintentar)
```
Env: `WEBHOOK_TOKEN` (secreto, obligatoria), `WEBHOOK_MAX_BODY_BYTES` (opcional).

## Preguntas abiertas
_Ninguna._ Q3 resuelta en ADR-0005 §2.
