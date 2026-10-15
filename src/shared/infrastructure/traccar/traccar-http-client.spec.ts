import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { Logger as NestLogger } from '@nestjs/common';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UpstreamUnavailableError } from '../../domain/upstream-unavailable.error.js';
import {
  createLogCapture,
  type LogCapture,
} from '../../../../test/support/log-capture.js';
import { runWithRequestContext } from '../context/request-context.js';
import {
  TraccarHttpClient,
  TraccarRequestError,
} from './traccar-http-client.js';

interface FakeTraccar {
  url: string;
  server: Server;
  requests: {
    method?: string;
    url?: string;
    headers: IncomingHttpHeaders;
    body: string;
  }[];
}

type Handler = (
  req: IncomingMessage,
  body: string,
) => { status: number; json?: unknown; text?: string } | void;

async function startFakeTraccar(handler: Handler): Promise<FakeTraccar> {
  const requests: FakeTraccar['requests'] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      requests.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body,
      });
      const response = handler(req, body);
      if (!response) {
        return;
      }
      const { status, json, text } = response;
      if (text !== undefined) {
        res.writeHead(status, { 'content-type': 'text/plain' }).end(text);
      } else if (json === undefined) {
        res.writeHead(status).end();
      } else {
        res
          .writeHead(status, { 'content-type': 'application/json' })
          .end(JSON.stringify(json));
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    server,
    requests,
  };
}

