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
      traccar: {
        baseUrl: 'http://traccar.test',
        apiToken: 'test-token',
        timeoutMs: 5000,
      },
      webhook: {
        token: 'test-webhook-token-0123456789',
        maxBodyBytes: 1048576,
      },
      nats: {
        servers: ['nats://127.0.0.1:4222'],
        publishTimeoutMs: 2000,
        eventsMaxAgeDays: 7,
        deadLetterMaxAgeDays: 30,
        duplicateWindowMinutes: 10,
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
      traccar: {
        baseUrl: 'http://traccar.test',
        apiToken: 'test-token',
        timeoutMs: 5000,
      },
      webhook: {
        token: 'test-webhook-token-0123456789',
        maxBodyBytes: 1048576,
      },
      nats: {
        servers: ['nats://127.0.0.1:4222'],
        publishTimeoutMs: 2000,
        eventsMaxAgeDays: 7,
        deadLetterMaxAgeDays: 30,
        duplicateWindowMinutes: 10,
      },
    });

    expect(loadConfig({ ...TEST_ENV, PORT: '' })).toEqual({
      port: 3000,
      logLevel: 'info',
      auth: {
        issuerUrl: 'http://keycloak.test/realms/telemetry',
        audience: 'traccar-adapter',
      },
      traccar: {
        baseUrl: 'http://traccar.test',
        apiToken: 'test-token',
        timeoutMs: 5000,
      },
      webhook: {
        token: 'test-webhook-token-0123456789',
        maxBodyBytes: 1048576,
      },
      nats: {
        servers: ['nats://127.0.0.1:4222'],
        publishTimeoutMs: 2000,
        eventsMaxAgeDays: 7,
        deadLetterMaxAgeDays: 30,
        duplicateWindowMinutes: 10,
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
      traccar: {
        baseUrl: 'http://traccar.test',
        apiToken: 'test-token',
        timeoutMs: 5000,
      },
      webhook: {
        token: 'test-webhook-token-0123456789',
        maxBodyBytes: 1048576,
      },
      nats: {
        servers: ['nats://127.0.0.1:4222'],
        publishTimeoutMs: 2000,
        eventsMaxAgeDays: 7,
        deadLetterMaxAgeDays: 30,
        duplicateWindowMinutes: 10,
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

  it('AC-1a: throws ConfigValidationError naming TRACCAR_BASE_URL and TRACCAR_API_TOKEN when missing', () => {
    const error = captureError(() =>
      loadConfig({
        KEYCLOAK_ISSUER_URL: 'http://keycloak.test/realms/telemetry',
      }),
    );
    expect(error.invalidVariables).toContain('TRACCAR_BASE_URL');
    expect(error.invalidVariables).toContain('TRACCAR_API_TOKEN');
  });

  it('AC-1b: normalizes TRACCAR_BASE_URL, sets default timeoutMs, and rejects invalid timeout values', () => {
    const config = loadConfig({
      ...TEST_ENV,
      TRACCAR_BASE_URL: 'http://t:8082/',
    });
    expect(config.traccar.baseUrl).toBe('http://t:8082');
    expect(config.traccar.timeoutMs).toBe(5000);

    const withExplicitTimeout = loadConfig({
      ...TEST_ENV,
      TRACCAR_TIMEOUT_MS: '10000',
    });
    expect(withExplicitTimeout.traccar.timeoutMs).toBe(10000);

    const errorBelowMin = captureError(() =>
      loadConfig({
        ...TEST_ENV,
        TRACCAR_TIMEOUT_MS: '50',
      }),
    );
    expect(errorBelowMin.invalidVariables).toEqual(['TRACCAR_TIMEOUT_MS']);

    const errorNotNumber = captureError(() =>
      loadConfig({
        ...TEST_ENV,
        TRACCAR_TIMEOUT_MS: 'abc',
      }),
    );
    expect(errorNotNumber.invalidVariables).toEqual(['TRACCAR_TIMEOUT_MS']);
  });

  it('AC-1c: error message never contains the value of TRACCAR_API_TOKEN', () => {
    const secretToken = 'super-secret-traccar-token-12345';
    const error = captureError(() =>
      loadConfig({
        ...TEST_ENV,
        TRACCAR_API_TOKEN: secretToken,
        PORT: 'not-a-number',
      }),
    );
    expect(error.invalidVariables).toContain('PORT');
    expect(error.message).not.toContain(secretToken);
  });
});

describe('loadConfig — webhook', () => {
  it('AC-1a: missing WEBHOOK_TOKEN → ConfigValidationError naming it', () => {
    const { WEBHOOK_TOKEN: _omit, ...env } = TEST_ENV;

    expect(captureError(() => loadConfig(env)).invalidVariables).toEqual([
      'WEBHOOK_TOKEN',
    ]);
  });

  it('AC-1a: WEBHOOK_TOKEN shorter than 16 chars is rejected without leaking it', () => {
    const shortToken = 'short-secret-15';
    const error = captureError(() =>
      loadConfig({ ...TEST_ENV, WEBHOOK_TOKEN: shortToken }),
    );

    expect(error.invalidVariables).toEqual(['WEBHOOK_TOKEN']);
    expect(error.message).not.toContain(shortToken);
  });

  it('AC-5a: WEBHOOK_MAX_BODY_BYTES defaults to 1 MiB and accepts overrides', () => {
    expect(loadConfig({ ...TEST_ENV }).webhook.maxBodyBytes).toBe(1_048_576);
    expect(
      loadConfig({ ...TEST_ENV, WEBHOOK_MAX_BODY_BYTES: '2048' }).webhook
        .maxBodyBytes,
    ).toBe(2048);
  });

  it.each(['512', '20000000', 'abc', '1024.5'])(
    'AC-5a: WEBHOOK_MAX_BODY_BYTES=%s is invalid',
    (value) => {
      expect(
        captureError(() =>
          loadConfig({ ...TEST_ENV, WEBHOOK_MAX_BODY_BYTES: value }),
        ).invalidVariables,
      ).toEqual(['WEBHOOK_MAX_BODY_BYTES']);
    },
  );
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
      traccar: {
        baseUrl: 'http://traccar.test',
        apiToken: 'test-token',
        timeoutMs: 5000,
      },
      webhook: {
        token: 'test-webhook-token-0123456789',
        maxBodyBytes: 1048576,
      },
      nats: {
        servers: ['nats://127.0.0.1:4222'],
        publishTimeoutMs: 2000,
        eventsMaxAgeDays: 7,
        deadLetterMaxAgeDays: 30,
        duplicateWindowMinutes: 10,
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
      traccar: {
        baseUrl: 'http://traccar.test',
        apiToken: 'test-token',
        timeoutMs: 5000,
      },
      webhook: {
        token: 'test-webhook-token-0123456789',
        maxBodyBytes: 1048576,
      },
      nats: {
        servers: ['nats://127.0.0.1:4222'],
        publishTimeoutMs: 2000,
        eventsMaxAgeDays: 7,
        deadLetterMaxAgeDays: 30,
        duplicateWindowMinutes: 10,
      },
    });
  });

  it('supports partial traccar overrides with deep merge', () => {
    expect(testConfig({ traccar: { timeoutMs: 10000 } })).toEqual({
      port: 3000,
      logLevel: 'info',
      auth: {
        issuerUrl: 'http://keycloak.test/realms/telemetry',
        audience: 'traccar-adapter',
      },
      traccar: {
        baseUrl: 'http://traccar.test',
        apiToken: 'test-token',
        timeoutMs: 10000,
      },
      webhook: {
        token: 'test-webhook-token-0123456789',
        maxBodyBytes: 1048576,
      },
      nats: {
        servers: ['nats://127.0.0.1:4222'],
        publishTimeoutMs: 2000,
        eventsMaxAgeDays: 7,
        deadLetterMaxAgeDays: 30,
        duplicateWindowMinutes: 10,
      },
    });
  });
});

