import { normalizeEvent, normalizePosition } from '../../domain/normalize.js';
import type {
  NormalizationRejection,
  NormalizeResult,
} from '../../domain/telemetry-event.js';
import type {
  DeadLetterPublisherPort,
  DeadLetterReason,
  PayloadKind,
} from '../ports/dead-letter-publisher.port.js';
import type { EventPublisherPort } from '../ports/event-publisher.port.js';

export interface IngestCommand {
  readonly kind: PayloadKind;
  readonly rawBody: Uint8Array;
  readonly oversized: boolean;
  readonly receivedAt: Date;
  readonly correlationId: string;
}

export type IngestOutcome =
  | { outcome: 'published'; eventId: string }
  | { outcome: 'deadlettered'; reason: DeadLetterReason };

interface Rejection {
  readonly reason: DeadLetterReason;
  readonly detail: string;
}

/** Every payload ends up published or dead-lettered; transport failures propagate (FR10). */
export class IngestTraccarPayloadUseCase {
  constructor(
    private readonly events: EventPublisherPort,
    private readonly deadLetters: DeadLetterPublisherPort,
  ) {}

  async execute(cmd: IngestCommand): Promise<IngestOutcome> {
    const result: NormalizeResult | Rejection = cmd.oversized
      ? {
          reason: 'PAYLOAD_TOO_LARGE',
          detail: 'body exceeds WEBHOOK_MAX_BODY_BYTES',
        }
      : this.normalize(cmd);

    if ('reason' in result) return this.deadLetter(cmd, result);
    if (!result.ok) return this.deadLetter(cmd, result.rejection);

    // Publisher errors propagate so the webhook answers 5xx and Traccar retries.
    await this.events.publish(result.event);
    return { outcome: 'published', eventId: result.event.id };
  }

  private normalize(cmd: IngestCommand): NormalizeResult | Rejection {
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(cmd.rawBody);
    } catch {
      return { reason: 'INVALID_JSON', detail: 'invalid utf-8' };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return { reason: 'INVALID_JSON', detail: 'invalid json' };
    }

    const ctx = {
      receivedAt: cmd.receivedAt,
      correlationId: cmd.correlationId,
    };
    try {
      return cmd.kind === 'position'
        ? normalizePosition(payload, ctx)
        : normalizeEvent(payload, ctx);
    } catch (error) {
      // Only the error name: messages may echo payload values.
      return {
        reason: 'PROCESSING_ERROR',
        detail: error instanceof Error ? error.name : 'UnknownError',
      };
    }
  }

  private async deadLetter(
    cmd: IngestCommand,
    { reason, detail }: Rejection | NormalizationRejection,
  ): Promise<IngestOutcome> {
    await this.deadLetters.publish({
      kind: cmd.kind,
      reason,
      detail,
      rawBody: cmd.rawBody,
      receivedAt: cmd.receivedAt,
      correlationId: cmd.correlationId,
    });
    return { outcome: 'deadlettered', reason };
  }
}
