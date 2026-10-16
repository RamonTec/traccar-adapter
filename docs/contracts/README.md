# Contratos de traccar-adapter

| Documento | Qué describe | Lo usan |
|-----------|--------------|---------|
| [`openapi.yaml`](openapi.yaml) (OpenAPI 3.1) | Comandos HTTP sobre groups y devices + health | api-core |
| [`asyncapi.yaml`](asyncapi.yaml) (AsyncAPI 3.0) | Eventos publicados en NATS JetStream | telemetry-service, realtime-gateway |

Ambos se verifican en CI contra el código: rutas, respuestas reales de los e2e y mensajes reales publicados en
JetStream (spec 016). Si el código cambia sin actualizar el contrato, el PR falla.

**traccar-adapter solo ejecuta comandos y publica eventos; no responde consultas.** Los datos de groups y devices
los consulta api-core en su propia base de datos; las posiciones, telemetry-service (historial) y realtime-gateway
(en vivo).

## 1. Integración de api-core (HTTP)

### Autenticación
Token de Keycloak por *client credentials* (realm `telemetry`), enviado como `Authorization: Bearer <token>`:
- `aud` debe incluir `traccar-adapter` (audience mapper del client llamante).
- Roles de client `traccar-adapter`: `groups:write` para `POST /groups`; `devices:write` para el resto.
- El `azp` del token queda como `actor` en la auditoría del adapter.
- Reutiliza el token hasta que expire; un `401` significa token inválido o caducado: pide otro y reintenta una vez.

Envía `x-correlation-id` con el id de la petición original de api-core para poder seguirla en los logs de ambos
servicios.

### Qué guardar en api-core
| Entidad de api-core | Campo a guardar | Viene de |
|---------------------|-----------------|----------|
| Group | `traccarGroupId` | `groupId` de `POST /groups` |
| Device (GPS) | `traccarDeviceId` | `deviceId` de `POST /devices` |

`deviceId` es también el que llega en cada evento de NATS (`data.deviceId`): es la clave para unir telemetría con
el device de api-core. El `name` del group es la clave externa que elige api-core (opaca, exacta, única).

### Flujos
**Crear group** (onboarding de un tenant)
1. api-core guarda el group en su BD como pendiente de sincronizar.
2. `POST /groups {"name": "<clave externa>"}` → `201` (creado) o `200` (ya existía: p.ej. un reintento).
3. Guarda `groupId` y marca el group como sincronizado.

**Registrar GPS**
1. api-core valida el IMEI (regla de negocio suya) y guarda el device como pendiente.
2. `POST /devices {"uniqueId": "<IMEI 15 dígitos>", "name": "...", "groupId": <traccarGroupId>}`.
3. `201` o `200` → guarda `deviceId`. Si el IMEI pertenecía a un device **deshabilitado**, el adapter lo retira y
   crea uno nuevo (`201`, `deviceId` distinto): el device viejo de api-core debe quedar como retirado.
4. `409 DEVICE_ALREADY_REGISTERED` → el IMEI está activo en otro group. Hay que deshabilitar ese device primero;
   un device **nunca** se mueve de group.

**Deshabilitar / habilitar GPS**
1. api-core cambia el estado en su BD como pendiente.
2. `POST /devices/{traccarDeviceId}/disable` (o `/enable`) sin body → `200 {deviceId, disabled}`.
3. Repetir el comando sobre un device que ya está en ese estado devuelve `200` sin cambios.
4. `409 DEVICE_RETIRED` → ese device fue retirado por reuso de IMEI y ya no puede cambiar de estado.

### Reintentos y consistencia (NFR1, NFR3)
Todos los comandos son **idempotentes** (`x-idempotent: true`): repetir la misma petición nunca duplica nada en
Traccar. Con eso api-core puede mantener su estado alineado con Traccar con un patrón simple:

