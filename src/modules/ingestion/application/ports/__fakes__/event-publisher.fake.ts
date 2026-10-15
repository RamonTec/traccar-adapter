import type { TelemetryEvent } from '../../../domain/telemetry-event.js';
import type { Delivery, EventPublisherPort } from '../event-publisher.port.js';

export class FakeEventPublisher implements EventPublisherPort {
  readonly published: TelemetryEvent[] = [];
  failWith?: Error;
  delivery: Delivery = 'published';

  publish(event: TelemetryEvent): Promise<Delivery> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.published.push(event);
    return Promise.resolve(this.delivery);
  }
}
