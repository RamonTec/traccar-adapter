import { z } from 'zod';

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface AuthConfig {
  readonly issuerUrl: string;
  readonly audience: string;
}

export interface TraccarConfig {
  readonly baseUrl: string;
  readonly apiToken: string;
  readonly timeoutMs: number;
}

export interface AppConfig {
  readonly port: number;
  readonly logLevel: LogLevel;
  readonly auth: AuthConfig;
  readonly traccar: TraccarConfig;
}

export const APP_CONFIG = Symbol('AppConfig');

export class ConfigValidationError extends Error {
  constructor(readonly invalidVariables: readonly string[]) {
    // Only names, never values: env values may contain secrets.
    super(`Invalid environment variables: ${invalidVariables.join(', ')}`);
    this.name = 'ConfigValidationError';
  }
}

export function parseEnv<S extends z.ZodObject>(
  schema: S,
  env: Record<string, string | undefined>,
): z.infer<S> {
  const present = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== ''),
  );
  const result = schema.safeParse(present);
  if (result.success) {
    return result.data;
  }
  const names = result.error.issues
    .map((issue) => issue.path[0])
    .filter((key) => key !== undefined)
    .map(String);
  throw new ConfigValidationError([...new Set(names)]);
}

const appEnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  KEYCLOAK_ISSUER_URL: z.url().transform((val) => val.replace(/\/+$/, '')),
  KEYCLOAK_AUDIENCE: z.string().min(1).default('traccar-adapter'),
  TRACCAR_BASE_URL: z.url().transform((val) => val.replace(/\/+$/, '')),
  TRACCAR_API_TOKEN: z.string().min(1),
  TRACCAR_TIMEOUT_MS: z.coerce.number().int().min(100).max(60000).default(5000),
});

export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const parsed = parseEnv(appEnvSchema, env);
  return {
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    auth: {
      issuerUrl: parsed.KEYCLOAK_ISSUER_URL,
      audience: parsed.KEYCLOAK_AUDIENCE,
    },
    traccar: {
      baseUrl: parsed.TRACCAR_BASE_URL,
      apiToken: parsed.TRACCAR_API_TOKEN,
      timeoutMs: parsed.TRACCAR_TIMEOUT_MS,
    },
  };
}
