---
id: 001-foundation
status: approved       # draft | approved | in-progress | done
requirements: [NFR4]
adrs: [ADR-0001, ADR-0002]
---

# 001 — Foundation: configuración, logging, errores y salud

## Problema
El servicio es hoy el starter de NestJS. Antes de cualquier operación sobre Traccar o NATS hace falta una base común: configuración validada al arranque, logs estructurados trazables por request (Phase 3, base de NFR4), un formato de error uniforme y un endpoint de salud para Docker. Sin esto, cada spec posterior reinventaría estas piezas.

## Alcance
- Incluye: carga y validación de configuración por entorno; logger estructurado con correlation ID; log de cada request HTTP; formato único de respuesta de error; `GET /health` (liveness); apagado ordenado; eliminar el endpoint de ejemplo del starter.
- **No incluye**: variables de Traccar, NATS o token del webhook (las añade cada spec que las usa); readiness contra Traccar/NATS; validación de DTOs de entrada; métricas/tracing; Dockerfile o docker-compose (Phase 4); autenticación de endpoints.

## Comportamiento (criterios de aceptación)

**Configuración**
- **AC-1** — CUANDO todas las variables de entorno requeridas son válidas, el sistema DEBE arrancar y escuchar en `PORT` (por defecto `3000`).
- **AC-2** — SI alguna variable falta o es inválida, ENTONCES el sistema DEBE terminar con código ≠ 0 antes de escuchar, informando el **nombre** de *todas* las variables erróneas (nunca sus valores).
- **AC-3** — El mecanismo de configuración DEBE permitir declarar variables requeridas sin valor por defecto (para secretos de specs futuros) y variables opcionales con default.

**Logging**
- **AC-4** — Cada línea de log DEBE ser un único objeto JSON en stdout con los campos obligatorios de ADR-0002 §4 (`time` ISO-8601, `level` como etiqueta, `service`, `context`, `msg`) y `correlationId` cuando se emite dentro de una request.
- **AC-5** — CUANDO una request trae el header `x-correlation-id`, el sistema DEBE usar ese valor en todos sus logs y devolverlo en el mismo header de la respuesta.
- **AC-6** — CUANDO una request no trae `x-correlation-id` o su valor no cumple ADR-0002 §1 (1-128 chars `[A-Za-z0-9._-]`), el sistema DEBE generar un UUID v4 y usarlo igual que en AC-5.
- **AC-7** — CUANDO termina una request HTTP, el sistema DEBE emitir un log con `req.method`, `req.url`, `res.statusCode`, `responseTime` y `correlationId`, con nivel `debug` para `/health`, `error` para 5xx, `warn` para 4xx e `info` en otro caso.
- **AC-15** — Los headers `authorization` y `cookie` de la request NO DEBEN aparecer en ningún log (ADR-0002 §4).
- **AC-8** — MIENTRAS `LOG_LEVEL` (`debug|info|warn|error`, defecto `info`) esté configurado, el sistema NO DEBE emitir logs de nivel inferior.

**Errores**
- **AC-9** — SI un caso de uso lanza un error de dominio con código conocido, ENTONCES la respuesta DEBE tener el status HTTP mapeado a ese código y cuerpo `{ code, message, correlationId }`.
- **AC-10** — SI ocurre un error no controlado, ENTONCES la respuesta DEBE ser `500` con `{ code: "INTERNAL_ERROR", message: "Internal server error", correlationId }`, sin stack ni detalles internos, y el error completo DEBE loguearse a nivel `error` con el mismo `correlationId`.
- **AC-11** — SI la ruta no existe, ENTONCES la respuesta DEBE ser `404` con el mismo formato de cuerpo (`code: "NOT_FOUND"`).

**Salud y ciclo de vida**
- **AC-12** — CUANDO se llama a `GET /health`, el sistema DEBE responder `200 { "status": "ok" }` sin autenticación y sin depender de servicios externos.
- **AC-13** — CUANDO el proceso recibe `SIGTERM`, el sistema DEBE dejar de aceptar conexiones nuevas, completar las requests en curso y terminar con código `0`.
- **AC-14** — El endpoint de ejemplo del starter (`GET /` → "Hello World") NO DEBE existir (responde según AC-11).

## Contratos externos
- Header `x-correlation-id` (entrada y salida, todas las rutas) — ADR-0002 §1.
- `GET /health` → `200 {"status":"ok"}`.
- Cuerpo de error y tabla code→status: ADR-0002 §3.
- Variables de entorno: `PORT` (opcional, entero 1-65535, def. 3000), `LOG_LEVEL` (opcional, def. `info`).

## Preguntas abiertas
_Ninguna._ Resueltas 2026-10-13:
1. Convenciones de correlación, salud y error → fijadas en **ADR-0002** (plataforma, aplica a los 5 servicios).
2. Logging → **nestjs-pino** (instalado).
