import { Global, Module, type OnModuleInit } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { ReadinessRegistry } from '../health/readiness.registry.js';
import { TraccarHttpClient } from './traccar-http-client.js';

@Global()
@Module({
  providers: [
    {
      provide: TraccarHttpClient,
      useFactory: (c: AppConfig) => new TraccarHttpClient(c.traccar),
      inject: [APP_CONFIG],
    },
  ],
  exports: [TraccarHttpClient],
})
export class TraccarModule implements OnModuleInit {
  constructor(
    private readonly client: TraccarHttpClient,
    private readonly registry: ReadinessRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register('traccar', () =>
      this.client.request('server.get', 'GET', '/api/server').then(() => true),
    );
  }
}
