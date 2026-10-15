import { Module } from '@nestjs/common';
import { TraccarHttpClient } from '../../shared/infrastructure/traccar/traccar-http-client.js';
import {
  TRACCAR_DEVICE_PORT,
  type TraccarDevicePort,
} from './application/ports/traccar-device.port.js';
import { RegisterDeviceUseCase } from './application/use-cases/register-device.use-case.js';
import { DeviceController } from './infrastructure/inbound/device.controller.js';
import { TraccarDeviceHttpAdapter } from './infrastructure/outbound/traccar-device.http-adapter.js';

@Module({
  controllers: [DeviceController],
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
  ],
})
export class DeviceModule {}
