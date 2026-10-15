import { Inject, Injectable, Logger } from '@nestjs/common';
import { headers } from '@nats-io/transport-node';
import { UpstreamUnavailableError } from '../../domain/upstream-unavailable.error.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { currentCorrelationId } from '../context/request-context.js';
import { NatsConnectionManager } from './nats-connection.manager.js';

export interface PublishOptions {
  readonly msgId: string;
  readonly correlationId?: string;
}

export interface PublishResult {
  readonly stream: string;
  readonly seq: number;
  readonly duplicate: boolean;
}

const encoder = new TextEncoder();

/** Publishes with JetStream dedup (`Nats-Msg-Id`) and waits for the PubAck (FR9). */
@Injectable()
export class JetStreamPublisher {
  private readonly logger = new Logger(JetStreamPublisher.name);

  constructor(
    private readonly conn: NatsConnectionManager,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async publish(
    subject: string,
    payload: unknown,
    opts: PublishOptions,
  ): Promise<PublishResult> {
    const startedAt = performance.now();
    const h = headers();
    const correlationId = opts.correlationId ?? currentCorrelationId();
    if (correlationId) h.set('x-correlation-id', correlationId);

    try {
      const ack = await this.conn
        .jetstream()
        .publish(subject, encoder.encode(JSON.stringify(payload)), {
          msgID: opts.msgId,
          timeout: this.config.nats.publishTimeoutMs,
          headers: h,
        });
      const line = {
        subject,
        msgId: opts.msgId,
        duplicate: ack.duplicate,
        durationMs: Math.round(performance.now() - startedAt),
      };
      // A duplicate is Traccar retrying something already stored: expected, not news.
      if (ack.duplicate) this.logger.debug(line);
      else this.logger.log(line);
      return { stream: ack.stream, seq: ack.seq, duplicate: ack.duplicate };
    } catch (err) {
      this.logger.error(
        { subject, msgId: opts.msgId, err },
        'JetStream publish failed',
      );
      throw new UpstreamUnavailableError('nats');
    }
  }
}