describe('loadConfig — nats', () => {
  it('AC-1a: missing NATS_SERVERS → ConfigValidationError naming it', () => {
    const { NATS_SERVERS: _omit, ...env } = TEST_ENV;

    expect(captureError(() => loadConfig(env)).invalidVariables).toEqual([
      'NATS_SERVERS',
    ]);
  });

  it('AC-1a: splits and trims a comma-separated server list', () => {
    expect(
      loadConfig({ ...TEST_ENV, NATS_SERVERS: 'nats://a:4222, tls://b:4222' })
        .nats.servers,
    ).toEqual(['nats://a:4222', 'tls://b:4222']);
  });

  it.each(['http://x', 'nats://a:4222,', 'a:4222'])(
    'AC-1a: NATS_SERVERS=%s is invalid',
    (value) => {
      expect(
        captureError(() => loadConfig({ ...TEST_ENV, NATS_SERVERS: value }))
          .invalidVariables,
      ).toEqual(['NATS_SERVERS']);
    },
  );

  it('AC-1b: defaults and optional creds file', () => {
    expect(loadConfig({ ...TEST_ENV }).nats).toEqual({
      servers: ['nats://127.0.0.1:4222'],
      publishTimeoutMs: 2000,
      eventsMaxAgeDays: 7,
      deadLetterMaxAgeDays: 30,
      duplicateWindowMinutes: 10,
    });
    expect(
      loadConfig({ ...TEST_ENV, NATS_CREDS_FILE: '/run/secrets/nats.creds' })
        .nats.credsFile,
    ).toBe('/run/secrets/nats.creds');
  });

  it.each([
    ['NATS_PUBLISH_TIMEOUT_MS', '99'],
    ['NATS_PUBLISH_TIMEOUT_MS', '30001'],
    ['NATS_EVENTS_MAX_AGE_DAYS', '0'],
    ['NATS_DEADLETTER_MAX_AGE_DAYS', '366'],
    ['NATS_DUPLICATE_WINDOW_MINUTES', '61'],
  ])('AC-1b: %s=%s is out of range', (name, value) => {
    expect(
      captureError(() => loadConfig({ ...TEST_ENV, [name]: value }))
        .invalidVariables,
    ).toEqual([name]);
  });
});

describe('testConfig helper — webhook', () => {
  it('supports partial webhook overrides with deep merge', () => {
    expect(testConfig({ webhook: { maxBodyBytes: 1024 } }).webhook).toEqual({
      token: 'test-webhook-token-0123456789',
      maxBodyBytes: 1024,
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
