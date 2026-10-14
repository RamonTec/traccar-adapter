---
spec: 008-webhook-ingest
status: draft          # draft | approved
---

# 008 — Diseño

## Componentes
| Capa | Archivo | N/M | Responsabilidad |
|------|---------|-----|-----------------|
| shared/infra | `src/shared/infrastructure/config/app-config.ts` | M | Sección `webhook` |
| ingestion/app | `src/modules/ingestion/application/ports/event-publisher.port.ts` | N | Port para publicar eventos |
| ingestion/app | `src/modules/ingestion/application/ports/dead-letter-publisher.port.ts` | N | Port del dead-letter + `DeadLetterRequest` |
| ingestion/app | `src/modules/ingestion/application/ports/__fakes__/*.fake.ts` | N | Fakes de ambos ports |
| ingestion/app | `src/modules/ingestion/application/use-cases/ingest-traccar-payload.use-case.ts` | N | Orquestación: decodificar → normalizar → publicar o mandar al dead-letter |
| shared/infra | `src/shared/infrastructure/http/raw-body.middleware.ts` | N | Captura el body crudo acotado de las rutas del webhook |
| shared/infra | `src/shared/infrastructure/http/configure-http.ts` | N | Orden de los body parsers (webhook crudo; resto JSON) |
| raíz | `src/main.ts` | M | `bodyParser: false` + `configureHttp` |
| ingestion/infra | `src/modules/ingestion/infrastructure/inbound/webhook-token.guard.ts` | N | Token compartido en tiempo constante |
| ingestion/infra | `src/modules/ingestion/infrastructure/inbound/traccar-webhook.controller.ts` | N | `POST /webhooks/traccar/{positions,events}` |
| ingestion/infra | `src/modules/ingestion/infrastructure/outbound/unconfigured.publisher.ts` | N | Publisher provisional: 503 hasta que existan 009 y 010 |
| ingestion | `src/modules/ingestion/ingestion.module.ts` | N | Wiring |
| raíz | `src/app.module.ts` | M | `IngestionModule` + overrides de publishers para tests |
| docs | `docs/ops/traccar-config.md` | N | Configuración requerida de Traccar (AC-11) |

## Contratos internos
```ts
// config: AppConfig += webhook: { readonly token: string; readonly maxBodyBytes: number }
// WEBHOOK_TOKEN z.string().min(16) (obligatoria) · WEBHOOK_MAX_BODY_BYTES int 1024..10485760, default 1048576

// ports
export interface EventPublisherPort { publish(event: TelemetryEvent): Promise<void> }          // fallo → UpstreamUnavailableError
export const EVENT_PUBLISHER_PORT = Symbol('EventPublisherPort');
export type DeadLetterReason = 'INVALID_JSON' | 'SCHEMA_MISMATCH' | 'MISSING_GROUP' | 'PAYLOAD_TOO_LARGE' | 'PROCESSING_ERROR';
export type PayloadKind = 'position' | 'event';
export interface DeadLetterRequest {
  readonly kind: PayloadKind; readonly reason: DeadLetterReason; readonly detail: string;
  readonly rawBody: Uint8Array; readonly receivedAt: Date; readonly correlationId: string;
}
export interface DeadLetterPublisherPort { publish(req: DeadLetterRequest): Promise<void> }   // fallo → UpstreamUnavailableError
export const DEAD_LETTER_PUBLISHER_PORT = Symbol('DeadLetterPublisherPort');

// use case
export interface IngestCommand {
  readonly kind: PayloadKind; readonly rawBody: Uint8Array; readonly oversized: boolean;
  readonly receivedAt: Date; readonly correlationId: string;
}
export type IngestOutcome = { outcome: 'published'; eventId: string } | { outcome: 'deadlettered'; reason: DeadLetterReason };
export class IngestTraccarPayloadUseCase {
  constructor(events: EventPublisherPort, deadLetters: DeadLetterPublisherPort);
  execute(cmd: IngestCommand): Promise<IngestOutcome>;
}

// raw body
export interface RawWebhookBody { readonly body: Buffer; readonly oversized: boolean }     // en req.rawWebhookBody
export function rawBodyMiddleware(maxBodyBytes: number): RequestHandler;                    // express
export function configureHttp(app: NestExpressApplication, config: AppConfig): void;
```

## Flujo
**HTTP**: `configureHttp` registra, en este orden:
1. `app.use('/webhooks/traccar', rawBodyMiddleware(max))`: lee el stream; guarda hasta `max` bytes y, si se pasa, marca `oversized` y descarta el resto sin acumularlo; pone `req._body = true`.
2. `app.useBodyParser('json')`, que se salta las requests con `_body` ya marcado.

Resultado: un JSON inválido **nunca** produce un 400 en el webhook, y la memoria queda acotada por `max`.

**Request**: `ServiceAuthGuard` (la ruta es `@Public`) → `WebhookTokenGuard` (401) → controller → `useCase.execute({ kind según la ruta, rawBody, oversized, receivedAt: new Date(), correlationId: req.id })`.

**Use case**:
1. `oversized` → dead-letter `PAYLOAD_TOO_LARGE`.
2. Decodificar UTF-8 en modo estricto y `JSON.parse`; si falla → `INVALID_JSON`.
3. `normalizePosition`/`normalizeEvent` (007); si rechaza → dead-letter con su `reason`.
4. `events.publish(event)` → `published`.

Cualquier excepción inesperada en los pasos 2-3 → `PROCESSING_ERROR`, con `detail` = nombre del error. Los errores de **publicación** (del evento o del dead-letter) se propagan: `UpstreamUnavailableError` → 503 por el filtro de 001.

**Log** (en el controller): `{ kind, eventId?, outcome, reason?, durationMs }` con nivel `info` si se publica y `warn` si va al dead-letter; el `correlationId` lo añade nestjs-pino.

## Decisiones
- **Middleware de body propio** en vez de `express.raw`: `raw` responde 413 al pasarse del límite, sin pasar por nuestro filtro ni por el dead-letter. El propio conserva la cabecera del body y deja que el use case lo mande al dead-letter.
- **Publishers provisionales que responden 503**: el servicio arranca y es seguro entre specs (Traccar reintenta). 009 y 010 sustituyen el binding.
- El use case **no** loguea: la capa de aplicación no tiene logger; el resultado se devuelve y lo loguea el controller.
- Comparación del token: `timingSafeEqual(sha256(recibido), sha256(esperado))`, que también evita filtrar la longitud.

## Mapa AC → componentes
| AC | Componentes |
|----|-------------|
| 1 | webhook-token.guard |
| 2, 4, 6, 7, 8 | use case (+ fakes), controller |
| 3, 5 | raw-body.middleware, configure-http, use case |
| 9 | controller (`@Public`), rutas |
| 10 | controller |
| 11 | docs/ops/traccar-config.md |
