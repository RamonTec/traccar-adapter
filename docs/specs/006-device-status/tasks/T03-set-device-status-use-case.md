---
id: 006-T03
status: todo           # todo | doing | blocked | done
depends_on: [006-T02]
covers: [AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-8]
---

# 006-T03 — Add SetDeviceStatusUseCase

## Objetivo
`SetDeviceStatusUseCase` lleva un device al estado `disabled` pedido de forma idempotente, y se niega a rehabilitar devices retirados.

## Contexto (leer SOLO esto)
- `src/modules/device/application/ports/traccar-device-status.port.ts`
- `src/modules/device/domain/device.ts`
- `src/modules/device/domain/errors.ts`
- `src/shared/domain/upstream-unavailable.error.ts`
- skill `automated-testing` (`recipes.md` §2 y §3)

## Contrato
```ts
// src/modules/device/application/use-cases/set-device-status.use-case.ts
export interface SetDeviceStatusInput { deviceId: number; disabled: boolean }
export interface SetDeviceStatusOutput { device: Device; changed: boolean }
export class SetDeviceStatusUseCase {
  constructor(private readonly traccar: TraccarDeviceStatusPort) {}
  execute(input: SetDeviceStatusInput): Promise<SetDeviceStatusOutput>;
}
```
Algoritmo, **en este orden**:
1. `device = get(deviceId)`. Si es `undefined` → `DeviceNotFoundError(deviceId)`.
2. `device.disabled === input.disabled` → `{ device, changed:false }`, sin llamar a `setDisabled`.
3. `!input.disabled && isRetired(device.uniqueId)` → `DeviceRetiredError(deviceId)`.
4. `setDisabled(deviceId, input.disabled)` → `{ device: { ...device, disabled: input.disabled }, changed:true }`.
5. Los errores del port se propagan sin envolver.

El paso 2 va antes que el 3 a propósito: deshabilitar un device retirado (que ya está deshabilitado) da `changed:false`, no un error.

## Archivos a crear/modificar
- [ ] `src/modules/device/application/use-cases/set-device-status.use-case.ts` (nuevo)
- [ ] `src/modules/device/application/use-cases/set-device-status.use-case.spec.ts` (nuevo; `FakeTraccarDeviceStatusPort` en memoria dentro del spec, con log de llamadas)

## Criterios de aceptación
- [ ] **AC-1** — Device habilitado + `disabled:true` → `setDisabled(id, true)` llamado una vez; `changed:true`, `device.disabled:true`.
- [ ] **AC-2** — Device deshabilitado + `disabled:true` → `changed:false`, `setDisabled` no se llama.
- [ ] **AC-3** — Device deshabilitado, no retirado, + `disabled:false` → `changed:true`.
- [ ] **AC-4** — Device habilitado + `disabled:false` → `changed:false`, sin escritura.
- [ ] **AC-5** — Device con `uniqueId '…:retired:18'` y `disabled:true`: `disabled:false` → `DeviceRetiredError`, sin escritura; `disabled:true` → `changed:false`.
- [ ] **AC-6** — `get` devuelve `undefined` → `DeviceNotFoundError`.
- [ ] **AC-8** — `get` o `setDisabled` rechazan con `UpstreamUnavailableError` → se propaga. Al reintentar con el estado ya aplicado → `changed:false`.

## Fuera de alcance
- HTTP (T04, T05).

## Verificación
```bash
pnpm vitest run src/modules/device/application/use-cases/set-device-status.use-case.spec.ts
pnpm check
```

## Handoff
