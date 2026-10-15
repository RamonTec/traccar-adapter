import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TraccarHttpClient } from '../../shared/infrastructure/traccar/traccar-http-client.js';
import {
  TRACCAR_DEVICE_PORT,
  type TraccarDevicePort,
} from './application/ports/traccar-device.port.js';
import { RegisterDeviceUseCase } from './application/use-cases/register-device.use-case.js';
import { DeviceModule } from './device.module.js';
import { DeviceController } from './infrastructure/inbound/device.controller.js';
import { TraccarDeviceHttpAdapter } from './infrastructure/outbound/traccar-device.http-adapter.js';

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

describe('DeviceModule (wiring)', () => {
  it('wires providers and controllers resolving RegisterDeviceUseCase, DeviceController and TraccarDevicePort', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FakeTraccarModule, DeviceModule],
    }).compile();

    const useCase = moduleRef.get<RegisterDeviceUseCase>(RegisterDeviceUseCase);
    const controller = moduleRef.get<DeviceController>(DeviceController);
    const port = moduleRef.get<TraccarDevicePort>(TRACCAR_DEVICE_PORT);

    expect(useCase).toBeInstanceOf(RegisterDeviceUseCase);
    expect(controller).toBeInstanceOf(DeviceController);
    expect(port).toBeInstanceOf(TraccarDeviceHttpAdapter);
  });
});
