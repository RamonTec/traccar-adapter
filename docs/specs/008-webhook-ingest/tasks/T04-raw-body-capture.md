---
id: 008-T04
status: done           # todo | doing | blocked | done
depends_on: [008-T01]
covers: [AC-3, AC-5]
---

# 008-T04 — Add bounded raw body capture for webhook routes

## Objetivo
Que las rutas `/webhooks/traccar/*` reciban el body **crudo** (aunque sea un JSON inválido) con la memoria acotada, y que el resto de rutas siga parseando JSON con normalidad.

## Contexto (leer SOLO esto)
- `src/main.ts`
- `test/app.e2e-spec.ts` (solo cómo se crea la app in-process)
- skill `automated-testing` (`recipes.md` §4)

## Contrato
```ts
// src/shared/infrastructure/http/raw-body.middleware.ts
export interface RawWebhookBody { readonly body: Buffer; readonly oversized: boolean }
export const WEBHOOK_PATH_PREFIX = '/webhooks/traccar';
export function rawBodyMiddleware(maxBodyBytes: number): (req: Request, res: Response, next: NextFunction) => void;
// Lee 'data': acumula hasta maxBodyBytes; si el total los supera → oversized = true y deja de acumular (sigue consumiendo el stream sin guardarlo).
// 'end' → (req as any).rawWebhookBody = { body: Buffer.concat(chunks), oversized }; (req as any)._body = true; next().
// 'error' → next(err).

// src/shared/infrastructure/http/configure-http.ts
export function configureHttp(app: NestExpressApplication, config: AppConfig): void;
// app.use(WEBHOOK_PATH_PREFIX, rawBodyMiddleware(config.webhook.maxBodyBytes)); app.useBodyParser('json');

// main.ts: NestFactory.create<NestExpressApplication>(..., { bufferLogs: true, bodyParser: false }); configureHttp(app, config) antes de listen.
```

## Archivos a crear/modificar
- [ ] `src/shared/infrastructure/http/raw-body.middleware.ts` (nuevo) + `.spec.ts`
- [ ] `src/shared/infrastructure/http/configure-http.ts` (nuevo)
- [ ] `src/main.ts` (modificar)
- [ ] `test/app.e2e-spec.ts`: la app in-process se crea con `createNestApplication<NestExpressApplication>({ bufferLogs: true, bodyParser: false })` y llama a `configureHttp`

## Criterios de aceptación
- [ ] **AC-3** — Integración (app de prueba con `configureHttp` y un controller de prueba `@Public` en `POST /webhooks/traccar/echo` que devuelve `rawWebhookBody.body.toString('base64')` y `oversized`): el body `{"a":` llega sin errores y es idéntico; no hay un 400.
- [ ] **AC-5** — Con `maxBodyBytes: 1024` y un body de 5000 bytes → `oversized: true` y `body.length === 1024`.
- [ ] Una ruta fuera del prefijo (`POST /json-echo` de prueba) sigue recibiendo `req.body` parseado como JSON.
- [ ] El e2e de proceso real sigue en verde.

## Fuera de alcance
- Token (T05) y controller real (T06).

## Verificación
```bash
pnpm vitest run src/shared/infrastructure/http
pnpm test:e2e
pnpm check
```

## Handoff
- `rawBodyMiddleware(max)` en `/webhooks/traccar`: `req.rawWebhookBody = {body, oversized}` (guarda como mucho `max` bytes) y marca `_body` para que el parser JSON lo salte.
- `configureHttp(app, config)` exige `bodyParser: false`; aplicado en `main.ts` y en las apps in-process de `test/app.e2e-spec.ts`.
- Otras suites e2e (group/device) siguen con el bodyParser por defecto de Nest; T06 usa `configureHttp`.
