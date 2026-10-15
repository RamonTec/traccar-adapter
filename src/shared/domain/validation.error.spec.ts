import { DomainError } from './domain-error.js';
import { ValidationError } from './validation.error.js';

describe('ValidationError', () => {
  it('AC-4a: has code VALIDATION_ERROR, is instanceof DomainError and keeps details', () => {
    const details = [{ path: 'name', message: 'Required' }];
    const error = new ValidationError(details);

    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.name).toBe('ValidationError');
    expect(error.message).toBe('Validation failed');
    expect(error.details).toEqual(details);
  });
});
