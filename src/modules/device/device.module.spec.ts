import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditModule } from '../../shared/infrastructure/audit/audit.module.js';
import { TraccarHttpClient } from '../../shared/infrastructure/traccar/traccar-http-client.js';
import {
  TRACCAR_DEVICE_PORT,
  type TraccarDevicePort,
} from './application/ports/traccar-device.port.js';
import {
  TRACCAR_DEVICE_STATUS_PORT,
  type TraccarDeviceStatusPort,
} from './application/ports/traccar-device-status.port.js';
import { RegisterDeviceUseCase } from './application/use-cases/register-device.use-case.js';
import { SetDeviceStatusUseCase } from './application/use-cases/set-device-status.use-case.js';
import { DeviceModule } from './device.module.js';
import { DeviceStatusController } from './infrastructure/inbound/device-status.controller.js';
import { DeviceController } from './infrastructure/inbound/device.controller.js';
import { TraccarDeviceStatusHttpAdapter } from './infrastructure/outbound/traccar-device-status.http-adapter.js';
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
      imports: [FakeTraccarModule, AuditModule, DeviceModule],
    }).compile();

    const useCase = moduleRef.get<RegisterDeviceUseCase>(RegisterDeviceUseCase);
    const controller = moduleRef.get<DeviceController>(DeviceController);
    const port = moduleRef.get<TraccarDevicePort>(TRACCAR_DEVICE_PORT);

    expect(useCase).toBeInstanceOf(RegisterDeviceUseCase);
    expect(controller).toBeInstanceOf(DeviceController);
    expect(port).toBeInstanceOf(TraccarDeviceHttpAdapter);
  });

  it('wires SetDeviceStatusUseCase, DeviceStatusController and TraccarDeviceStatusPort', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FakeTraccarModule, AuditModule, DeviceModule],
    }).compile();

    expect(moduleRef.get(SetDeviceStatusUseCase)).toBeInstanceOf(
      SetDeviceStatusUseCase,
    );
    expect(moduleRef.get(DeviceStatusController)).toBeInstanceOf(
      DeviceStatusController,
    );
    expect(
      moduleRef.get<TraccarDeviceStatusPort>(TRACCAR_DEVICE_STATUS_PORT),
    ).toBeInstanceOf(TraccarDeviceStatusHttpAdapter);
  });
});
