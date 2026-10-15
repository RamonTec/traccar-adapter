---
id: 003-T02
status: done          # todo | doing | blocked | done
depends_on: []
covers: [AC-6]
---

# 003-T02 — Add request context (AsyncLocalStorage) for correlation ID

## Objetivo
Que cualquier código que se ejecute dentro de una request (adapters salientes, publishers) pueda leer el `correlationId` sin recibirlo como parámetro.

## Contexto (leer SOLO esto)
- `src/shared/infrastructure/logging/correlation-id.ts`
- `src/app.module.ts`
- skill `automated-testing` (`recipes.md` §4)

## Contrato
```ts
// src/shared/infrastructure/context/request-context.ts  (node:async_hooks)
export interface RequestContext { readonly correlationId: string }
export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T;
export function currentCorrelationId(): string | undefined;

// src/shared/infrastructure/context/request-context.middleware.ts
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request & { id?: unknown }, res: Response, next: () => void): void;
  // correlationId = res.getHeader(CORRELATION_ID_HEADER) (lo fija pino-http) ?? resolveCorrelationId(req.headers[...])
  // runWithRequestContext({ correlationId }, next)
}

// app.module.ts: AppModule implements NestModule → configure(c) { c.apply(RequestContextMiddleware).forRoutes('*') }
```

## Archivos a crear/modificar
- [x] `src/shared/infrastructure/context/request-context.ts` (nuevo) + `.spec.ts`
- [x] `src/shared/infrastructure/context/request-context.middleware.ts` (nuevo) + `.spec.ts`
- [x] `src/app.module.ts` (modificar: `configure`)

## Criterios de aceptación
- [x] **AC-6a** — Fuera de cualquier contexto, `currentCorrelationId()` → `undefined`.
- [x] **AC-6b** — Dentro de `runWithRequestContext({ correlationId: 'c1' }, fn)`, `fn` y todo lo que espere con `await` (incluido `setTimeout`) leen `'c1'`. Dos contextos concurrentes no se mezclan.
- [x] **AC-6c** — Integración (si el guard global de 002 ya está activo, marca el controller de prueba con `@Public()`) (`AppModule.register` + controller de prueba que devuelve `currentCorrelationId()` tras un `await`): con `x-correlation-id: e2e-ctx` el body es `'e2e-ctx'`; sin el header, el body coincide con el header de respuesta generado.

## Fuera de alcance
- Usarlo en el cliente de Traccar (T04).

## Verificación
```bash
pnpm vitest run src/shared/infrastructure/context
pnpm check
```

## Handoff
- Request context asíncrono con `AsyncLocalStorage` (`runWithRequestContext`, `currentCorrelationId`).
- `RequestContextMiddleware` extrae `correlationId` del header de respuesta (pino-http) o fallback a `req.headers` y envuelve la request.
- `AppModule` implementa `NestModule` aplicando `RequestContextMiddleware` a todas las rutas (`*`).
- Tests unitarios e integración probados y pasando en verde.
