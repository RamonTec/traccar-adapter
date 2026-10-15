---
id: 005-T01
status: done           # todo | doing | blocked | done
depends_on: [004-T02]
covers: [AC-3, AC-4, AC-6]
---

# 005-T01 — Add Device domain, retiredUniqueId and device errors (409/404)

## Objetivo
Existen el tipo `Device`, la función `retiredUniqueId` y los errores `DeviceAlreadyRegisteredError` (409) y `GroupNotFoundError` (404), ya traducidos por el filtro HTTP.

## Contexto (leer SOLO esto)
- `src/shared/domain/domain-error.ts`
- `src/modules/group/domain/errors.ts` (patrón a imitar)
- `src/shared/infrastructure/http/error-http-status.ts`
- `src/shared/infrastructure/http/error-http-status.spec.ts`

## Contrato
```ts
// src/modules/device/domain/device.ts
export interface Device {
  readonly id: number; readonly uniqueId: string; readonly groupId: number;
  readonly name: string; readonly disabled: boolean;
}
export const retiredUniqueId = (uniqueId: string, deviceId: number): string =>
  `${uniqueId}:retired:${deviceId}`;

// src/modules/device/domain/errors.ts
export class DeviceAlreadyRegisteredError extends DomainError {
  readonly code = 'DEVICE_ALREADY_REGISTERED';
  constructor(readonly uniqueId: string, readonly existingGroupId: number) {
    super(`Device ${uniqueId} is already registered in group ${existingGroupId}`);
  }
}
export class GroupNotFoundError extends DomainError {
  readonly code = 'GROUP_NOT_FOUND';
  constructor(readonly groupId: number) { super(`Group ${groupId} not found`); }
}

// src/shared/infrastructure/http/error-http-status.ts → añadir
DEVICE_ALREADY_REGISTERED: 409,
GROUP_NOT_FOUND: 404,
```
`codeForHttpStatus(409)` debe seguir siendo `'CONFLICT'` y `codeForHttpStatus(404)` `'NOT_FOUND'`. Respeta el mecanismo que dejó 004-T02 para `GROUP_NAME_AMBIGUOUS`.

## Archivos a crear/modificar
- [x] `src/modules/device/domain/device.ts` (nuevo) + `device.spec.ts`
- [x] `src/modules/device/domain/errors.ts` (nuevo) + `errors.spec.ts`
- [x] `src/shared/infrastructure/http/error-http-status.ts` (modificado) + ampliar `.spec.ts`

## Criterios de aceptación
- [x] **AC-4** — `retiredUniqueId('123456789012345', 18) === '123456789012345:retired:18'`.
- [x] **AC-3** — `DeviceAlreadyRegisteredError`: `code` correcto, `instanceof DomainError`, expone `uniqueId` y `existingGroupId`; `httpStatusForCode('DEVICE_ALREADY_REGISTERED') === 409`.
- [x] **AC-6** — `GroupNotFoundError`: `code` correcto, expone `groupId`; `httpStatusForCode('GROUP_NOT_FOUND') === 404`.
- [x] `codeForHttpStatus(409) === 'CONFLICT'` y `codeForHttpStatus(404) === 'NOT_FOUND'`.

## Fuera de alcance
- Port y use case (T02, T03).

## Verificación
```bash
pnpm vitest run src/modules/device/domain src/shared/infrastructure/http/error-http-status.spec.ts
pnpm check
```

## Handoff
- Creados `Device` y `retiredUniqueId` en `device.ts`.
- Creados `DeviceAlreadyRegisteredError` y `GroupNotFoundError` en `errors.ts`.
- Mapeados a 409 y 404 en `error-http-status.ts`, preservando mapeo inverso genérico.
- T02 (TraccarDevicePort) queda desbloqueado para implementación.
