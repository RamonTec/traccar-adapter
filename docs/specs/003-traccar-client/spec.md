---
id: 003-traccar-client
status: draft          # draft | approved | in-progress | done
requirements: [NFR4]
adrs: [ADR-0002, ADR-0005]
---

# 003 — Traccar client: acceso autenticado y resiliente a la API de Traccar

## Problema
Las operaciones de groups y devices dependen de la API REST de Traccar 6.15.3. Hace falta una base común de autenticación, timeouts, traducción de errores, trazabilidad y readiness. También hace falta validar empíricamente los endpoints antes de diseñar sobre ellos.

## Alcance
- Incluye: autenticación con Bearer token (ADR-0005 §1); timeout; traducción de errores de transporte y HTTP; log por llamada; propagación de `x-correlation-id`; `GET /health/ready` con el check de Traccar; **verificación empírica** de los endpoints que usarán 004-006 y su registro en el skill `traccar-api`.
- **No incluye**: operaciones de negocio (004-006); reintentos automáticos (los reintentos son responsabilidad del llamante y son seguros porque las operaciones son idempotentes, ADR-0005 §3).

## Comportamiento (criterios de aceptación)
- **AC-1** — Toda llamada a Traccar DEBE ir a `TRACCAR_BASE_URL` con `Authorization: Bearer <TRACCAR_API_TOKEN>`. Ambas variables son obligatorias al arrancar.
- **AC-2** — SI Traccar no responde en `TRACCAR_TIMEOUT_MS` (por defecto 5000), rechaza la conexión o devuelve 5xx, ENTONCES la operación DEBE fallar como "Traccar no disponible", y el endpoint que la originó responde `503 UPSTREAM_UNAVAILABLE`.
- **AC-3** — SI Traccar responde 401/403, ENTONCES el sistema DEBE loguear `error` "Traccar credentials rejected" y responder al llamante `503 UPSTREAM_UNAVAILABLE`, nunca 401/403: las credenciales del llamante son válidas.
- **AC-4** — Cualquier otro 4xx de Traccar DEBE quedar disponible para la capa que lo interpreta, con status y mensaje, y **no** debe exponerse tal cual al llamante.
- **AC-5** — Cada llamada DEBE loguearse con la operación, el método, la ruta, el status, `durationMs` y `correlationId`. El token nunca aparece.
- **AC-6** — Cada llamada saliente DEBE llevar el `x-correlation-id` de la request en curso (ADR-0002 §1).
- **AC-7** — CUANDO se llama a `GET /health/ready`, el sistema DEBE consultar Traccar (`GET /api/server`) y responder `200 {"status":"ok","checks":{"traccar":"ok"}}`, o `503` con `"traccar":"error"`.
- **AC-8** — El skill `traccar-api` DEBE documentar, **con respuestas reales capturadas de 6.15.3**, los endpoints, payloads y errores de: crear y listar groups, crear, buscar por `uniqueId`, obtener y actualizar devices, y `GET /api/server`. Debe incluir cómo responde Traccar ante un `uniqueId` duplicado.

## Contratos externos
- Env: `TRACCAR_BASE_URL`, `TRACCAR_API_TOKEN` (secreto), `TRACCAR_TIMEOUT_MS` (opcional).
- `GET /health/ready` (ADR-0002 §2).

## Preguntas abiertas
1. Qué permisos mínimos necesita el usuario de servicio en Traccar (¿admin, o un manager con límite de devices?). *Se determina en la verificación de AC-8.*
