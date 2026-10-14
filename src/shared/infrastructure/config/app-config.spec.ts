import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { TEST_ENV, testConfig } from '../../../../test/support/test-env.js';
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
  it('AC-10a: loadConfig({}) throws ConfigValidationError containing KEYCLOAK_ISSUER_URL', () => {
    const error = captureError(() => loadConfig({}));
    expect(error.invalidVariables).toContain('KEYCLOAK_ISSUER_URL');
  });

  it('AC-10b: applies defaults and parses provided values with TEST_ENV', () => {
    expect(loadConfig({ ...TEST_ENV })).toEqual({
      port: 3000,
      logLevel: 'info',
      auth: {
        issuerUrl: 'http://keycloak.test/realms/telemetry',
        audience: 'traccar-adapter',
      },
    });

    expect(
      loadConfig({
        ...TEST_ENV,
        PORT: '8080',
        LOG_LEVEL: 'debug',
        KEYCLOAK_AUDIENCE: 'custom-aud',
      }),
    ).toEqual({
      port: 8080,
      logLevel: 'debug',
      auth: {
        issuerUrl: 'http://keycloak.test/realms/telemetry',
        audience: 'custom-aud',
      },
    });

    expect(loadConfig({ ...TEST_ENV, PORT: '' })).toEqual({
      port: 3000,
      logLevel: 'info',
      auth: {
        issuerUrl: 'http://keycloak.test/realms/telemetry',
        audience: 'traccar-adapter',
      },
    });
  });

  it('AC-10c: rejects invalid KEYCLOAK_ISSUER_URL', () => {
    const error = captureError(() =>
      loadConfig({ ...TEST_ENV, KEYCLOAK_ISSUER_URL: 'not-a-url' }),
    );
    expect(error.invalidVariables).toEqual(['KEYCLOAK_ISSUER_URL']);
  });

  it('normalizes KEYCLOAK_ISSUER_URL by trimming trailing slashes', () => {
    const config = loadConfig({
      ...TEST_ENV,
      KEYCLOAK_ISSUER_URL: 'http://keycloak.test/realms/telemetry///',
    });
    expect(config.auth.issuerUrl).toBe('http://keycloak.test/realms/telemetry');
  });

  it('AC-10d (AC-1): ignores undeclared variables', () => {
    expect(loadConfig({ ...TEST_ENV, UNRELATED: 'x' })).toEqual({
      port: 3000,
      logLevel: 'info',
      auth: {
        issuerUrl: 'http://keycloak.test/realms/telemetry',
        audience: 'traccar-adapter',
      },
    });
  });

  it('AC-10d (AC-2a): reports every invalid variable, not only the first', () => {
    const error = captureError(() =>
      loadConfig({
        ...TEST_ENV,
        PORT: 'abc',
        LOG_LEVEL: 'verbose',
        KEYCLOAK_ISSUER_URL: 'not-a-url',
      }),
    );
    expect(error.invalidVariables).toEqual([
      'PORT',
      'LOG_LEVEL',
      'KEYCLOAK_ISSUER_URL',
    ]);
  });

  it.each(['0', '65536', '3.5'])('AC-10d (AC-2b): rejects PORT=%s', (port) => {
    const error = captureError(() => loadConfig({ ...TEST_ENV, PORT: port }));
    expect(error.invalidVariables).toEqual(['PORT']);
  });

  it('AC-10d (AC-2c): message lists names but not values', () => {
    const error = captureError(() =>
      loadConfig({
        ...TEST_ENV,
        PORT: 'abc',
        LOG_LEVEL: 'verbose',
        KEYCLOAK_ISSUER_URL: 'secret-url',
      }),
    );
    expect(error.message).toBe(
      'Invalid environment variables: PORT, LOG_LEVEL, KEYCLOAK_ISSUER_URL',
    );
    expect(error.message).not.toContain('abc');
    expect(error.message).not.toContain('verbose');
    expect(error.message).not.toContain('secret-url');
  });
});

describe('testConfig helper', () => {
  it('returns default test config when no overrides are given', () => {
    expect(testConfig()).toEqual({
      port: 3000,
      logLevel: 'info',
      auth: {
        issuerUrl: 'http://keycloak.test/realms/telemetry',
        audience: 'traccar-adapter',
      },
    });
  });

  it('supports partial auth overrides with deep merge', () => {
    expect(testConfig({ auth: { audience: 'custom-aud' } })).toEqual({
      port: 3000,
      logLevel: 'info',
      auth: {
        issuerUrl: 'http://keycloak.test/realms/telemetry',
        audience: 'custom-aud',
      },
    });
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
