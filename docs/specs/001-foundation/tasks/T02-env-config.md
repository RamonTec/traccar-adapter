---
id: 001-T02
status: todo           # todo | doing | blocked | done
depends_on: []
covers: [AC-1, AC-2, AC-3]
---

# 001-T02 — Add env config loading and validation with zod

## Objetivo
Función pura que valida variables de entorno y devuelve una config tipada, o falla listando **todos** los nombres inválidos.

## Contexto (leer SOLO esto)
- `docs/standards/coding.md` (secciones TypeScript y Configuración)
- `docs/standards/testing.md`

## Contrato
```ts
// src/shared/infrastructure/config/app-config.ts
import { z } from 'zod';
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];
export interface AppConfig { readonly port: number; readonly logLevel: LogLevel }
export const APP_CONFIG = Symbol('AppConfig');

export class ConfigValidationError extends Error {
  constructor(readonly invalidVariables: readonly string[]); // message: 'Invalid environment variables: A, B'
}
// '' se trata como ausente. Lanza ConfigValidationError con todos los nombres (path[0] de cada issue, sin duplicados).
export function parseEnv<S extends z.ZodObject>(schema: S, env: Record<string, string | undefined>): z.infer<S>;
export function loadConfig(env: Record<string, string | undefined>): AppConfig;
```
Esquema de `loadConfig`: `PORT` opcional, entero 1-65535, default `3000` (coerción desde string); `LOG_LEVEL` opcional, enum `LOG_LEVELS`, default `'info'`. Variables no declaradas se ignoran.

## Archivos a crear/modificar
- [ ] `pnpm add zod` (^4) → `package.json`, `pnpm-lock.yaml`
- [ ] `src/shared/infrastructure/config/app-config.ts` (nuevo)
- [ ] `src/shared/infrastructure/config/app-config.spec.ts` (nuevo)

## Criterios de aceptación
- [ ] **AC-1** — `loadConfig({})` → `{ port: 3000, logLevel: 'info' }`; `loadConfig({ PORT: '8080', LOG_LEVEL: 'debug' })` → `{ port: 8080, logLevel: 'debug' }`; `PORT: ''` → 3000.
- [ ] **AC-2a** — `loadConfig({ PORT: 'abc', LOG_LEVEL: 'verbose' })` lanza `ConfigValidationError` con `invalidVariables` = `['PORT', 'LOG_LEVEL']` (ambas, no solo la primera).
- [ ] **AC-2b** — `PORT: '0'`, `'65536'` y `'3.5'` son inválidos.
- [ ] **AC-2c** — El `message` del error contiene los nombres y **no** contiene los valores (`abc`, `verbose`).
- [ ] **AC-3** — Con un esquema de prueba `z.object({ SECRET: z.string().min(1) })`, `parseEnv(schema, {})` y `parseEnv(schema, { SECRET: '' })` lanzan con `['SECRET']`; `{ SECRET: 'x' }` devuelve `{ SECRET: 'x' }`.

## Fuera de alcance
- Llamar a `loadConfig` desde `main.ts` (T07). Variables de Traccar/NATS.

## Verificación
```bash
pnpm vitest run src/shared/infrastructure/config
pnpm check
```

## Handoff
