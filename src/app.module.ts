import {
  type DynamicModule,
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import type { DestinationStream } from 'pino';
import { JwtVerifier } from './shared/infrastructure/auth/jwt-verifier.js';
import { ServiceAuthGuard } from './shared/infrastructure/auth/service-auth.guard.js';
import {
  APP_CONFIG,
  type AppConfig,
} from './shared/infrastructure/config/app-config.js';
import { RequestContextMiddleware } from './shared/infrastructure/context/request-context.middleware.js';
import { HealthController } from './shared/infrastructure/http/health.controller.js';
import { HealthModule } from './shared/infrastructure/health/health.module.js';
import { HttpExceptionFilter } from './shared/infrastructure/http/http-exception.filter.js';
import { LoggingModule } from './shared/infrastructure/logging/logging.module.js';
import { TraccarModule } from './shared/infrastructure/traccar/traccar.module.js';
import { GroupModule } from './modules/group/group.module.js';
import { DeviceModule } from './modules/device/device.module.js';
import type { DeadLetterPublisherPort } from './modules/ingestion/application/ports/dead-letter-publisher.port.js';
import type { EventPublisherPort } from './modules/ingestion/application/ports/event-publisher.port.js';
import { IngestionModule } from './modules/ingestion/ingestion.module.js';

export interface AppModuleOverrides {
  readonly jwtVerifier?: Pick<JwtVerifier, 'verify'>;
  readonly eventPublisher?: EventPublisherPort;
  readonly deadLetterPublisher?: DeadLetterPublisherPort;
}

@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }

  static register(
    config: AppConfig,
    logStream?: DestinationStream,
    overrides?: AppModuleOverrides,
  ): DynamicModule {
    const jwtVerifierProvider = overrides?.jwtVerifier
      ? { provide: JwtVerifier, useValue: overrides.jwtVerifier }
      : {
          provide: JwtVerifier,
          useFactory: (c: AppConfig) => new JwtVerifier(c.auth),
          inject: [APP_CONFIG],
        };

    const configModule: DynamicModule = {
      module: class ConfigModule {},
      global: true,
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };

    return {
      module: AppModule,
      imports: [
        configModule,
        HealthModule,
        TraccarModule,
        LoggingModule.forRoot(config, logStream),
        GroupModule,
        DeviceModule,
        IngestionModule.register({
          eventPublisher: overrides?.eventPublisher,
          deadLetterPublisher: overrides?.deadLetterPublisher,
        }),
      ],
      controllers: [HealthController],
      providers: [
        { provide: APP_FILTER, useClass: HttpExceptionFilter },
        jwtVerifierProvider,
        { provide: APP_GUARD, useClass: ServiceAuthGuard },
      ],
    };
  }
}
