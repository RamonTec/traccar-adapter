import { describe, expect, it } from 'vitest';
import { DomainError } from './domain-error.js';
import { UpstreamUnavailableError } from './upstream-unavailable.error.js';

describe('UpstreamUnavailableError', () => {
  it('AC-domain: UpstreamUnavailableError has code UPSTREAM_UNAVAILABLE and is instanceof DomainError', () => {
    const error = new UpstreamUnavailableError('traccar');

    expect(error).toBeInstanceOf(DomainError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('UpstreamUnavailableError');
    expect(error.message).toBe('traccar is unavailable');
    expect(error.upstream).toBe('traccar');
    expect(error.code).toBe('UPSTREAM_UNAVAILABLE');
  });
});
