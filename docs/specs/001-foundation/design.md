---
spec: 001-foundation
status: approved       # draft | approved
---

# 001 — Diseño

## Componentes
| Capa | Archivo | N/M | Responsabilidad |
|------|---------|-----|-----------------|
| shared/domain | `src/shared/domain/domain-error.ts` | N | Base abstracta de errores de dominio con `code` |
| shared/infra | `src/shared/infrastructure/http/error-http-status.ts` | N | Tabla code↔status (ADR-0002 §3) |
| shared/infra | `src/shared/infrastructure/config/app-config.ts` | N | Esquema zod de env, `loadConfig`, `APP_CONFIG` |
| shared/infra | `src/shared/infrastructure/logging/correlation-id.ts` | N | Resolver/validar/generar correlation ID |
| shared/infra | `src/shared/infrastructure/logging/pino-http-options.ts` | N | Opciones pino-http según ADR-0002 §4 |
| shared/infra | `src/shared/infrastructure/logging/logging.module.ts` | N | Envuelve `LoggerModule.forRoot` |
| shared/infra | `src/shared/infrastructure/http/http-exception.filter.ts` | N | Filtro global: toda excepción → cuerpo ADR-0002 |
| shared/infra | `src/shared/infrastructure/http/health.controller.ts` | N | `GET /health` |
| raíz | `src/app.module.ts` | M | `AppModule.register(config, logStream?)` |
| raíz | `src/main.ts` | M | Bootstrap: config → logger → shutdown hooks → listen |
| raíz | `src/app.controller.ts`, `app.service.ts`, `app.controller.spec.ts` | borrar | Boilerplate (AC-14) |
| test | `test/support/log-capture.ts` | N | Stream en memoria para leer logs JSON en tests |
| test | `test/app.e2e-spec.ts` | M | E2E de la foundation |

Dependencia nueva: `zod` (^4) para validar env.

## Contratos internos
```ts
// shared/domain/domain-error.ts
export abstract class DomainError extends Error {
  abstract readonly code: string;            // SCREAMING_SNAKE, mapeado en ERROR_HTTP_STATUS
  protected constructor(message: string);    // this.name = new.target.name
}

// shared/infrastructure/http/error-http-status.ts
export const ERROR_HTTP_STATUS: Readonly<Record<string, number>>; // VALIDATION_ERROR:400 … INTERNAL_ERROR:500; módulos futuros añaden sus códigos aquí
export function httpStatusForCode(code: string): number | undefined;
export function codeForHttpStatus(status: number): string; // inverso de la tabla; 4xx sin mapear → 'BAD_REQUEST'; resto → 'INTERNAL_ERROR'

// shared/infrastructure/config/app-config.ts
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];
export interface AppConfig { readonly port: number; readonly logLevel: LogLevel }
export const APP_CONFIG = Symbol('AppConfig');
export class ConfigValidationError extends Error {
  constructor(readonly invalidVariables: readonly string[]); // message: 'Invalid environment variables: A, B'
}
export function parseEnv<S extends z.ZodObject>(schema: S, env: Record<string, string | undefined>): z.infer<S>; // '' = ausente; lanza ConfigValidationError con TODOS los nombres
export function loadConfig(env: Record<string, string | undefined>): AppConfig; // parseEnv + mapeo a camelCase

// shared/infrastructure/logging/correlation-id.ts
export const CORRELATION_ID_HEADER = 'x-correlation-id';
export function resolveCorrelationId(
  header: string | string[] | undefined,
  generate?: () => string,                   // default crypto.randomUUID
): string;                                   // válido: /^[A-Za-z0-9._-]{1,128}$/; array → primer elemento

// shared/infrastructure/logging/pino-http-options.ts
export const SERVICE_NAME = 'traccar-adapter';
export function buildPinoHttpOptions(config: Pick<AppConfig, 'logLevel'>): import('pino-http').Options;

// shared/infrastructure/logging/logging.module.ts
export class LoggingModule {
  static forRoot(config: AppConfig, stream?: import('pino').DestinationStream): DynamicModule;
}

// shared/infrastructure/http/http-exception.filter.ts
@Catch() export class HttpExceptionFilter implements ExceptionFilter { catch(e: unknown, host: ArgumentsHost): void }
export interface ErrorBody { code: string; message: string; correlationId: string; details?: unknown[] }

// shared/infrastructure/http/health.controller.ts
@Controller('health') export class HealthController { @Get() check(): { status: 'ok' } }

// app.module.ts
export class AppModule { static register(config: AppConfig, logStream?: DestinationStream): DynamicModule }
```

