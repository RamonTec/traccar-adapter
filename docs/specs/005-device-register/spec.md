---
id: 005-device-register
status: approved       # draft | approved | in-progress | done
requirements: [FR2, FR3, NFR3, NFR4, NFR5]
adrs: [ADR-0002, ADR-0003, ADR-0005]
---

# 005 — Device register: registrar un device en un group de Traccar

## Problema
core-service registra un GPS (IMEI) bajo el group de un cliente (FR2). El registro tiene que ser seguro ante reintentos (NFR3) y no puede mover nunca un device entre groups (FR3/NFR5). Además, debe permitir reusar el IMEI de un device dado de baja aunque Traccar exija que `uniqueId` sea único (ADR-0005 §4).

## Alcance
- Incluye: `POST /devices` con *get-or-create* por `uniqueId`, retiro del device viejo deshabilitado y la garantía estructural de que ninguna ruta cambia el `groupId`.
- **No incluye**: validar la unicidad del IMEI a nivel de negocio (es de core-service), renombrar, borrar ni consultar devices.

## Comportamiento (criterios de aceptación)
- **AC-1** — CUANDO no existe ningún device con ese `uniqueId`, el sistema DEBE crearlo habilitado en `groupId` y responder `201 {"deviceId", "uniqueId", "groupId"}`.
- **AC-2** — CUANDO existe un device **habilitado** con ese `uniqueId` en el **mismo** `groupId`, el sistema NO DEBE escribir en Traccar y DEBE responder `200` con ese device.
- **AC-3** — SI existe un device **habilitado** con ese `uniqueId` en **otro** group, ENTONCES `409 DEVICE_ALREADY_REGISTERED`, sin modificar ese device.
- **AC-4** — CUANDO existe un device **deshabilitado** con ese `uniqueId` (en cualquier group), el sistema DEBE:
  1. renombrar su `uniqueId` a `<uniqueId>:retired:<deviceId>`, sin cambiar su group ni su estado;
  2. crear el nuevo device;
  3. responder `201` con un `deviceId` distinto del viejo.
- **AC-5** — SI el retiro se completa pero la creación falla, ENTONCES `503`, y un reintento DEBE terminar en AC-1.
- **AC-6** — SI `groupId` no existe en Traccar, ENTONCES `404 GROUP_NOT_FOUND`.
- **AC-7** — SI el body no es válido, ENTONCES `400 VALIDATION_ERROR` con `details`. Son inválidos: `uniqueId` que no tenga exactamente 15 dígitos, `name` vacío o de más de 128 caracteres, `groupId` que no sea un entero positivo, o campos no declarados.
- **AC-8** — SI Traccar no está disponible, ENTONCES `503 UPSTREAM_UNAVAILABLE`.
- **AC-9** — El endpoint exige el rol `devices:write`.
- **AC-10** — Cada ejecución DEBE loguear `op: "device.register"`, `actor`, `uniqueId`, `groupId`, `deviceId`, `retiredDeviceId` (si aplica) y `result` (`created|existing|retired-and-created|conflict|failed`).
- **AC-11** — (FR3/NFR5) Un test estructural DEBE comprobar que las rutas registradas son exactamente las de una lista permitida, y que ningún port ni use case expone una operación que reciba un `groupId` nuevo para un device existente.

## Contratos externos
```
POST /devices           Authorization: Bearer <jwt con devices:write>
{ "uniqueId": "15 dígitos", "name": "string 1..128", "groupId": number }
201|200 { "deviceId": number, "uniqueId": string, "groupId": number }
400 · 401 · 403 · 404 GROUP_NOT_FOUND · 409 DEVICE_ALREADY_REGISTERED · 503
```

## Preguntas abiertas
_Ninguna._ Resueltas 2026-10-14:
1. `uniqueId` = IMEI de exactamente 15 dígitos en v1. Otros identificadores requerirán un spec nuevo.
