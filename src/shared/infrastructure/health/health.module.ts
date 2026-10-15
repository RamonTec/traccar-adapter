import { Global, Module } from '@nestjs/common';
import { ReadinessController } from './readiness.controller.js';
import { ReadinessRegistry } from './readiness.registry.js';

@Global()
@Module({
  controllers: [ReadinessController],
  providers: [ReadinessRegistry],
  exports: [ReadinessRegistry],
})
export class HealthModule {}
