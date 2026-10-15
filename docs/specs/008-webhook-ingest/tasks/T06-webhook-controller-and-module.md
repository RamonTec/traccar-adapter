---
id: 008-T06
status: done           # todo | doing | blocked | done
depends_on: [008-T03, 008-T04, 008-T05, 002-T04]
covers: [AC-1, AC-2, AC-3, AC-5, AC-6, AC-7, AC-9, AC-10]
---

# 008-T06 — Add webhook controller and IngestionModule wiring

## Objetivo
Exponer los dos endpoints del webhook en la app real, conectados al use case, con publishers provisionales que responden 503 hasta que existan 009 y 010.

## Contexto (leer SOLO esto)
- `src/app.module.ts`
- `src/modules/ingestion/application/use-cases/ingest-traccar-payload.use-case.ts` (solo exports)
- `src/modules/ingestion/application/ports/` (solo símbolos y tipos)
- `test/app.e2e-spec.ts`

## Contrato
```ts
// src/modules/ingestion/infrastructure/outbound/unconfigured.publisher.ts
export class UnconfiguredPublisher implements EventPublisherPort, DeadLetterPublisherPort {
  publish(): Promise<never>; // throw new UpstreamUnavailableError('nats')
}
// src/modules/ingestion/infrastructure/inbound/traccar-webhook.controller.ts
@Public() @UseGuards(WebhookTokenGuard) @Controller('webhooks/traccar')
export class TraccarWebhookController {
  @Post('positions') @HttpCode(200) positions(@Req() req): Promise<{ outcome: string }>;
  @Post('events')    @HttpCode(200) events(@Req() req): Promise<{ outcome: string }>;
  // cmd = { kind, rawBody: req.rawWebhookBody.body, oversized: req.rawWebhookBody.oversized, receivedAt: new Date(), correlationId: String(req.id) }
  // log: info { kind, eventId, outcome, durationMs } si se publica · warn { kind, outcome, reason, durationMs } si va al dead-letter
}
// src/modules/ingestion/ingestion.module.ts
export interface IngestionOverrides { eventPublisher?: EventPublisherPort; deadLetterPublisher?: DeadLetterPublisherPort }
@Module({}) export class IngestionModule {
  static register(overrides?: IngestionOverrides): DynamicModule;
  // EVENT_PUBLISHER_PORT       → overrides.eventPublisher      ?? new UnconfiguredPublisher()  (009 cambia el default)
  // DEAD_LETTER_PUBLISHER_PORT → overrides.deadLetterPublisher ?? new UnconfiguredPublisher()  (010 cambia el default)
  // IngestTraccarPayloadUseCase: useFactory (events, dl) => new IngestTraccarPayloadUseCase(events, dl), inject: [ambos tokens]
  // controllers: [TraccarWebhookController], providers += WebhookTokenGuard
}
// app.module.ts: AppModule.register(config, logStream?, overrides?: { jwtVerifier?, eventPublisher?, deadLetterPublisher? })
//   imports += IngestionModule.register({ eventPublisher: overrides?.eventPublisher, deadLetterPublisher: overrides?.deadLetterPublisher })
```

## Archivos a crear/modificar
- [ ] `src/modules/ingestion/infrastructure/outbound/unconfigured.publisher.ts` (nuevo)
- [ ] `src/modules/ingestion/infrastructure/inbound/traccar-webhook.controller.ts` (nuevo)
- [ ] `src/modules/ingestion/ingestion.module.ts` (nuevo) y `src/app.module.ts` (modificar)
- [ ] `test/webhook.e2e-spec.ts` (nuevo; app in-process con `configureHttp`, los fakes de 008-T02 como overrides y `TEST_ENV.WEBHOOK_TOKEN`)

## Criterios de aceptación
- [ ] **AC-1** — Sin token → 401, y los dos fakes quedan vacíos.
- [ ] **AC-2** — `positions` con el fixture `position.json` → 200, y el fake de eventos tiene 1 evento.
- [ ] **AC-3** — `positions` con el body `{"position":` → 200, y el fake del dead-letter tiene `INVALID_JSON` con los bytes exactos.
- [ ] **AC-5** — Con `testConfig({ webhook: { …, maxBodyBytes: 1024 } })` y un body de 5000 bytes → 200 `PAYLOAD_TOO_LARGE`.
- [ ] **AC-6/7** — Publisher de eventos con `failWith` → 503 `UPSTREAM_UNAVAILABLE`; dead-letter con `failWith` en un JSON inválido → 503.
- [ ] **AC-9** — No hace falta JWT. `POST /webhooks/traccar/events` usa `kind: 'event'`.
- [ ] **AC-10** — Se emite un log con `kind`, `outcome` y `durationMs`; ninguna línea contiene el token ni el body.
- [ ] Sin overrides (publishers provisionales) → 503 en un payload válido.

## Fuera de alcance
- NATS (009, 010).

## Verificación
```bash
pnpm test:e2e
pnpm check
```

## Handoff
- `POST /webhooks/traccar/{positions,events}` (@Public + WebhookTokenGuard) → 200 `{outcome}`; `IngestionModule.register(overrides)` con `UnconfiguredPublisher` (503) por defecto.
- `AppModule.register(..., { eventPublisher, deadLetterPublisher })`; correlationId vía `currentCorrelationId()`.
- Desviaciones: allowlist de rutas ampliada (si no, el e2e fallaba) y log `warn outcome:'failed'` cuando el use case lanza.
