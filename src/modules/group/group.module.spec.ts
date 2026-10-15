import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TraccarHttpClient } from '../../shared/infrastructure/traccar/traccar-http-client.js';
import {
  TRACCAR_GROUP_PORT,
  type TraccarGroupPort,
} from './application/ports/traccar-group.port.js';
import { CreateGroupUseCase } from './application/use-cases/create-group.use-case.js';
import { GroupModule } from './group.module.js';
import { GroupController } from './infrastructure/inbound/group.controller.js';
import { TraccarGroupHttpAdapter } from './infrastructure/outbound/traccar-group.http-adapter.js';

@Global()
@Module({
  providers: [
    {
      provide: TraccarHttpClient,
      useValue: {} as unknown as TraccarHttpClient,
    },
  ],
  exports: [TraccarHttpClient],
})
class FakeTraccarModule {}

describe('GroupModule (wiring)', () => {
  it('wires providers and controllers resolving CreateGroupUseCase, GroupController and TraccarGroupPort', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FakeTraccarModule, GroupModule],
    }).compile();

    const useCase = moduleRef.get<CreateGroupUseCase>(CreateGroupUseCase);
    const controller = moduleRef.get<GroupController>(GroupController);
    const port = moduleRef.get<TraccarGroupPort>(TRACCAR_GROUP_PORT);

    expect(useCase).toBeInstanceOf(CreateGroupUseCase);
    expect(controller).toBeInstanceOf(GroupController);
    expect(port).toBeInstanceOf(TraccarGroupHttpAdapter);
  });
});
