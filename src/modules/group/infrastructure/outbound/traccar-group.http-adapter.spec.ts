import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { UpstreamUnavailableError } from '../../../../shared/domain/upstream-unavailable.error.js';
import { TraccarHttpClient } from '../../../../shared/infrastructure/traccar/traccar-http-client.js';
import { TraccarGroupHttpAdapter } from './traccar-group.http-adapter.js';

type Handler = (
  req: IncomingMessage,
  body: string,
) => { status: number; json?: unknown };

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
      const { status, json } = handler(req, body);
      res
        .writeHead(status, { 'content-type': 'application/json' })
        .end(json === undefined ? '' : JSON.stringify(json));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    server,
    requests,
  };
}

describe('TraccarGroupHttpAdapter (integration)', () => {
  let traccar: FakeTraccar | undefined;

  async function adapterFor(handler: Handler): Promise<{
    adapter: TraccarGroupHttpAdapter;
    requests: RecordedRequest[];
  }> {
    traccar = await fakeTraccar(handler);
    const client = new TraccarHttpClient({
      baseUrl: traccar.url,
      apiToken: 'test-token',
      timeoutMs: 1000,
    });
    return {
      adapter: new TraccarGroupHttpAdapter(client),
      requests: traccar.requests,
    };
  }

  afterEach(async () => {
    const server = traccar?.server;
    traccar = undefined;
    if (server) await new Promise((r) => server.close(r));
  });

  it('AC-1: create posts only the name and maps the 200 response to a Group', async () => {
    const { adapter, requests } = await adapterFor(() => ({
      status: 200,
      json: { id: 3, attributes: {}, groupId: 0, name: 'acme' },
    }));

    await expect(adapter.create('acme')).resolves.toEqual({
      id: 3,
      name: 'acme',
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('POST');
    expect(requests[0]?.url).toBe('/api/groups');
    expect(requests[0]?.body).toBe('{"name":"acme"}');
  });

  it('AC-1b: list gets /api/groups and maps each item to a Group', async () => {
    const { adapter, requests } = await adapterFor(() => ({
      status: 200,
      json: [{ id: 1, name: 'a', groupId: 0, attributes: {} }],
    }));

    await expect(adapter.list()).resolves.toEqual([{ id: 1, name: 'a' }]);

    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.url).toBe('/api/groups');
  });

  it('AC-5: list rejects with UpstreamUnavailableError on a 500', async () => {
    const { adapter } = await adapterFor(() => ({ status: 500 }));

    await expect(adapter.list()).rejects.toBeInstanceOf(
      UpstreamUnavailableError,
    );
  });
});
