# Traccar 6.15.3 API Reference — Observed Contract

- **Fecha de verificación**: 2026-10-15
- **Versión de Traccar probada**: 6.15.3 (Jetty 12.1.12, H2 / DatabaseStorage)
- **Modo de autenticación**: `Authorization: Bearer <token>`

---

## Matriz de verificación (11 llamadas)

| # | Operación | Método y Endpoint | Status observado | Resultado clave |
|---|-----------|-------------------|------------------|-----------------|
| 1 | Server status | `GET /api/server` | `200 OK` | Devuelve metadatos del servidor y versión `"6.15.3"`. |
| 2 | Crear group | `POST /api/groups` | `200 OK` | Devuelve el objeto grupo con `id` asignado y `groupId: 0`. Código 200 (no 201). |
| 3 | Listar groups | `GET /api/groups` | `200 OK` | Array JSON de grupos. Filtra por grupos accesibles al usuario. |
| 4 | Crear device | `POST /api/devices` | `200 OK` | Devuelve el device creado con `status: "offline"`, `disabled: false`. Código 200 (no 201). |
| 5 | Device con `uniqueId` duplicado | `POST /api/devices` | `400 Bad Request` | Devuelve error 400 (no 409) con `StorageException` / `Unique index or primary key violation` en `UNIQUEID`. |
| 6 | Buscar device por `uniqueId` | `GET /api/devices?uniqueId=<x>` | `200 OK` | Array JSON de devices. **Sí encuentra devices deshabilitados** (`disabled: true`). |
| 7 | Device inexistente por ID | `GET /api/devices/{id}` | `400 Bad Request` | Devuelve error 400 (no 404) con `SecurityException: Device access denied`. |
| 8 | Modificar device (`disabled:true`) | `PUT /api/devices/{id}` | `200 OK` / `400 Bad Request` | **Exige el objeto completo**. Omitir `name` da error 400. Omitir `groupId` resetea a `groupId: 0`. |
| 9 | Reusar IMEI (renombrar uniqueId deshabilitado) | `PUT /api/devices/{id}` | `200 OK` | Permite cambiar `uniqueId` a `<imei>:retired:<deviceId>`. Tras esto, se puede registrar un nuevo device con el IMEI liberado. |
| 10 | Token inválido o ausente | `GET /api/session` o endpoints protegidos | `401 Unauthorized` / `400 Bad Request` | Sin token: `401 Unauthorized`. Token con formato inválido: `400 Bad Request` en `TokenManager.decodeToken`. |
| 11 | Permisos no-admin | `POST /api/groups` y `POST /api/devices` | `200 OK` | Un usuario estándar (no-admin) puede crear groups y devices sin requerir privilegios de administrador. |

---

## Detalle de llamadas observadas

### 1. `GET /api/server`

#### Request
```http
GET /api/server HTTP/1.1
Host: localhost:8082
Authorization: Bearer <TRACCAR_API_TOKEN>
Accept: application/json
```

#### Response
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "id": 1,
  "attributes": {},
  "registration": false,
  "readonly": false,
  "deviceReadonly": false,
  "map": null,
  "bingKey": null,
  "mapUrl": null,
  "overlayUrl": null,
  "latitude": 0.0,
  "longitude": 0.0,
  "zoom": 0,
  "forceSettings": false,
  "coordinateFormat": null,
  "limitCommands": false,
  "disableReports": false,
  "fixedEmail": false,
  "poiLayer": null,
  "announcement": null,
  "emailEnabled": false,
  "geocoderEnabled": true,
  "textEnabled": false,
  "storageSpace": null,
  "newServer": false,
  "openIdEnabled": false,
  "openIdForce": false,
  "version": "6.15.3"
}
```

---

### 2. `POST /api/groups`

#### Request
```http
POST /api/groups HTTP/1.1
Host: localhost:8082
Authorization: Bearer <TRACCAR_API_TOKEN>
Content-Type: application/json

{
  "name": "sample-group-1"
}
```

#### Response
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "id": 2,
  "attributes": {},
  "groupId": 0,
  "name": "sample-group-1"
}
```
*Nota: Traccar responde `200 OK` al crear recursos, no `201 Created`.*

---

### 3. `GET /api/groups`

#### Request
```http
GET /api/groups HTTP/1.1
Host: localhost:8082
Authorization: Bearer <TRACCAR_API_TOKEN>
```

#### Response
```http
HTTP/1.1 200 OK
Content-Type: application/json

[
  {
    "id": 2,
    "attributes": {},
    "groupId": 0,
    "name": "sample-group-1"
  }
]
```
*Forma: Array JSON de objetos Group. Filtra por los grupos a los que el usuario tiene acceso o que fueron creados por él.*

