import { testConfig } from '../../../../test/support/test-env.js';
import {
  buildStreamDefinitions,
  DEADLETTER_STREAM,
  EVENTS_STREAM,
  SUBJECTS,
} from './stream-definitions.js';

const DAY_NANOS = 86_400 * 1e9;

describe('buildStreamDefinitions', () => {
  it('AC-1c: builds both streams from the defaults', () => {
    expect(buildStreamDefinitions(testConfig().nats)).toEqual([
      {
        name: EVENTS_STREAM,
        subjects: [SUBJECTS.position, SUBJECTS.deviceEvent],
        maxAgeNanos: 7 * DAY_NANOS,
        duplicateWindowNanos: 600 * 1e9,
      },
      {
        name: DEADLETTER_STREAM,
        subjects: [SUBJECTS.deadLetter],
        maxAgeNanos: 30 * DAY_NANOS,
        duplicateWindowNanos: 600 * 1e9,
      },
    ]);
  });

  it('AC-1c: honours configured ages and window', () => {
    const [events, deadLetter] = buildStreamDefinitions({
      ...testConfig().nats,
      eventsMaxAgeDays: 1,
      deadLetterMaxAgeDays: 2,
      duplicateWindowMinutes: 1,
    });

    expect(events!.maxAgeNanos).toBe(DAY_NANOS);
    expect(deadLetter!.maxAgeNanos).toBe(2 * DAY_NANOS);
    expect(events!.duplicateWindowNanos).toBe(60 * 1e9);
  });

  it('AC-1d: stream names contain no dots (JetStream restriction)', () => {
    for (const { name } of buildStreamDefinitions(testConfig().nats)) {
      expect(name).not.toContain('.');
    }
  });
});
