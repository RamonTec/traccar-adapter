# Recetas de test — traccar-adapter

Lee solo la sección que necesitas. Los nombres de ejemplo (`Imei`, `RegisterDeviceUseCase`…) son ilustrativos: adapta a tu task.

## §1 Unit: dominio / función pura

```ts
import { Imei } from './imei.js';
import { InvalidImeiError } from './errors.js';

describe('Imei', () => {
  it('AC-1: accepts a 15-digit IMEI', () => {
    expect(Imei.create('356938035643809').value).toBe('356938035643809');
  });

  it.each(['', '123', '35693803564380X'])('AC-2: rejects %j', (raw) => {
    expect(() => Imei.create(raw)).toThrow(InvalidImeiError);
  });
});
```

## §2 Unit: use case con fake

```ts
import { RegisterDeviceUseCase } from './register-device.use-case.js';
import { FakeTraccarDevicePort } from '../ports/__fakes__/traccar-device.port.fake.js';

describe('RegisterDeviceUseCase', () => {
  let port: FakeTraccarDevicePort;
  let useCase: RegisterDeviceUseCase;

  beforeEach(() => {
    port = new FakeTraccarDevicePort();
    useCase = new RegisterDeviceUseCase(port); // clase plana, sin TestingModule
  });

  it('AC-1: returns the traccar device id', async () => {
    port.nextId = 42;
    await expect(useCase.execute({ imei: '356938035643809', groupId: 7 })).resolves.toEqual({ deviceId: 42 });
    expect(port.created).toEqual([{ uniqueId: '356938035643809', groupId: 7 }]);
  });

  it('AC-3: propagates upstream unavailability', async () => {
    port.failWith = new TraccarUnavailableError();
    await expect(useCase.execute({ imei: '356938035643809', groupId: 7 })).rejects.toBeInstanceOf(TraccarUnavailableError);
  });
});
```

## §3 Fake de un port

Implementa la interfaz real (así TypeScript detecta drift), guarda lo recibido y permite programar respuestas/fallos.

```ts
// application/ports/__fakes__/traccar-device.port.fake.ts
import type { TraccarDevicePort, CreateDeviceCommand } from '../traccar-device.port.js';

export class FakeTraccarDevicePort implements TraccarDevicePort {
  readonly created: CreateDeviceCommand[] = [];
  nextId = 1;
  failWith?: Error;

  async createDevice(cmd: CreateDeviceCommand): Promise<number> {
    if (this.failWith) throw this.failWith;
    this.created.push(cmd);
    return this.nextId++;
  }
}
```

## §4 Integración Nest: controller / filter / logging

```ts
import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import request from 'supertest';
import { LoggingModule } from '../logging/logging.module.js';
import { createLogCapture } from '../../../../test/support/log-capture.js';

@Controller('dummy')
class DummyController {
  @Get() ok() { return { ok: true }; }
}

describe('Feature (integration)', () => {
  let app: INestApplication;
  const logs = createLogCapture();

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [LoggingModule.forRoot({ port: 0, logLevel: 'debug' }, logs.stream)],
      controllers: [DummyController],
      // providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
    }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    await app.init();
  });

  afterEach(() => app.close());

  it('AC-5: echoes the correlation id', async () => {
    const res = await request(app.getHttpServer()).get('/dummy').set('x-correlation-id', 'cid-1').expect(200);
    expect(res.headers['x-correlation-id']).toBe('cid-1');
    await vi.waitFor(() => expect(logs.lines().some((l) => l.correlationId === 'cid-1')).toBe(true));
  });
});
```

Para inyectar un use case falso en un controller: `providers: [{ provide: RegisterDeviceUseCase, useValue: fakeUseCase }]`.

## §5 Integración: adapter HTTP contra Traccar falso

Servidor real en puerto 0 con `node:http`; sin librerías de mocking de red.

```ts
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

type Handler = (req: IncomingMessage, body: string) => { status: number; json?: unknown };

async function fakeTraccar(handler: Handler): Promise<{ url: string; server: Server; requests: { method?: string; url?: string; body: string }[] }> {
  const requests: { method?: string; url?: string; body: string }[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, body });
      const { status, json } = handler(req, body);
      res.writeHead(status, { 'content-type': 'application/json' }).end(json === undefined ? '' : JSON.stringify(json));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server, requests };
}

// afterEach: await new Promise((r) => traccar.server.close(r));
```

Casos mínimos por operación: happy path (verifica método, ruta, body y auth enviados), 4xx de Traccar → error de aplicación esperado, 5xx/timeout/conexión rechazada → `TraccarUnavailableError`. Para timeouts, el handler no responde y el adapter se configura con timeout corto.

## §6 E2E de proceso

Requiere `pnpm build` previo (lo hace `pnpm test:e2e`).

```ts
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });

const children: ChildProcess[] = [];
const startApp = (env: Record<string, string>) => {
  const child = spawn('node', ['dist/main.js'], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  return child;
};
const exitCode = (child: ChildProcess) => new Promise<number | null>((r) => child.once('exit', (code) => r(code)));

async function waitForHealth(port: number, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('app did not become healthy');
}

afterEach(() => children.splice(0).forEach((c) => c.exitCode === null && c.kill('SIGKILL')));
```

## §7 NATS / JetStream

_Pendiente: se completa con el spec 008 (publish-events)._
