---
id: 006-T06
status: done           # todo | doing | blocked | done
depends_on: [006-T04, 006-T05, 005-T07]
covers: [AC-9]
---

# 006-T06 — Wire device status into DeviceModule and route allowlist

## Objetivo
La aplicación expone `POST /devices/:deviceId/disable` y `/enable` contra el adapter real, y la lista permitida de rutas las incluye a propósito.

## Contexto (leer SOLO esto)
- `src/modules/device/device.module.ts`
- `src/modules/device/device.module.spec.ts`
- `test/route-allowlist.e2e-spec.ts`

## Contrato
```ts
// src/modules/device/device.module.ts → añadir
controllers: [DeviceController, DeviceStatusController],
providers: [
  ...,
  { provide: TRACCAR_DEVICE_STATUS_PORT, useFactory: (c: TraccarHttpClient) => new TraccarDeviceStatusHttpAdapter(c), inject: [TraccarHttpClient] },
  { provide: SetDeviceStatusUseCase, useFactory: (p: TraccarDeviceStatusPort) => new SetDeviceStatusUseCase(p), inject: [TRACCAR_DEVICE_STATUS_PORT] },
],

// test/route-allowlist.e2e-spec.ts → añadir a ALLOWED_ROUTES
'POST /devices/:deviceId/disable',
'POST /devices/:deviceId/enable',
```

## Archivos a crear/modificar
- [ ] `src/modules/device/device.module.ts` (modificado) + ampliar `device.module.spec.ts`
- [ ] `test/route-allowlist.e2e-spec.ts` (modificado)

## Criterios de aceptación
- [ ] `device.module.spec.ts` resuelve `SetDeviceStatusUseCase` y `DeviceStatusController`, y `TRACCAR_DEVICE_STATUS_PORT` es `instanceof TraccarDeviceStatusHttpAdapter`.
- [ ] **AC-9** — `route-allowlist.e2e-spec.ts` en verde con las 2 rutas nuevas, y no hay ninguna otra ruta nueva.
- [ ] `pnpm test` y `pnpm test:e2e` siguen en verde.

## Fuera de alcance
- Escenarios HTTP completos (T07).

## Verificación
```bash
pnpm vitest run src/modules/device
pnpm test:e2e
pnpm check
```

## Handoff
- `DeviceModule` registra `DeviceStatusController`, `TRACCAR_DEVICE_STATUS_PORT` → `TraccarDeviceStatusHttpAdapter` y `SetDeviceStatusUseCase`.
- Allowlist: + `POST /devices/:deviceId/{disable,enable}`; `pnpm test:e2e` verde.