describe('TraccarHttpClient', () => {
  let fake: FakeTraccar | undefined;
  let logCapture: LogCapture;

  beforeEach(() => {
    logCapture = createLogCapture();
    const p = pino({ level: 'trace' }, logCapture.stream);
    function forward(
      fn: (obj: Record<string, unknown>, msg?: string) => void,
      message: unknown,
      params: unknown[],
    ) {
      const obj =
        typeof message === 'object' && message !== null
          ? (message as Record<string, unknown>)
          : { message };
      const msg =
        typeof params[0] === 'string' && params[0] !== 'TraccarHttpClient'
          ? params[0]
          : undefined;
      if (msg !== undefined) fn(obj, msg);
      else fn(obj);
    }
    NestLogger.overrideLogger({
      log: (msg, ...params) => forward(p.info.bind(p), msg, params),
      warn: (msg, ...params) => forward(p.warn.bind(p), msg, params),
      error: (msg, ...params) => forward(p.error.bind(p), msg, params),
    });
  });

  afterEach(async () => {
    NestLogger.overrideLogger(true);
    if (fake) {
      fake.server.closeAllConnections?.();
      await new Promise<void>((resolve) => fake!.server.close(() => resolve()));
      fake = undefined;
    }
  });

  it('AC-1: sends Authorization Bearer test-token, method, path, encoded query, and JSON body with Content-Type: application/json', async () => {
    fake = await startFakeTraccar((_req, _body) => ({
      status: 200,
      json: { id: 1, name: 'device-1' },
    }));

    const client = new TraccarHttpClient({
      baseUrl: fake.url,
      apiToken: 'test-token',
      timeoutMs: 2000,
    });

    const result = await client.request<{ id: number; name: string }>(
      'createDevice',
      'POST',
      '/api/devices',
      {
        query: { all: true, filter: 'active devices' },
        body: { name: 'device-1', uniqueId: '123456789012345' },
      },
    );

    expect(result).toEqual({ id: 1, name: 'device-1' });
    expect(fake.requests).toHaveLength(1);
    const req = fake.requests[0];
    expect(req.method).toBe('POST');
    expect(req.url).toBe('/api/devices?all=true&filter=active+devices');
    expect(req.headers.authorization).toBe('Bearer test-token');
    expect(req.headers['content-type']).toBe('application/json');
    expect(req.headers.accept).toBe('application/json');
    expect(JSON.parse(req.body)).toEqual({
      name: 'device-1',
      uniqueId: '123456789012345',
    });
  });

  it('AC-2: handler that does not respond with timeoutMs: 200 throws UpstreamUnavailableError in less than 1 s', async () => {
    fake = await startFakeTraccar(() => {
      // Do not respond
    });

    const client = new TraccarHttpClient({
      baseUrl: fake.url,
      apiToken: 'test-token',
      timeoutMs: 200,
    });

    const start = Date.now();
    await expect(client.request('hangOp', 'GET', '/api/slow')).rejects.toThrow(
      UpstreamUnavailableError,
    );
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
  });

  it('AC-2: 500 response throws UpstreamUnavailableError', async () => {
    fake = await startFakeTraccar(() => ({
      status: 500,
      text: 'Internal Server Error',
    }));

    const client = new TraccarHttpClient({
      baseUrl: fake.url,
      apiToken: 'test-token',
      timeoutMs: 1000,
    });

    await expect(
      client.request('errorOp', 'GET', '/api/devices'),
    ).rejects.toThrow(UpstreamUnavailableError);
  });

  it('AC-2: closed port throws UpstreamUnavailableError', async () => {
    const client = new TraccarHttpClient({
      baseUrl: 'http://127.0.0.1:59998',
      apiToken: 'test-token',
      timeoutMs: 1000,
    });

    await expect(
      client.request('deadPortOp', 'GET', '/api/devices'),
    ).rejects.toThrow(UpstreamUnavailableError);
  });

  it('AC-3: 401 and 403 throw UpstreamUnavailableError and log error "Traccar credentials rejected"', async () => {
    let nextStatus = 401;
    fake = await startFakeTraccar(() => ({
      status: nextStatus,
      text: 'Unauthorized',
    }));

    const client = new TraccarHttpClient({
      baseUrl: fake.url,
      apiToken: 'test-token',
      timeoutMs: 1000,
    });

    // 401
    await expect(
      client.request('getWith401', 'GET', '/api/devices'),
    ).rejects.toThrow(UpstreamUnavailableError);

    const error401Line = logCapture
      .lines()
      .find(
        (l) => l.msg === 'Traccar credentials rejected' && l.status === 401,
      );
    expect(error401Line).toBeDefined();
    expect(error401Line?.op).toBe('getWith401');

    // 403
    nextStatus = 403;
    await expect(
      client.request('getWith403', 'GET', '/api/devices'),
    ).rejects.toThrow(UpstreamUnavailableError);

    const error403Line = logCapture
      .lines()
      .find(
        (l) => l.msg === 'Traccar credentials rejected' && l.status === 403,
      );
    expect(error403Line).toBeDefined();
    expect(error403Line?.op).toBe('getWith403');
  });

  it('AC-4: 400 with body "Duplicate entry" throws TraccarRequestError { status: 400, traccarMessage: "Duplicate entry" }', async () => {
    fake = await startFakeTraccar(() => ({
      status: 400,
      text: 'Duplicate entry',
    }));

    const client = new TraccarHttpClient({
      baseUrl: fake.url,
      apiToken: 'test-token',
      timeoutMs: 1000,
    });

    let caughtError: unknown;
    try {
      await client.request('createDevice', 'POST', '/api/devices', {
        body: { name: 'duplicate' },
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(TraccarRequestError);
    const reqError = caughtError as TraccarRequestError;
    expect(reqError.status).toBe(400);
    expect(reqError.traccarMessage).toBe('Duplicate entry');
  });

  it('AC-5: each call produces a log with op, method, path, status, and durationMs, and no line contains test-token', async () => {
    fake = await startFakeTraccar(() => ({
      status: 200,
      json: [{ id: 1 }],
    }));

    const client = new TraccarHttpClient({
      baseUrl: fake.url,
      apiToken: 'test-token',
      timeoutMs: 1000,
    });

    await client.request('listDevices', 'GET', '/api/devices', {
      query: { all: true },
    });

    const callLog = logCapture
      .lines()
      .find((l) => l.op === 'listDevices' && l.method === 'GET');

    expect(callLog).toBeDefined();
    expect(callLog?.path).toBe('/api/devices');
    expect(callLog?.status).toBe(200);
    expect(typeof callLog?.durationMs).toBe('number');

    // Verify token is never logged in any line
    const allLines = logCapture.lines();
    expect(allLines.length).toBeGreaterThan(0);
    for (const line of allLines) {
      expect(JSON.stringify(line)).not.toContain('test-token');
    }
  });

  it('AC-6: within runWithRequestContext({ correlationId: "c-9" }) sends x-correlation-id: c-9; outside context header is omitted', async () => {
    fake = await startFakeTraccar(() => ({ status: 204 }));

    const client = new TraccarHttpClient({
      baseUrl: fake.url,
      apiToken: 'test-token',
      timeoutMs: 1000,
    });

    // Outside context
    await client.request('outside', 'GET', '/api/devices');
    expect(fake.requests[0].headers['x-correlation-id']).toBeUndefined();

    // Inside context
    await runWithRequestContext({ correlationId: 'c-9' }, async () => {
      await client.request('inside', 'GET', '/api/devices');
    });
    expect(fake.requests[1].headers['x-correlation-id']).toBe('c-9');
  });

  it('handles 204 No Content returning undefined', async () => {
    fake = await startFakeTraccar(() => ({ status: 204 }));

    const client = new TraccarHttpClient({
      baseUrl: fake.url,
      apiToken: 'test-token',
      timeoutMs: 1000,
    });

    const res = await client.request<void>(
      'deleteDevice',
      'GET',
      '/api/devices/1',
    );
    expect(res).toBeUndefined();
  });
});
