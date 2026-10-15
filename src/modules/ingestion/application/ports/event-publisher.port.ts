import type { TelemetryEvent } from '../../domain/telemetry-event.js';

export const EVENT_PUBLISHER_PORT = Symbol('EventPublisherPort');

export interface EventPublisherPort {
  /** Rejects with UpstreamUnavailableError when the event could not be persisted. */
  publish(event: TelemetryEvent): Promise<void>;
}
