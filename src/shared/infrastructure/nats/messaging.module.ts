import { Global, Module } from '@nestjs/common';
import { JetStreamPublisher } from './jetstream.publisher.js';
import { NatsConnectionManager } from './nats-connection.manager.js';

@Global()
@Module({
  providers: [NatsConnectionManager, JetStreamPublisher],
  exports: [NatsConnectionManager, JetStreamPublisher],
})
export class MessagingModule {}
