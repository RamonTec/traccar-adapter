---
id: 005-T02
status: done           # todo | doing | blocked | done
depends_on: [005-T01]
covers: [AC-11]
---

# 005-T02 — Add TraccarDevicePort with structural type test

## Objetivo
`TraccarDevicePort` existe con exactamente cuatro operaciones, y un test de tipos garantiza que ninguna permite cambiar el `groupId` de un device existente (FR3/NFR5).

## Contexto (leer SOLO esto)
- `src/modules/device/domain/device.ts`
- `docs/standards/architecture.md` (sección "Restricciones de dominio")

## Contrato
```ts
// src/modules/device/application/ports/traccar-device.port.ts
import type { Device } from '../../domain/device.js';

export const TRACCAR_DEVICE_PORT = Symbol('TraccarDevicePort');

/** El POST de Traccar falló porque el uniqueId ya existe (carrera). */
export class DeviceUniqueIdTakenError extends Error {
  constructor(readonly uniqueId: string) {
    super(`uniqueId ${uniqueId} already taken in Traccar`);
    this.name = 'DeviceUniqueIdTakenError';
  }
}

export interface CreateDeviceCommand { uniqueId: string; name: string; groupId: number }

export interface TraccarDevicePort {
  groupExists(groupId: number): Promise<boolean>;
  findByUniqueId(uniqueId: string): Promise<Device | undefined>;
  create(input: CreateDeviceCommand): Promise<Device>;
  /** Solo cambia uniqueId; conserva groupId y disabled (FR3). */
  retire(deviceId: number, newUniqueId: string): Promise<void>;
}
```
Sin imports de `@nestjs/*`: el lint los prohíbe en `application`.

## Archivos a crear/modificar
- [x] `src/modules/device/application/ports/traccar-device.port.ts` (nuevo)
- [x] `src/modules/device/application/ports/traccar-device.port.spec.ts` (nuevo, `expectTypeOf` de vitest)

## Criterios de aceptación
- [x] **AC-11a** — `expectTypeOf<keyof TraccarDevicePort>().toEqualTypeOf<'groupExists' | 'findByUniqueId' | 'create' | 'retire'>()`. Añadir un método rompe el test a propósito.
- [x] **AC-11b** — `expectTypeOf<Parameters<TraccarDevicePort['retire']>>().toEqualTypeOf<[number, string]>()`. Ninguna operación que reciba un id de device existente acepta `groupId`.
- [x] `new DeviceUniqueIdTakenError('x')` expone `uniqueId` y `name === 'DeviceUniqueIdTakenError'`.

## Fuera de alcance
- Implementación (T04). Lista permitida de rutas (T07).

## Verificación
```bash
pnpm vitest run src/modules/device/application/ports
pnpm check
```

## Handoff
- Definido `TraccarDevicePort` con `groupExists`, `findByUniqueId`, `create` y `retire`.
- Creado `DeviceUniqueIdTakenError` para colisiones concurrentes de `uniqueId`.
- Verificada mediante test de tipos estructurales la imposibilidad de pasar `groupId` en `retire` (FR3/NFR5).
- Desbloquea T03 (RegisterDeviceUseCase) y T04 (TraccarDeviceHttpAdapter).
