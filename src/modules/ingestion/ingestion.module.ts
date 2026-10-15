import { type DynamicModule, Module } from '@nestjs/common';
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
        {
          provide: EVENT_PUBLISHER_PORT,
          // 009 replaces the default with the JetStream publisher.
          useValue: overrides?.eventPublisher ?? new UnconfiguredPublisher(),
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
