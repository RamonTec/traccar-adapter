---
id: 013-T03
status: todo           # todo | doing | blocked | done
depends_on: []
covers: [AC-12]
---

# 013-T03 — Support non-critical checks and info in readiness

## Objetivo
`/health/ready` puede informar de dependencias no críticas (`down`) sin dejar de estar listo, y añadir información extra (p.ej. el outbox).

## Contexto (leer SOLO esto)
- `src/shared/infrastructure/health/readiness.registry.ts` (+ `.spec.ts`)
- `src/shared/infrastructure/health/readiness.controller.ts`

## Contrato
```ts
export type ReadinessStatus = 'ok' | 'error' | 'down';
register(name: string, check: ReadinessCheck, opts?: { critical?: boolean }): void;   // default critical: true
// no crítico que falla o lanza → 'down' y NO pone ok = false; crítico → 'error' como hoy
registerInfo(name: string, info: () => Record<string, number | null>): void;
export interface ReadinessResult { ok: boolean; checks: Record<string, ReadinessStatus>; info: Record<string, Record<string, number | null>> }
// Controller: body = { status, checks, ...info }  (status 'ok' | 'error'; 503 si !ok)
```

## Archivos a crear/modificar
- [ ] `readiness.registry.ts` (+ spec)
- [ ] `readiness.controller.ts`

## Criterios de aceptación
- [ ] **AC-12a** — Un check no crítico que devuelve `false` → `checks.x = 'down'` y `ok: true`.
- [ ] **AC-12b** — Un `registerInfo('outbox', …)` aparece en la respuesta como `outbox: {…}`.
- [ ] Sin opciones, el comportamiento actual no cambia (tests existentes en verde).

## Fuera de alcance
- Registrar `nats` como no crítico y `outbox` (T06).

## Verificación
```bash
pnpm vitest run src/shared/infrastructure/health
pnpm check
```

## Handoff
