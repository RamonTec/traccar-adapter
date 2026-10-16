import type { JetStreamManager } from '@nats-io/jetstream';
import {
  DEADLETTER_STREAM,
  EVENTS_STREAM,
} from '../../src/shared/infrastructure/nats/stream-definitions.js';
import {
  ASYNCAPI_PATH,
  type ContractViolation,
  loadDocument,
  validateAgainst,
} from './contracts.js';

interface Ref {
  $ref: string;
}
interface Channel {
  address: string;
  messages: Record<string, Ref>;
}

const resolve = <T>(ref: Ref): T => {
  let node: unknown = loadDocument(ASYNCAPI_PATH);
  for (const segment of ref.$ref.slice(2).split('/')) {
    node = (node as Record<string, unknown>)[segment];
  }
  return node as T;
};

/** Payload and headers schema pointers of the message published on `subject`. */
function messageSchemas(
  subject: string,
): { payload: string; headers: string } | undefined {
  const channels = loadDocument(ASYNCAPI_PATH).channels as Record<
    string,
    Channel
  >;
  const channel = Object.values(channels).find((c) => c.address === subject);
  if (!channel) return undefined;
  const message = resolve<{ payload: Ref; headers: Ref }>(
    Object.values(channel.messages)[0]!,
  );
  return {
    payload: message.payload.$ref.slice(1),
    headers: message.headers.$ref.slice(1),
  };
}

/** Validates one published message (payload + headers) against the AsyncAPI. */
export function checkMessageContract(
  subject: string,
  payload: unknown,
  headers: Record<string, string>,
): ContractViolation[] {
  const schemas = messageSchemas(subject);
  if (!schemas) {
    return [{ where: subject, errors: ['subject not documented'] }];
  }
  const violations = [
    validateAgainst(ASYNCAPI_PATH, schemas.payload, payload),
    validateAgainst(ASYNCAPI_PATH, schemas.headers, headers),
  ].filter((v): v is ContractViolation => v !== null);
  const body = payload as { id?: unknown; correlationId?: unknown };
  const errors: string[] = [];
  if (headers['Nats-Msg-Id'] !== body.id) errors.push('Nats-Msg-Id ≠ id');
  if (
    headers['x-correlation-id'] !== undefined &&
    headers['x-correlation-id'] !== body.correlationId
  ) {
    errors.push('x-correlation-id ≠ correlationId');
  }
  if (errors.length > 0) violations.push({ where: subject, errors });
  return violations;
}

/**
 * Validates every message currently stored in the telemetry streams. Call it in
 * `afterEach` of suites that publish (streams are recreated per test).
 */
export async function checkStreamsContract(
  jsm: JetStreamManager,
): Promise<ContractViolation[]> {
  const violations: ContractViolation[] = [];
  for (const stream of [EVENTS_STREAM, DEADLETTER_STREAM]) {
    let state;
    try {
      state = (await jsm.streams.info(stream)).state;
    } catch {
      continue; // stream not created in this test
    }
    if (state.messages === 0) continue;
    for (let seq = state.first_seq; seq <= state.last_seq; seq += 1) {
      const msg = await jsm.streams
        .getMessage(stream, { seq })
        .catch(() => null);
      if (!msg) continue; // deleted or purged sequence
      const headers: Record<string, string> = {};
      for (const [key, values] of msg.header ?? []) headers[key] = values[0]!;
      violations.push(
        ...checkMessageContract(msg.subject, msg.json(), headers).map((v) => ({
          ...v,
          where: `${stream}#${seq} ${v.where}`,
        })),
      );
    }
  }
  return violations;
}
