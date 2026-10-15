export const DEAD_LETTER_PUBLISHER_PORT = Symbol('DeadLetterPublisherPort');

export type DeadLetterReason =
  | 'INVALID_JSON'
  | 'SCHEMA_MISMATCH'
  | 'MISSING_GROUP'
  | 'PAYLOAD_TOO_LARGE'
  | 'PROCESSING_ERROR';

export type PayloadKind = 'position' | 'event';

export interface DeadLetterRequest {
  readonly kind: PayloadKind;
  readonly reason: DeadLetterReason;
  readonly detail: string;
  /** Original bytes as received, never re-encoded (FR10). */
  readonly rawBody: Uint8Array;
  readonly receivedAt: Date;
  readonly correlationId: string;
}

export interface DeadLetterPublisherPort {
  publish(req: DeadLetterRequest): Promise<void>;
}
