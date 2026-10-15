import { Logger } from '@nestjs/common';
import type { JetStreamPublisher } from '../../../../shared/infrastructure/nats/jetstream.publisher.js';
import { SUBJECTS } from '../../../../shared/infrastructure/nats/stream-definitions.js';
import type {
  DeadLetterPublisherPort,
  DeadLetterRequest,
} from '../../application/ports/dead-letter-publisher.port.js';
import type { Delivery } from '../../application/ports/event-publisher.port.js';
import { buildDeadLetterMessage } from './dead-letter-message.js';

/** Persists every payload that could not be processed (FR10). */
export class JetStreamDeadLetterPublisher implements DeadLetterPublisherPort {
  private readonly logger = new Logger(JetStreamDeadLetterPublisher.name);

  constructor(private readonly publisher: JetStreamPublisher) {}

  async publish(req: DeadLetterRequest): Promise<Delivery> {
    const msg = buildDeadLetterMessage(req);
    await this.publisher.publish(SUBJECTS.deadLetter, msg, {
      msgId: msg.id,
      correlationId: req.correlationId,
    });
    // Never log rawPayload: it may carry personal data.
    this.logger.error(
      { reason: msg.reason, kind: msg.kind, id: msg.id },
      'Payload dead-lettered',
    );
    return 'published';
  }
}
