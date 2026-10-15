import { readFileSync } from 'node:fs';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import {
  jetstream,
  JetStreamApiError,
  type JetStreamClient,
  jetstreamManager,
  RetentionPolicy,
  StorageType,
} from '@nats-io/jetstream';
import {
  connect,
  credsAuthenticator,
  type NatsConnection,
} from '@nats-io/transport-node';
import { UpstreamUnavailableError } from '../../domain/upstream-unavailable.error.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { ReadinessRegistry } from '../health/readiness.registry.js';
import {
  buildStreamDefinitions,
  type StreamDefinition,
} from './stream-definitions.js';

const STREAM_NOT_FOUND = 10059;
const MAX_BACKOFF_MS = 30_000;

/**
 * Connects in the background so the app starts without NATS (readiness reports it).
 * The first connection uses our own cancellable retry loop; after that the client
 * reconnects on its own.
 */
@Injectable()
export class NatsConnectionManager
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(NatsConnectionManager.name);
  private nc?: NatsConnection;
  private js?: JetStreamClient;
  private ready = false;
  private stopped = false;
  private attempt = 0;
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly readiness: ReadinessRegistry,
  ) {}

  onApplicationBootstrap(): void {
    // Not critical since 013: with NATS down the outbox keeps the service ready.
    this.readiness.register('nats', () => Promise.resolve(this.isReady()), {
      critical: false,
    });
    void this.start();
  }

  isReady(): boolean {
    return this.ready;
  }

  jetstream(): JetStreamClient {
    if (!this.ready || !this.js) throw new UpstreamUnavailableError('nats');
    return this.js;
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    this.ready = false;
    clearTimeout(this.timer);
    if (this.nc && !this.nc.isClosed()) await this.nc.drain();
  }

  private async start(): Promise<void> {
    const { servers, credsFile } = this.config.nats;
    try {
      const nc = await connect({
        servers: [...servers],
        name: 'traccar-adapter',
        maxReconnectAttempts: -1,
        reconnectTimeWait: 2000,
        ...(credsFile && {
          authenticator: credsAuthenticator(readFileSync(credsFile)),
        }),
      });
      if (this.stopped) {
        await nc.close();
        return;
      }
      this.nc = nc;
    } catch (err) {
      if (this.stopped) return;
      const delayMs = Math.min(1000 * 2 ** this.attempt, MAX_BACKOFF_MS);
      this.attempt += 1;
      this.logger.warn(
        { attempt: this.attempt, delayMs, err },
        'NATS not reachable, retrying',
      );
      this.timer = setTimeout(() => void this.start(), delayMs);
      return;
    }

    this.js = jetstream(this.nc);
    void this.watchStatus(this.nc);
    await this.markReady();
  }

  private async watchStatus(nc: NatsConnection): Promise<void> {
    for await (const status of nc.status()) {
      if (status.type === 'disconnect') {
        this.ready = false;
        this.logger.warn('NATS disconnected');
      } else if (status.type === 'reconnect') {
        this.logger.log('NATS reconnected');
        await this.markReady();
      }
    }
  }

  private async markReady(): Promise<void> {
    try {
      await this.ensureStreams();
      this.ready = !this.stopped;
      this.logger.log('NATS ready');
    } catch (err) {
      // Stays not ready; the next reconnect retries.
      this.logger.error({ err }, 'Could not ensure JetStream streams');
    }
  }

  private async ensureStreams(): Promise<void> {
    if (!this.nc) return;
    const jsm = await jetstreamManager(this.nc);
    for (const def of buildStreamDefinitions(this.config.nats)) {
      const action = await this.ensureStream(jsm, def);
      this.logger.log({ name: def.name, action }, 'Stream ensured');
    }
  }

  private async ensureStream(
    jsm: Awaited<ReturnType<typeof jetstreamManager>>,
    def: StreamDefinition,
  ): Promise<'created' | 'updated' | 'unchanged'> {
    const wanted = {
      subjects: [...def.subjects],
      max_age: def.maxAgeNanos,
      duplicate_window: def.duplicateWindowNanos,
    };
    let current;
    try {
      current = (await jsm.streams.info(def.name)).config;
    } catch (err) {
      if (!(
        err instanceof JetStreamApiError && err.code === STREAM_NOT_FOUND
      )) {
        throw err;
      }
      await jsm.streams.add({
        name: def.name,
        storage: StorageType.File,
        retention: RetentionPolicy.Limits,
        ...wanted,
      });
      return 'created';
    }

    const same =
      current.max_age === wanted.max_age &&
      current.duplicate_window === wanted.duplicate_window &&
      [...current.subjects].sort().join() ===
        [...wanted.subjects].sort().join();
    if (same) return 'unchanged';
    await jsm.streams.update(def.name, wanted);
    return 'updated';
  }
}
