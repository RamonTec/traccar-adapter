---
id: 002-T01
status: todo           # todo | doing | blocked | done
depends_on: []
covers: [AC-10]
---

# 002-T01 — Add auth config section and shared test env helper

## Objetivo
Que `AppConfig` incluya la configuración de Keycloak, y crear un único helper de entorno y config para tests, para que añadir variables obligatorias no rompa los tests existentes.

## Contexto (leer SOLO esto)
- `src/shared/infrastructure/config/app-config.ts`
- `src/shared/infrastructure/config/app-config.spec.ts`
- `test/app.e2e-spec.ts` (solo `startApp` y la llamada a `AppModule.register`)
- skill `automated-testing` (SKILL.md)

## Contrato
```ts
// app-config.ts
export interface AuthConfig { readonly issuerUrl: string; readonly audience: string }
export interface AppConfig { readonly port: number; readonly logLevel: LogLevel; readonly auth: AuthConfig }
// appEnvSchema += KEYCLOAK_ISSUER_URL: z.url() (obligatoria) · KEYCLOAK_AUDIENCE: z.string().min(1).default('traccar-adapter')

// test/support/test-env.ts
export const TEST_ENV: Readonly<Record<string, string>> = {
  KEYCLOAK_ISSUER_URL: 'http://keycloak.test/realms/telemetry',
};
export function testConfig(overrides?: Partial<AppConfig>): AppConfig; // loadConfig(TEST_ENV) + overrides
```

## Archivos a crear/modificar
- [ ] `src/shared/infrastructure/config/app-config.ts` (modificar)
- [ ] `src/shared/infrastructure/config/app-config.spec.ts` (adaptar: base `TEST_ENV`)
- [ ] `test/support/test-env.ts` (nuevo)
- [ ] Ajuste mecánico de los literales `{ port, logLevel }` → `testConfig({...})` en `src/shared/infrastructure/http/http-exception.filter.spec.ts`, `src/shared/infrastructure/logging/logging.module.spec.ts` y `test/app.e2e-spec.ts`. En `startApp`, `env: { ...process.env, ...TEST_ENV, ...env }`.

## Criterios de aceptación
- [ ] **AC-10a** — `loadConfig({})` lanza `ConfigValidationError` con `invalidVariables` que contiene `KEYCLOAK_ISSUER_URL`.
- [ ] **AC-10b** — `loadConfig({ ...TEST_ENV })` → `auth: { issuerUrl: TEST_ENV.KEYCLOAK_ISSUER_URL, audience: 'traccar-adapter' }`; con `KEYCLOAK_AUDIENCE: 'x'` → `audience: 'x'`.
- [ ] **AC-10c** — `KEYCLOAK_ISSUER_URL: 'not-a-url'` es inválida.
- [ ] **AC-10d** — Los tests previos de 001 (PORT y LOG_LEVEL) siguen pasando, usando `TEST_ENV` como base.
- [ ] **AC-10e** — El e2e de proceso real sigue en verde: arranque, error de config y SIGTERM.

## Fuera de alcance
- Usar `auth` en algún sitio (T02-T04).

## Verificación
```bash
pnpm vitest run src/shared
pnpm test:e2e
pnpm check
```

## Handoff
