import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import {
  DiscoveryModule,
  DiscoveryService,
  MetadataScanner,
} from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { loadDocument, OPENAPI_PATH } from '../support/contracts.js';
import { testConfig } from '../support/test-env.js';

// Internal routes between Traccar and the adapter: not part of the published API.
const INTERNAL_PREFIX = '/webhooks/';
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

function joinPath(...parts: string[]): string {
  const path = parts
    .flatMap((part) => part.split('/'))
    .filter((segment) => segment !== '')
    .map((segment) =>
      segment.startsWith(':') ? `{${segment.slice(1)}}` : segment,
    )
    .join('/');
  return `/${path}`;
}

async function exposedRoutes(): Promise<string[]> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register(testConfig()), DiscoveryModule],
  }).compile();
  const discovery = moduleRef.get(DiscoveryService);
  const scanner = moduleRef.get(MetadataScanner);
  const routes: string[] = [];
  for (const wrapper of discovery.getControllers()) {
    const { instance, metatype } = wrapper;
    if (!instance || !metatype) continue;
    const prefix =
      (Reflect.getMetadata(PATH_METADATA, metatype) as string) ?? '';
    const prototype = Object.getPrototypeOf(instance) as object;
    for (const name of scanner.getAllMethodNames(prototype)) {
      const handler = (prototype as Record<string, unknown>)[name] as object;
      const path = Reflect.getMetadata(PATH_METADATA, handler) as
        string | undefined;
      if (path === undefined) continue;
      const method = Reflect.getMetadata(
        METHOD_METADATA,
        handler,
      ) as RequestMethod;
      routes.push(`${RequestMethod[method]} ${joinPath(prefix, path)}`);
    }
  }
  await moduleRef.close();
  return routes;
}

function documentedRoutes(): string[] {
  const paths = loadDocument(OPENAPI_PATH).paths as Record<
    string,
    Record<string, unknown>
  >;
  return Object.entries(paths).flatMap(([path, item]) =>
    HTTP_METHODS.filter((method) => method in item).map(
      (method) => `${method.toUpperCase()} ${path}`,
    ),
  );
}

describe('OpenAPI routes (spec 016)', () => {
  it('AC-5: every public route of the service is documented and every documented route exists', async () => {
    const exposed = (await exposedRoutes())
      .filter((route) => !route.split(' ')[1]!.startsWith(INTERNAL_PREFIX))
      .sort();

    expect(exposed.length).toBeGreaterThan(0);
    expect(documentedRoutes().sort()).toEqual(exposed);
  });

  it('AC-5: the internal Traccar webhooks are not published', () => {
    expect(
      documentedRoutes().filter((r) => r.includes(INTERNAL_PREFIX)),
    ).toEqual([]);
  });

  it('AC-1: every command declares its required role, and the health routes are public', () => {
    const paths = loadDocument(OPENAPI_PATH).paths as Record<
      string,
      Record<string, { 'x-required-role'?: string; security?: unknown[] }>
    >;
    for (const [path, item] of Object.entries(paths)) {
      for (const method of HTTP_METHODS) {
        const operation = item[method];
        if (!operation) continue;
        if (path.startsWith('/health')) {
          expect(operation.security, `${method} ${path}`).toEqual([]);
        } else {
          expect(operation['x-required-role'], `${method} ${path}`).toMatch(
            /^(groups|devices):write$/,
          );
        }
      }
    }
  });

  it('AC-2: every command is idempotent and every response states whether it is retryable', () => {
    const doc = loadDocument(OPENAPI_PATH) as {
      paths: Record<
        string,
        Record<
          string,
          {
            'x-idempotent'?: boolean;
            responses: Record<
              string,
              { $ref?: string; 'x-retryable'?: boolean }
            >;
          }
        >
      >;
      components: { responses: Record<string, { 'x-retryable'?: boolean }> };
    };
    for (const [path, item] of Object.entries(doc.paths)) {
      if (path.startsWith('/health')) continue;
      for (const method of HTTP_METHODS) {
        const operation = item[method];
        if (!operation) continue;
        expect(operation['x-idempotent'], `${method} ${path}`).toBe(true);
        for (const [status, response] of Object.entries(operation.responses)) {
          const resolved = response.$ref
            ? doc.components.responses[response.$ref.split('/').at(-1)!]!
            : response;
          expect(resolved['x-retryable'], `${method} ${path} ${status}`).toBe(
            status === '503' || status === '500',
          );
        }
      }
    }
  });
});
