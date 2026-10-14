---
id: 003-T02
status: todo           # todo | doing | blocked | done
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
- [ ] `src/shared/infrastructure/context/request-context.ts` (nuevo) + `.spec.ts`
- [ ] `src/shared/infrastructure/context/request-context.middleware.ts` (nuevo) + `.spec.ts`
- [ ] `src/app.module.ts` (modificar: `configure`)

## Criterios de aceptación
- [ ] **AC-6a** — Fuera de cualquier contexto, `currentCorrelationId()` → `undefined`.
- [ ] **AC-6b** — Dentro de `runWithRequestContext({ correlationId: 'c1' }, fn)`, `fn` y todo lo que espere con `await` (incluido `setTimeout`) leen `'c1'`. Dos contextos concurrentes no se mezclan.
- [ ] **AC-6c** — Integración (si el guard global de 002 ya está activo, marca el controller de prueba con `@Public()`) (`AppModule.register` + controller de prueba que devuelve `currentCorrelationId()` tras un `await`): con `x-correlation-id: e2e-ctx` el body es `'e2e-ctx'`; sin el header, el body coincide con el header de respuesta generado.

## Fuera de alcance
- Usarlo en el cliente de Traccar (T04).

## Verificación
```bash
pnpm vitest run src/shared/infrastructure/context
pnpm check
```

## Handoff
