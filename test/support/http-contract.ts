import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import {
  type ContractViolation,
  loadDocument,
  OPENAPI_PATH,
  validateAgainst,
} from './contracts.js';

export interface RecordedResponse {
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly body: unknown;
}

interface ResponseObject {
  $ref?: string;
  content?: Record<string, unknown>;
}
interface Operation {
  responses: Record<string, ResponseObject>;
}

/**
 * Records every JSON response of `app`. Call before `app.init()` so the
 * middleware runs ahead of the routes.
 */
export function recordResponses(app: INestApplication): {
  take(): RecordedResponse[];
} {
  let recorded: RecordedResponse[] = [];
  app.use((req: Request, res: Response, next: NextFunction) => {
    const json = res.json.bind(res);
    res.json = (body: unknown) => {
      recorded.push({
        method: req.method,
        path: req.originalUrl.split('?')[0]!,
        status: res.statusCode,
        body,
      });
      return json(body);
    };
    next();
  });
  return {
    take() {
      const out = recorded;
      recorded = [];
      return out;
    },
  };
}

const escapePointer = (segment: string): string =>
  segment.replaceAll('~', '~0').replaceAll('/', '~1');

function findOperation(
  method: string,
  path: string,
): { template: string; operation: Operation } | undefined {
  const paths = loadDocument(OPENAPI_PATH).paths as Record<
    string,
    Record<string, Operation>
  >;
  for (const [template, item] of Object.entries(paths)) {
    const pattern = new RegExp(`^${template.replace(/\{[^}]+\}/g, '[^/]+')}$`);
    const operation = item[method.toLowerCase()];
    if (operation && pattern.test(path)) return { template, operation };
  }
  return undefined;
}

/**
 * Checks recorded responses against the OpenAPI: the status must be documented
 * for the operation and the body must match its schema. Routes the document
 * does not describe (internal webhooks, unknown paths) are skipped; the route
 * test (AC-5) guarantees every public route is documented.
 */
export function checkHttpContract(
  responses: readonly RecordedResponse[],
): ContractViolation[] {
  const violations: ContractViolation[] = [];
  for (const res of responses) {
    const found = findOperation(res.method, res.path);
    if (!found) continue;
    const where = `${res.method} ${res.path} → ${res.status}`;
    const response = found.operation.responses[String(res.status)];
    if (!response) {
      violations.push({ where, errors: ['status not documented'] });
      continue;
    }
    const base = response.$ref
      ? response.$ref.slice(1)
      : `/paths/${escapePointer(found.template)}/${res.method.toLowerCase()}/responses/${res.status}`;
    const violation = validateAgainst(
      OPENAPI_PATH,
      `${base}/content/application~1json/schema`,
      res.body,
    );
    if (violation) violations.push({ where, errors: violation.errors });
  }
  return violations;
}
