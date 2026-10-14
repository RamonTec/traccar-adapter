import {
  type AppConfig,
  type AuthConfig,
  loadConfig,
} from '../../src/shared/infrastructure/config/app-config.js';

export const TEST_ENV: Readonly<Record<string, string>> = Object.freeze({
  KEYCLOAK_ISSUER_URL: 'http://keycloak.test/realms/telemetry',
});

export type TestConfigOverrides = Partial<Omit<AppConfig, 'auth'>> & {
  readonly auth?: Partial<AuthConfig>;
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
  };
}
