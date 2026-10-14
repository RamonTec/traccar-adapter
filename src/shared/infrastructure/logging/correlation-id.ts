import { randomUUID } from 'node:crypto';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

const CORRELATION_ID_REGEX = /^[A-Za-z0-9._-]{1,128}$/;

export function resolveCorrelationId(
  header: string | string[] | undefined,
  generate: () => string = randomUUID,
): string {
  const candidate = Array.isArray(header) ? header[0] : header;
  if (typeof candidate === 'string' && CORRELATION_ID_REGEX.test(candidate)) {
    return candidate;
  }
  return generate();
}
