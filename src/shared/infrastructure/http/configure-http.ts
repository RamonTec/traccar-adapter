import type { NestExpressApplication } from '@nestjs/platform-express';
import type { AppConfig } from '../config/app-config.js';
import {
  WEBHOOK_PATH_PREFIX,
  rawBodyMiddleware,
} from './raw-body.middleware.js';

/** Requires the app to be created with `bodyParser: false`. */
export function configureHttp(
  app: NestExpressApplication,
  config: AppConfig,
): void {
  // Must run before the JSON parser, which skips requests flagged as read.
  app.use(WEBHOOK_PATH_PREFIX, rawBodyMiddleware(config.webhook.maxBodyBytes));
  app.useBodyParser('json');
}
