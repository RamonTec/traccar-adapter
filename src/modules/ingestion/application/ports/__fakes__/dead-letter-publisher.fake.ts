import type {
  DeadLetterPublisherPort,
  DeadLetterRequest,
} from '../dead-letter-publisher.port.js';

export class FakeDeadLetterPublisher implements DeadLetterPublisherPort {
  readonly published: DeadLetterRequest[] = [];
  failWith?: Error;

  publish(req: DeadLetterRequest): Promise<void> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.published.push(req);
    return Promise.resolve();
  }
}
