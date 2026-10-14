---
id: 003-T04
status: todo           # todo | doing | blocked | done
depends_on: [003-T02, 003-T03]
covers: [AC-1, AC-2, AC-3, AC-4, AC-5, AC-6]
---

# 003-T04 — Add TraccarHttpClient and UpstreamUnavailableError

## Objetivo
Un único punto de llamada a Traccar: autenticado, con timeout, que traduce errores, propaga el `correlationId` y deja registro de cada llamada.

## Contexto (leer SOLO esto)
- `src/shared/domain/domain-error.ts`
- `src/shared/infrastructure/context/request-context.ts` (solo exports)
- `src/shared/infrastructure/config/app-config.ts` (solo `TraccarConfig`)
- skill `automated-testing` (`recipes.md` §5: Traccar falso)

## Contrato
```ts
// src/shared/domain/upstream-unavailable.error.ts
export class UpstreamUnavailableError extends DomainError {
  readonly code = 'UPSTREAM_UNAVAILABLE';
  constructor(readonly upstream: string) { super(`${upstream} is unavailable`); }
}
// src/shared/infrastructure/traccar/traccar-http-client.ts
export class TraccarRequestError extends Error { constructor(readonly status: number, readonly traccarMessage: string) }
export type TraccarMethod = 'GET' | 'POST' | 'PUT';
export class TraccarHttpClient {
  private readonly logger = new Logger(TraccarHttpClient.name);
  constructor(config: TraccarConfig, fetchFn: typeof fetch = fetch);
  request<T>(op: string, method: TraccarMethod, path: string,
             opts?: { query?: Record<string, string | number | boolean>; body?: unknown }): Promise<T>;
}
```
Comportamiento:
- 2xx → JSON parseado (204 → `undefined`);
- 401/403 → `logger.error({ op, status }, 'Traccar credentials rejected')` + `UpstreamUnavailableError('traccar')`;
- otro 4xx → `TraccarRequestError`;
- 5xx, timeout o error de red → `UpstreamUnavailableError('traccar')`;
- log por llamada `{ op, method, path, status, durationMs }`: `info` si es 2xx, `warn` si es 4xx, `error` en lo demás; sin query ni body.

## Archivos a crear/modificar
- [ ] `src/shared/domain/upstream-unavailable.error.ts` (nuevo) + `.spec.ts`
- [ ] `src/shared/infrastructure/traccar/traccar-http-client.ts` (nuevo)
- [ ] `src/shared/infrastructure/traccar/traccar-http-client.spec.ts` (nuevo, contra un servidor `node:http` en el puerto 0)

## Criterios de aceptación
- [ ] **AC-1** — El servidor falso recibe `Authorization: Bearer test-token`, el método y la ruta correctos, la query codificada y el body JSON con `Content-Type: application/json`.
- [ ] **AC-2** — Con un handler que no responde y `timeoutMs: 200` → `UpstreamUnavailableError` en menos de 1 s. Un 500 → igual. Un puerto cerrado → igual.
- [ ] **AC-3** — 401 y 403 → `UpstreamUnavailableError` + log `error` "Traccar credentials rejected".
- [ ] **AC-4** — 400 con body `"Duplicate entry"` → `TraccarRequestError { status: 400, traccarMessage: 'Duplicate entry' }`.
- [ ] **AC-5** — Cada llamada produce un log con `op`, `method`, `path`, `status` y `durationMs`, y ninguna línea contiene `test-token`.
- [ ] **AC-6** — Dentro de `runWithRequestContext({ correlationId: 'c-9' })` el servidor recibe `x-correlation-id: c-9`; fuera de contexto no se envía el header.
- [ ] `UpstreamUnavailableError` → 503 `UPSTREAM_UNAVAILABLE` por el filtro existente (test del error: `code` correcto, `instanceof DomainError`).

## Fuera de alcance
- Módulo Nest y readiness (T05). Operaciones de groups y devices (004-006).

## Verificación
```bash
pnpm vitest run src/shared/infrastructure/traccar src/shared/domain
pnpm check
```

## Handoff
