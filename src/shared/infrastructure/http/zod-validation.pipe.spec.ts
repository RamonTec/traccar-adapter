import { z } from 'zod';
import { ValidationError } from '../../domain/validation.error.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(z.object({ a: z.string() }).strict());

  function captureError(value: unknown): ValidationError {
    try {
      pipe.transform(value);
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      return err as ValidationError;
    }
    throw new Error('expected ValidationError');
  }

  it('AC-4b: returns the parsed value for a valid input', () => {
    expect(pipe.transform({ a: 'x' })).toEqual({ a: 'x' });
  });

  it.each([
    ['missing field', {}],
    ['unknown key', { a: 'x', b: 1 }],
  ])(
    'AC-4b: throws ValidationError with non-empty issues for %s',
    (_label, value) => {
      const error = captureError(value);

      expect(error.details.length).toBeGreaterThan(0);
      for (const issue of error.details) {
        expect(issue.path).not.toBe('');
        expect(issue.message).not.toBe('');
      }
    },
  );

  it('AC-4b: uses (root) as path for root-level issues', () => {
    const error = captureError('not-an-object');

    expect(error.details[0]?.path).toBe('(root)');
  });
});
