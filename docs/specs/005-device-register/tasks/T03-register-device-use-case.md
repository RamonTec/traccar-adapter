---
id: 005-T03
status: done           # todo | doing | blocked | done
depends_on: [005-T02]
covers: [AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-8]
---

# 005-T03 — Add RegisterDeviceUseCase

## Objetivo
`RegisterDeviceUseCase` registra un device en un group de forma idempotente: crea, devuelve el existente, rechaza conflictos o retira el device deshabilitado y crea uno nuevo.

## Contexto (leer SOLO esto)
- `src/modules/device/application/ports/traccar-device.port.ts`
- `src/modules/device/domain/device.ts`
- `src/modules/device/domain/errors.ts`
- `src/shared/domain/upstream-unavailable.error.ts`
- skill `automated-testing` (`recipes.md` §2 y §3)

## Contrato
```ts
// src/modules/device/application/use-cases/register-device.use-case.ts
export interface RegisterDeviceInput { uniqueId: string; name: string; groupId: number }
export type RegisterResult = 'created' | 'existing' | 'retired-and-created';
export interface RegisterDeviceOutput { device: Device; result: RegisterResult; retiredDeviceId?: number }
export class RegisterDeviceUseCase {
  constructor(private readonly traccar: TraccarDevicePort) {}
  execute(input: RegisterDeviceInput): Promise<RegisterDeviceOutput>;
}
```
Algoritmo:
1. `!groupExists(groupId)` → `GroupNotFoundError(groupId)`.
2. `existing = findByUniqueId(uniqueId)`:
   - `undefined` → `create(input)` → `created`.
   - `!disabled && groupId === input.groupId` → `existing` (sin llamadas de escritura; `name` se ignora).
   - `!disabled && groupId !== input.groupId` → `DeviceAlreadyRegisteredError(uniqueId, existing.groupId)`.
   - `disabled` → `retire(existing.id, retiredUniqueId(uniqueId, existing.id))` → `create(input)` → `retired-and-created`, con `retiredDeviceId = existing.id`.
3. Si `create` lanza `DeviceUniqueIdTakenError` (carrera): relee **una vez** con `findByUniqueId`. Si encuentra uno habilitado, aplica las reglas de `existing`/conflicto. En cualquier otro caso → `UpstreamUnavailableError('traccar')`.
4. Cualquier otro error del port se propaga sin envolver.

Clase TS plana, sin decoradores.

## Archivos a crear/modificar
- [x] `src/modules/device/application/use-cases/register-device.use-case.ts` (nuevo)
- [x] `src/modules/device/application/use-cases/register-device.use-case.spec.ts` (nuevo; `FakeTraccarDevicePort` en memoria dentro del spec: devices, groups y log de llamadas; `retire` cambia solo `uniqueId`; opción `failNextCreate: Error`)

## Criterios de aceptación
- [x] **AC-1** — Group 5 existe y no hay devices → `created`, device con `groupId 5` y `disabled:false`.
- [x] **AC-2** — Device habilitado en el group 5 → `existing` con el mismo `id`; el log del fake no tiene ni `create` ni `retire`.
- [x] **AC-3** — Device habilitado en el group 9 → `DeviceAlreadyRegisteredError` con `existingGroupId 9`; el device del group 9 no cambia.
- [x] **AC-4** — Device deshabilitado (id 18, group 9) → la llamada es `retire(18, '<imei>:retired:18')`, seguida de `create`. El resultado es `retired-and-created`, `retiredDeviceId:18` y un id nuevo distinto de 18. El device 18 sigue en el group 9 y `disabled:true`.
- [x] **AC-5** — Deshabilitado + `failNextCreate = UpstreamUnavailableError` → rechaza con ese error, pero el retiro ya está aplicado. Un segundo `execute` → `created`.
- [x] **AC-6** — El group no existe → `GroupNotFoundError` y no se llama a `findByUniqueId`.
- [x] **AC-8** — `groupExists` rechaza con `UpstreamUnavailableError` → se propaga tal cual.
- [x] **Carrera** — `failNextCreate = DeviceUniqueIdTakenError` y el fake inserta un device habilitado en el mismo group → `existing`. Si no aparece nada → `UpstreamUnavailableError`.

## Fuera de alcance
- HTTP real (T04). Controller y logs (T05).

## Verificación
```bash
pnpm vitest run src/modules/device/application/use-cases
pnpm check
```

## Handoff
- Implementado `RegisterDeviceUseCase` con lógica de registro idempotente, retiro y manejo de carreras concurrentes.
- Tests exhaustivos con `FakeTraccarDevicePort` cubriendo AC-1 a AC-8 y carrera `DeviceUniqueIdTakenError`.
- Desbloquea T05 (RegisterDevice DTO y DeviceController).
