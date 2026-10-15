import { DomainError } from '../../../shared/domain/domain-error.js';
import {
  DeviceAlreadyRegisteredError,
  DeviceNotFoundError,
  DeviceRetiredError,
  GroupNotFoundError,
} from './errors.js';

describe('Device domain errors', () => {
  it('AC-3: DeviceAlreadyRegisteredError has code DEVICE_ALREADY_REGISTERED, is instanceof DomainError and exposes uniqueId and existingGroupId', () => {
    const error = new DeviceAlreadyRegisteredError('123456789012345', 42);

    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('DEVICE_ALREADY_REGISTERED');
    expect(error.uniqueId).toBe('123456789012345');
    expect(error.existingGroupId).toBe(42);
    expect(error.message).toBe(
      'Device 123456789012345 is already registered in group 42',
    );
  });

  it('AC-6: GroupNotFoundError has code GROUP_NOT_FOUND, is instanceof DomainError and exposes groupId', () => {
    const error = new GroupNotFoundError(99);

    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('GROUP_NOT_FOUND');
    expect(error.groupId).toBe(99);
    expect(error.message).toBe('Group 99 not found');
  });

  it('AC-5b: DeviceRetiredError has code DEVICE_RETIRED, is instanceof DomainError and exposes deviceId', () => {
    const error = new DeviceRetiredError(18);

    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('DEVICE_RETIRED');
    expect(error.deviceId).toBe(18);
    expect(error.message).toBe('Device 18 is retired and cannot be enabled');
  });

  it('AC-6: DeviceNotFoundError has code DEVICE_NOT_FOUND, is instanceof DomainError and exposes deviceId', () => {
    const error = new DeviceNotFoundError(999);

    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('DEVICE_NOT_FOUND');
    expect(error.deviceId).toBe(999);
    expect(error.message).toBe('Device 999 not found');
  });
});
