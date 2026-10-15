import { DomainError } from '../../../shared/domain/domain-error.js';

export class DeviceAlreadyRegisteredError extends DomainError {
  readonly code = 'DEVICE_ALREADY_REGISTERED';

  constructor(
    readonly uniqueId: string,
    readonly existingGroupId: number,
  ) {
    super(
      `Device ${uniqueId} is already registered in group ${existingGroupId}`,
    );
  }
}

export class GroupNotFoundError extends DomainError {
  readonly code = 'GROUP_NOT_FOUND';

  constructor(readonly groupId: number) {
    super(`Group ${groupId} not found`);
  }
}

export class DeviceNotFoundError extends DomainError {
  readonly code = 'DEVICE_NOT_FOUND';

  constructor(readonly deviceId: number) {
    super(`Device ${deviceId} not found`);
  }
}

export class DeviceRetiredError extends DomainError {
  readonly code = 'DEVICE_RETIRED';

  constructor(readonly deviceId: number) {
    super(`Device ${deviceId} is retired and cannot be enabled`);
  }
}
