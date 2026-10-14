---
spec: 010-deadletter-publish
status: approved       # draft | approved
---

# 010 — Diseño

## Componentes
| Capa | Archivo | N/M | Responsabilidad |
|------|---------|-----|-----------------|
| ingestion/infra | `src/modules/ingestion/infrastructure/outbound/dead-letter-message.ts` | N | Construye el mensaje ADR-0004 (formato de transporte), función pura |
| ingestion/infra | `src/modules/ingestion/infrastructure/outbound/jetstream-dead-letter.publisher.ts` | N | Implementa `DeadLetterPublisherPort` |
| ingestion | `src/modules/ingestion/ingestion.module.ts` | M | El binding por defecto del dead-letter pasa a JetStream |

Sin dependencias nuevas (`node:crypto`, `TextDecoder`).

## Contratos internos
```ts
// dead-letter-message.ts
export const DEAD_LETTER_MAX_RAW_BYTES = 65_536;
export const DEAD_LETTER_MAX_DETAIL_CHARS = 500;
export interface DeadLetterMessage {
  readonly id: string; readonly source: 'traccar'; readonly kind: PayloadKind; readonly reason: DeadLetterReason;
  readonly detail: string; readonly receivedAt: string; readonly correlationId: string;
  readonly rawPayload: string; readonly rawEncoding: 'utf8' | 'base64'; readonly truncated: boolean;
}
export function buildDeadLetterMessage(req: DeadLetterRequest): DeadLetterMessage;

// jetstream-dead-letter.publisher.ts
export class JetStreamDeadLetterPublisher implements DeadLetterPublisherPort {
  constructor(publisher: JetStreamPublisher);
  publish(req: DeadLetterRequest): Promise<void>;
}
```

## Flujo
`buildDeadLetterMessage`:
1. `id = 'traccar-deadletter-' + sha256hex(req.rawBody)`, calculado sobre **todos** los bytes recibidos.
2. `head = rawBody.subarray(0, 64 KiB)`; `truncated = rawBody.length > 64 KiB`.
3. Decodificar `head` como UTF-8 en modo estricto: si funciona → `rawEncoding: 'utf8'`; si no → `base64`. Puede pasar si el truncado cortó un carácter multibyte; es aceptable.
4. `detail`: sustituir `/bearer\s+\S+/gi` por `Bearer [REDACTED]` y recortar a 500 caracteres.
5. `receivedAt` en ISO.

`publish`: `JetStreamPublisher.publish(SUBJECTS.deadLetter, msg, { msgId: msg.id, correlationId: req.correlationId })` y luego `logger.error({ reason, kind, id }, 'Payload dead-lettered')`, sin `rawPayload`. Los errores de publicación los traduce `JetStreamPublisher` a `UpstreamUnavailableError`, y el webhook responde 503.

## Decisiones
- El mensaje se construye en **infraestructura**: es el formato de transporte de ADR-0004 y el use case (008) solo entrega `DeadLetterRequest`.
- El truncado a 64 KiB se aplica a **cualquier** body, no solo a `PAYLOAD_TOO_LARGE`, para acotar el tamaño de los mensajes del stream.
- El hash sobre el body completo hace que un reintento de Traccar del mismo body se deduplique dentro de `duplicate_window`.

## Mapa AC → componentes
| AC | Componentes |
|----|-------------|
| 1, 5, 6 | jetstream-dead-letter.publisher |
| 2, 3, 4 | dead-letter-message |
