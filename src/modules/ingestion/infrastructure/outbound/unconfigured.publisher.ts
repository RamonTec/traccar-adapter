import { UpstreamUnavailableError } from '../../../../shared/domain/upstream-unavailable.error.js';
import type { DeadLetterPublisherPort } from '../../application/ports/dead-letter-publisher.port.js';
import type { EventPublisherPort } from '../../application/ports/event-publisher.port.js';

/** Placeholder until JetStream publishers exist (009, 010): answers 503 so Traccar retries. */
export class UnconfiguredPublisher
  implements EventPublisherPort, DeadLetterPublisherPort
{
  publish(): Promise<never> {
    return Promise.reject(new UpstreamUnavailableError('nats'));
  }
}
