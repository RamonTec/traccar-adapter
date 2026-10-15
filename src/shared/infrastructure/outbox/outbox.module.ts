import {
  Global,
  Module,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { ReadinessRegistry } from '../health/readiness.registry.js';
import { OutboxDrainer } from './outbox.drainer.js';
import { ReliablePublisher } from './reliable.publisher.js';
import { SqliteOutboxStore } from './sqlite-outbox.store.js';

@Global()
@Module({
  providers: [
    {
      provide: SqliteOutboxStore,
      useFactory: (c: AppConfig) => new SqliteOutboxStore(c.outbox),
      inject: [APP_CONFIG],
    },
    OutboxDrainer,
    ReliablePublisher,
  ],
  exports: [ReliablePublisher],
})
export class OutboxModule implements OnModuleInit, OnApplicationShutdown {
  constructor(
    private readonly store: SqliteOutboxStore,
    private readonly registry: ReadinessRegistry,
  ) {}

  onModuleInit(): void {
    // Critical: while the outbox accepts writes, nothing is lost even with NATS down (AC-12).
    this.registry.register('outbox', () =>
      Promise.resolve(this.store.isWritable()),
    );
    this.registry.registerInfo('outbox', () => this.store.stats());
  }

  onApplicationShutdown(): void {
    this.store.close();
  }
}
