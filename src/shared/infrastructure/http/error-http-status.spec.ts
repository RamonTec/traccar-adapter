import { describe, expect, it } from 'vitest';
import {
  codeForHttpStatus,
  ERROR_HTTP_STATUS,
  GENERIC_ERROR_HTTP_STATUS,
  httpStatusForCode,
} from './error-http-status.js';

const entries = Object.entries(ERROR_HTTP_STATUS);
const genericEntries = Object.entries(GENERIC_ERROR_HTTP_STATUS);

describe('httpStatusForCode', () => {
  it.each(entries)('AC-9b: maps %s to %i', (code, status) => {
    expect(httpStatusForCode(code)).toBe(status);
  });

  it('AC-3b: maps GROUP_NAME_AMBIGUOUS to 409', () => {
    expect(httpStatusForCode('GROUP_NAME_AMBIGUOUS')).toBe(409);
  });

  it('AC-3: maps DEVICE_ALREADY_REGISTERED to 409', () => {
    expect(httpStatusForCode('DEVICE_ALREADY_REGISTERED')).toBe(409);
  });

  it('AC-6: maps GROUP_NOT_FOUND to 404', () => {
    expect(httpStatusForCode('GROUP_NOT_FOUND')).toBe(404);
  });

  it('AC-9b: returns undefined for an unknown code', () => {
    expect(httpStatusForCode('SOMETHING_UNKNOWN')).toBeUndefined();
  });
});

describe('codeForHttpStatus', () => {
  it('AC-11a: maps 404 to NOT_FOUND', () => {
    expect(codeForHttpStatus(404)).toBe('NOT_FOUND');
  });

  it('AC-3b: 409 still maps back to CONFLICT', () => {
    expect(codeForHttpStatus(409)).toBe('CONFLICT');
  });

  it.each(genericEntries)('AC-11a: maps status back to %s', (code, status) => {
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
