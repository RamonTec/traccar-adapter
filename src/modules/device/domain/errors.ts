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
