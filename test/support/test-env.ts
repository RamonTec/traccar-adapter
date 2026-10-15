import {
  type AppConfig,
  type AuthConfig,
  type TraccarConfig,
  loadConfig,
} from '../../src/shared/infrastructure/config/app-config.js';

export const TEST_ENV: Readonly<Record<string, string>> = Object.freeze({
  KEYCLOAK_ISSUER_URL: 'http://keycloak.test/realms/telemetry',
  KEYCLOAK_AUDIENCE: 'traccar-adapter',
  TRACCAR_BASE_URL: 'http://traccar.test',
  TRACCAR_API_TOKEN: 'test-token',
  TRACCAR_TIMEOUT_MS: '5000',
});

export type TestConfigOverrides = Partial<
  Omit<AppConfig, 'auth' | 'traccar'>
> & {
  readonly auth?: Partial<AuthConfig>;
  readonly traccar?: Partial<TraccarConfig>;
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
  };
}
