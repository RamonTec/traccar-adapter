import { UpstreamUnavailableError } from '../../../../shared/domain/upstream-unavailable.error.js';
import type { Device } from '../../domain/device.js';
import {
  DeviceAlreadyRegisteredError,
  GroupNotFoundError,
} from '../../domain/errors.js';
import {
  type CreateDeviceCommand,
  DeviceUniqueIdTakenError,
  type TraccarDevicePort,
} from '../ports/traccar-device.port.js';
import { RegisterDeviceUseCase } from './register-device.use-case.js';

class FakeTraccarDevicePort implements TraccarDevicePort {
  readonly groups = new Set<number>();
  readonly devices: Device[] = [];
  readonly calls: string[] = [];
  nextId = 100;
  failNextCreate?: Error;
  failGroupExists?: Error;
  onCreateHook?: () => void;

  async groupExists(groupId: number): Promise<boolean> {
    this.calls.push(`groupExists(${groupId})`);
    if (this.failGroupExists) {
      throw this.failGroupExists;
    }
    return this.groups.has(groupId);
  }

  async findByUniqueId(uniqueId: string): Promise<Device | undefined> {
    this.calls.push(`findByUniqueId(${uniqueId})`);
    return this.devices.find((d) => d.uniqueId === uniqueId);
  }

  async create(input: CreateDeviceCommand): Promise<Device> {
    this.calls.push(`create(${input.uniqueId})`);
    if (this.onCreateHook) {
      this.onCreateHook();
    }
    if (this.failNextCreate) {
      const err = this.failNextCreate;
      this.failNextCreate = undefined;
      throw err;
    }
    const newDevice: Device = {
      id: this.nextId++,
      uniqueId: input.uniqueId,
      name: input.name,
      groupId: input.groupId,
      disabled: false,
    };
    this.devices.push(newDevice);
    return newDevice;
  }

  async retire(deviceId: number, newUniqueId: string): Promise<void> {
    this.calls.push(`retire(${deviceId}, ${newUniqueId})`);
    const device = this.devices.find((d) => d.id === deviceId);
    if (device) {
      Object.assign(device, { uniqueId: newUniqueId });
    }
  }
}

