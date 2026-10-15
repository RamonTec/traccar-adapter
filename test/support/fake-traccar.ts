import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface FakeTraccarGroup {
  id: number;
  name: string;
  groupId: number;
  attributes: Record<string, unknown>;
}

export interface FakeTraccarDevice {
  id: number;
  name: string;
  uniqueId: string;
  groupId: number;
  disabled: boolean;
  attributes: Record<string, unknown>;
  calendarId?: number;
  status?: string;
  lastUpdate?: string | null;
  positionId?: number;
  phone?: string | null;
  model?: string | null;
  contact?: string | null;
  category?: string | null;
  expirationTime?: string | null;
}

export interface FakeTraccarRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

export interface FakeTraccarResponse {
  status: number;
  json?: unknown;
  text?: string;
}

export interface FakeTraccarServer {
  readonly url: string;
  readonly close: () => Promise<void>;
  readonly requests: FakeTraccarRequest[];
  groups: FakeTraccarGroup[];
  devices: FakeTraccarDevice[];
  failNextPost: number;
  down: boolean;
  setHandler: (
    handler: (
      req: IncomingMessage,
      body: string,
    ) => FakeTraccarResponse | undefined,
  ) => void;
}

export async function createFakeTraccar(
  initialHandler?: (
    req: IncomingMessage,
    body: string,
  ) => FakeTraccarResponse | undefined,
): Promise<FakeTraccarServer> {
  const requests: FakeTraccarRequest[] = [];
  const groups: FakeTraccarGroup[] = [];
  const devices: FakeTraccarDevice[] = [];
  let failNextPost = 0;
  let down = false;
  let customHandler = initialHandler;

  const defaultHandler = (
    req: IncomingMessage,
    body: string,
  ): FakeTraccarResponse => {
    const url = req.url
      ? new URL(req.url, 'http://127.0.0.1')
      : new URL('http://127.0.0.1');
    const pathname = url.pathname;

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

    if (pathname === '/api/devices') {
      if (req.method === 'GET') {
        const uniqueId = url.searchParams.get('uniqueId');
        if (uniqueId !== null) {
          const matching = devices.filter((d) => d.uniqueId === uniqueId);
          return { status: 200, json: matching };
        }
        return { status: 200, json: devices };
      }

      if (req.method === 'POST') {
        if (failNextPost > 0) {
          failNextPost--;
          return { status: 500, json: { message: 'Traccar unavailable' } };
        }
        const parsed = body
          ? (JSON.parse(body) as Partial<FakeTraccarDevice>)
          : {};
        const duplicate = devices.some((d) => d.uniqueId === parsed.uniqueId);
        if (duplicate) {
          return {
            status: 400,
            text:
              'org.traccar.storage.StorageException: org.h2.jdbc.JdbcSQLIntegrityConstraintViolationException: ' +
              'Unique index or primary key violation: "PUBLIC.CONSTRAINT_A INDEX PUBLIC.CONSTRAINT_A_INDEX_6 ' +
              `ON PUBLIC.TC_DEVICES(UNIQUEID NULLS FIRST) VALUES ( /* 18 */ '${parsed.uniqueId}' )"; ` +
              'SQL statement: INSERT INTO tc_devices(groupId, contact, model, disabled, calendarId, phone, ' +
              'expirationTime, name, attributes, category, uniqueId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          };
        }
        const maxId = devices.reduce((max, d) => Math.max(max, d.id), 0);
        const newDevice: FakeTraccarDevice = {
          id: maxId + 1,
          name: parsed.name ?? parsed.uniqueId ?? '',
          uniqueId: parsed.uniqueId ?? '',
          groupId: parsed.groupId ?? 0,
          disabled: parsed.disabled ?? false,
          attributes: parsed.attributes ?? {},
          calendarId: parsed.calendarId ?? 0,
          status: parsed.status ?? 'offline',
          lastUpdate: null,
          positionId: 0,
          phone: null,
          model: null,
          contact: null,
          category: null,
          expirationTime: null,
        };
        devices.push(newDevice);
        return { status: 200, json: newDevice };
      }
    }

    const deviceMatch = pathname.match(/^\/api\/devices\/(\d+)$/);
    if (deviceMatch) {
      const deviceId = Number(deviceMatch[1]);
      const index = devices.findIndex((d) => d.id === deviceId);

      if (req.method === 'GET') {
        if (index === -1) {
          return {
            status: 400,
            text: 'java.lang.SecurityException: Device access denied',
          };
        }
        return { status: 200, json: devices[index] };
      }

      if (req.method === 'PUT') {
        if (index === -1) {
          return {
            status: 400,
            text: 'java.lang.SecurityException: Device access denied',
          };
        }
        const parsed = body
          ? (JSON.parse(body) as Partial<FakeTraccarDevice>)
          : {};
        const existing = devices[index];
        const updated: FakeTraccarDevice = {
          ...existing,
          ...parsed,
          id: deviceId,
          groupId: parsed.groupId !== undefined ? parsed.groupId : 0,
          disabled:
            parsed.disabled !== undefined ? parsed.disabled : existing.disabled,
          name: parsed.name !== undefined ? parsed.name : existing.name,
          uniqueId:
            parsed.uniqueId !== undefined ? parsed.uniqueId : existing.uniqueId,
        };
        devices[index] = updated;
        return { status: 200, json: updated };
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
        : ((customHandler ? customHandler(req, body) : undefined) ??
          defaultHandler(req, body));

      const payload =
        response.text !== undefined
          ? response.text
          : response.json !== undefined
            ? JSON.stringify(response.json)
            : '';
      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(payload);
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
        } else {
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
        }
      }),
    requests,
    get groups() {
      return groups;
    },
    set groups(newGroups: FakeTraccarGroup[]) {
      groups.length = 0;
      groups.push(...newGroups);
    },
    get devices() {
      return devices;
    },
    set devices(newDevices: FakeTraccarDevice[]) {
      devices.length = 0;
      devices.push(...newDevices);
    },
    get failNextPost() {
      return failNextPost;
    },
    set failNextPost(value: number) {
      failNextPost = value;
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
