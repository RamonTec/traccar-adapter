---
spec: 003-traccar-client
status: approved       # draft | approved
---

# 003 — Diseño

## Componentes
| Capa | Archivo | N/M | Responsabilidad |
|------|---------|-----|-----------------|
| docs | `docs/sdd/skills/traccar-api/SKILL.md` + `reference.md` | N | API de Traccar 6.15.3 verificada (AC-8) |
| shared/infra | `src/shared/infrastructure/context/request-context.ts` | N | Contexto async (ALS) con el `correlationId` de la request |
| shared/infra | `src/shared/infrastructure/context/request-context.middleware.ts` | N | Abre el contexto en cada request HTTP |
| shared/infra | `src/shared/infrastructure/config/app-config.ts` | M | Sección `traccar` + env |
| test | `test/support/test-env.ts` | M | Variables de Traccar dummy |
| shared/domain | `src/shared/domain/upstream-unavailable.error.ts` | N | `DomainError` `UPSTREAM_UNAVAILABLE` (→ 503, ya en la tabla) |
| shared/infra | `src/shared/infrastructure/traccar/traccar-http-client.ts` | N | fetch + Bearer + timeout + traducción de errores + log |
| shared/infra | `src/shared/infrastructure/health/readiness.registry.ts` | N | Registro de checks de readiness |
| shared/infra | `src/shared/infrastructure/health/readiness.controller.ts` | N | `GET /health/ready` (`@Public`) |
| shared/infra | `src/shared/infrastructure/traccar/traccar.module.ts` | N | Provee el cliente y registra el check `traccar` |
| raíz | `src/app.module.ts` | M | Middleware de contexto, `TraccarModule`, readiness |

Sin dependencias nuevas: `fetch` y `AbortSignal.timeout` son nativos de Node.

## Contratos internos
```ts
// context/request-context.ts
export interface RequestContext { readonly correlationId: string }
export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T;
export function currentCorrelationId(): string | undefined;

// config/app-config.ts (extensión)
export interface TraccarConfig { readonly baseUrl: string; readonly apiToken: string; readonly timeoutMs: number }
// AppConfig += traccar: TraccarConfig
// env: TRACCAR_BASE_URL z.url() · TRACCAR_API_TOKEN z.string().min(1) · TRACCAR_TIMEOUT_MS int 100..60000, default 5000

// shared/domain/upstream-unavailable.error.ts
export class UpstreamUnavailableError extends DomainError { readonly code = 'UPSTREAM_UNAVAILABLE'; constructor(upstream: string) }

// traccar/traccar-http-client.ts
export class TraccarRequestError extends Error {                  // 4xx que no son 401/403; lo interpreta cada adapter
  constructor(readonly status: number, readonly traccarMessage: string);
}
export type TraccarMethod = 'GET' | 'POST' | 'PUT';
export class TraccarHttpClient {
  constructor(config: TraccarConfig, fetchFn?: typeof fetch);
  request<T>(op: string, method: TraccarMethod, path: string, opts?: { query?: Record<string, string | number | boolean>; body?: unknown }): Promise<T>;
}

// health/readiness.registry.ts
export type ReadinessCheck = () => Promise<boolean>;
export class ReadinessRegistry { register(name: string, check: ReadinessCheck): void; run(): Promise<{ ok: boolean; checks: Record<string, 'ok' | 'error'> }> }
```

## Flujo
`request()`:
1. Headers: `Authorization: Bearer <token>`, `Accept: application/json`, `x-correlation-id: currentCorrelationId()` (si existe), y `Content-Type` solo si hay body.
2. `signal: AbortSignal.timeout(timeoutMs)`.
3. Traducción del resultado:
   - 2xx → JSON, o `undefined` si la respuesta es 204;
   - 401/403 → log `error` "Traccar credentials rejected" y `UpstreamUnavailableError`;
   - otro 4xx → `TraccarRequestError(status, body como texto)`;
   - 5xx, timeout o error de red → `UpstreamUnavailableError('traccar')`.
4. Log `info`/`warn`/`error` con `{ op, method, path, status, durationMs }`. Sin query string ni body (pueden llevar IMEI u otros datos). El `correlationId` lo añade nestjs-pino.

Readiness: `TraccarModule.onModuleInit` registra `traccar` → `request('server.get', 'GET', '/api/server')`; el check vale `true` si no lanza. El controller responde 200 si todos los checks están ok y 503 si alguno falla.

## Decisiones
- **Contexto async propio** en vez de leer los internos de nestjs-pino: queda una API estable y también sirve para NATS (009) y para los mensajes salientes.
- El cliente vive en `shared/infrastructure/traccar` y **no** expone operaciones de negocio. Cada módulo (group, device) define su port y un adapter que usa este cliente (ADR-0001).
- `UpstreamUnavailableError` va en `shared/domain` para que los use cases puedan reconocerlo sin importar infraestructura.
- Readiness como registro extensible: 009 añadirá `nats` sin tocar el controller.

## Mapa AC → componentes
| AC | Componentes |
|----|-------------|
| 1 | app-config, traccar-http-client |
| 2, 3, 4 | traccar-http-client, upstream-unavailable.error |
| 5 | traccar-http-client |
| 6 | request-context (+ middleware), traccar-http-client |
| 7 | readiness.registry, readiness.controller, traccar.module |
| 8 | skill traccar-api |