describe('RegisterDeviceUseCase', () => {
  let port: FakeTraccarDevicePort;
  let useCase: RegisterDeviceUseCase;

  beforeEach(() => {
    port = new FakeTraccarDevicePort();
    useCase = new RegisterDeviceUseCase(port);
  });

  it('AC-1: creates a new device when group exists and no device with uniqueId exists', async () => {
    port.groups.add(5);

    const output = await useCase.execute({
      uniqueId: '123456789012345',
      name: 'Truck 1',
      groupId: 5,
    });

    expect(output.result).toBe('created');
    expect(output.device).toEqual({
      id: 100,
      uniqueId: '123456789012345',
      name: 'Truck 1',
      groupId: 5,
      disabled: false,
    });
    expect(output.retiredDeviceId).toBeUndefined();
  });

  it('AC-2: returns existing device when enabled in same group without calling create or retire', async () => {
    port.groups.add(5);
    port.devices.push({
      id: 42,
      uniqueId: '123456789012345',
      name: 'Initial Name',
      groupId: 5,
      disabled: false,
    });

    const output = await useCase.execute({
      uniqueId: '123456789012345',
      name: 'New Name',
      groupId: 5,
    });

    expect(output.result).toBe('existing');
    expect(output.device.id).toBe(42);
    expect(output.device.name).toBe('Initial Name');
    expect(port.calls).toEqual([
      'groupExists(5)',
      'findByUniqueId(123456789012345)',
    ]);
    expect(port.calls.some((c) => c.startsWith('create'))).toBe(false);
    expect(port.calls.some((c) => c.startsWith('retire'))).toBe(false);
  });

  it('AC-3: throws DeviceAlreadyRegisteredError when enabled in another group without changing the device', async () => {
    port.groups.add(5);
    port.groups.add(9);
    port.devices.push({
      id: 42,
      uniqueId: '123456789012345',
      name: 'Truck 9',
      groupId: 9,
      disabled: false,
    });

    await expect(
      useCase.execute({
        uniqueId: '123456789012345',
        name: 'Truck 1',
        groupId: 5,
      }),
    ).rejects.toSatisfy((err) => {
      expect(err).toBeInstanceOf(DeviceAlreadyRegisteredError);
      expect((err as DeviceAlreadyRegisteredError).uniqueId).toBe(
        '123456789012345',
      );
      expect((err as DeviceAlreadyRegisteredError).existingGroupId).toBe(9);
      return true;
    });

    const existingDevice = port.devices.find((d) => d.id === 42);
    expect(existingDevice?.groupId).toBe(9);
    expect(existingDevice?.uniqueId).toBe('123456789012345');
  });

  it('AC-4: retires disabled device and creates new device in requested group', async () => {
    port.groups.add(5);
    port.groups.add(9);
    port.devices.push({
      id: 18,
      uniqueId: '123456789012345',
      name: 'Old Device',
      groupId: 9,
      disabled: true,
    });

    const output = await useCase.execute({
      uniqueId: '123456789012345',
      name: 'New Device',
      groupId: 5,
    });

    expect(output.result).toBe('retired-and-created');
    expect(output.retiredDeviceId).toBe(18);
    expect(output.device.id).not.toBe(18);
    expect(output.device.groupId).toBe(5);
    expect(output.device.disabled).toBe(false);

    const oldDevice = port.devices.find((d) => d.id === 18);
    expect(oldDevice).toEqual({
      id: 18,
      uniqueId: '123456789012345:retired:18',
      name: 'Old Device',
      groupId: 9,
      disabled: true,
    });

    expect(port.calls).toEqual([
      'groupExists(5)',
      'findByUniqueId(123456789012345)',
      'retire(18, 123456789012345:retired:18)',
      'create(123456789012345)',
    ]);
  });

  it('AC-5: retains retirement if create fails and retry succeeds as created', async () => {
    port.groups.add(5);
    port.devices.push({
      id: 18,
      uniqueId: '123456789012345',
      name: 'Old Device',
      groupId: 5,
      disabled: true,
    });
    port.failNextCreate = new UpstreamUnavailableError('traccar');

    await expect(
      useCase.execute({
        uniqueId: '123456789012345',
        name: 'New Device',
        groupId: 5,
      }),
    ).rejects.toBeInstanceOf(UpstreamUnavailableError);

    // Old device is already retired
    const oldDevice = port.devices.find((d) => d.id === 18);
    expect(oldDevice?.uniqueId).toBe('123456789012345:retired:18');

    // Second execution finds no device with original uniqueId -> created
    const retryOutput = await useCase.execute({
      uniqueId: '123456789012345',
      name: 'New Device',
      groupId: 5,
    });
    expect(retryOutput.result).toBe('created');
    expect(retryOutput.device.groupId).toBe(5);
  });

  it('AC-6: throws GroupNotFoundError when group does not exist and does not check device', async () => {
    await expect(
      useCase.execute({
        uniqueId: '123456789012345',
        name: 'Truck 1',
        groupId: 99,
      }),
    ).rejects.toSatisfy((err) => {
      expect(err).toBeInstanceOf(GroupNotFoundError);
      expect((err as GroupNotFoundError).groupId).toBe(99);
      return true;
    });

    expect(port.calls).toEqual(['groupExists(99)']);
  });

  it('AC-8: propagates UpstreamUnavailableError from groupExists', async () => {
    port.failGroupExists = new UpstreamUnavailableError('traccar');

    await expect(
      useCase.execute({
        uniqueId: '123456789012345',
        name: 'Truck 1',
        groupId: 5,
      }),
    ).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

  it('Carrera: resolves to existing when create encounters DeviceUniqueIdTakenError and finds enabled device in same group', async () => {
    port.groups.add(5);
    port.failNextCreate = new DeviceUniqueIdTakenError('123456789012345');
    port.onCreateHook = () => {
      port.devices.push({
        id: 77,
        uniqueId: '123456789012345',
        name: 'Concurrent Truck',
        groupId: 5,
        disabled: false,
      });
    };

    const output = await useCase.execute({
      uniqueId: '123456789012345',
      name: 'My Truck',
      groupId: 5,
    });

    expect(output.result).toBe('existing');
    expect(output.device.id).toBe(77);
  });

  it('Carrera: throws DeviceAlreadyRegisteredError when create encounters DeviceUniqueIdTakenError and finds enabled device in other group', async () => {
    port.groups.add(5);
    port.failNextCreate = new DeviceUniqueIdTakenError('123456789012345');
    port.onCreateHook = () => {
      port.devices.push({
        id: 77,
        uniqueId: '123456789012345',
        name: 'Concurrent Truck',
        groupId: 9,
        disabled: false,
      });
    };

    await expect(
      useCase.execute({
        uniqueId: '123456789012345',
        name: 'My Truck',
        groupId: 5,
      }),
    ).rejects.toBeInstanceOf(DeviceAlreadyRegisteredError);
  });

  it('Carrera: throws UpstreamUnavailableError when create encounters DeviceUniqueIdTakenError and device cannot be found', async () => {
    port.groups.add(5);
    port.failNextCreate = new DeviceUniqueIdTakenError('123456789012345');

    await expect(
      useCase.execute({
        uniqueId: '123456789012345',
        name: 'My Truck',
        groupId: 5,
      }),
    ).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });
});
