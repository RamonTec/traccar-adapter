import { DomainError } from '../../../shared/domain/domain-error.js';
import { GroupNameAmbiguousError } from './errors.js';

describe('GroupNameAmbiguousError', () => {
  it('AC-3a: has code GROUP_NAME_AMBIGUOUS, is instanceof DomainError and exposes name and matches', () => {
    const error = new GroupNameAmbiguousError('acme', 2);

    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('GROUP_NAME_AMBIGUOUS');
    expect(error.name).toBe('acme');
    expect(error.matches).toBe(2);
    expect(error.message).toBe('2 groups named "acme" exist in Traccar');
  });
});