---

### 4. `POST /api/devices`

#### Request
```http
POST /api/devices HTTP/1.1
Host: localhost:8082
Authorization: Bearer <TRACCAR_API_TOKEN>
Content-Type: application/json

{
  "name": "sample-dev-1",
  "uniqueId": "123456789012345",
  "groupId": 2
}
```

#### Response
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "id": 18,
  "attributes": {},
  "groupId": 2,
  "calendarId": 0,
  "name": "sample-dev-1",
  "uniqueId": "123456789012345",
  "status": "offline",
  "lastUpdate": null,
  "positionId": 0,
  "phone": null,
  "model": null,
  "contact": null,
  "category": null,
  "disabled": false,
  "expirationTime": null
}
```

---

### 5. `POST /api/devices` con el mismo `uniqueId` (Duplicado)

#### Request
```http
POST /api/devices HTTP/1.1
Host: localhost:8082
Authorization: Bearer <TRACCAR_API_TOKEN>
Content-Type: application/json

{
  "name": "sample-dev-duplicate",
  "uniqueId": "123456789012345",
  "groupId": 2
}
```

#### Response
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

org.traccar.storage.StorageException: org.h2.jdbc.JdbcSQLIntegrityConstraintViolationException: Unique index or primary key violation: "PUBLIC.CONSTRAINT_A INDEX PUBLIC.CONSTRAINT_A_INDEX_6 ON PUBLIC.TC_DEVICES(UNIQUEID NULLS FIRST) VALUES ( /* 18 */ '123456789012345' )"; SQL statement:
INSERT INTO tc_devices(groupId, contact, model, disabled, calendarId, phone, expirationTime, name, attributes, category, uniqueId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) [23505-240]
	at org.traccar.storage.DatabaseStorage.addObject(DatabaseStorage.java:113)
...
```

#### Detección de duplicado (AC-8b)
- Traccar **no** devuelve `409 Conflict`.
- Código HTTP: **`400 Bad Request`**.
- Mensaje: texto plano en el cuerpo que contiene `Unique index or primary key violation` y `TC_DEVICES(UNIQUEID ...)` o `StorageException`.
- Criterio de parsing: cuando el status sea `400` y el cuerpo contenga `UNIQUEID` o `Unique index or primary key violation`, debe interpretarse como colisión de identificador único (`uniqueId`).

---

### 6. `GET /api/devices?uniqueId=<x>`

#### Request
```http
GET /api/devices?uniqueId=123456789012345 HTTP/1.1
Host: localhost:8082
Authorization: Bearer <TRACCAR_API_TOKEN>
```

#### Response (cuando el device está deshabilitado `disabled: true`)
```http
HTTP/1.1 200 OK
Content-Type: application/json

[
  {
    "id": 18,
    "attributes": {},
    "groupId": 2,
    "calendarId": 0,
    "name": "sample-dev-1",
    "uniqueId": "123456789012345",
    "status": "offline",
    "lastUpdate": null,
    "positionId": 0,
    "phone": null,
    "model": null,
    "contact": null,
    "category": null,
    "disabled": true,
    "expirationTime": null
  }
]
```
*Comportamiento: `GET /api/devices?uniqueId=<x>` **sí encuentra** dispositivos deshabilitados (`disabled: true`).*

---

### 7. `GET /api/devices/{id}` (No existente)

#### Request
```http
GET /api/devices/999999 HTTP/1.1
Host: localhost:8082
Authorization: Bearer <TRACCAR_API_TOKEN>
```

#### Response
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

java.lang.SecurityException: Device access denied
	at org.traccar.api.security.PermissionsService.checkPermission(PermissionsService.java:224)
	at org.traccar.api.BaseObjectResource.getSingle(BaseObjectResource.java:68)
...
```
*Nota: Traccar responde `400 Bad Request` (no `404 Not Found`) con `SecurityException: Device access denied` ante IDs no encontrados o inaccesibles.*

---

### 8. `PUT /api/devices/{id}` (Exigencia de objeto completo y `groupId`)

#### Caso A: PUT parcial sin `name`
```http
PUT /api/devices/18 HTTP/1.1
Host: localhost:8082
Authorization: Bearer <TRACCAR_API_TOKEN>
Content-Type: application/json

