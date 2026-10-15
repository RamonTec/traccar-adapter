import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface FakeTraccarGroup {
  id: number;
  name: string;
  groupId: number;
  attributes: Record<string, unknown>;
}

export interface FakeTraccarRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

export interface FakeTraccarServer {
  readonly url: string;
  readonly close: () => Promise<void>;
  readonly requests: FakeTraccarRequest[];
  groups: FakeTraccarGroup[];
  down: boolean;
  setHandler: (
    handler: (
      req: IncomingMessage,
      body: string,
    ) => { status: number; json?: unknown },
  ) => void;
}

export async function createFakeTraccar(
  initialHandler?: (
    req: IncomingMessage,
    body: string,
  ) => { status: number; json?: unknown },
): Promise<FakeTraccarServer> {
  const requests: FakeTraccarRequest[] = [];
  const groups: FakeTraccarGroup[] = [];
  let down = false;
  let customHandler = initialHandler;

  const defaultHandler = (
    req: IncomingMessage,
    body: string,
  ): { status: number; json?: unknown } => {
    const pathname = req.url
      ? new URL(req.url, 'http://127.0.0.1').pathname
      : '';

    if (pathname === '/api/server') {
      return { status: 200, json: { id: 1, version: '6.15' } };
    }

    if (pathname === '/api/groups') {
      if (req.method === 'GET') {
        return { status: 200, json: groups };
      }
      if (req.method === 'POST') {
        const parsed = body
          ? (JSON.parse(body) as Partial<FakeTraccarGroup>)
          : {};
        const maxId = groups.reduce((max, g) => Math.max(max, g.id), 0);
        const newGroup: FakeTraccarGroup = {
          id: maxId + 1,
          name: parsed.name ?? '',
          groupId: parsed.groupId ?? 0,
          attributes: parsed.attributes ?? {},
        };
        groups.push(newGroup);
        return { status: 200, json: newGroup };
      }
    }

    return { status: 200, json: { id: 1, version: '6.15' } };
  };

  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      requests.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body,
      });
      const response = down
        ? { status: 500, json: { message: 'Traccar unavailable' } }
        : customHandler
          ? customHandler(req, body)
          : defaultHandler(req, body);
      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(response.json !== undefined ? JSON.stringify(response.json) : '');
    });
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        if (!server.listening) {
          resolve();
          return;
        }
        server.close((err) => {
          if (
            err &&
            (err as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING'
          ) {
            reject(err);
          } else {
            resolve();
          }
        });
      }),
    requests,
    get groups() {
      return groups;
    },
    set groups(newGroups: FakeTraccarGroup[]) {
      groups.length = 0;
      groups.push(...newGroups);
    },
    get down() {
      return down;
    },
    set down(value: boolean) {
      down = value;
    },
    setHandler: (newHandler) => {
      customHandler = newHandler;
    },
  };
}
