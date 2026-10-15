import type { TelemetryEvent } from '../../../domain/telemetry-event.js';
import type { EventPublisherPort } from '../event-publisher.port.js';

export class FakeEventPublisher implements EventPublisherPort {
  readonly published: TelemetryEvent[] = [];
  failWith?: Error;

  publish(event: TelemetryEvent): Promise<void> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.published.push(event);
    return Promise.resolve();
  }
}
