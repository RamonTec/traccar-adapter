---
id: 006-T01
status: done           # todo | doing | blocked | done
depends_on: [005-T01]
covers: [AC-5, AC-6]
---

# 006-T01 — Add isRetired and DeviceNotFound/DeviceRetired errors (404/409)

## Objetivo
El dominio de device sabe reconocer un device retirado y tiene los errores `DeviceNotFoundError` (404) y `DeviceRetiredError` (409), ya traducidos por el filtro HTTP.

## Contexto (leer SOLO esto)
- `src/modules/device/domain/device.ts`
- `src/modules/device/domain/errors.ts`
- `src/shared/infrastructure/http/error-http-status.ts`
- `src/shared/infrastructure/http/error-http-status.spec.ts`

## Contrato
```ts
// src/modules/device/domain/device.ts → añadir
export const isRetired = (uniqueId: string): boolean => uniqueId.includes(':retired:');

// src/modules/device/domain/errors.ts → añadir
export class DeviceNotFoundError extends DomainError {
  readonly code = 'DEVICE_NOT_FOUND';
  constructor(readonly deviceId: number) { super(`Device ${deviceId} not found`); }
}
export class DeviceRetiredError extends DomainError {
  readonly code = 'DEVICE_RETIRED';
  constructor(readonly deviceId: number) { super(`Device ${deviceId} is retired and cannot be enabled`); }
}

// src/shared/infrastructure/http/error-http-status.ts → añadir
DEVICE_NOT_FOUND: 404,
DEVICE_RETIRED: 409,
```
`codeForHttpStatus(404)` debe seguir siendo `'NOT_FOUND'` y `codeForHttpStatus(409)` `'CONFLICT'`. Respeta el mecanismo de 004-T02 y 005-T01.

## Archivos a crear/modificar
- [ ] `src/modules/device/domain/device.ts` (modificado) + ampliar `device.spec.ts`
- [ ] `src/modules/device/domain/errors.ts` (modificado) + ampliar `errors.spec.ts`
- [ ] `src/shared/infrastructure/http/error-http-status.ts` (modificado) + ampliar `.spec.ts`

## Criterios de aceptación
- [ ] **AC-5a** — `isRetired('123456789012345:retired:18') === true`; `isRetired('123456789012345') === false`.
- [ ] **AC-5b** — `DeviceRetiredError`: `code` correcto, `instanceof DomainError`, expone `deviceId`; `httpStatusForCode('DEVICE_RETIRED') === 409`.
- [ ] **AC-6** — `DeviceNotFoundError`: `code` correcto, expone `deviceId`; `httpStatusForCode('DEVICE_NOT_FOUND') === 404`.
- [ ] `codeForHttpStatus(404) === 'NOT_FOUND'` y `codeForHttpStatus(409) === 'CONFLICT'`.

## Fuera de alcance
- Port y use case (T02, T03).

## Verificación
```bash
pnpm vitest run src/modules/device/domain src/shared/infrastructure/http/error-http-status.spec.ts
pnpm check
```

## Handoff
- `isRetired(uniqueId)` en `device.ts`; `DeviceNotFoundError` (404) y `DeviceRetiredError` (409) en `errors.ts`.
- Códigos añadidos solo a `ERROR_HTTP_STATUS`; el mapeo inverso sigue siendo genérico (404→NOT_FOUND, 409→CONFLICT).