{
  "id": 18,
  "disabled": true
}
```
**Respuesta:** `400 Bad Request`
```text
org.traccar.storage.StorageException: org.h2.jdbc.JdbcSQLIntegrityConstraintViolationException: NULL not allowed for column "NAME"; SQL statement:
UPDATE tc_devices SET groupId = ?, contact = ?, model = ?, disabled = ?, calendarId = ?, phone = ?, expirationTime = ?, name = ?, attributes = ?, category = ?, uniqueId = ? WHERE id = ?
```

#### Caso B: PUT sin `groupId` (Peligro crítico de pérdida de grupo)
```http
PUT /api/devices/18 HTTP/1.1
Host: localhost:8082
Authorization: Bearer <TRACCAR_API_TOKEN>
Content-Type: application/json

{
  "id": 18,
  "name": "sample-dev-1",
  "uniqueId": "123456789012345",
  "disabled": true
}
```
**Respuesta:** `200 OK`
```json
{
  "id": 18,
  "attributes": {},
  "groupId": 0,
  "name": "sample-dev-1",
  "uniqueId": "123456789012345",
  "disabled": true
}
```
*Al omitirse `groupId`, Traccar asigna `0` en la entidad Java y lo persiste, **desvinculando el device del grupo**.*

#### Caso C: PUT con objeto completo (Comportamiento correcto)
```http
PUT /api/devices/18 HTTP/1.1
Host: localhost:8082
Authorization: Bearer <TRACCAR_API_TOKEN>
Content-Type: application/json

{
  "id": 18,
  "name": "sample-dev-1",
  "uniqueId": "123456789012345",
  "groupId": 2,
  "disabled": true
}
```
**Respuesta:** `200 OK`
```json
{
  "id": 18,
  "attributes": {},
  "groupId": 2,
  "calendarId": 0,
  "name": "sample-dev-1",
  "uniqueId": "123456789012345",
  "status": "offline",
  "lastUpdate": null,
  "positionId": 0,
  "phone": null,
  "model": null,
  "contact": null,
  "category": null,
  "disabled": true,
  "expirationTime": null
}
```

---

### 9. `PUT /api/devices/{id}` renombrando `uniqueId` (Reuso de IMEI)

#### Request
```http
PUT /api/devices/18 HTTP/1.1
Host: localhost:8082
Authorization: Bearer <TRACCAR_API_TOKEN>
Content-Type: application/json

{
  "id": 18,
  "name": "sample-dev-1",
  "uniqueId": "123456789012345:retired:18",
  "groupId": 2,
  "disabled": true
}
```

#### Response
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "id": 18,
  "attributes": {},
  "groupId": 2,
  "calendarId": 0,
  "name": "sample-dev-1",
  "uniqueId": "123456789012345:retired:18",
  "status": "offline",
  "lastUpdate": null,
  "positionId": 0,
  "phone": null,
  "model": null,
  "contact": null,
  "category": null,
  "disabled": true,
  "expirationTime": null
}
```
*Comportamiento: Traccar permite cambiar el `uniqueId` del device deshabilitado. A continuación, una llamada `POST /api/devices` con el `uniqueId: "123456789012345"` original resulta exitosa (`200 OK`), confirmando la estrategia de retiro y reuso de IMEI de ADR-0005 §4.*

---

### 10. Token inválido o ausente

#### Caso A: Sin header de autorización
```http
GET /api/groups HTTP/1.1
Host: localhost:8082
```
**Respuesta:** `401 Unauthorized`
```text
jakarta.ws.rs.WebApplicationException: HTTP 401 Unauthorized
	at org.traccar.api.security.SecurityRequestFilter.filter(SecurityRequestFilter.java:122)
```

#### Caso B: Con token malformado o de firma inválida
```http
GET /api/session HTTP/1.1
Host: localhost:8082
Authorization: Bearer invalid-token-xyz
```
**Respuesta:** `400 Bad Request`
```text
java.lang.ArrayIndexOutOfBoundsException / NegativeArraySizeException
	at org.traccar.api.signature.CryptoManager.verify(CryptoManager.java:66)
	at org.traccar.api.signature.TokenManager.decodeToken(TokenManager.java:107)
```

---

### 11. Permisos con usuario de servicio (no-admin)

#### Pruebas ejecutadas
- Con un usuario estándar no administrador (`admin: false`):
  1. `POST /api/groups`: `200 OK` (Grupo creado satisfactoriamente).
  2. `POST /api/devices`: `200 OK` (Device creado satisfactoriamente).
  3. `GET /api/permissions`: `400 Bad Request` (`java.lang.SecurityException: Administrator access required`).
  4. `GET /api/users`: `200 OK` (`[]` array vacío, no puede listar otros usuarios).

#### Conclusión de permisos mínimos
- **No se requiere rol de administrador**.
- Permisos requeridos para el usuario de servicio:
  - Cuenta activa.
  - `readonly: false` (o `null`).
  - `deviceReadonly: false` (o `null`).
  - `limitCommands: false`.
