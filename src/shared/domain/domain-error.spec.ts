import { describe, expect, it } from 'vitest';
import { DomainError } from './domain-error.js';

class FooError extends DomainError {
  readonly code = 'FOO';

  constructor(message: string) {
    super(message);
  }
}

describe('DomainError', () => {
  it('AC-9a: subclass is a typed Error with name, message and code', () => {
    const error = new FooError('msg');

    expect(error).toBeInstanceOf(DomainError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('FooError');
    expect(error.message).toBe('msg');
    expect(error.code).toBe('FOO');
  });
});
