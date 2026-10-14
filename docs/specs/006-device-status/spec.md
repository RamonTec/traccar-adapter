---
id: 006-device-status
status: draft          # draft | approved | in-progress | done
requirements: [FR3, FR4, NFR1, NFR4]
adrs: [ADR-0002, ADR-0003, ADR-0005]
---

# 006 — Device status: deshabilitar y rehabilitar devices

## Problema
Cuando core-service da de baja o reactiva un device, el flujo de datos tiene que cortarse o reanudarse en origen (FR4). La operación debe ser idempotente para que core-service pueda reintentarla hasta que el estado sea consistente (NFR1).

## Alcance
- Incluye: `POST /devices/{deviceId}/disable` y `/enable`, idempotentes; no permitir rehabilitar devices retirados.
- **No incluye**: la cola de reintentos y alertas de core-service (la otra mitad de NFR1, que va a su backlog); borrar devices.

## Comportamiento (criterios de aceptación)
- **AC-1** — CUANDO se deshabilita un device habilitado, el sistema DEBE marcarlo `disabled` en Traccar y responder `200 {"deviceId", "disabled": true}`.
- **AC-2** — CUANDO se deshabilita un device ya deshabilitado, el sistema NO DEBE escribir en Traccar y DEBE responder `200` con el mismo cuerpo.
- **AC-3** — CUANDO se habilita un device deshabilitado y no retirado, el sistema DEBE habilitarlo y responder `200 {"disabled": false}`.
- **AC-4** — CUANDO se habilita un device ya habilitado, `200` sin escribir en Traccar.
- **AC-5** — SI el device está retirado (su `uniqueId` contiene `:retired:`), ENTONCES `enable` DEBE responder `409 DEVICE_RETIRED`. `disable` responde según AC-2.
- **AC-6** — SI el `deviceId` no existe, ENTONCES `404 DEVICE_NOT_FOUND`. SI no es un entero positivo, ENTONCES `400 VALIDATION_ERROR`.
- **AC-7** — Al actualizar, el sistema DEBE conservar sin cambios el resto de atributos del device en Traccar (`name`, `uniqueId`, **`groupId`**, `attributes`).
- **AC-8** — SI Traccar no está disponible, ENTONCES `503 UPSTREAM_UNAVAILABLE`. El reintento es seguro (AC-2, AC-4).
- **AC-9** — Ambos endpoints exigen el rol `devices:write` y no aceptan body.
- **AC-10** — Cada ejecución DEBE loguear `op` (`device.disable|device.enable`), `actor`, `deviceId` y `result` (`changed|unchanged|retired|not-found|failed`).

## Contratos externos
```
POST /devices/{deviceId}/disable   Authorization: Bearer <jwt con devices:write>
POST /devices/{deviceId}/enable
200 { "deviceId": number, "disabled": boolean }
400 · 401 · 403 · 404 DEVICE_NOT_FOUND · 409 DEVICE_RETIRED · 503
```

## Preguntas abiertas
_Ninguna._ Confirmado empíricamente en el planning: deshabilitar tiene efecto inmediato y detiene el reenvío.
