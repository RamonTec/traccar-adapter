import { Module } from '@nestjs/common';
import { TraccarHttpClient } from '../../shared/infrastructure/traccar/traccar-http-client.js';
import {
  TRACCAR_DEVICE_STATUS_PORT,
  type TraccarDeviceStatusPort,
} from './application/ports/traccar-device-status.port.js';
import {
  TRACCAR_DEVICE_PORT,
  type TraccarDevicePort,
} from './application/ports/traccar-device.port.js';
import { RegisterDeviceUseCase } from './application/use-cases/register-device.use-case.js';
import { SetDeviceStatusUseCase } from './application/use-cases/set-device-status.use-case.js';
import { DeviceStatusController } from './infrastructure/inbound/device-status.controller.js';
import { DeviceController } from './infrastructure/inbound/device.controller.js';
import { TraccarDeviceStatusHttpAdapter } from './infrastructure/outbound/traccar-device-status.http-adapter.js';
import { TraccarDeviceHttpAdapter } from './infrastructure/outbound/traccar-device.http-adapter.js';

@Module({
  controllers: [DeviceController, DeviceStatusController],
  providers: [
    {
      provide: TRACCAR_DEVICE_PORT,
      useFactory: (c: TraccarHttpClient) => new TraccarDeviceHttpAdapter(c),
      inject: [TraccarHttpClient],
    },
    {
      provide: RegisterDeviceUseCase,
      useFactory: (p: TraccarDevicePort) => new RegisterDeviceUseCase(p),
      inject: [TRACCAR_DEVICE_PORT],
    },
    {
      provide: TRACCAR_DEVICE_STATUS_PORT,
      useFactory: (c: TraccarHttpClient) =>
        new TraccarDeviceStatusHttpAdapter(c),
      inject: [TraccarHttpClient],
    },
    {
      provide: SetDeviceStatusUseCase,
      useFactory: (p: TraccarDeviceStatusPort) => new SetDeviceStatusUseCase(p),
      inject: [TRACCAR_DEVICE_STATUS_PORT],
    },
  ],
})
export class DeviceModule {}
