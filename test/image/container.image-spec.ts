import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  docker,
  dockerOk,
  httpInContainer,
  IMAGE,
  removeAll,
  runContainer,
  VALID_ENV,
  waitHealthy,
} from './docker.js';

const RUN_ID = `${process.pid}-${Date.now()}`;

describe('Container image (spec 014)', () => {
  const containers: string[] = [];
  let counter = 0;

  function containerName(): string {
    const name = `traccar-adapter-image-test-${RUN_ID}-${++counter}`;
    containers.push(name);
    return name;
  }

  async function inspect<T>(format: string): Promise<T> {
    return JSON.parse(
      await dockerOk([
        'image',
        'inspect',
        IMAGE,
        '--format',
        `{{json ${format}}}`,
      ]),
    ) as T;
  }

  async function shell(command: string): Promise<string> {
    return dockerOk([
      'run',
      '--rm',
      '--entrypoint',
      'sh',
      IMAGE,
      '-c',
      command,
    ]);
  }

  beforeAll(async () => {
    await dockerOk(['build', '-t', IMAGE, '.'], { timeoutMs: 600_000 });
  });

  afterEach(async () => {
    await removeAll(containers.splice(0));
  });

  it('AC-1: pins the Node version of the image to .node-version', async () => {
    const expected = readFileSync('.node-version', 'utf8').trim();
    expect(await shell('node --version')).toBe(`v${expected}`);
  });

  it('AC-1: the build fails when package.json and the lockfile disagree', async () => {
    const context = mkdtempSync(join(tmpdir(), 'traccar-adapter-ctx-'));
    try {
      for (const file of ['Dockerfile', '.dockerignore', 'pnpm-lock.yaml']) {
        cpSync(file, join(context, file));
      }
      const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
        dependencies: Record<string, string>;
      };
      pkg.dependencies['left-pad'] = '1.3.0';
      writeFileSync(join(context, 'package.json'), JSON.stringify(pkg));

      const res = await docker(
        ['build', '--target', 'deps', '-t', `${IMAGE}-mismatch`, context],
        { timeoutMs: 300_000 },
      );

      expect(res.code).not.toBe(0);
      expect(res.stdout + res.stderr).toMatch(/lockfile/i);
    } finally {
      rmSync(context, { recursive: true, force: true });
    }
  });

  it('AC-2: with a valid configuration it listens on PORT and GET /health returns 200', async () => {
    const name = containerName();
    await runContainer(name, { env: { ...VALID_ENV, PORT: '3100' } });
    await waitHealthy(name, 30_000);

    const res = await httpInContainer(name, '/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('AC-3: a missing required variable stops the container naming it', async () => {
    const env: Record<string, string> = { ...VALID_ENV };
    delete env.WEBHOOK_TOKEN;
    const args = ['run', '--rm'];
    for (const [key, value] of Object.entries(env))
      args.push('-e', `${key}=${value}`);

    const res = await docker([...args, IMAGE]);

    expect(res.code).not.toBe(0);
    const line = JSON.parse(res.stderr.trim().split('\n').at(-1)!) as {
      invalidVariables: string[];
    };
    expect(line.invalidVariables).toEqual(['WEBHOOK_TOKEN']);
  });

  it('AC-4: runs as the unprivileged node user', async () => {
    expect(await inspect<string>('.Config.User')).toBe('node');
    expect(await shell('id -u')).toBe('1000');
  });

  it('AC-5: contains only the compiled code and production dependencies', async () => {
    expect((await shell('ls -A /app')).split('\n')).toEqual([
      'data',
      'dist',
      'node_modules',
      'package.json',
    ]);
    expect(
      await shell(
        'find /app -path /app/node_modules -prune -o -name "*.ts" ! -name "*.d.ts" -print',
      ),
    ).toBe('');
    expect(
      await shell('find /app/dist -name "*.spec.*" -o -name "__fakes__"'),
    ).toBe('');
    expect(await shell('find / -xdev -name ".env*" 2>/dev/null; true')).toBe(
      '',
    );
    expect(
      await shell(
        'ls /app/node_modules | grep -E "^(vitest|typescript|@nestjs)$" || true',
      ),
    ).toBe('@nestjs');
    expect(await shell('ls /app/node_modules/@nestjs')).not.toMatch(
      /cli|testing|schematics/,
    );
  });

  it('AC-6: bakes no environment-specific configuration', async () => {
    const env = await inspect<string[]>('.Config.Env');
    const names = env.map((entry) => entry.split('=')[0]).sort();

    expect(names).toEqual(
      [
        'NODE_ENV',
        'NODE_VERSION',
        'OUTBOX_PATH',
        'PATH',
        'YARN_VERSION',
      ].sort(),
    );
  });

  it('AC-7: declares a healthcheck on GET /health and becomes healthy', async () => {
    const healthcheck = await inspect<{ Test: string[] }>(
      '.Config.Healthcheck',
    );
    expect(healthcheck.Test.join(' ')).toContain('/health');

    const name = containerName();
    await runContainer(name, { env: VALID_ENV });
    await waitHealthy(name, 30_000);
  });
});
