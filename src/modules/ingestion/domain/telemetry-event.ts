// Event contract published to JetStream (ADR-0004). Pure types, no runtime code.

interface Envelope<T extends string, D> {
  readonly id: string;
  readonly type: T;
  readonly version: 1;
  readonly source: 'traccar';
  readonly occurredAt: string;
  readonly receivedAt: string;
  readonly correlationId: string;
  readonly data: D;
}

export interface PositionData {
  /** null: Traccar forwards positions before persisting them (id 0, ADR-0004 amendment). */
  positionId: number | null;
  deviceId: number;
  groupId: number;
  fixTime: string;
  deviceTime: string;
  serverTime: string;
  valid: boolean;
  latitude: number;
  longitude: number;
  altitude: number;
  speedKmh: number;
  course: number;
  accuracy: number;
  attributes: Record<string, unknown>;
}

export interface DeviceEventData {
  eventId: number;
  eventType: string;
  deviceId: number;
  groupId: number;
  eventTime: string;
  positionId: number | null;
  attributes: Record<string, unknown>;
}

export type PositionReported = Envelope<'position.reported', PositionData>;
export type DeviceEvent = Envelope<'device.event', DeviceEventData>;
export type TelemetryEvent = PositionReported | DeviceEvent;

export type RejectionReason = 'MISSING_GROUP' | 'SCHEMA_MISMATCH';

export interface NormalizationRejection {
  readonly reason: RejectionReason;
  readonly detail: string;
}

export type NormalizeResult =
  | { ok: true; event: TelemetryEvent }
  | { ok: false; rejection: NormalizationRejection };

export interface NormalizeContext {
  readonly receivedAt: Date;
  readonly correlationId: string;
}
