import { jetstreamManager, type JetStreamManager } from '@nats-io/jetstream';
import { connect, type NatsConnection } from '@nats-io/transport-node';

export const NATS_TEST_URL =
  process.env.NATS_TEST_URL ?? 'nats://127.0.0.1:4222';

export async function connectTestNats(): Promise<{
  nc: NatsConnection;
  jsm: JetStreamManager;
}> {
  let nc: NatsConnection;
  try {
    nc = await connect({ servers: NATS_TEST_URL, timeout: 2000 });
  } catch {
    throw new Error(
      `NATS not reachable at ${NATS_TEST_URL}: run \`pnpm test:infra:up\``,
    );
  }
  return { nc, jsm: await jetstreamManager(nc) };
}

export async function purgeStreamIfExists(
  jsm: JetStreamManager,
  name: string,
): Promise<void> {
  try {
    await jsm.streams.purge(name);
  } catch (error) {
    if (!isStreamNotFound(error)) throw error;
  }
}

export async function deleteStreamIfExists(
  jsm: JetStreamManager,
  name: string,
): Promise<void> {
  try {
    await jsm.streams.delete(name);
  } catch (error) {
    if (!isStreamNotFound(error)) throw error;
  }
}

function isStreamNotFound(error: unknown): boolean {
  return error instanceof Error && /stream not found/i.test(error.message);
}
