import { type DynamicModule, Module } from '@nestjs/common';
import { JetStreamPublisher } from '../../shared/infrastructure/nats/jetstream.publisher.js';
import {
  DEAD_LETTER_PUBLISHER_PORT,
  type DeadLetterPublisherPort,
} from './application/ports/dead-letter-publisher.port.js';
import {
  EVENT_PUBLISHER_PORT,
  type EventPublisherPort,
} from './application/ports/event-publisher.port.js';
import { IngestTraccarPayloadUseCase } from './application/use-cases/ingest-traccar-payload.use-case.js';
import { TraccarWebhookController } from './infrastructure/inbound/traccar-webhook.controller.js';
import { WebhookTokenGuard } from './infrastructure/inbound/webhook-token.guard.js';
import { JetStreamEventPublisher } from './infrastructure/outbound/jetstream-event.publisher.js';
import { UnconfiguredPublisher } from './infrastructure/outbound/unconfigured.publisher.js';

export interface IngestionOverrides {
  eventPublisher?: EventPublisherPort;
  deadLetterPublisher?: DeadLetterPublisherPort;
}

@Module({})
export class IngestionModule {
  static register(overrides?: IngestionOverrides): DynamicModule {
    return {
      module: IngestionModule,
      controllers: [TraccarWebhookController],
      providers: [
        WebhookTokenGuard,
        overrides?.eventPublisher
          ? {
              provide: EVENT_PUBLISHER_PORT,
              useValue: overrides.eventPublisher,
            }
          : {
              provide: EVENT_PUBLISHER_PORT,
              useFactory: (p: JetStreamPublisher) =>
                new JetStreamEventPublisher(p),
              inject: [JetStreamPublisher],
            },
        {
          provide: DEAD_LETTER_PUBLISHER_PORT,
          // 010 replaces the default with the JetStream dead-letter publisher.
          useValue:
            overrides?.deadLetterPublisher ?? new UnconfiguredPublisher(),
        },
        {
          provide: IngestTraccarPayloadUseCase,
          useFactory: (
            events: EventPublisherPort,
            deadLetters: DeadLetterPublisherPort,
          ) => new IngestTraccarPayloadUseCase(events, deadLetters),
          inject: [EVENT_PUBLISHER_PORT, DEAD_LETTER_PUBLISHER_PORT],
        },
      ],
    };
  }
}
