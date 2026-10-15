---
id: 013-T04
status: done           # todo | doing | blocked | done
depends_on: [013-T02]
covers: [AC-1, AC-2, AC-3, AC-4, AC-7, AC-11]
---

# 013-T04 — Add ReliablePublisher

## Objetivo
Publicar en JetStream o, si no se puede, guardar en el outbox, sin adelantar nunca a los pendientes.

## Contexto (leer SOLO esto)
- `src/shared/infrastructure/nats/jetstream.publisher.ts` (solo exports)
- `src/shared/infrastructure/outbox/sqlite-outbox.store.ts` (solo exports)
- `src/shared/domain/upstream-unavailable.error.ts`

## Contrato
```ts
// src/shared/infrastructure/outbox/reliable.publisher.ts
export type Delivery = 'published' | 'buffered';
@Injectable() export class ReliablePublisher {
  constructor(js: JetStreamPublisher, store: SqliteOutboxStore, drainer: OutboxDrainer);
  publish(subject: string, payload: unknown, opts: PublishOptions): Promise<Delivery>;  // PublishOptions = { msgId, correlationId? }
}
```
```ts
// interfaz mínima del drainer que usa (lo implementa T05): { kick(): void }
```
1. `store.stats().pending > 0` → `append` → `'buffered'` (sin llamar a JetStream).
2. Si no: `await js.publish(...)` → `'published'`. Si lanza `UpstreamUnavailableError` → `append` → `drainer.kick()` → `'buffered'`. Otros errores se propagan.
3. `append` falla → `logger.error({ id: msgId, subject, err }, 'Outbox write failed')` → `throw new UpstreamUnavailableError('outbox')`.
4. Cada append → `logger.warn({ id: msgId, subject }, 'Message buffered')` (nunca el body).
Body guardado = `JSON.stringify(payload)`; `correlationId` = `opts.correlationId ?? currentCorrelationId()`.

## Archivos a crear/modificar
- [ ] `src/shared/infrastructure/outbox/reliable.publisher.ts` (nuevo) + `.spec.ts` (unit: `JetStreamPublisher` fake, store real `:memory:`, drainer fake)

## Criterios de aceptación
- [ ] **AC-1** — JetStream OK → `'published'`, outbox vacío.
- [ ] **AC-1/AC-2** — JetStream lanza `UpstreamUnavailableError` → `'buffered'`, una fila con subject, msgId, correlationId y el JSON exacto; `kick()` llamado.
- [ ] **AC-7** — Con un pendiente previo → `'buffered'` sin llamar a JetStream.
- [ ] **AC-3/AC-4** — Outbox lleno → `UpstreamUnavailableError('outbox')` y log `error`.
- [ ] **AC-11** — Log `warn` con `id` y `subject`, sin el body.

## Fuera de alcance
- Drenar (T05) y wiring (T06).

## Verificación
```bash
pnpm vitest run src/shared/infrastructure/outbox
pnpm check
```

## Handoff
- `ReliablePublisher.publish` → 'published' | 'buffered': con pendientes encola detrás (AC-7); `UpstreamUnavailableError` de NATS → outbox + `drainer.kick()`; otros errores se propagan.
- Fallo del outbox (lleno/escritura) → log error + `UpstreamUnavailableError('outbox')` (503). Log warn 'Message buffered' sin body.
