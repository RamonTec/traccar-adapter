import {
  type AppConfig,
  type AuthConfig,
  type TraccarConfig,
  type NatsConfig,
  type OutboxConfig,
  type WebhookConfig,
  loadConfig,
} from '../../src/shared/infrastructure/config/app-config.js';

export const TEST_ENV: Readonly<Record<string, string>> = Object.freeze({
  KEYCLOAK_ISSUER_URL: 'http://keycloak.test/realms/telemetry',
  KEYCLOAK_AUDIENCE: 'traccar-adapter',
  TRACCAR_BASE_URL: 'http://traccar.test',
  TRACCAR_API_TOKEN: 'test-token',
  TRACCAR_TIMEOUT_MS: '5000',
  WEBHOOK_TOKEN: 'test-webhook-token-0123456789',
  NATS_SERVERS: 'nats://127.0.0.1:4222',
  OUTBOX_PATH: ':memory:',
});

export type TestConfigOverrides = Partial<
  Omit<AppConfig, 'auth' | 'traccar' | 'webhook' | 'nats' | 'outbox'>
> & {
  readonly auth?: Partial<AuthConfig>;
  readonly traccar?: Partial<TraccarConfig>;
  readonly webhook?: Partial<WebhookConfig>;
  readonly nats?: Partial<NatsConfig>;
  readonly outbox?: Partial<OutboxConfig>;
};

export function testConfig(overrides?: TestConfigOverrides): AppConfig {
  const base = loadConfig(TEST_ENV);
  if (!overrides) {
    return base;
  }
  return {
    ...base,
    ...overrides,
    auth: {
      ...base.auth,
      ...overrides.auth,
    },
    traccar: {
      ...base.traccar,
      ...overrides.traccar,
    },
    webhook: {
      ...base.webhook,
      ...overrides.webhook,
    },
    nats: {
      ...base.nats,
      ...overrides.nats,
    },
    outbox: {
      ...base.outbox,
      ...overrides.outbox,
    },
  };
}
