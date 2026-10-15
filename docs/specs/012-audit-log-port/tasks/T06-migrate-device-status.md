---
id: 012-T06
status: todo           # todo | doing | blocked | done
depends_on: [012-T05]
covers: [AC-1, AC-4, AC-8, AC-10]
---

# 012-T06 — Move device.disable/enable audit into SetDeviceStatusUseCase

## Objetivo
`device.disable` / `device.enable` se auditan desde `SetDeviceStatusUseCase`; `DeviceStatusController` ya no audita y el contrato HTTP no cambia.

## Contexto (leer SOLO esto)
- `src/shared/application/run-audited.ts` (solo exports)
- `src/modules/device/application/use-cases/set-device-status.use-case.ts` (+ su spec)
- `src/modules/device/infrastructure/inbound/device-status.controller.ts` (+ su spec)
- `src/modules/device/device.module.ts` (+ `device.module.spec.ts`)

## Contrato
```ts
// src/shared/application/run-audited.ts
export type AuditFields = Readonly<Record<string, string | number | undefined>>; // undefined → se omite
export interface AuditOutcome { readonly result: string; readonly fields?: AuditFields }
export interface AuditedOperation<T> {
  readonly op: string;
  readonly actor: string | undefined;
  readonly fields: AuditFields;                // ids conocidos antes de ejecutar
  success(output: T): AuditOutcome;            // succeeded = true
  failure(error: unknown): AuditOutcome;       // succeeded = false
}
export interface AuditDeps { readonly audit: AuditLogPort; readonly clock: ClockPort }
export function runAudited<T>(deps: AuditDeps, operation: AuditedOperation<T>, run: () => Promise<T>): Promise<T>;
```
```ts
export interface SetDeviceStatusInput { deviceId: number; disabled: boolean; actor: string | undefined }
// constructor(traccar: TraccarDeviceStatusPort, audit: AuditLogPort, clock: ClockPort)
// op = disabled ? 'device.disable' : 'device.enable' · fields { deviceId }
// success: changed ? 'changed' : 'unchanged'
// failure: DeviceRetiredError → 'retired'; DeviceNotFoundError → 'not-found'; otro → 'failed'
```
El controller conserva el helper privado `run(deviceId, disabled, actor)` solo para llamar al use case y mapear la respuesta.
Patrón en el use case (la lógica actual pasa intacta a un método privado `run`):
```ts
async execute(input: X): Promise<Y> {
  return runAudited({ audit: this.audit, clock: this.clock }, {
    op, actor: input.actor, fields: {...},
    success: (out) => ({ result: ..., fields: {...} }),
    failure: (err) => ({ result: err instanceof <Rechazo> ? '<nombre>' : 'failed' }),
  }, () => this.run(input));
}
```
El controller: quita `Logger`, el `try/finally`, el tipo `AuditResult` y los imports de errores de dominio; pasa `actor` (de `@Actor()`) en el input. El module: la factory del use case inyecta además `AUDIT_LOG_PORT` y `CLOCK_PORT`. En el spec de módulo, importar `AuditModule`.
Los tests de auditoría del spec del controller se **mueven** al spec del use case (fake de `AuditLogPort` que guarda eventos + clock fijo); el spec del controller conserva los tests HTTP y añade que el use case recibe `actor`.

## Archivos a crear/modificar
- [ ] `src/modules/device/application/use-cases/set-device-status.use-case.ts` (+ spec)
- [ ] `src/modules/device/infrastructure/inbound/device-status.controller.ts` (+ spec)
- [ ] `src/modules/device/device.module.ts` (+ spec)

## Criterios de aceptación
- [ ] **AC-4** — Unit: `changed`/`unchanged` → `succeeded: true`; `retired`, `not-found` y `failed` → `succeeded: false`; siempre `deviceId`; `op` según `disabled`.
- [ ] **AC-8** — Mismo error relanzado; el controller sigue respondiendo 409 / 404 / 503.
- [ ] **AC-10** — Tests HTTP del controller y `test/device-status.e2e-spec.ts` en verde sin tocar status ni body.

## Fuera de alcance
- E2E transversal (T07).

## Verificación
```bash
pnpm vitest run src/modules/device
pnpm test:infra:up && pnpm test:e2e
pnpm check
```

## Handoff
