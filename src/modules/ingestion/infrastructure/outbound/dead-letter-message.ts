import { createHash } from 'node:crypto';
import type {
  DeadLetterReason,
  DeadLetterRequest,
  PayloadKind,
} from '../../application/ports/dead-letter-publisher.port.js';

export const DEAD_LETTER_MAX_RAW_BYTES = 65_536;
export const DEAD_LETTER_MAX_DETAIL_CHARS = 500;

/** ADR-0004 dead-letter message. */
export interface DeadLetterMessage {
  readonly id: string;
  readonly source: 'traccar';
  readonly kind: PayloadKind;
  readonly reason: DeadLetterReason;
  readonly detail: string;
  readonly receivedAt: string;
  readonly correlationId: string;
  readonly rawPayload: string;
  readonly rawEncoding: 'utf8' | 'base64';
  readonly truncated: boolean;
}

export function buildDeadLetterMessage(
  req: DeadLetterRequest,
): DeadLetterMessage {
  // Hash of the full body: a Traccar retry of the same body dedups to one message.
  const hash = createHash('sha256').update(req.rawBody).digest('hex');
  const head = req.rawBody.subarray(0, DEAD_LETTER_MAX_RAW_BYTES);

  let rawPayload: string;
  let rawEncoding: 'utf8' | 'base64';
  try {
    rawPayload = new TextDecoder('utf-8', { fatal: true }).decode(head);
    rawEncoding = 'utf8';
  } catch {
    rawPayload = Buffer.from(head).toString('base64');
    rawEncoding = 'base64';
  }

  return {
    id: `traccar-deadletter-${hash}`,
    source: 'traccar',
    kind: req.kind,
    reason: req.reason,
    detail: req.detail
      .replace(/bearer\s+\S+/gi, 'Bearer [REDACTED]')
      .slice(0, DEAD_LETTER_MAX_DETAIL_CHARS),
    receivedAt: req.receivedAt.toISOString(),
    correlationId: req.correlationId,
    rawPayload,
    rawEncoding,
    truncated: req.rawBody.length > DEAD_LETTER_MAX_RAW_BYTES,
  };
}
