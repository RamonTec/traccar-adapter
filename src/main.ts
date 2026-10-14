import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import {
  ConfigValidationError,
  loadConfig,
} from './shared/infrastructure/config/app-config.js';
import { SERVICE_NAME } from './shared/infrastructure/logging/pino-http-options.js';

async function bootstrap(): Promise<void> {
  let config;
  try {
    config = loadConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      process.stderr.write(
        JSON.stringify({
          time: new Date().toISOString(),
          level: 'error',
          service: SERVICE_NAME,
          context: 'Bootstrap',
          msg: 'Invalid environment variables',
          invalidVariables: error.invalidVariables,
        }) + '\n',
      );
      process.exit(1);
    }
    throw error;
  }

  const app = await NestFactory.create(AppModule.register(config), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks([], { useProcessExit: true });
  await app.listen(config.port);
}

await bootstrap();
