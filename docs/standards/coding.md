# Estándar: Código

## TypeScript

- `strict`. Prohibido `any` en `domain`/`application`; en `infrastructure` solo en el borde (payload crudo) y se convierte de inmediato a `unknown` + validación.
- ESM: imports relativos con extensión `.js`.
- `readonly` por defecto en propiedades de entidades/VO. Sin setters; cambios de estado vía métodos con nombre de negocio (`device.disable()`).
- Sin `export default`. Un concepto público por archivo.
- Sin comentarios que repitan el código; solo el *por qué* cuando no es obvio.

## Nombres

- Código, identificadores y mensajes de log/errores: **inglés**. Documentación SDD: español.
- Clases `PascalCase`, archivos `kebab-case.<rol>.ts` (ver tabla en `architecture.md`).
- Vocabulario de Traccar: `Device`, `Group`, `Position`, `Event`. Prohibido `vehicle`, `tenant` en este servicio.

## Errores

- Dominio/aplicación lanzan errores tipados que extienden `DomainError` (`shared/domain/errors.ts`), con `code` estable (`DEVICE_NOT_FOUND`).
- Errores de Traccar se traducen en el adapter a errores de aplicación (`TraccarUnavailableError`, etc.); nunca se filtra un error de HTTP client hacia el use case.
- El mapeo error → HTTP status vive en un único exception filter en `shared/infrastructure`.

## Validación

- Entrada HTTP: DTO validado en el borde con **zod**; errores → `400 VALIDATION_ERROR` con `details` (ADR-0002 §3).
- Invariantes de negocio: en el constructor/factory de la entidad o VO (`Imei.create(raw)`), no en el controller.

## Logging (NFR4, Phase 3)

- Logger: `nestjs-pino`, formato y campos según **ADR-0002 §4** (JSON, `correlationId` en cada línea).
- Obligatorio loguear: cada comando a Traccar (op, ids, resultado, duración), cada webhook recibido, cada publish a `telemetry.events` / `telemetry.deadletter`.
- Nunca loguear tokens ni headers de auth.
- El log **no** es mecanismo de entrega: un payload fallido va al deadletter, no solo al log.

### Niveles

| Nivel | Cuándo |
|-------|--------|
| `error` | Fallo inesperado que alguien debe mirar (bug, 5xx no mapeado, error no manejado). |
| `warn` | Anómalo pero esperado o recuperable: rechazo de negocio (409), upstream caído (503), reintento. |
| `info` | Hecho de negocio completado (group creado, device registrado). |
| `debug` | Detalle de diagnóstico; nunca necesario en producción. |

### Auditoría de operaciones

Cada operación de escritura expuesta (p.ej. `POST /groups`) emite **exactamente una** línea de auditoría por petición válida, haya éxito o fallo. Responde a *quién, qué, con qué resultado y cuánto tardó* (OWASP Logging Cheat Sheet). Los campos de ADR-0002 §4 (`time`, `level`, `service`, `context`, `correlationId`) los pone el logger; además:

| Campo | Contenido | Equivalente ECS / OpenTelemetry |
|-------|-----------|------------------|
| `msg` | igual a `op` (ADR-0002 exige `msg`) | `message` |
| `op` | `<recurso>.<acción>` en inglés: `group.create`, `device.register` | `event.action` |
| `actor` | `azp`/`sub` del token (lo fija el guard) | `user.id` / `enduser.id` |
| `result` | enum por operación: éxitos (`created`, `existing`…), rechazos de negocio con nombre propio (`ambiguous`…) y `failed` para cualquier otro error | `event.outcome` + detalle |
| `durationMs` | entero, ms | `event.duration` (ECS lo pide en ns) |
| ids de negocio | `name`, `groupId`, `deviceId`… solo los que existan (sin `null`/`undefined`) | — |

- Nivel: `info` si `result` es un éxito, `warn` si es un rechazo o `failed`. Los `error` los emite el exception filter, no la auditoría.
- La línea de auditoría no sustituye al log de request de pino-http ni al de cada comando a Traccar; son eventos distintos.
- Prohibido incluir tokens, headers o el body completo; solo los campos de la tabla.
- Ubicación: es responsabilidad del adaptador de entrada (necesita `actor`, que es un concepto de transporte), **no** del use case. Objetivo: un interceptor transversal (`@Audit('<op>')`) para no repetir `try/finally` en cada controller. Hasta que exista, el controller lo hace con `try/finally` y relanza el error sin tocarlo.

## Configuración

- Toda config por variables de entorno, validadas al arranque (fail fast). Sin valores por defecto para secretos.
