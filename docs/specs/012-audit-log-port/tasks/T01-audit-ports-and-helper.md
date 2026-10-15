---
id: 012-T01
status: done           # todo | doing | blocked | done
depends_on: []
covers: [AC-5, AC-6, AC-7, AC-8, AC-9]
---

# 012-T01 — Add AuditLogPort, ClockPort and runAudited helper

## Objetivo
Existen los ports transversales de ADR-0006 y un helper puro que mide, ejecuta, clasifica, registra exactamente un evento y relanza el error original.

## Contexto (leer SOLO esto)
- `docs/decisions/0006-audit-logging-in-application-layer.md` (§ Decisión)
- `docs/standards/architecture.md` (Regla de dependencias)
- skill `automated-testing` (`recipes.md` §1)

## Contrato
```ts
// src/shared/application/ports/audit-log.port.ts
export const AUDIT_LOG_PORT = Symbol('AuditLogPort');
export interface AuditEvent {
  readonly op: string;                         // '<recurso>.<acción>'
  readonly actor: string | undefined;
  readonly result: string;
  readonly succeeded: boolean;                 // nivel info/warn; no se loguea
  readonly durationMs: number;                 // entero ≥ 0
  readonly fields: Readonly<Record<string, string | number>>;
}
export interface AuditLogPort { record(event: AuditEvent): void }

// src/shared/application/ports/clock.port.ts
export const CLOCK_PORT = Symbol('ClockPort');
export interface ClockPort { now(): number }   // ms monotónicos
```

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
Algoritmo de `runAudited`:
1. `start = clock.now()`; `out = await run()`.
2. Éxito → `outcome = success(out)`, `succeeded = true`; error → `outcome = failure(err)`, `succeeded = false`, y al final `throw err` (el **mismo** objeto).
3. `fields` = `operation.fields` ∪ `outcome.fields`, sin claves `undefined`.
4. `durationMs = Math.max(0, Math.round(clock.now() - start))`.
5. `audit.record({ op, actor, result: outcome.result, succeeded, durationMs, fields })` dentro de `try/catch` que ignora el error (AC-7).

## Archivos a crear/modificar
- [ ] `src/shared/application/ports/audit-log.port.ts` (nuevo)
- [ ] `src/shared/application/ports/clock.port.ts` (nuevo)
- [ ] `src/shared/application/run-audited.ts` (nuevo) + `run-audited.spec.ts` (fake de `AuditLogPort` con array de eventos; clock que devuelve valores programados)

## Criterios de aceptación
- [ ] **AC-5** — Clock `[100, 112.6]` → `durationMs === 13`; clock que retrocede → `0`.
- [ ] **AC-6** — `actor: undefined` → el evento se registra con `actor: undefined`.
- [ ] **AC-7** — Si `audit.record` lanza, `runAudited` devuelve el resultado de `run` (o relanza el error de `run`), nunca el de la auditoría.
- [ ] **AC-8** — `run` rechaza con `e` → `runAudited` rechaza con el mismo `e` (`toBe`) y registra `succeeded: false` con el `result` de `failure(e)`.
- [ ] **AC-9** — `fields` combina base y outcome y omite los `undefined`; exactamente **un** `record` por ejecución, con éxito y con error.
- [ ] Ningún archivo importa `@nestjs/*` ni `infrastructure` (`pnpm lint`).

## Fuera de alcance
- El adapter de pino (T02) y el wiring (T03).

## Verificación
```bash
pnpm vitest run src/shared/application
pnpm check
```

## Handoff
- Ports `AuditLogPort`/`ClockPort` en `shared/application/ports` (ADR-0006).
- `runAudited(deps, operation, run)`: un único `record` por ejecución (éxito o error), campos sin undefined, `durationMs` entero ≥ 0, relanza el error original; un fallo de auditoría se ignora.
