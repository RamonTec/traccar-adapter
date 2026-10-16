---
id: 016-published-contracts
status: approved       # draft | approved | in-progress | done
requirements: [FR1, FR2, FR3, FR4, FR9, FR10, NFR1, NFR3]
adrs: [0002, 0003, 0004, 0005, 0007]
---

# 016 — Contratos publicados (HTTP y eventos)

## Problema
Los contratos del servicio están repartidos entre specs, ADRs y código. api-core necesita llamar a los comandos de
groups y devices (FR1–FR4) y mantener su estado consistente con Traccar (NFR1); telemetry-service y
realtime-gateway necesitan consumir los eventos de JetStream (FR9, FR10). Sin un contrato publicado y verificado,
cada consumidor tendría que leer el código del adapter, y un cambio en él podría romperlos sin que nadie lo note.

## Alcance
- Incluye:
  - Un documento **OpenAPI 3.1** con la API que pueden llamar otros servicios: `POST /groups`, `POST /devices`,
    `POST /devices/{deviceId}/disable`, `POST /devices/{deviceId}/enable`, `GET /health`, `GET /health/ready`.
  - Un documento **AsyncAPI 3** con lo que el servicio publica en JetStream: subjects, mensajes, headers y garantías.
  - Una guía de integración para consumidores (flujos de api-core, idempotencia, reintentos, errores).
  - Tests que fallen si el código y los contratos dejan de coincidir.
- **No incluye**:
  - Los webhooks de Traccar (`/webhooks/traccar/*`): son internos entre Traccar y el adapter
    (`docs/ops/traccar-config.md`).
  - Endpoints nuevos (consultas, edición, borrado). Las consultas de groups/devices son de api-core y las de
    posiciones de telemetry-service (planning); si hacen falta comandos nuevos, serán specs propios.
  - Generar clientes para los consumidores ni publicar los contratos como página web o paquete.
  - Cambiar el comportamiento observable de ningún endpoint ni evento.

## Comportamiento (criterios de aceptación)
- **AC-1** — El OpenAPI DEBE describir cada endpoint del alcance con: body de petición, respuestas por código de
  estado (éxito y cada error que el endpoint puede devolver) con el formato de error de ADR-0002, y la autenticación
  requerida (token Bearer de Keycloak, audiencia y rol por operación; `/health*` públicos).
- **AC-2** — El OpenAPI DEBE indicar para cada comando si es idempotente y qué respuestas son reintentables
  (p.ej. `503`) y cuáles definitivas (p.ej. conflicto o device retirado).
- **AC-3** — El AsyncAPI DEBE describir los subjects `telemetry.events.position`, `telemetry.events.device-event` y
  `telemetry.deadletter.traccar`: esquema de cada mensaje, headers (`Nats-Msg-Id`, `x-correlation-id`), streams,
  retención, ventana de deduplicación, regla de versionado y garantías de entrega (al menos una vez; duplicados
  posibles fuera de la ventana; orden por device).
- **AC-4** — Ambos documentos DEBEN ser válidos según su especificación; un documento inválido DEBE hacer fallar
  `pnpm check`.
- **AC-5** — SI el servicio expone una ruta (fuera de los webhooks) que no está en el OpenAPI, o el OpenAPI describe
  una que no existe, ENTONCES `pnpm check` DEBE fallar.
- **AC-6** — Las respuestas que producen las suites e2e para los endpoints del alcance DEBEN cumplir el esquema del
  OpenAPI para su ruta y código de estado; SI no lo cumplen, ENTONCES la suite DEBE fallar.
- **AC-7** — Los eventos y dead-letters que publican las suites e2e DEBEN cumplir el esquema del AsyncAPI para su
  subject; SI no lo cumplen, ENTONCES la suite DEBE fallar.
- **AC-8** — Cada documento DEBE tener una versión. La guía DEBE definir qué es un cambio incompatible y cómo se
  publica (nueva versión del documento; en eventos, además, nuevo `version` del mensaje según ADR-0004).
- **AC-9** — La guía de integración DEBE describir los flujos de api-core (crear group, registrar device,
  deshabilitar/habilitar, reuso de IMEI), qué ids debe guardar api-core y cómo reintentar sin duplicar (NFR1, NFR3).

## Contratos externos
- Nuevos archivos publicados: `docs/contracts/openapi.yaml`, `docs/contracts/asyncapi.yaml` y la guía de
  integración. Son la referencia para api-core, telemetry-service y realtime-gateway.
- Sin cambios en endpoints, eventos ni configuración.

## Preguntas abiertas
_Ninguna._
