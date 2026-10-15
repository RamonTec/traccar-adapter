import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { JetStreamPublisher } from '../nats/jetstream.publisher.js';
import { SqliteOutboxStore } from './sqlite-outbox.store.js';

const MAX_BACKOFF_MS = 30_000;

/**
 * Publishes buffered messages in arrival order once JetStream is reachable,
 * with the original Nats-Msg-Id so JetStream drops anything already stored (AC-9).
 */
@Injectable()
export class OutboxDrainer
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(OutboxDrainer.name);
  private draining = false;
  private stopped = false;
  private attempt = 0;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly store: SqliteOutboxStore,
    private readonly js: JetStreamPublisher,
  ) {}

  onApplicationBootstrap(): void {
    this.kick();
  }

  onApplicationShutdown(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  /** Starts a drain unless one is running or a retry is already scheduled. */
  kick(): void {
    if (this.stopped || this.draining || this.timer) return;
    void this.drain();
  }

  private async drain(): Promise<void> {
    this.draining = true;
    this.timer = undefined;
    try {
      let entry = this.store.oldest();
      while (!this.stopped && entry) {
        try {
          await this.js.publish(entry.subject, JSON.parse(entry.body), {
            msgId: entry.msgId,
            correlationId: entry.correlationId,
          });
        } catch {
          this.scheduleRetry();
          return;
        }
        this.store.delete(entry.seq);
        this.attempt = 0;
        this.logger.log(
          {
            id: entry.msgId,
            subject: entry.subject,
            pending: this.store.stats().pending,
          },
          'Buffered message delivered',
        );
        entry = this.store.oldest();
      }
    } finally {
      this.draining = false;
    }
  }

  private scheduleRetry(): void {
    if (this.stopped) return;
    const delayMs = Math.min(1000 * 2 ** this.attempt, MAX_BACKOFF_MS);
    this.attempt += 1;
    this.logger.warn(
      { attempt: this.attempt, delayMs, pending: this.store.stats().pending },
      'Outbox drain failed, retrying',
    );
    this.timer = setTimeout(() => void this.drain(), delayMs);
  }
}
