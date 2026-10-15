---
name: traccar-api
description: Reference and operational guide for Traccar 6.15.3 REST API. Covers authentication via API tokens, group and device endpoints, uniqueId conflict detection, IMEI retirement, and minimum service account permissions. Use when implementing Traccar HTTP client adapters, onboarding devices/groups, or validating Traccar API interactions.
---

# Traccar 6.15.3 API — Reference & Rules

Comportamiento real verificado contra una instancia activa de **Traccar 6.15.3**.
Contrato y respuestas observadas en [reference.md](./reference.md).
Decisiones arquitectónicas asociadas: [ADR-0005](../../../decisions/0005-traccar-integration.md).

## Disparadores (cuándo usar este skill)
- Implementación de adaptadores o clientes HTTP hacia Traccar (`TraccarHttpClient`).
- Creación, consulta o actualización de `Device` o `Group`.
- Manejo de unicidad de IMEI / `uniqueId` y detección de duplicados.
- Retiro de dispositivos por reuso de IMEI (`<imei>:retired:<deviceId>`).
- Configuración de credenciales y permisos mínimos del usuario de servicio.

## Reglas duras y trampas conocidas

1. **Nunca omitir `groupId` en `PUT /api/devices/{id}` (Regla dura FR3/NFR5)**:
   - Traccar deserializa el payload completo sobre la entidad Java. Si se omite `groupId`, Java lo inicializa en `0`, lo que desvincula el device de su group silenciosamente.
   - Todo `PUT` debe enviar el objeto completo preservando el `groupId` existente.
   - Si se omiten campos no nulables (como `name`), Traccar falla con `400 Bad Request` (`NULL not allowed for column "NAME"`).

2. **Detección de `uniqueId` duplicado (AC-8b)**:
   - Traccar **no** devuelve `409 Conflict`. Devuelve **`400 Bad Request`** con una violación de restricción en el cuerpo (`org.traccar.storage.StorageException: ... Unique index or primary key violation: ... TC_DEVICES(UNIQUEID ...)`).
   - El cliente debe inspeccionar el status `400` y el contenido del body para clasificar el error como colisión de `uniqueId`.

3. **Búsqueda de devices por `uniqueId`**:
   - `GET /api/devices?uniqueId=<imei>` devuelve un array JSON con los dispositivos coincidentes.
   - **Encuentra dispositivos deshabilitados**: si el device está deshabilitado (`disabled: true`), Traccar lo sigue devolviendo en la consulta por `uniqueId`.

4. **Device inexistente en `GET /api/devices/{id}`**:
   - Traccar **no** devuelve `404 Not Found`. Devuelve **`400 Bad Request`** con `java.lang.SecurityException: Device access denied` (evaluado por `PermissionsService`).

5. **Reuso de IMEI (ADR-0005 §4)**:
   - Para reusar un IMEI cuyo device previo está deshabilitado, se debe hacer `PUT /api/devices/{id}` cambiando el `uniqueId` a `<imei>:retired:<deviceId>` (manteniendo `groupId` y `disabled: true`).
   - Una vez retirado, el `uniqueId` original queda libre y permite crear un nuevo device mediante `POST /api/devices`.

6. **Códigos de éxito de creación**:
   - Tanto `POST /api/groups` como `POST /api/devices` responden con **`200 OK`** (no `201 Created`).

7. **Autenticación saliente**:
   - Se utiliza el header `Authorization: Bearer <TRACCAR_API_TOKEN>`.
   - Las peticiones sin header reciben `401 Unauthorized`.
   - Tokens con formato inválido o firma ilegible provocan `400 Bad Request` en el `TokenManager`/`CryptoManager` de Traccar.

## Permisos mínimos del usuario de servicio

El usuario de servicio para `traccar-adapter` debe configurarse con:
- **Rol estándar (no administrador)**: no requiere privilegios de admin.
- `readonly: false` (o `null`).
- `deviceReadonly: false` (o `null`).
- `limitCommands: false`.

Un usuario con estos permisos mínimos puede crear grupos (`POST /api/groups`), crear devices (`POST /api/devices`), consultarlos y actualizarlos (`PUT /api/devices/{id}`), quedando dichos recursos vinculados a su cuenta.
