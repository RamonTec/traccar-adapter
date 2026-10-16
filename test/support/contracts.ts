import { readFileSync } from 'node:fs';
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';

// Published contracts (spec 016). Paths are relative to the repo root (vitest root).
export const OPENAPI_PATH = 'docs/contracts/openapi.yaml';
export const ASYNCAPI_PATH = 'docs/contracts/asyncapi.yaml';

export interface ContractViolation {
  readonly where: string;
  readonly errors: string[];
}

const documents = new Map<string, Record<string, unknown>>();

/** YAML document as a plain object (cached; callers must not mutate it). */
export function loadDocument(path: string): Record<string, unknown> {
  let doc = documents.get(path);
  if (!doc) {
    doc = parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    documents.set(path, doc);
  }
  return doc;
}

const ajv = new Ajv2020({
  strict: false,
  allErrors: true,
  // The whole OpenAPI/AsyncAPI document is registered so internal $refs resolve;
  // it is not a JSON Schema itself.
  validateSchema: false,
});
addFormats.default(ajv);
const validators = new Map<string, ValidateFunction>();

/**
 * Validates `value` against the schema at JSON pointer `pointer` (e.g.
 * `/components/schemas/ErrorBody`) of the document at `docPath`.
 */
export function validateAgainst(
  docPath: string,
  pointer: string,
  value: unknown,
): ContractViolation | null {
  if (!ajv.getSchema(docPath)) ajv.addSchema(loadDocument(docPath), docPath);
  const key = `${docPath}#${pointer}`;
  let validate = validators.get(key);
  if (!validate) {
    validate = ajv.compile({ $ref: key });
    validators.set(key, validate);
  }
  if (validate(value)) return null;
  return {
    where: key,
    errors: (validate.errors ?? []).map(
      (e) => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`,
    ),
  };
}
