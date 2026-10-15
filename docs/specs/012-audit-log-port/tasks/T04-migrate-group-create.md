---
id: 012-T04
status: done           # todo | doing | blocked | done
depends_on: [012-T03]
covers: [AC-1, AC-2, AC-6, AC-8, AC-10]
---

# 012-T04 — Move group.create audit into CreateGroupUseCase

## Objetivo
`group.create` se audita desde `CreateGroupUseCase` vía `AuditLogPort`; `GroupController` ya no audita y el contrato HTTP no cambia.

## Contexto (leer SOLO esto)
- `src/shared/application/run-audited.ts` (solo exports)
- `src/modules/group/application/use-cases/create-group.use-case.ts` (+ su spec)
- `src/modules/group/infrastructure/inbound/group.controller.ts` (+ su spec)
- `src/modules/group/group.module.ts` (+ `group.module.spec.ts`)

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
export interface CreateGroupInput { name: string; actor: string | undefined }
// constructor(traccar: TraccarGroupPort, audit: AuditLogPort, clock: ClockPort)
// op 'group.create' · fields { name } · success: created ? 'created' : 'existing' (+ groupId)
// failure: GroupNameAmbiguousError → 'ambiguous'; otro → 'failed'
```
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
- [ ] `src/modules/group/application/use-cases/create-group.use-case.ts` (+ spec)
- [ ] `src/modules/group/infrastructure/inbound/group.controller.ts` (+ spec)
- [ ] `src/modules/group/group.module.ts` (+ spec)

## Criterios de aceptación
- [ ] **AC-1/AC-2** — Unit del use case: `created` y `existing` → un evento `succeeded: true` con `name` y `groupId`; `ambiguous` y `failed` (Upstream) → `succeeded: false`, con `name` y sin `groupId`.
- [ ] **AC-6** — `actor: undefined` → evento con `actor: undefined`.
- [ ] **AC-8** — El use case relanza el mismo error; el controller sigue respondiendo 409 / 503.
- [ ] **AC-10** — Los tests HTTP del controller y `test/group-create.e2e-spec.ts` siguen en verde sin tocar status ni body; el controller no emite líneas de auditoría.

## Fuera de alcance
- Device (T05, T06).

## Verificación
```bash
pnpm vitest run src/modules/group
pnpm test:infra:up && pnpm test:e2e
pnpm check
```

## Handoff
- `CreateGroupUseCase(traccar, audit, clock)` + `actor` en el input; lógica intacta en `run` privado envuelta en `runAudited`.
- `GroupController` sin Logger/try-finally/errores de dominio; su spec comprueba status 409/503 y que no emite auditoría.
- Desviación: fakes compartidos `FakeAuditLog`/`FakeClock` en `shared/application/ports/__fakes__/` (los reutilizan T05/T06).
- e2e 68/68 sin cambios en `test/`.
