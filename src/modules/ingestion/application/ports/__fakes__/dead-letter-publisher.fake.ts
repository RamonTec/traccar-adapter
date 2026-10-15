import type {
  DeadLetterPublisherPort,
  DeadLetterRequest,
} from '../dead-letter-publisher.port.js';
import type { Delivery } from '../event-publisher.port.js';

export class FakeDeadLetterPublisher implements DeadLetterPublisherPort {
  readonly published: DeadLetterRequest[] = [];
  failWith?: Error;
  delivery: Delivery = 'published';

  publish(req: DeadLetterRequest): Promise<Delivery> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.published.push(req);
    return Promise.resolve(this.delivery);
  }
}
