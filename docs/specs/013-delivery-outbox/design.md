---
spec: 013-delivery-outbox
status: approved          # draft | approved
---

# 013 — Diseño

## Componentes
| Capa | Archivo | N/M | Responsabilidad |
|------|---------|-----|-----------------|
| shared/infra | `src/shared/infrastructure/config/app-config.ts` | M | Sección `outbox` (`OUTBOX_PATH`, `OUTBOX_MAX_BYTES`) |
| shared/infra | `src/shared/infrastructure/outbox/sqlite-outbox.store.ts` | N | Cola FIFO duradera en SQLite (`node:sqlite`), límite por bytes |
| shared/infra | `src/shared/infrastructure/health/readiness.registry.ts` + `readiness.controller.ts` | M | Checks no críticos (`down`) e `info` adicional en `/health/ready` |
| shared/infra | `src/shared/infrastructure/outbox/reliable.publisher.ts` | N | NATS o, si no se puede, outbox; respeta el orden |
| shared/infra | `src/shared/infrastructure/outbox/outbox.drainer.ts` | N | Drena pendientes en orden, con backoff, sin bloquear |
| shared/infra | `src/shared/infrastructure/outbox/outbox.module.ts` | N | `@Global`: store, publisher, drainer, readiness `outbox` |
| shared/infra | `src/shared/infrastructure/nats/nats-connection.manager.ts` | M | `nats` pasa a check no crítico |
| raíz | `src/app.module.ts` | M | Importa `OutboxModule` |
| ingestion/app | `event-publisher.port.ts`, `dead-letter-publisher.port.ts`, `ingest-traccar-payload.use-case.ts` (+ fakes) | M | `publish` devuelve `Delivery`; nuevo outcome `buffered` |
| ingestion/infra | `jetstream-event.publisher.ts`, `jetstream-dead-letter.publisher.ts`, `ingestion.module.ts` | M | Publican vía `ReliablePublisher` |
| ingestion/infra | `traccar-webhook.controller.ts` | M | Log de `buffered` |
| test | `test/outbox.e2e-spec.ts` + ajustes en e2e de 009/010/008 | N/M | NATS caído → 200 `buffered`; reinicio → drenado |

## Contratos internos
```ts
// config: AppConfig += outbox: OutboxConfig
export interface OutboxConfig {
  readonly path: string;        // OUTBOX_PATH, default 'data/outbox.db' (':memory:' permitido en tests)
  readonly maxBytes: number;    // OUTBOX_MAX_BYTES 1_048_576..68_719_476_736, default 536_870_912 (512 MiB)
}
// TEST_ENV += OUTBOX_PATH: ':memory:'

// sqlite-outbox.store.ts
export interface OutboxEntry {
  readonly seq: number; readonly subject: string; readonly msgId: string;
  readonly correlationId: string | undefined; readonly body: string;   // JSON ya serializado
  readonly createdAt: number;   // epoch ms
}
export type NewOutboxEntry = Omit<OutboxEntry, 'seq' | 'createdAt'>;
export class OutboxFullError extends Error {}
export class SqliteOutboxStore {
  constructor(cfg: OutboxConfig, clock: () => number = Date.now);
  append(entry: NewOutboxEntry): void;   // OutboxFullError si bytes + body > maxBytes; error de escritura → se propaga
  oldest(): OutboxEntry | undefined;
  delete(seq: number): void;
  stats(): { pending: number; oldestAgeMs: number | null };
  isWritable(): boolean;                 // bytes < maxBytes y la BD responde
  close(): void;
}
// tabla outbox(seq INTEGER PRIMARY KEY AUTOINCREMENT, subject, msg_id, correlation_id, body, created_at)
// PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; crea el directorio padre si no existe

// readiness.registry.ts
export type ReadinessStatus = 'ok' | 'error' | 'down';
register(name: string, check: ReadinessCheck, opts?: { critical?: boolean }): void; // no crítico: false → 'down' y no tumba `ok`
registerInfo(name: string, info: () => Record<string, number | null>): void;
// ReadinessResult += info: Record<string, Record<string, number | null>>  → respuesta: { status, checks, ...info }

// reliable.publisher.ts
export type Delivery = 'published' | 'buffered';
@Injectable() export class ReliablePublisher {
  constructor(js: JetStreamPublisher, store: SqliteOutboxStore, drainer: OutboxDrainer);
  publish(subject: string, payload: unknown, opts: PublishOptions): Promise<Delivery>;
}

// outbox.drainer.ts
@Injectable() export class OutboxDrainer implements OnApplicationBootstrap, OnApplicationShutdown {
  kick(): void;                  // programa un drenado (single-flight) si hay pendientes
}

// ingestion ports
export type Delivery = 'published' | 'buffered';   // en application (sin importar infra)
export interface EventPublisherPort { publish(event: TelemetryEvent): Promise<Delivery> }
export interface DeadLetterPublisherPort { publish(req: DeadLetterRequest): Promise<Delivery> }
export type IngestOutcome =
  | { outcome: 'published'; eventId: string }
  | { outcome: 'deadlettered'; reason: DeadLetterReason }
  | { outcome: 'buffered'; eventId?: string; reason?: DeadLetterReason };
```

