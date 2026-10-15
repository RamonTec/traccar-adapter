import { UpstreamUnavailableError } from '../../../../shared/domain/upstream-unavailable.error.js';
import type { Device } from '../../domain/device.js';
import {
  DeviceNotFoundError,
  DeviceRetiredError,
} from '../../domain/errors.js';
import type { TraccarDeviceStatusPort } from '../ports/traccar-device-status.port.js';
import { SetDeviceStatusUseCase } from './set-device-status.use-case.js';

class FakeTraccarDeviceStatusPort implements TraccarDeviceStatusPort {
  readonly devices = new Map<number, Device>();
  readonly calls: string[] = [];
  failNextGet?: Error;
  failNextSet?: Error;

  async get(deviceId: number): Promise<Device | undefined> {
    this.calls.push(`get(${deviceId})`);
    if (this.failNextGet) {
      const err = this.failNextGet;
      this.failNextGet = undefined;
      throw err;
    }
    return this.devices.get(deviceId);
  }

  async setDisabled(deviceId: number, disabled: boolean): Promise<void> {
    this.calls.push(`setDisabled(${deviceId}, ${disabled})`);
    if (this.failNextSet) {
      const err = this.failNextSet;
      this.failNextSet = undefined;
      throw err;
    }
    const device = this.devices.get(deviceId);
    if (device) {
      this.devices.set(deviceId, { ...device, disabled });
    }
  }

  seed(device: Partial<Device> & { id: number }): Device {
    const full: Device = {
      uniqueId: '123456789012345',
      groupId: 3,
      name: 'Truck',
      disabled: false,
      ...device,
    };
    this.devices.set(full.id, full);
    return full;
  }

  writes(): string[] {
    return this.calls.filter((c) => c.startsWith('setDisabled'));
  }
}

describe('SetDeviceStatusUseCase', () => {
  let port: FakeTraccarDeviceStatusPort;
  let useCase: SetDeviceStatusUseCase;

  beforeEach(() => {
    port = new FakeTraccarDeviceStatusPort();
    useCase = new SetDeviceStatusUseCase(port);
  });

  it('AC-1: disables an enabled device', async () => {
    port.seed({ id: 18 });

    const out = await useCase.execute({ deviceId: 18, disabled: true });

    expect(out.changed).toBe(true);
    expect(out.device.disabled).toBe(true);
    expect(out.device.id).toBe(18);
    expect(port.writes()).toEqual(['setDisabled(18, true)']);
  });

  it('AC-2: disabling an already disabled device is a no-op', async () => {
    port.seed({ id: 18, disabled: true });

    const out = await useCase.execute({ deviceId: 18, disabled: true });

    expect(out).toEqual({
      device: expect.objectContaining({ id: 18, disabled: true }),
      changed: false,
    });
    expect(port.writes()).toEqual([]);
  });

  it('AC-3: enables a disabled, non-retired device', async () => {
    port.seed({ id: 18, disabled: true });

    const out = await useCase.execute({ deviceId: 18, disabled: false });

    expect(out.changed).toBe(true);
    expect(out.device.disabled).toBe(false);
    expect(port.writes()).toEqual(['setDisabled(18, false)']);
  });

  it('AC-4: enabling an already enabled device is a no-op', async () => {
    port.seed({ id: 18 });

    const out = await useCase.execute({ deviceId: 18, disabled: false });

    expect(out.changed).toBe(false);
    expect(port.writes()).toEqual([]);
  });

  it('AC-5: refuses to enable a retired device', async () => {
    port.seed({
      id: 18,
      uniqueId: '123456789012345:retired:18',
      disabled: true,
    });

    await expect(
      useCase.execute({ deviceId: 18, disabled: false }),
    ).rejects.toBeInstanceOf(DeviceRetiredError);
    expect(port.writes()).toEqual([]);
  });

  it('AC-5: disabling a retired (already disabled) device is a no-op', async () => {
    port.seed({
      id: 18,
      uniqueId: '123456789012345:retired:18',
      disabled: true,
    });

    const out = await useCase.execute({ deviceId: 18, disabled: true });

    expect(out.changed).toBe(false);
    expect(port.writes()).toEqual([]);
  });

  it('AC-6: unknown device → DeviceNotFoundError', async () => {
    const promise = useCase.execute({ deviceId: 999, disabled: true });

    await expect(promise).rejects.toBeInstanceOf(DeviceNotFoundError);
    await expect(promise).rejects.toMatchObject({ deviceId: 999 });
  });

  it('AC-8: propagates UpstreamUnavailableError from get', async () => {
    port.seed({ id: 18 });
    const err = new UpstreamUnavailableError('traccar');
    port.failNextGet = err;

    await expect(
      useCase.execute({ deviceId: 18, disabled: true }),
    ).rejects.toBe(err);
  });

  it('AC-8: propagates UpstreamUnavailableError from setDisabled and converges on retry', async () => {
    port.seed({ id: 18 });
    const err = new UpstreamUnavailableError('traccar');
    port.failNextSet = err;

    await expect(
      useCase.execute({ deviceId: 18, disabled: true }),
    ).rejects.toBe(err);

    // Simula que la escritura llegó a Traccar pese al error de red.
    port.seed({ id: 18, disabled: true });
    const out = await useCase.execute({ deviceId: 18, disabled: true });

    expect(out.changed).toBe(false);
  });
});
