---
spec: 012-audit-log-port
status: draft             # draft | approved
---

# 012 — Diseño

## Componentes
| Capa | Archivo | N/M | Responsabilidad |
|------|---------|-----|-----------------|
| shared/application | `src/shared/application/ports/audit-log.port.ts` | N | `AuditLogPort`, `AuditEvent`, `AUDIT_LOG_PORT` (ADR-0006) |
| shared/application | `src/shared/application/ports/clock.port.ts` | N | `ClockPort`, `CLOCK_PORT` |
| shared/application | `src/shared/application/run-audited.ts` | N | Helper: medir → ejecutar → clasificar → registrar → relanzar |
| shared/infra | `src/shared/infrastructure/audit/pino-audit-log.adapter.ts` | N | Emite la línea (`context: 'Audit'`), nunca lanza |
| shared/infra | `src/shared/infrastructure/audit/system-clock.ts` | N | `performance.now()` |
| shared/infra | `src/shared/infrastructure/audit/audit.module.ts` | N | `@Global()`: provee y exporta ambos tokens |
| raíz | `src/app.module.ts` | M | Importa `AuditModule` |
| group | `create-group.use-case.ts`, `group.controller.ts`, `group.module.ts` | M | Audita en el use case; el controller solo pasa `actor` |
| device | `register-device.use-case.ts`, `device.controller.ts`, `device.module.ts` | M | Ídem `device.register` |
| device | `set-device-status.use-case.ts`, `device-status.controller.ts`, `device.module.ts` | M | Ídem `device.disable` / `device.enable` |
| test | `test/audit.e2e-spec.ts` | N | Una línea `context: 'Audit'` por operación vía HTTP; ninguna del controller |

## Contratos internos
```ts
// shared/application/ports/audit-log.port.ts
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

// shared/application/ports/clock.port.ts
export const CLOCK_PORT = Symbol('ClockPort');
export interface ClockPort { now(): number }   // ms monotónicos

// shared/application/run-audited.ts
export type AuditFields = Readonly<Record<string, string | number | undefined>>; // undefined → se omite
export interface AuditOutcome { readonly result: string; readonly fields?: AuditFields }
export interface AuditedOperation<T> {
  readonly op: string;
  readonly actor: string | undefined;
  readonly fields: AuditFields;                // ids conocidos antes de ejecutar
  success(output: T): AuditOutcome;            // succeeded = true
  failure(error: unknown): AuditOutcome;       // succeeded = false; por defecto { result: 'failed' }
}
export interface AuditDeps { readonly audit: AuditLogPort; readonly clock: ClockPort }
export function runAudited<T>(deps: AuditDeps, operation: AuditedOperation<T>, run: () => Promise<T>): Promise<T>;

// Use cases: input += actor; constructor += (audit: AuditLogPort, clock: ClockPort)
export interface CreateGroupInput { name: string; actor: string | undefined }
export interface RegisterDeviceInput { uniqueId: string; name: string; groupId: number; actor: string | undefined }
export interface SetDeviceStatusInput { deviceId: number; disabled: boolean; actor: string | undefined }
```

## Flujo
1. `runAudited`: `start = clock.now()`; `out = await run()`.
2. Éxito → `success(out)`; error → `failure(err)` y se relanza el **mismo** error.
3. `record({ op, actor, result, succeeded, durationMs: max(0, round(now − start)), fields: base ∪ outcome sin undefined })`
   dentro de `try/catch` (AC-7: el helper también se protege, aunque el adapter nunca lance).
4. Adapter: `line = { ...fields, msg: op, op, actor, result, durationMs }` (los campos fijos van **después**: AC-9);
   `new Logger('Audit')` → `log(line)` si `succeeded`, si no `warn(line)`; todo en `try/catch`.

Clasificación por operación (la lógica de negocio actual no cambia; se envuelve en un `run` privado):
| op | fields base | success → result (+fields) | failure → result |
|----|-------------|----------------------------|------------------|
| `group.create` | `name` | `created`/`existing` (+`groupId`) | `GroupNameAmbiguousError` → `ambiguous`; otro → `failed` |
| `device.register` | `uniqueId`, `groupId` | `output.result` (+`deviceId`, `retiredDeviceId?`) | `DeviceAlreadyRegisteredError` → `conflict`; otro → `failed` |
| `device.disable`/`enable` (según `disabled`) | `deviceId` | `changed`/`unchanged` | `DeviceRetiredError` → `retired`; `DeviceNotFoundError` → `not-found`; otro → `failed` |

Controllers: quitan `Logger`, `try/finally` e imports de errores de dominio; pasan `actor` en el input.
Modules: las factories de los use cases inyectan además `AUDIT_LOG_PORT` y `CLOCK_PORT` (globales vía `AuditModule`).

## Decisiones
- Helper con callbacks `success`/`failure` en vez de decorator o clase base: función pura, testeable sin Nest y
  explícita en cada use case.
- `actor` en el input del use case (ADR-0006 §4), no en un contexto ambiental (AsyncLocalStorage): el use case no
  depende del transporte.
- `context: 'Audit'` con un `Logger` de Nest (ya enrutado a pino por `nestjs-pino`), sin crear un logger aparte.
- Tests: la auditoría de cada operación pasa a los specs de los use cases (fake de `AuditLogPort` + clock
  controlado); los specs de controllers verifican solo HTTP y que se pasa `actor`.

## Riesgos / preguntas abiertas
- Los specs de módulo (`group.module.spec.ts`, `device.module.spec.ts`) deben importar `AuditModule` para resolver
  los tokens nuevos.