## Flujo
**Arranque**: `main.ts` → `loadConfig(process.env)`; si `ConfigValidationError` → escribe una línea JSON (`level:"error"`, `service`, `context:"Bootstrap"`, `invalidVariables`) a stderr y `process.exit(1)` → `NestFactory.create(AppModule.register(config), { bufferLogs: true })` → `app.useLogger(app.get(Logger))` → `app.enableShutdownHooks()` → `listen(config.port)`.

**Request**: pino-http `genReqId` → `resolveCorrelationId(req.headers['x-correlation-id'])` y `res.setHeader('x-correlation-id', id)` → `customAttributeKeys.reqId = 'correlationId'` → controller → al terminar, log automático con `customLogLevel` (health→debug, 5xx→error, 4xx→warn, info).

**Error**: `HttpExceptionFilter` →
1. `DomainError` con código mapeado → status de la tabla, `message` del error.
2. `DomainError` sin mapear → 500 `INTERNAL_ERROR` + log `error` "Unmapped domain error code" (obliga a registrar el código).
3. `HttpException` de Nest (incluye 404 de ruta) → su status, `codeForHttpStatus(status)`, mensaje genérico por código.
4. Cualquier otra cosa → 500 `INTERNAL_ERROR` + log `error` con `err` completo.
`correlationId` = `req.id` (asignado por pino-http).

**Opciones pino** (`buildPinoHttpOptions`): `level`, `base: { service }`, `timestamp: pino.stdTimeFunctions.isoTime`, `formatters.level: (label) => ({ level: label })`, `serializers.req → { method, url }`, `serializers.res → { statusCode }`, `redact: ['req.headers.authorization','req.headers.cookie','res.headers["set-cookie"]']`.

## Decisiones
- `loadConfig` es función pura sobre un objeto `env` (no `@nestjs/config`): testeable sin Nest y ejecutable antes de crear la app (AC-2 "antes de escuchar").
- `zod` para el esquema: errores con `path` → nombres de variables; reutilizable si se elige zod para DTOs en 003.
- `parseEnv` genérico separado de `loadConfig`: permite testear AC-3 (requeridas sin default) con un esquema de prueba, y que cada spec futuro añada sus variables al esquema.
- `logStream` inyectable en `AppModule.register` solo para tests (capturar logs sin parchear stdout).
- Unmapped 4xx → `BAD_REQUEST` (status preservado): ADR-0002 permite códigos adicionales.
- AC-13 se verifica en e2e lanzando `node dist/main.js` como proceso hijo y enviando `SIGTERM`; `test:e2e` pasa a ejecutar `pnpm build` antes.

## Mapa AC → componentes
| AC | Componentes |
|----|-------------|
| 1, 2, 3 | app-config, main |
| 4, 7, 8, 15 | pino-http-options, logging.module |
| 5, 6 | correlation-id, pino-http-options |
| 9, 10, 11 | domain-error, error-http-status, http-exception.filter |
| 12 | health.controller |
| 13 | main (`enableShutdownHooks`) |
| 14 | borrado de boilerplate en app.module |

## Riesgos / preguntas abiertas
- Logs emitidos por `new Logger(ctx)` de Nest dentro del filtro deben llevar `correlationId` vía el contexto async de nestjs-pino; se verifica explícitamente en el test del filtro (AC-10).
