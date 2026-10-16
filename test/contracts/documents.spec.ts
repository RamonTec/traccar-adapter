import { createRequire } from 'node:module';
import { validate } from '@readme/openapi-parser';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import {
  ASYNCAPI_PATH,
  loadDocument,
  OPENAPI_PATH,
} from '../support/contracts.js';

const require = createRequire(import.meta.url);

describe('Published contract documents (spec 016)', () => {
  it('AC-4: openapi.yaml is a valid OpenAPI 3.1 document', async () => {
    const doc = structuredClone(loadDocument(OPENAPI_PATH));

    const result = await validate(doc as Parameters<typeof validate>[0]);

    expect(result.valid ? [] : result.errors).toEqual([]);
    expect(doc.openapi).toBe('3.1.0');
  });

  it('AC-4: asyncapi.yaml is a valid AsyncAPI 3.0 document', () => {
    const doc = loadDocument(ASYNCAPI_PATH);
    const schema = require('@asyncapi/specs/schemas/3.0.0.json') as object;
    // The AsyncAPI schema bundles the draft-07 meta-schema itself.
    const ajv = new Ajv.default({
      strict: false,
      allErrors: true,
      meta: false,
      validateSchema: false,
    });
    addFormats.default(ajv);

    const valid = ajv.validate(schema, doc);

    expect(valid ? [] : ajv.errors).toEqual([]);
    expect(doc.asyncapi).toBe('3.0.0');
  });
});
