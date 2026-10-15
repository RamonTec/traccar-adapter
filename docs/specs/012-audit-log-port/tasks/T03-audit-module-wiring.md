---
id: 012-T03
status: todo           # todo | doing | blocked | done
depends_on: [012-T02]
covers: [AC-1]
---

# 012-T03 — Add AuditModule and import it in AppModule

## Objetivo
`AUDIT_LOG_PORT` y `CLOCK_PORT` se pueden inyectar en cualquier módulo de la app.

## Contexto (leer SOLO esto)
- `src/shared/infrastructure/audit/pino-audit-log.adapter.ts` (solo exports)
- `src/shared/infrastructure/audit/system-clock.ts` (solo exports)
- `src/shared/infrastructure/nats/messaging.module.ts` (patrón `@Global`)
- `src/app.module.ts`

## Contrato
```ts
// src/shared/infrastructure/audit/audit.module.ts
@Global()
@Module({
  providers: [
    { provide: AUDIT_LOG_PORT, useClass: PinoAuditLogAdapter },
    { provide: CLOCK_PORT, useClass: SystemClock },
  ],
  exports: [AUDIT_LOG_PORT, CLOCK_PORT],
})
export class AuditModule {}
// app.module.ts: imports += AuditModule
```

## Archivos a crear/modificar
- [ ] `src/shared/infrastructure/audit/audit.module.ts` (nuevo) + `audit.module.spec.ts` (nuevo)
- [ ] `src/app.module.ts` (modificar)

## Criterios de aceptación
- [ ] `audit.module.spec.ts`: un módulo de prueba que importa `AuditModule` resuelve `AUDIT_LOG_PORT` como `PinoAuditLogAdapter` y `CLOCK_PORT` como `SystemClock`, y un provider de otro módulo los recibe inyectados (global).
- [ ] `pnpm test` y los e2e siguen en verde.

## Fuera de alcance
- Usarlos en los use cases (T04-T06).

## Verificación
```bash
pnpm vitest run src/shared/infrastructure/audit
pnpm check
```

## Handoff
