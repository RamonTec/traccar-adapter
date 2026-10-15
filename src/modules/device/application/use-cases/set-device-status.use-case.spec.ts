import { FakeAuditLog } from '../../../../shared/application/ports/__fakes__/audit-log.fake.js';
import { FakeClock } from '../../../../shared/application/ports/__fakes__/clock.fake.js';
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
  let audit: FakeAuditLog;
  let useCase: SetDeviceStatusUseCase;

  beforeEach(() => {
    port = new FakeTraccarDeviceStatusPort();
    audit = new FakeAuditLog();
    useCase = new SetDeviceStatusUseCase(port, audit, new FakeClock());
  });

  it('AC-1: disables an enabled device', async () => {
    port.seed({ id: 18 });

    const out = await useCase.execute({
      deviceId: 18,
      disabled: true,
      actor: 'svc',
    });

    expect(out.changed).toBe(true);
    expect(out.device.disabled).toBe(true);
    expect(out.device.id).toBe(18);
    expect(port.writes()).toEqual(['setDisabled(18, true)']);
  });

  it('AC-2: disabling an already disabled device is a no-op', async () => {
    port.seed({ id: 18, disabled: true });

    const out = await useCase.execute({
      deviceId: 18,
      disabled: true,
      actor: 'svc',
    });

    expect(out).toEqual({
      device: expect.objectContaining({ id: 18, disabled: true }),
      changed: false,
    });
    expect(port.writes()).toEqual([]);
  });

  it('AC-3: enables a disabled, non-retired device', async () => {
    port.seed({ id: 18, disabled: true });

    const out = await useCase.execute({
      deviceId: 18,
      disabled: false,
      actor: 'svc',
    });

    expect(out.changed).toBe(true);
    expect(out.device.disabled).toBe(false);
    expect(port.writes()).toEqual(['setDisabled(18, false)']);
  });

  it('AC-4: enabling an already enabled device is a no-op', async () => {
    port.seed({ id: 18 });

    const out = await useCase.execute({
      deviceId: 18,
      disabled: false,
      actor: 'svc',
    });

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
      useCase.execute({ deviceId: 18, disabled: false, actor: 'svc' }),
    ).rejects.toBeInstanceOf(DeviceRetiredError);
    expect(port.writes()).toEqual([]);
  });

  it('AC-5: disabling a retired (already disabled) device is a no-op', async () => {
    port.seed({
      id: 18,
      uniqueId: '123456789012345:retired:18',
      disabled: true,
    });

    const out = await useCase.execute({
      deviceId: 18,
      disabled: true,
      actor: 'svc',
    });

    expect(out.changed).toBe(false);
    expect(port.writes()).toEqual([]);
  });

  it('AC-6: unknown device → DeviceNotFoundError', async () => {
    const promise = useCase.execute({
      deviceId: 999,
      disabled: true,
      actor: 'svc',
    });

    await expect(promise).rejects.toBeInstanceOf(DeviceNotFoundError);
    await expect(promise).rejects.toMatchObject({ deviceId: 999 });
  });

  it('AC-8: propagates UpstreamUnavailableError from get', async () => {
    port.seed({ id: 18 });
    const err = new UpstreamUnavailableError('traccar');
    port.failNextGet = err;

    await expect(
      useCase.execute({ deviceId: 18, disabled: true, actor: 'svc' }),
    ).rejects.toBe(err);
  });

  it('AC-8: propagates UpstreamUnavailableError from setDisabled and converges on retry', async () => {
    port.seed({ id: 18 });
    const err = new UpstreamUnavailableError('traccar');
    port.failNextSet = err;

    await expect(
      useCase.execute({ deviceId: 18, disabled: true, actor: 'svc' }),
    ).rejects.toBe(err);

    // Simula que la escritura llegó a Traccar pese al error de red.
    port.seed({ id: 18, disabled: true });
    const out = await useCase.execute({
      deviceId: 18,
      disabled: true,
      actor: 'svc',
    });

    expect(out.changed).toBe(false);
  });

  describe('audit (ADR-0006)', () => {
    it.each([
      [true, 'device.disable', false, 'changed'],
      [true, 'device.disable', true, 'unchanged'],
      [false, 'device.enable', true, 'changed'],
      [false, 'device.enable', false, 'unchanged'],
    ])(
      'AC-4: disabled=%s → %s, initially disabled=%s → %s',
      async (disabled, op, initiallyDisabled, result) => {
        port.seed({ id: 18, disabled: initiallyDisabled });

        await useCase.execute({ deviceId: 18, disabled, actor: 'svc' });

        expect(audit.events).toEqual([
          {
            op,
            actor: 'svc',
            result,
            succeeded: true,
            durationMs: 5,
            fields: { deviceId: 18 },
          },
        ]);
      },
    );

    it.each([
      [
        'retired',
        () =>
          port.seed({
            id: 18,
            uniqueId: '123456789012345:retired:18',
            disabled: true,
          }),
        DeviceRetiredError,
      ],
      ['not-found', () => undefined, DeviceNotFoundError],
      [
        'failed',
        () => {
          port.seed({ id: 18, disabled: true });
          port.failNextGet = new UpstreamUnavailableError('traccar');
        },
        UpstreamUnavailableError,
      ],
    ])(
      'AC-4/AC-8: %s → failed event with deviceId and the original error',
      async (result, arrange, errorType) => {
        arrange();

        await expect(
          useCase.execute({ deviceId: 18, disabled: false, actor: 'svc' }),
        ).rejects.toBeInstanceOf(errorType);
        expect(audit.events).toEqual([
          expect.objectContaining({
            op: 'device.enable',
            result,
            succeeded: false,
            fields: { deviceId: 18 },
          }),
        ]);
      },
    );
  });
});
