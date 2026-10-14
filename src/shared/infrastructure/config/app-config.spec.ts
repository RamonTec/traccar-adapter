import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ConfigValidationError, loadConfig, parseEnv } from './app-config.js';

function captureError(fn: () => unknown): ConfigValidationError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigValidationError);
    return error as ConfigValidationError;
  }
  throw new Error('Expected ConfigValidationError to be thrown');
}

describe('loadConfig', () => {
  it('AC-1: applies defaults and parses provided values', () => {
    expect(loadConfig({})).toEqual({ port: 3000, logLevel: 'info' });
    expect(loadConfig({ PORT: '8080', LOG_LEVEL: 'debug' })).toEqual({
      port: 8080,
      logLevel: 'debug',
    });
    expect(loadConfig({ PORT: '' })).toEqual({ port: 3000, logLevel: 'info' });
  });

  it('AC-1: ignores undeclared variables', () => {
    expect(loadConfig({ UNRELATED: 'x' })).toEqual({
      port: 3000,
      logLevel: 'info',
    });
  });

  it('AC-2a: reports every invalid variable, not only the first', () => {
    const error = captureError(() =>
      loadConfig({ PORT: 'abc', LOG_LEVEL: 'verbose' }),
    );
    expect(error.invalidVariables).toEqual(['PORT', 'LOG_LEVEL']);
  });

  it.each(['0', '65536', '3.5'])('AC-2b: rejects PORT=%s', (port) => {
    const error = captureError(() => loadConfig({ PORT: port }));
    expect(error.invalidVariables).toEqual(['PORT']);
  });

  it('AC-2c: message lists names but not values', () => {
    const error = captureError(() =>
      loadConfig({ PORT: 'abc', LOG_LEVEL: 'verbose' }),
    );
    expect(error.message).toBe(
      'Invalid environment variables: PORT, LOG_LEVEL',
    );
    expect(error.message).not.toContain('abc');
    expect(error.message).not.toContain('verbose');
  });
});

describe('parseEnv', () => {
  const schema = z.object({ SECRET: z.string().min(1) });

  it('AC-3: treats missing and empty values as absent', () => {
    expect(captureError(() => parseEnv(schema, {})).invalidVariables).toEqual([
      'SECRET',
    ]);
    expect(
      captureError(() => parseEnv(schema, { SECRET: '' })).invalidVariables,
    ).toEqual(['SECRET']);
  });

  it('AC-3: returns the parsed object when valid', () => {
    expect(parseEnv(schema, { SECRET: 'x' })).toEqual({ SECRET: 'x' });
  });
});
