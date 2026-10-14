---
spec: 009-jetstream-publish
status: approved       # draft | approved
---

# 009 — Diseño

## Componentes
| Capa | Archivo | N/M | Responsabilidad |
|------|---------|-----|-----------------|
| shared/infra | `src/shared/infrastructure/config/app-config.ts` | M | Sección `nats` |
| shared/infra | `src/shared/infrastructure/nats/stream-definitions.ts` | N | Nombres, subjects y configuración de streams (ADR-0004), función pura |
| test/tooling | `package.json` (`test:infra:up/down`) + skill `automated-testing` §7 | M | NATS real en Docker para tests |
| shared/infra | `src/shared/infrastructure/nats/nats-connection.manager.ts` | N | Conexión en segundo plano, streams, readiness y drain |
| shared/infra | `src/shared/infrastructure/nats/jetstream.publisher.ts` | N | Publicación con `msgID`, PubAck, timeout, headers y log |
| shared/infra | `src/shared/infrastructure/nats/messaging.module.ts` | N | `@Global`: provee manager y publisher |
| ingestion/infra | `src/modules/ingestion/infrastructure/outbound/jetstream-event.publisher.ts` | N | Implementa `EventPublisherPort` |
| ingestion | `src/modules/ingestion/ingestion.module.ts` | M | El binding por defecto de `EVENT_PUBLISHER_PORT` pasa a JetStream |
| raíz | `src/app.module.ts` | M | Importa `MessagingModule` |

Dependencias nuevas: `@nats-io/transport-node` y `@nats-io/jetstream` (^3.4).

## Contratos internos
```ts
// config: AppConfig += nats: NatsConfig
export interface NatsConfig {
  readonly servers: readonly string[];          // NATS_SERVERS (obligatoria, separadas por comas, cada una nats://…)
  readonly credsFile?: string;                  // NATS_CREDS_FILE (opcional)
  readonly publishTimeoutMs: number;            // NATS_PUBLISH_TIMEOUT_MS 100..30000, default 2000
  readonly eventsMaxAgeDays: number;            // NATS_EVENTS_MAX_AGE_DAYS 1..365, default 7
  readonly deadLetterMaxAgeDays: number;        // NATS_DEADLETTER_MAX_AGE_DAYS 1..365, default 30
  readonly duplicateWindowMinutes: number;      // NATS_DUPLICATE_WINDOW_MINUTES 1..60, default 10
}

// stream-definitions.ts
export const EVENTS_STREAM = 'TELEMETRY_EVENTS';
export const DEADLETTER_STREAM = 'TELEMETRY_DEADLETTER';
export const SUBJECTS = {
  position: 'telemetry.events.position', deviceEvent: 'telemetry.events.device-event', deadLetter: 'telemetry.deadletter.traccar',
} as const;
export interface StreamDefinition { name: string; subjects: string[]; maxAgeNanos: number; duplicateWindowNanos: number }
export function buildStreamDefinitions(cfg: NatsConfig): readonly StreamDefinition[];

// nats-connection.manager.ts
@Injectable() export class NatsConnectionManager implements OnApplicationBootstrap, OnApplicationShutdown {
  onApplicationBootstrap(): void;               // registra readiness 'nats' y lanza connect() SIN await
  isReady(): boolean;                           // conectado y streams asegurados
  jetstream(): JetStreamClient;                 // si !isReady → UpstreamUnavailableError('nats')
  onApplicationShutdown(): Promise<void>;       // nc.drain()
}

// jetstream.publisher.ts
export interface PublishOptions { readonly msgId: string; readonly correlationId?: string }
export interface PublishResult { readonly stream: string; readonly seq: number; readonly duplicate: boolean }
@Injectable() export class JetStreamPublisher {
  publish(subject: string, payload: unknown, opts: PublishOptions): Promise<PublishResult>;
}

// jetstream-event.publisher.ts
export class JetStreamEventPublisher implements EventPublisherPort { constructor(publisher: JetStreamPublisher) }
```

## Flujo
**Conexión**:
1. Bucle propio en segundo plano: `connect({ servers, name: 'traccar-adapter', maxReconnectAttempts: -1, reconnectTimeWait: 2000, authenticator? })`. Si el **primer** intento falla, se reprograma con backoff (1 s, 2 s, 4 s… hasta 30 s) mediante un `setTimeout` que el shutdown cancela. Una vez conectado, las reconexiones las gestiona el cliente. La app arranca aunque NATS no esté.
2. Al conectar, `ensureStreams()`: `jsm.streams.info(name)`; si no existe → `add`; si `subjects`, `max_age` o `duplicate_window` difieren → `update`. Almacenamiento `file` y retención `limits`.
3. Los eventos de `nc.status()` actualizan `isReady` (desconexión → `false`, reconexión → `true`).

**Publicación**: `JSON.stringify(payload)` → bytes. Headers: `x-correlation-id` (del argumento o, si falta, de `currentCorrelationId()`). Luego `js.publish(subject, data, { msgID, timeout, headers })`.
- PubAck con `duplicate` → resultado exitoso y log `debug`.
- Sin conexión, timeout o cualquier error → `UpstreamUnavailableError('nats')` y log `error` con `subject` y `msgId`.
- Si va bien → log `info` con `{ subject, msgId, duplicate, durationMs }`.

**Evento**: `position.reported` → `SUBJECTS.position`; `device.event` → `SUBJECTS.deviceEvent`; `msgId = event.id`.

## Decisiones
- `@nats-io/*` v3 (cliente modular actual) en vez de `nats` v2.
- Primer intento con bucle propio en vez de `waitOnFirstConnect`: un connect pendiente de la librería no se puede cancelar en el shutdown y dejaría timers vivos (procesos colgados en tests).
- La conexión **no** bloquea el arranque (AC-5): readiness indica el estado y el webhook responde 503 hasta conectar. Traccar reintenta.
- Los tests de NATS son **e2e contra un NATS real** (`nats:2.11-alpine -js` en Docker, `NATS_TEST_URL`), no mocks: la deduplicación y el PubAck se comportan como en producción. Si NATS no está disponible, los tests fallan con un mensaje explícito (`pnpm test:infra:up`).
- `stream-definitions` es puro, para testear la configuración sin NATS.

## Mapa AC → componentes
| AC | Componentes |
|----|-------------|
| 1 | stream-definitions, nats-connection.manager |
| 2 | jetstream-event.publisher, jetstream.publisher |
| 3, 4, 8 | jetstream.publisher |
| 5, 6, 7 | nats-connection.manager (+ ReadinessRegistry de 003) |