- Guarda la intención en su BD **antes** de llamar (estado `pending`) y la confirma con la respuesta.
- Si la llamada no tiene respuesta (timeout, red) o devuelve una respuesta con `x-retryable: true` (`503`, `500`),
  **reintenta la misma petición** con backoff exponencial (p.ej. 1 s → 30 s) y, si sigue fallando, deja el registro
  en `pending` para un proceso de reintento posterior.
- Si la respuesta es `x-retryable: false` (`400`, `403`, `404`, `409`), no reintentes: es un error de datos o de
  estado que requiere otra acción (corregir la petición, deshabilitar antes, conciliar a mano).

| Código | `code` | Reintentar | Acción en api-core |
|--------|--------|------------|--------------------|
| 400 | `VALIDATION_ERROR` | No | Bug o dato inválido: revisar `details` |
| 401 | `UNAUTHORIZED` | Una vez, con token nuevo | Renovar token |
| 403 | `FORBIDDEN` | No | Configuración de roles del client en Keycloak |
| 404 | `GROUP_NOT_FOUND` / `DEVICE_NOT_FOUND` | No | Conciliar: el id guardado no existe en Traccar |
| 409 | `GROUP_NAME_AMBIGUOUS` | No | Conciliación manual en Traccar (grupos duplicados creados fuera del adapter) |
| 409 | `DEVICE_ALREADY_REGISTERED` | No | Deshabilitar el device del otro group primero |
| 409 | `DEVICE_RETIRED` | No | Marcar el device como retirado |
| 500 | `INTERNAL_ERROR` | Sí, con backoff | Reportar si persiste |
| 503 | `UPSTREAM_UNAVAILABLE` | Sí, con backoff | Traccar caído o lento |

Ramifica siempre por `code`, nunca por `message`.

### Lo que no existe (a propósito)
- Mover un device a otro group (FR3/NFR5): el IMEI se registra de nuevo en el group nuevo.
- Borrar groups o devices: se deshabilitan; el historial se conserva.
- Editar nombre u otros atributos: si api-core lo necesita, se pide como spec nuevo en este servicio.

## 2. Consumidores de eventos (NATS JetStream)
- Subjects: `telemetry.events.position`, `telemetry.events.device-event` (stream `TELEMETRY_EVENTS`) y
  `telemetry.deadletter.traccar` (stream `TELEMETRY_DEADLETTER`).
- Usa un **consumer durable** propio por servicio para no perder mensajes mientras estás caído (dentro de la
  retención: 7 días eventos, 30 dead-letters).
- **Deduplica por `id`**: la entrega es *al menos una vez*.
- El orden por device se mantiene; usa `occurredAt` / `data.fixTime` como tiempo de negocio.
- Ignora campos desconocidos y filtra por `version` (hoy `1`).
- `data.attributes` llega tal como lo envía Traccar: sus claves dependen del modelo de GPS.

## 3. Versiones y cambios
Cada documento tiene `info.version` con versionado semántico, independiente del otro:

| Cambio | Ejemplo | Versión |
|--------|---------|---------|
| **Incompatible** | quitar o renombrar un endpoint, campo o subject; hacer obligatorio un campo de la petición; cambiar un tipo, un código de error o un status de éxito; cambiar el significado de un campo | **mayor** (`2.0.0`) |
| Compatible | endpoint, campo opcional, código de error o subject nuevos; nuevas claves en `attributes` | menor (`1.1.0`) |
| Solo documentación | descripciones, ejemplos | parche (`1.0.1`) |

- Un cambio incompatible requiere un spec que lo justifique y avisar a los consumidores antes de mergearlo.
- En eventos, además, el mensaje pasa a `version: 2` y se sigue publicando `version: 1` durante la migración
  (ADR-0004).
- Los consumidores fijan la versión que usan referenciando el contrato en un tag o commit de este repo.

## 4. Historial
| Versión | Documento | Cambio |
|---------|-----------|--------|
| 1.0.0 | openapi.yaml | Versión inicial: `POST /groups`, `POST /devices`, `disable`/`enable`, health |
| 1.0.0 | asyncapi.yaml | Versión inicial: position, device-event, dead-letter |
