import {
  Controller,
  HttpCode,
  Logger,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../../../shared/infrastructure/auth/auth.decorators.js';
import { currentCorrelationId } from '../../../../shared/infrastructure/context/request-context.js';
import type { RawWebhookBody } from '../../../../shared/infrastructure/http/raw-body.middleware.js';
import type { PayloadKind } from '../../application/ports/dead-letter-publisher.port.js';
import {
  type IngestOutcome,
  IngestTraccarPayloadUseCase,
} from '../../application/use-cases/ingest-traccar-payload.use-case.js';
import { WebhookTokenGuard } from './webhook-token.guard.js';

interface WebhookRequest extends Request {
  rawWebhookBody: RawWebhookBody;
}

// Traccar authenticates with a shared token, not a service JWT (ADR-0005).
@Public()
@UseGuards(WebhookTokenGuard)
@Controller('webhooks/traccar')
export class TraccarWebhookController {
  private readonly logger = new Logger(TraccarWebhookController.name);

  constructor(private readonly ingest: IngestTraccarPayloadUseCase) {}

  @Post('positions')
  @HttpCode(200)
  positions(@Req() req: WebhookRequest): Promise<{ outcome: string }> {
    return this.run('position', req);
  }

  @Post('events')
  @HttpCode(200)
  events(@Req() req: WebhookRequest): Promise<{ outcome: string }> {
    return this.run('event', req);
  }

  private async run(
    kind: PayloadKind,
    req: WebhookRequest,
  ): Promise<{ outcome: string }> {
    const startedAt = performance.now();
    const durationMs = () => Math.round(performance.now() - startedAt);

    let result: IngestOutcome;
    try {
      result = await this.ingest.execute({
        kind,
        rawBody: req.rawWebhookBody.body,
        oversized: req.rawWebhookBody.oversized,
        receivedAt: new Date(),
        correlationId: correlationIdOf(req),
      });
    } catch (err) {
      this.logger.warn({
        msg: 'webhook.ingest',
        kind,
        outcome: 'failed',
        durationMs: durationMs(),
      });
      throw err;
    }

    const line = {
      msg: 'webhook.ingest',
      kind,
      outcome: result.outcome,
      ...('eventId' in result && { eventId: result.eventId }),
      ...('reason' in result && { reason: result.reason }),
      durationMs: durationMs(),
    };
    // dead-lettered and buffered (JetStream down, kept in the outbox) are worth a warning.
    if (result.outcome === 'published') this.logger.log(line);
    else this.logger.warn(line);
    return { outcome: result.outcome };
  }
}

// pino-http's genReqId assigns the correlation id to req.id (ADR-0002 §1).
function correlationIdOf(req: Request): string {
  return (
    currentCorrelationId() ?? (typeof req.id === 'string' ? req.id : 'unknown')
  );
}
