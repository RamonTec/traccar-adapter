import { readFileSync } from 'node:fs';
import {
  docker,
  dockerOk,
  httpInContainer,
  IMAGE,
  removeAll,
  runContainer,
  stopTimed,
  streamMessages,
  VALID_ENV,
  waitHealthy,
} from './docker.js';

const RUN_ID = `${process.pid}-${Date.now()}`;
const NETWORK = `traccar-adapter-image-test-${RUN_ID}`;
const NATS = `traccar-adapter-image-test-nats-${RUN_ID}`;
const NATS_URL = 'nats://nats:4222';
const EVENTS_STREAM = 'TELEMETRY_EVENTS';
const ENV: Readonly<Record<string, string>> = {
  ...VALID_ENV,
  NATS_SERVERS: NATS_URL,
};
const position = readFileSync(
  new URL('../fixtures/traccar/position.json', import.meta.url),
  'utf8',
);

interface Readiness {
  checks: Record<string, string>;
  outbox: { pending: number; oldestAgeMs: number | null };
}

async function readiness(name: string): Promise<Readiness> {
  return (await httpInContainer(name, '/health/ready')).body as Readiness;
}

async function waitFor(
  check: () => Promise<boolean>,
  timeoutMs: number,
  what: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

describe('Container shutdown and outbox volume (spec 014)', () => {
  const containers: string[] = [];
  const volumes: string[] = [];
  let counter = 0;

  function containerName(): string {
    const name = `traccar-adapter-image-test-${RUN_ID}-${++counter}`;
    containers.push(name);
    return name;
  }

  async function startAdapter(name: string, volume?: string): Promise<void> {
    await runContainer(name, { env: ENV, network: NETWORK, volume });
    await waitHealthy(name, 30_000);
  }

  async function waitNats(name: string, state: 'ok' | 'down'): Promise<void> {
    await waitFor(
      async () => (await readiness(name)).checks.nats === state,
      20_000,
      `nats ${state} in ${name}`,
    );
  }

  beforeAll(async () => {
    await dockerOk(['build', '-t', IMAGE, '.'], { timeoutMs: 600_000 });
    await dockerOk(['network', 'create', NETWORK]);
    await dockerOk([
      'run',
      '-d',
      '--name',
      NATS,
      '--network',
      NETWORK,
      '--network-alias',
      'nats',
      'nats:2.11-alpine',
      '-js',
    ]);
  });

  afterEach(async () => {
    await removeAll(containers.splice(0));
    await docker(['unpause', NATS]);
    await docker(['start', NATS]);
  });

  afterAll(async () => {
    await removeAll([NATS]);
    if (volumes.length > 0) await docker(['volume', 'rm', '-f', ...volumes]);
    await docker(['network', 'rm', NETWORK]);
  });

  it('AC-8: connected to NATS, docker stop exits with code 0 in < 10 s', async () => {
    const name = containerName();
    await startAdapter(name);
    await waitNats(name, 'ok');

    const { ms, exitCode } = await stopTimed(name);

    expect(exitCode).toBe(0);
    expect(ms).toBeLessThan(10_000);
  });

  it('AC-8: NATS unresponsive mid-session, docker stop exits with code 0 in < 10 s', async () => {
    const name = containerName();
    await startAdapter(name);
    await waitNats(name, 'ok');
    await dockerOk(['pause', NATS]);

    const { ms, exitCode } = await stopTimed(name);

    expect(exitCode).toBe(0);
    expect(ms).toBeLessThan(10_000);
  });

  it('AC-9: pending messages survive recreating the container and drain when NATS returns', async () => {
    const volume = `traccar-adapter-image-test-data-${RUN_ID}`;
    volumes.push(volume);
    const first = containerName();
    await startAdapter(first, volume);
    await waitNats(first, 'ok');
    const before = await streamMessages(NETWORK, NATS_URL, EVENTS_STREAM);

    await dockerOk(['stop', NATS]);
    await waitNats(first, 'down');
    const res = await httpInContainer(first, '/webhooks/traccar/positions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${ENV['WEBHOOK_TOKEN']}`,
        'content-type': 'application/json',
      },
      body: position,
    });
    expect(res).toEqual({ status: 200, body: { outcome: 'buffered' } });
    await stopTimed(first);
    await dockerOk(['rm', first]);

    const second = containerName();
    await startAdapter(second, volume);
    expect((await readiness(second)).outbox.pending).toBe(1);

    await dockerOk(['start', NATS]);
    await waitFor(
      async () => (await readiness(second)).outbox.pending === 0,
      30_000,
      'outbox drained',
    );
    expect(await streamMessages(NETWORK, NATS_URL, EVENTS_STREAM)).toBe(
      before + 1,
    );
  });
});
