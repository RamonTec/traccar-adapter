import type { TelemetryEvent } from '../../domain/telemetry-event.js';

export const EVENT_PUBLISHER_PORT = Symbol('EventPublisherPort');

/** 'buffered': kept in the local outbox until JetStream is back (ADR-0007). */
export type Delivery = 'published' | 'buffered';

export interface EventPublisherPort {
  /** Rejects with UpstreamUnavailableError when the event could not be persisted. */
  publish(event: TelemetryEvent): Promise<Delivery>;
}
