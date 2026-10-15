import { Injectable, Logger } from '@nestjs/common';
import { UpstreamUnavailableError } from '../../domain/upstream-unavailable.error.js';
import { currentCorrelationId } from '../context/request-context.js';
import {
  JetStreamPublisher,
  type PublishOptions,
} from '../nats/jetstream.publisher.js';
import { OutboxDrainer } from './outbox.drainer.js';
import { SqliteOutboxStore } from './sqlite-outbox.store.js';

export type Delivery = 'published' | 'buffered';

/**
 * Publishes to JetStream or, when it is unavailable, stores the message in the
 * local outbox (ADR-0007). Never overtakes pending messages, to keep order.
 */
@Injectable()
export class ReliablePublisher {
  private readonly logger = new Logger(ReliablePublisher.name);

  constructor(
    private readonly js: JetStreamPublisher,
    private readonly store: SqliteOutboxStore,
    private readonly drainer: OutboxDrainer,
  ) {}

  async publish(
    subject: string,
    payload: unknown,
    opts: PublishOptions,
  ): Promise<Delivery> {
    if (this.store.stats().pending > 0) {
      return this.buffer(subject, payload, opts);
    }
    try {
      await this.js.publish(subject, payload, opts);
      return 'published';
    } catch (err) {
      if (!(err instanceof UpstreamUnavailableError)) throw err;
      return this.buffer(subject, payload, opts);
    }
  }

  private buffer(
    subject: string,
    payload: unknown,
    opts: PublishOptions,
  ): Delivery {
    try {
      this.store.append({
        subject,
        msgId: opts.msgId,
        correlationId: opts.correlationId ?? currentCorrelationId(),
        body: JSON.stringify(payload),
      });
    } catch (err) {
      // Not stored anywhere: answer 503 so the sender retries (FR10).
      this.logger.error(
        { id: opts.msgId, subject, err },
        'Outbox write failed',
      );
      throw new UpstreamUnavailableError('outbox');
    }
    this.logger.warn({ id: opts.msgId, subject }, 'Message buffered');
    this.drainer.kick();
    return 'buffered';
  }
}
