---
id: 001-T04
status: todo           # todo | doing | blocked | done
depends_on: [001-T02, 001-T03]
covers: [AC-4, AC-5, AC-6, AC-7, AC-8, AC-15]
---

# 001-T04 — Add structured logging module (nestjs-pino)

## Objetivo
Logs JSON según ADR-0002 §4 con correlation ID por request, log automático de cada request y redacción de headers sensibles.

## Contexto (leer SOLO esto)
- `src/shared/infrastructure/config/app-config.ts` (solo tipos `AppConfig`, `LogLevel`)
- `src/shared/infrastructure/logging/correlation-id.ts`
- `docs/standards/testing.md`

## Contrato
```ts
// src/shared/infrastructure/logging/pino-http-options.ts
import type { Options } from 'pino-http';
export const SERVICE_NAME = 'traccar-adapter';
export function buildPinoHttpOptions(config: Pick<AppConfig, 'logLevel'>): Options;
// level: config.logLevel · base: { service: SERVICE_NAME } · timestamp: pino.stdTimeFunctions.isoTime
// formatters.level: (label) => ({ level: label })
// genReqId(req, res): id = resolveCorrelationId(req.headers[CORRELATION_ID_HEADER]); res.setHeader(CORRELATION_ID_HEADER, id); return id
// customAttributeKeys: { reqId: 'correlationId' }
// customLogLevel(req, res, err): url empieza por '/health' → 'debug'; err || status>=500 → 'error'; >=400 → 'warn'; si no 'info'
// customSuccessObject / customErrorObject: añaden context: 'HTTP' al objeto (NO usar customProps: duplicaría la clave context)
// serializers: req → { method, url }, res → { statusCode }
// redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]']

// src/shared/infrastructure/logging/logging.module.ts
export class LoggingModule {
  static forRoot(config: AppConfig, stream?: DestinationStream): DynamicModule;
  // → LoggerModule.forRoot({ pinoHttp: stream ? [opts, stream] : opts })
}

// test/support/log-capture.ts
export function createLogCapture(): { stream: DestinationStream; lines(): Record<string, unknown>[] };
// stream = { write: (s) => buffer.push(s) }; lines() = JSON.parse de cada línea
```

## Archivos a crear/modificar
- [ ] `src/shared/infrastructure/logging/pino-http-options.ts` (nuevo)
- [ ] `src/shared/infrastructure/logging/logging.module.ts` (nuevo)
- [ ] `src/shared/infrastructure/logging/logging.module.spec.ts` (nuevo) — app Nest de prueba: `LoggingModule.forRoot(cfg, capture.stream)` + controller dummy definido en el spec (`GET /ok` → 200 y loguea con `new Logger('Dummy').log('hello')`, `GET /boom` → `throw new InternalServerErrorException()`, `GET /health` → 200); `app.useLogger(app.get(Logger))`; supertest.
- [ ] `test/support/log-capture.ts` (nuevo)

## Criterios de aceptación
- [ ] **AC-4** — El log `hello` tiene `time` ISO-8601, `level: 'info'`, `service: 'traccar-adapter'`, `context: 'Dummy'`, `msg: 'hello'` y `correlationId`.
- [ ] **AC-5** — Con header `x-correlation-id: abc-1`, la respuesta trae ese header y **todas** las líneas de esa request tienen `correlationId: 'abc-1'`.
- [ ] **AC-6** — Sin header (y con `x-correlation-id: 'bad value'`), la respuesta trae un UUID v4 y coincide con el `correlationId` de los logs.
- [ ] **AC-7** — Hay una línea por request con `req.method`, `req.url`, `res.statusCode`, `responseTime` numérico, `context: 'HTTP'`; nivel `info` para `/ok`, `debug` para `/health`, `warn` para una ruta inexistente (404), `error` para `/boom`.
- [ ] **AC-8** — Con `logLevel: 'warn'`: `/ok` no produce ninguna línea `info`; `/boom` sí produce su línea `error`.
- [ ] **AC-15** — Enviando `Authorization: Bearer s3cr3t` y `Cookie: sid=s3cr3t`, ninguna línea capturada contiene `s3cr3t`.

## Fuera de alcance
- Formato del cuerpo de error (T05). Wiring en `AppModule`/`main.ts` (T07).

## Verificación
```bash
pnpm vitest run src/shared/infrastructure/logging
pnpm check
```

## Handoff