## Flujo
**Publicar** (`ReliablePublisher.publish`):
1. Si `store.stats().pending > 0` → `append` y `'buffered'` (AC-7: no adelantar a los pendientes).
2. Si no → `js.publish(...)`. OK → `'published'`. `UpstreamUnavailableError` → `append` → `drainer.kick()` → `'buffered'`.
3. `append` falla (`OutboxFullError` o escritura) → log `error` y `UpstreamUnavailableError('outbox')` → webhook 503 (AC-4).
4. Log `warn 'Message buffered' { id: msgId, subject }` en cada append; nunca el body (AC-11).

**Drenar** (`OutboxDrainer`): al arrancar y en cada `kick()`, si no hay otro drenado en curso: `oldest()` → `js.publish(subject, JSON.parse(body), { msgId, correlationId })` → `delete(seq)` → log `info 'Buffered message delivered' { id, subject, pending }` → siguiente. Si falla: reintenta con backoff 1 s → 30 s (`setTimeout`, cancelado en shutdown). Mismo `msgId` → JetStream deduplica (AC-9).

**Readiness**: `nats` no crítico (`down` sin tumbar el servicio); `outbox` crítico = `store.isWritable()`; `info.outbox = stats()` (AC-12).

**Ingesta**: `published` → `{ outcome: 'published', eventId }`; si la entrega fue `buffered` → `{ outcome: 'buffered', eventId }`. Igual en el dead-letter con `reason`.

## Decisiones
- El outbox vive en la capa de transporte (`ReliablePublisher` sobre `JetStreamPublisher`): un solo punto para eventos y dead-letters; los ports de ingestion solo exponen `Delivery`.
- Se guarda el JSON ya serializado y se re-publica con `JSON.parse` → mismo `JSON.stringify` (valores JSON puros).
- `SqliteOutboxStore` síncrono (`DatabaseSync`): una escritura por mensaje solo en degradación; simplifica el orden.
- Límite por bytes de `body` (contador en memoria inicializado al abrir), no por tamaño de archivo SQLite.
- Cambio de contrato de 009: con NATS caído `/health/ready` deja de dar 503 (AC-12) y el webhook responde 200 `buffered`; se actualizan sus e2e.
- Despliegue: el adapter aún no tiene servicio en `docker-compose.yml`; se documenta en el README el volumen para `OUTBOX_PATH` (Compose: volumen con nombre; Kubernetes: StatefulSet + PVC).

## Riesgos / preguntas abiertas
- `node:sqlite` es *release candidate* en Node 24 (sin flag); si cambia su API, el impacto queda acotado a `SqliteOutboxStore`.
- Mientras NATS está caído, el readiness sigue `ready`: la alerta debe basarse en `outbox.pending` / `oldestAgeMs`.
