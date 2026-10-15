import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { UpstreamUnavailableError } from '../../../../shared/domain/upstream-unavailable.error.js';
import {
  TraccarHttpClient,
  TraccarRequestError,
} from '../../../../shared/infrastructure/traccar/traccar-http-client.js';
import { DeviceUniqueIdTakenError } from '../../application/ports/traccar-device.port.js';
import { TraccarDeviceHttpAdapter } from './traccar-device.http-adapter.js';

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

describe('TraccarDeviceHttpAdapter (integration)', () => {
  let traccar: FakeTraccar | undefined;

  async function adapterFor(handler: Handler): Promise<{
    adapter: TraccarDeviceHttpAdapter;
    requests: RecordedRequest[];
  }> {
    traccar = await fakeTraccar(handler);
    const client = new TraccarHttpClient({
      baseUrl: traccar.url,
      apiToken: 'test-token',
      timeoutMs: 1000,
    });
    return {
      adapter: new TraccarDeviceHttpAdapter(client),
      requests: traccar.requests,
    };
  }

  afterEach(async () => {
    const server = traccar?.server;
    traccar = undefined;
    if (server) await new Promise((r) => server.close(r));
  });

  it('AC-1: create posts {name, uniqueId, groupId} and maps 200 response to Device', async () => {
    const { adapter, requests } = await adapterFor(() => ({
      status: 200,
      json: {
        id: 18,
        attributes: {},
        groupId: 5,
        calendarId: 0,
        name: 'Truck 1',
        uniqueId: '123456789012345',
        disabled: false,
      },
    }));

    const result = await adapter.create({
      name: 'Truck 1',
      uniqueId: '123456789012345',
      groupId: 5,
    });

    expect(result).toEqual({
      id: 18,
      uniqueId: '123456789012345',
      groupId: 5,
      name: 'Truck 1',
      disabled: false,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('POST');
    expect(requests[0]?.url).toBe('/api/devices');
    expect(requests[0]?.body).toBe(
      '{"name":"Truck 1","uniqueId":"123456789012345","groupId":5}',
    );
  });

  it('AC-1b: findByUniqueId sends uniqueId query, returns undefined when empty, Device when found with disabled:true', async () => {
    let querySeen = '';
    const { adapter } = await adapterFor((req) => {
      querySeen = req.url ?? '';
      if (querySeen.includes('uniqueId=missing')) {
        return { status: 200, json: [] };
      }
      return {
        status: 200,
        json: [
          {
            id: 21,
            name: 'Disabled Truck',
            uniqueId: '356938035643809',
            groupId: 9,
            disabled: true,
            attributes: {},
          },
        ],
      };
    });

    const notFound = await adapter.findByUniqueId('missing');
    expect(notFound).toBeUndefined();
    expect(querySeen).toBe('/api/devices?uniqueId=missing');

    const found = await adapter.findByUniqueId('356938035643809');
    expect(found).toEqual({
      id: 21,
      uniqueId: '356938035643809',
      groupId: 9,
      name: 'Disabled Truck',
      disabled: true,
    });
  });

  it('AC-4 / AC-11: retire fetches raw device with GET and PUTs identical body except uniqueId', async () => {
    const rawDevice = {
      id: 18,
      name: 'Truck 18',
      uniqueId: '123456789012345',
      groupId: 9,
      disabled: true,
      attributes: { tracker: 'teltonika' },
      calendarId: 7,
      phone: '+12345678',
    };

    const { adapter, requests } = await adapterFor((req) => {
      if (req.method === 'GET' && req.url === '/api/devices/18') {
        return { status: 200, json: rawDevice };
      }
      if (req.method === 'PUT' && req.url === '/api/devices/18') {
        return { status: 200, json: {} };
      }
      return { status: 404 };
    });

    await adapter.retire(18, '123456789012345:retired:18');

    expect(requests).toHaveLength(2);
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.url).toBe('/api/devices/18');

    expect(requests[1]?.method).toBe('PUT');
    expect(requests[1]?.url).toBe('/api/devices/18');
    const putBody = JSON.parse(requests[1]!.body);
    expect(putBody).toEqual({
      ...rawDevice,
      uniqueId: '123456789012345:retired:18',
    });
    expect(putBody.groupId).toBe(9);
    expect(putBody.disabled).toBe(true);
  });

  it('AC-6: groupExists returns true when groupId in /api/groups and false when absent', async () => {
    const { adapter } = await adapterFor(() => ({
      status: 200,
      json: [{ id: 2, name: 'fleet-north' }],
    }));

    await expect(adapter.groupExists(2)).resolves.toBe(true);
    await expect(adapter.groupExists(3)).resolves.toBe(false);
  });

  it('Carrera: translates 400 duplicate uniqueId to DeviceUniqueIdTakenError, preserves other 400', async () => {
    const duplicateBody =
      'org.traccar.storage.StorageException: org.h2.jdbc.JdbcSQLIntegrityConstraintViolationException: Unique index or primary key violation: "PUBLIC.CONSTRAINT_A INDEX PUBLIC.CONSTRAINT_A_INDEX_6 ON PUBLIC.TC_DEVICES(UNIQUEID NULLS FIRST) VALUES ( /* 18 */ \'123456789012345\' )";';

    const { adapter } = await adapterFor((_req, body) => {
      const parsed = JSON.parse(body);
      if (parsed.uniqueId === 'duplicate') {
        return { status: 400, body: duplicateBody };
      }
      return { status: 400, body: 'other bad request' };
    });

    await expect(
      adapter.create({
        name: 'Dev',
        uniqueId: 'duplicate',
        groupId: 2,
      }),
    ).rejects.toSatisfy((err) => {
      expect(err).toBeInstanceOf(DeviceUniqueIdTakenError);
      expect((err as DeviceUniqueIdTakenError).uniqueId).toBe('duplicate');
      return true;
    });

    await expect(
      adapter.create({
        name: 'Dev',
        uniqueId: 'other',
        groupId: 2,
      }),
    ).rejects.toBeInstanceOf(TraccarRequestError);
  });

  it('AC-8: propagates UpstreamUnavailableError on 500 response for any operation', async () => {
    const { adapter } = await adapterFor(() => ({ status: 500 }));

    await expect(adapter.groupExists(1)).rejects.toBeInstanceOf(
      UpstreamUnavailableError,
    );
    await expect(adapter.findByUniqueId('x')).rejects.toBeInstanceOf(
      UpstreamUnavailableError,
    );
    await expect(
      adapter.create({ name: 'x', uniqueId: 'x', groupId: 1 }),
    ).rejects.toBeInstanceOf(UpstreamUnavailableError);
    await expect(adapter.retire(1, 'x:retired:1')).rejects.toBeInstanceOf(
      UpstreamUnavailableError,
    );
  });
});
