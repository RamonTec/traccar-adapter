import { Module } from '@nestjs/common';
import { TraccarHttpClient } from '../../shared/infrastructure/traccar/traccar-http-client.js';
import {
  TRACCAR_GROUP_PORT,
  type TraccarGroupPort,
} from './application/ports/traccar-group.port.js';
import { CreateGroupUseCase } from './application/use-cases/create-group.use-case.js';
import { GroupController } from './infrastructure/inbound/group.controller.js';
import { TraccarGroupHttpAdapter } from './infrastructure/outbound/traccar-group.http-adapter.js';

@Module({
  controllers: [GroupController],
  providers: [
    {
      provide: TRACCAR_GROUP_PORT,
      useFactory: (c: TraccarHttpClient) => new TraccarGroupHttpAdapter(c),
      inject: [TraccarHttpClient],
    },
    {
      provide: CreateGroupUseCase,
      useFactory: (p: TraccarGroupPort) => new CreateGroupUseCase(p),
      inject: [TRACCAR_GROUP_PORT],
    },
  ],
})
export class GroupModule {}
