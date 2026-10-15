import type { NatsConfig } from '../config/app-config.js';

// ADR-0004. Stream names cannot contain dots; subjects use them as hierarchy.
export const EVENTS_STREAM = 'TELEMETRY_EVENTS';
export const DEADLETTER_STREAM = 'TELEMETRY_DEADLETTER';

export const SUBJECTS = {
  position: 'telemetry.events.position',
  deviceEvent: 'telemetry.events.device-event',
  deadLetter: 'telemetry.deadletter.traccar',
} as const;

export interface StreamDefinition {
  readonly name: string;
  readonly subjects: readonly string[];
  readonly maxAgeNanos: number;
  readonly duplicateWindowNanos: number;
}

const MS_TO_NANOS = 1_000_000;
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

export function buildStreamDefinitions(
  cfg: NatsConfig,
): readonly StreamDefinition[] {
  const duplicateWindowNanos =
    cfg.duplicateWindowMinutes * MINUTE_MS * MS_TO_NANOS;
  return [
    {
      name: EVENTS_STREAM,
      subjects: [SUBJECTS.position, SUBJECTS.deviceEvent],
      maxAgeNanos: cfg.eventsMaxAgeDays * DAY_MS * MS_TO_NANOS,
      duplicateWindowNanos,
    },
    {
      name: DEADLETTER_STREAM,
      subjects: [SUBJECTS.deadLetter],
      maxAgeNanos: cfg.deadLetterMaxAgeDays * DAY_MS * MS_TO_NANOS,
      duplicateWindowNanos,
    },
  ];
}
