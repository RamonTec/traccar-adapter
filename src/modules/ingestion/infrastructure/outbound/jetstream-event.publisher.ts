import type { JetStreamPublisher } from '../../../../shared/infrastructure/nats/jetstream.publisher.js';
import { SUBJECTS } from '../../../../shared/infrastructure/nats/stream-definitions.js';
import type { EventPublisherPort } from '../../application/ports/event-publisher.port.js';
import type { TelemetryEvent } from '../../domain/telemetry-event.js';

export class JetStreamEventPublisher implements EventPublisherPort {
  constructor(private readonly publisher: JetStreamPublisher) {}

  async publish(event: TelemetryEvent): Promise<void> {
    const subject =
      event.type === 'position.reported'
        ? SUBJECTS.position
        : SUBJECTS.deviceEvent;
    // event.id doubles as Nats-Msg-Id: Traccar retries collapse into one message (ADR-0004).
    await this.publisher.publish(subject, event, {
      msgId: event.id,
      correlationId: event.correlationId,
    });
  }
}
