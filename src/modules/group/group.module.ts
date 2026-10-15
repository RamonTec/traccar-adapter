import { Module } from '@nestjs/common';
import {
  AUDIT_LOG_PORT,
  type AuditLogPort,
} from '../../shared/application/ports/audit-log.port.js';
import {
  CLOCK_PORT,
  type ClockPort,
} from '../../shared/application/ports/clock.port.js';
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
      useFactory: (p: TraccarGroupPort, a: AuditLogPort, c: ClockPort) =>
        new CreateGroupUseCase(p, a, c),
      inject: [TRACCAR_GROUP_PORT, AUDIT_LOG_PORT, CLOCK_PORT],
    },
  ],
})
export class GroupModule {}
