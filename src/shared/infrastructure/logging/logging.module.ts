import { type DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import type { AppConfig } from '../config/app-config.js';
import { buildPinoHttpOptions } from './pino-http-options.js';

@Module({})
export class LoggingModule {
  static forRoot(config: AppConfig, stream?: DestinationStream): DynamicModule {
    const opts = buildPinoHttpOptions(config);
    return {
      module: LoggingModule,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: stream ? [opts, stream] : opts,
        }),
      ],
      exports: [LoggerModule],
    };
  }
}
