import {
  type ExecutionContext,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { testConfig } from '../../../../../test/support/test-env.js';
import { WebhookTokenGuard } from './webhook-token.guard.js';

const TOKEN = 'test-webhook-token-0123456789';

function contextWith(authorization?: string): ExecutionContext {
  const headers = authorization === undefined ? {} : { authorization };
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('WebhookTokenGuard', () => {
  let guard: WebhookTokenGuard;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    guard = new WebhookTokenGuard(testConfig());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('AC-1a: correct bearer token → true', () => {
    expect(guard.canActivate(contextWith(`Bearer ${TOKEN}`))).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ['missing header', undefined, 'missing'],
    ['Basic scheme', `Basic ${TOKEN}`, 'missing'],
    ['empty bearer', 'Bearer ', 'missing'],
    [
      'wrong token, same length',
      `Bearer ${'x'.repeat(TOKEN.length)}`,
      'mismatch',
    ],
    ['wrong token, other length', 'Bearer short', 'mismatch'],
  ])('AC-1b: %s → UnauthorizedException (%s)', (_, header, reason) => {
    expect(() => guard.canActivate(contextWith(header))).toThrow(
      UnauthorizedException,
    );
    expect(warn).toHaveBeenCalledWith({ reason }, 'Rejected webhook token');
  });

  it('AC-1c: the warn log never contains the received or expected token', () => {
    const received = 'Bearer received-secret-value-123';

    expect(() => guard.canActivate(contextWith(received))).toThrow();

    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain('received-secret-value-123');
    expect(logged).not.toContain(TOKEN);
  });
});
