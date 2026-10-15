import { Global, Module } from '@nestjs/common';
import { NatsConnectionManager } from './nats-connection.manager.js';

@Global()
@Module({
  providers: [NatsConnectionManager],
  exports: [NatsConnectionManager],
})
export class MessagingModule {}
