import { describe, expect, it } from 'vitest';
import {
  codeForHttpStatus,
  ERROR_HTTP_STATUS,
  httpStatusForCode,
} from './error-http-status.js';

const entries = Object.entries(ERROR_HTTP_STATUS);

describe('httpStatusForCode', () => {
  it.each(entries)('AC-9b: maps %s to %i', (code, status) => {
    expect(httpStatusForCode(code)).toBe(status);
  });

  it('AC-9b: returns undefined for an unknown code', () => {
    expect(httpStatusForCode('SOMETHING_UNKNOWN')).toBeUndefined();
  });
});

describe('codeForHttpStatus', () => {
  it('AC-11a: maps 404 to NOT_FOUND', () => {
    expect(codeForHttpStatus(404)).toBe('NOT_FOUND');
  });

  it.each(entries)('AC-11a: maps status back to %s', (code, status) => {
    expect(codeForHttpStatus(status)).toBe(code);
  });

  it.each([405, 413])(
    'AC-11b: maps unmapped 4xx %i to BAD_REQUEST',
    (status) => {
      expect(codeForHttpStatus(status)).toBe('BAD_REQUEST');
    },
  );

  it('AC-11b: maps unmapped 5xx to INTERNAL_ERROR', () => {
    expect(codeForHttpStatus(502)).toBe('INTERNAL_ERROR');
  });
});
