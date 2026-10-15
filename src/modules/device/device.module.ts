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
      useFactory: (p: TraccarDevicePort, a: AuditLogPort, c: ClockPort) =>
        new RegisterDeviceUseCase(p, a, c),
      inject: [TRACCAR_DEVICE_PORT, AUDIT_LOG_PORT, CLOCK_PORT],
    },
    {
      provide: TRACCAR_DEVICE_STATUS_PORT,
      useFactory: (c: TraccarHttpClient) =>
        new TraccarDeviceStatusHttpAdapter(c),
      inject: [TraccarHttpClient],
    },
    {
      provide: SetDeviceStatusUseCase,
      useFactory: (p: TraccarDeviceStatusPort, a: AuditLogPort, c: ClockPort) =>
        new SetDeviceStatusUseCase(p, a, c),
      inject: [TRACCAR_DEVICE_STATUS_PORT, AUDIT_LOG_PORT, CLOCK_PORT],
    },
  ],
})
export class DeviceModule {}
