---
id: 012-T02
status: done           # todo | doing | blocked | done
depends_on: [012-T01]
covers: [AC-1, AC-7, AC-9]
---

# 012-T02 — Add PinoAuditLogAdapter and SystemClock

## Objetivo
`PinoAuditLogAdapter` emite la línea de auditoría con `context: 'Audit'`, el nivel según `succeeded` y los campos fijos protegidos; nunca lanza. `SystemClock` mide con `performance.now()`.

## Contexto (leer SOLO esto)
- `src/shared/application/ports/audit-log.port.ts`
- `src/shared/application/ports/clock.port.ts`
- `src/shared/infrastructure/logging/logging.module.ts` (solo `forRoot`)
- `test/support/log-capture.ts`

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
// src/shared/infrastructure/audit/pino-audit-log.adapter.ts
export class PinoAuditLogAdapter implements AuditLogPort {
  private readonly logger = new Logger('Audit');
  record(event: AuditEvent): void;
  // line = { ...event.fields, msg: event.op, op: event.op, actor: event.actor, result: event.result, durationMs: event.durationMs }
  // (campos fijos DESPUÉS del spread: un id de negocio no puede pisarlos; actor undefined no aparece en JSON)
  // succeeded ? logger.log(line) : logger.warn(line); todo dentro de try/catch vacío
}
// src/shared/infrastructure/audit/system-clock.ts
export class SystemClock implements ClockPort { now(): number /* performance.now() */ }
```

## Archivos a crear/modificar
- [ ] `src/shared/infrastructure/audit/pino-audit-log.adapter.ts` (nuevo) + `.spec.ts` (integración: `Test.createTestingModule` con `LoggingModule.forRoot(testConfig({ logLevel: 'debug' }), logs.stream)` y `app.useLogger(app.get(Logger))`, como `recipes.md` §4)
- [ ] `src/shared/infrastructure/audit/system-clock.ts` (nuevo) + `.spec.ts`

## Criterios de aceptación
- [ ] **AC-1** — `record({...succeeded: true})` → una línea con `level: 'info'`, `context: 'Audit'`, `msg` = `op`, `op`, `actor`, `result`, `durationMs` y los `fields` expandidos; `succeeded: false` → `level: 'warn'`.
- [ ] **AC-9** — `fields: { op: 'x', result: 'y', msg: 'z', durationMs: 999 }` no sobrescribe los campos fijos; la línea no contiene `succeeded`.
- [ ] **AC-6** — `actor: undefined` → la línea no tiene clave `actor`.
- [ ] **AC-7** — Con un `Logger.prototype.log` espiado que lanza, `record` no lanza.
- [ ] `SystemClock.now()` es no decreciente en dos llamadas seguidas.

## Fuera de alcance
- Registrar el módulo (T03).

## Verificación
```bash
pnpm vitest run src/shared/infrastructure/audit
pnpm check
```

## Handoff
- `PinoAuditLogAdapter`: `new Logger('Audit')`, campos fijos tras el spread de `fields` (no se pueden pisar), info/warn según `succeeded`, nunca lanza; `actor` undefined desaparece del JSON.
- `SystemClock.now()` = `performance.now()`.
