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

export interface WebhookConfig {
  readonly token: string;
  readonly maxBodyBytes: number;
}

export interface NatsConfig {
  readonly servers: readonly string[];
  readonly credsFile?: string;
  readonly publishTimeoutMs: number;
  readonly eventsMaxAgeDays: number;
  readonly deadLetterMaxAgeDays: number;
  readonly duplicateWindowMinutes: number;
}

export interface OutboxConfig {
  /** SQLite file of the delivery outbox (ADR-0007); ':memory:' for tests. */
  readonly path: string;
  readonly maxBytes: number;
}

export interface AppConfig {
  readonly port: number;
  readonly logLevel: LogLevel;
  readonly auth: AuthConfig;
  readonly traccar: TraccarConfig;
  readonly webhook: WebhookConfig;
  readonly nats: NatsConfig;
  readonly outbox: OutboxConfig;
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

const natsServers = z
  .string()
  .transform((val) => val.split(',').map((server) => server.trim()))
  .pipe(z.array(z.string().regex(/^(nats|tls):\/\/.+/)).min(1));

const appEnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  KEYCLOAK_ISSUER_URL: z.url().transform((val) => val.replace(/\/+$/, '')),
  KEYCLOAK_AUDIENCE: z.string().min(1).default('traccar-adapter'),
  TRACCAR_BASE_URL: z.url().transform((val) => val.replace(/\/+$/, '')),
  TRACCAR_API_TOKEN: z.string().min(1),
  TRACCAR_TIMEOUT_MS: z.coerce.number().int().min(100).max(60000).default(5000),
  WEBHOOK_TOKEN: z.string().min(16),
  WEBHOOK_MAX_BODY_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(10_485_760)
    .default(1_048_576),
  NATS_SERVERS: natsServers,
  NATS_CREDS_FILE: z.string().min(1).optional(),
  NATS_PUBLISH_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(30000)
    .default(2000),
  NATS_EVENTS_MAX_AGE_DAYS: z.coerce.number().int().min(1).max(365).default(7),
  NATS_DEADLETTER_MAX_AGE_DAYS: z.coerce
    .number()
    .int()
    .min(1)
    .max(365)
    .default(30),
  NATS_DUPLICATE_WINDOW_MINUTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(60)
    .default(10),
  OUTBOX_PATH: z.string().min(1).default('data/outbox.db'),
  OUTBOX_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1_048_576)
    .max(68_719_476_736)
    .default(536_870_912),
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
    webhook: {
      token: parsed.WEBHOOK_TOKEN,
      maxBodyBytes: parsed.WEBHOOK_MAX_BODY_BYTES,
    },
    nats: {
      servers: parsed.NATS_SERVERS,
      ...(parsed.NATS_CREDS_FILE !== undefined && {
        credsFile: parsed.NATS_CREDS_FILE,
      }),
      publishTimeoutMs: parsed.NATS_PUBLISH_TIMEOUT_MS,
      eventsMaxAgeDays: parsed.NATS_EVENTS_MAX_AGE_DAYS,
      deadLetterMaxAgeDays: parsed.NATS_DEADLETTER_MAX_AGE_DAYS,
      duplicateWindowMinutes: parsed.NATS_DUPLICATE_WINDOW_MINUTES,
    },
    outbox: {
      path: parsed.OUTBOX_PATH,
      maxBytes: parsed.OUTBOX_MAX_BYTES,
    },
  };
}
