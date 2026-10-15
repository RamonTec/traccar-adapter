---
id: 005-T08
status: todo           # todo | doing | blocked | done
depends_on: [005-T06, 004-T07]
covers: [AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9]
---

# 005-T08 — Add device-register e2e suite

## Objetivo
Una suite e2e en proceso prueba `POST /devices` de punta a punta contra un Traccar falso con estado de devices, y verifica que nunca se mueve un device de group.

## Contexto (leer SOLO esto)
- `test/support/fake-traccar.ts`
- `test/group-create.e2e-spec.ts` (patrón de suite y verifier falso)
- skill `traccar-api` (`reference.md` §4-§8: formas de respuesta)

## Contrato
Amplía `test/support/fake-traccar.ts`, sin romper a quienes ya lo usan, con un estado de devices en memoria:
- `GET /api/devices?uniqueId=x` → array (incluye los deshabilitados).
- `GET /api/devices/{id}` → objeto completo con `attributes`, `calendarId`, etc.; si no existe → 400 `SecurityException`.
- `POST /api/devices` → 200 con el device; si el `uniqueId` está duplicado → 400 con texto `Unique index or primary key violation ... TC_DEVICES(UNIQUEID`.
- `PUT /api/devices/{id}` → reemplaza el objeto completo, imitando a Traccar: si el body no trae `groupId`, lo pone a `0`.
- Un contador `failNextPost` para responder 500 a la siguiente creación.
- Un registro de requests para hacer aserciones.

Tokens del verifier falso: uno con `devices:write` y otro sin ese rol.

## Archivos a crear/modificar
- [ ] `test/support/fake-traccar.ts` (modificado)
- [ ] `test/device-register.e2e-spec.ts` (nuevo)

## Criterios de aceptación
- [ ] **AC-1** — Group 2 sin devices → 201 `{deviceId, uniqueId, groupId:2}`.
- [ ] **AC-2** — Repetir → 200 con el mismo `deviceId`; el fake no recibió ningún POST ni PUT adicional.
- [ ] **AC-3** — Device habilitado en el group 3 → 409 `DEVICE_ALREADY_REGISTERED`; ese device sigue igual en el fake.
- [ ] **AC-4** — Device deshabilitado (id N, group 3) y registro en el group 2 → 201 con `deviceId ≠ N`. En el fake, N queda con `uniqueId '<imei>:retired:N'`, `groupId 3` y `disabled:true`.
- [ ] **AC-5** — Como AC-4 con `failNextPost` → 503. Al reintentar → 201 (camino AC-1), y solo existe un device retirado.
- [ ] **AC-6** — `groupId: 999` → 404 `GROUP_NOT_FOUND`.
- [ ] **AC-7** — `uniqueId:'123'` → 400 `VALIDATION_ERROR` con `details`.
- [ ] **AC-8** — Traccar caído → 503 `UPSTREAM_UNAVAILABLE`.
- [ ] **AC-9** — Sin token → 401; token sin `devices:write` → 403.

## Fuera de alcance
- AC-10 (logs), cubierto en T05. AC-11, cubierto en T02, T04 y T07.

## Verificación
```bash
pnpm test:e2e
pnpm check
```

## Handoff
