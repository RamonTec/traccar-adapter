---
id: 003-T03
status: done           # todo | doing | blocked | done
depends_on: [002-T01]
covers: [AC-1]
---

# 003-T03 — Add Traccar config section

## Objetivo
Que la configuración de Traccar se valide al arrancar: sin URL o sin token, el servicio no arranca.

## Contexto (leer SOLO esto)
- `src/shared/infrastructure/config/app-config.ts`
- `src/shared/infrastructure/config/app-config.spec.ts`
- `test/support/test-env.ts`

## Contrato
```ts
export interface TraccarConfig { readonly baseUrl: string; readonly apiToken: string; readonly timeoutMs: number }
// AppConfig += readonly traccar: TraccarConfig
// TRACCAR_BASE_URL: z.url() (obligatoria; se guarda sin '/' final)
// TRACCAR_API_TOKEN: z.string().min(1) (obligatoria, secreto)
// TRACCAR_TIMEOUT_MS: z.coerce.number().int().min(100).max(60000).default(5000)
// TEST_ENV += TRACCAR_BASE_URL: 'http://traccar.test', TRACCAR_API_TOKEN: 'test-token'
```

## Archivos a crear/modificar
- [x] `src/shared/infrastructure/config/app-config.ts` (modificar)
- [x] `src/shared/infrastructure/config/app-config.spec.ts` (ampliar)
- [x] `test/support/test-env.ts` (ampliar)

## Criterios de aceptación
- [x] **AC-1a** — Sin `TRACCAR_BASE_URL` ni `TRACCAR_API_TOKEN` → `ConfigValidationError` que nombra ambas.
- [x] **AC-1b** — `TRACCAR_BASE_URL: 'http://t:8082/'` → `baseUrl: 'http://t:8082'`; timeout por defecto 5000; `'50'` y `'abc'` son inválidos.
- [x] **AC-1c** — El `message` del error nunca contiene el valor del token.
- [x] Los e2e de proceso real siguen en verde (usan `TEST_ENV`).

## Fuera de alcance
- Usar la config (T04).

## Verificación
```bash
pnpm vitest run src/shared/infrastructure/config
pnpm test:e2e
pnpm check
```

## Handoff
- Agregada sección `traccar` (`TraccarConfig`) a `AppConfig` y validada en `loadConfig` con Zod.
- `TRACCAR_BASE_URL` se normaliza sin slash final y `TRACCAR_API_TOKEN` es obligatorio; timeout por defecto es 5000 ms.
- Actualizado `test/support/test-env.ts` con defaults y soporte de override en `testConfig`.
- Listo para 003-T04 (`TraccarHttpClient`).
