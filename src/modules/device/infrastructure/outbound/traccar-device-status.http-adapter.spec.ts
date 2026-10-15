import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { UpstreamUnavailableError } from '../../../../shared/domain/upstream-unavailable.error.js';
import {
  TraccarHttpClient,
  TraccarRequestError,
} from '../../../../shared/infrastructure/traccar/traccar-http-client.js';
import { TraccarDeviceStatusHttpAdapter } from './traccar-device-status.http-adapter.js';

type Handler = (
  req: IncomingMessage,
  body: string,
) => { status: number; body?: string; json?: unknown };

interface RecordedRequest {
  method?: string;
  url?: string;
  body: string;
}

interface FakeTraccar {
  url: string;
  server: Server;
  requests: RecordedRequest[];
}

async function fakeTraccar(handler: Handler): Promise<FakeTraccar> {
  const requests: RecordedRequest[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString()));
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, body });
      const response = handler(req, body);
      if (response.body !== undefined) {
        res
          .writeHead(response.status, { 'content-type': 'text/plain' })
          .end(response.body);
      } else {
        res
          .writeHead(response.status, { 'content-type': 'application/json' })
          .end(
            response.json === undefined ? '' : JSON.stringify(response.json),
          );
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    server,
    requests,
  };
}

const RAW_DEVICE = {
  id: 18,
  attributes: { a: 1 },
  groupId: 3,
  calendarId: 7,
  name: 'Truck 1',
  uniqueId: '123456789012345',
  status: 'offline',
  lastUpdate: null,
  positionId: 0,
  phone: null,
  model: null,
  contact: null,
  category: null,
  disabled: false,
  expirationTime: null,
};

describe('TraccarDeviceStatusHttpAdapter (integration)', () => {
  let traccar: FakeTraccar | undefined;

  async function adapterFor(handler: Handler): Promise<{
    adapter: TraccarDeviceStatusHttpAdapter;
    requests: RecordedRequest[];
  }> {
    traccar = await fakeTraccar(handler);
    const client = new TraccarHttpClient({
      baseUrl: traccar.url,
      apiToken: 'test-token',
      timeoutMs: 1000,
    });
    return {
      adapter: new TraccarDeviceStatusHttpAdapter(client),
      requests: traccar.requests,
    };
  }

  afterEach(async () => {
    const server = traccar?.server;
    traccar = undefined;
    if (server) await new Promise((r) => server.close(r));
  });

  it('get maps GET /api/devices/{id} to a Device', async () => {
    const { adapter, requests } = await adapterFor(() => ({
      status: 200,
      json: RAW_DEVICE,
    }));

    const device = await adapter.get(18);

    expect(device).toEqual({
      id: 18,
      name: 'Truck 1',
      uniqueId: '123456789012345',
      groupId: 3,
      disabled: false,
    });
    expect(requests[0]).toMatchObject({
      method: 'GET',
      url: '/api/devices/18',
    });
  });

  it('AC-6: get returns undefined when Traccar answers 400 Device access denied', async () => {
    const { adapter } = await adapterFor(() => ({
      status: 400,
      body: 'java.lang.SecurityException: Device access denied - SecurityException (PermissionsManager:120 < ...)',
    }));

    await expect(adapter.get(999)).resolves.toBeUndefined();
  });

  it('AC-6: get propagates any other 400 as TraccarRequestError', async () => {
    const { adapter } = await adapterFor(() => ({
      status: 400,
      body: 'java.lang.IllegalArgumentException: something else',
    }));

    await expect(adapter.get(18)).rejects.toBeInstanceOf(TraccarRequestError);
  });

  it.each([true, false])(
    'AC-1/AC-3/AC-7: setDisabled(18, %s) re-sends the full device changing only disabled',
    async (disabled) => {
      const { adapter, requests } = await adapterFor((req) =>
        req.method === 'GET'
          ? { status: 200, json: { ...RAW_DEVICE, disabled: !disabled } }
          : { status: 200, json: { ...RAW_DEVICE, disabled } },
      );

      await adapter.setDisabled(18, disabled);

      expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([
        'GET /api/devices/18',
        'PUT /api/devices/18',
      ]);
      expect(JSON.parse(requests[1]!.body)).toEqual({
        ...RAW_DEVICE,
        disabled,
      });
    },
  );

  it('AC-8: 500 from Traccar → UpstreamUnavailableError', async () => {
    const { adapter } = await adapterFor(() => ({
      status: 500,
      body: 'boom',
    }));

    await expect(adapter.setDisabled(18, true)).rejects.toBeInstanceOf(
      UpstreamUnavailableError,
    );
  });
});
