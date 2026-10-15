---
id: 006-T02
status: todo           # todo | doing | blocked | done
depends_on: [006-T01]
covers: [AC-7]
---

# 006-T02 — Add TraccarDeviceStatusPort with structural type test

## Objetivo
`TraccarDeviceStatusPort` existe con exactamente dos operaciones, y un test de tipos garantiza que ninguna puede tocar otro campo que no sea `disabled` (FR3/AC-7).

## Contexto (leer SOLO esto)
- `src/modules/device/domain/device.ts`
- `src/modules/device/application/ports/traccar-device.port.ts` (patrón a imitar)
- `src/modules/device/application/ports/traccar-device.port.spec.ts` (patrón del test de tipos)

## Contrato
```ts
// src/modules/device/application/ports/traccar-device-status.port.ts
import type { Device } from '../../domain/device.js';

export const TRACCAR_DEVICE_STATUS_PORT = Symbol('TraccarDeviceStatusPort');

export interface TraccarDeviceStatusPort {
  /** undefined = no existe o no es accesible para el usuario de servicio. */
  get(deviceId: number): Promise<Device | undefined>;
  /** Solo cambia `disabled`; conserva name, uniqueId, groupId y attributes (FR3, AC-7). */
  setDisabled(deviceId: number, disabled: boolean): Promise<void>;
}
```
`TraccarDevicePort` (de 005) **no se modifica**: su test de tipos fija sus cuatro claves.

## Archivos a crear/modificar
- [ ] `src/modules/device/application/ports/traccar-device-status.port.ts` (nuevo)
- [ ] `src/modules/device/application/ports/traccar-device-status.port.spec.ts` (nuevo, `expectTypeOf`)

## Criterios de aceptación
- [ ] **AC-7a** — `expectTypeOf<keyof TraccarDeviceStatusPort>().toEqualTypeOf<'get' | 'setDisabled'>()`.
- [ ] **AC-7b** — `expectTypeOf<Parameters<TraccarDeviceStatusPort['setDisabled']>>().toEqualTypeOf<[number, boolean]>()`.
- [ ] El test de tipos de `traccar-device.port.spec.ts` sigue en verde sin cambios.

## Fuera de alcance
- Implementación (T04).

## Verificación
```bash
pnpm vitest run src/modules/device/application/ports
pnpm check
```

## Handoff
