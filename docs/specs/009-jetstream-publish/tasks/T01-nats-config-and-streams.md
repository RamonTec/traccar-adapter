---
id: 009-T01
status: todo           # todo | doing | blocked | done
depends_on: [002-T01]
covers: [AC-1]
---

# 009-T01 — Add NATS config section and stream definitions

## Objetivo
Validar la configuración de NATS al arrancar y definir, en una función pura, los streams y subjects de ADR-0004.

## Contexto (leer SOLO esto)
- `src/shared/infrastructure/config/app-config.ts`
- `src/shared/infrastructure/config/app-config.spec.ts`
- `test/support/test-env.ts`

## Contrato
```ts
// app-config.ts — AppConfig += readonly nats: NatsConfig
export interface NatsConfig {
  readonly servers: readonly string[];      // NATS_SERVERS: obligatoria; split(',').map(trim); cada una /^(nats|tls):\/\/.+/
  readonly credsFile?: string;              // NATS_CREDS_FILE: opcional
  readonly publishTimeoutMs: number;        // NATS_PUBLISH_TIMEOUT_MS: 100..30000, default 2000
  readonly eventsMaxAgeDays: number;        // NATS_EVENTS_MAX_AGE_DAYS: 1..365, default 7
  readonly deadLetterMaxAgeDays: number;    // NATS_DEADLETTER_MAX_AGE_DAYS: 1..365, default 30
  readonly duplicateWindowMinutes: number;  // NATS_DUPLICATE_WINDOW_MINUTES: 1..60, default 10
}
// TEST_ENV += NATS_SERVERS: 'nats://127.0.0.1:4222'

// src/shared/infrastructure/nats/stream-definitions.ts
export const EVENTS_STREAM = 'TELEMETRY_EVENTS';
export const DEADLETTER_STREAM = 'TELEMETRY_DEADLETTER';
export const SUBJECTS = {
  position: 'telemetry.events.position',
  deviceEvent: 'telemetry.events.device-event',
  deadLetter: 'telemetry.deadletter.traccar',
} as const;
export interface StreamDefinition { readonly name: string; readonly subjects: readonly string[]; readonly maxAgeNanos: number; readonly duplicateWindowNanos: number }
export function buildStreamDefinitions(cfg: NatsConfig): readonly StreamDefinition[];
// EVENTS: subjects [position, deviceEvent] · DEADLETTER: [deadLetter]; nanos = ms * 1_000_000
```

## Archivos a crear/modificar
- [ ] `src/shared/infrastructure/config/app-config.ts` + `.spec.ts`
- [ ] `test/support/test-env.ts`
- [ ] `src/shared/infrastructure/nats/stream-definitions.ts` (nuevo) + `.spec.ts`

## Criterios de aceptación
- [ ] **AC-1a** — Sin `NATS_SERVERS` → `ConfigValidationError`; `'nats://a:4222, nats://b:4222'` → dos servers; `'http://x'` es inválido.
- [ ] **AC-1b** — Valores por defecto: 2000 ms, 7 y 30 días, 10 min.
- [ ] **AC-1c** — `buildStreamDefinitions` con los defaults → `TELEMETRY_EVENTS` con 2 subjects, `maxAgeNanos = 7·86400·1e9` y `duplicateWindowNanos = 600·1e9`; `TELEMETRY_DEADLETTER` con 30 días y la misma ventana.
- [ ] **AC-1d** — Ningún nombre de stream contiene `.` (test explícito).

## Fuera de alcance
- Conexión (T03).

## Verificación
```bash
pnpm vitest run src/shared/infrastructure/config src/shared/infrastructure/nats
pnpm check
```

## Handoff
