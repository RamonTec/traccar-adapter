// Generic codes: the only ones codeForHttpStatus may return.
export const GENERIC_ERROR_HTTP_STATUS: Readonly<Record<string, number>> =
  Object.freeze({
    VALIDATION_ERROR: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    UPSTREAM_UNAVAILABLE: 503,
    INTERNAL_ERROR: 500,
  });

// Domain-specific codes share a status with a generic code and are excluded
// from the reverse mapping so codeForHttpStatus(409) stays 'CONFLICT'.
export const ERROR_HTTP_STATUS: Readonly<Record<string, number>> =
  Object.freeze({
    ...GENERIC_ERROR_HTTP_STATUS,
    GROUP_NAME_AMBIGUOUS: 409,
    DEVICE_ALREADY_REGISTERED: 409,
    GROUP_NOT_FOUND: 404,
    DEVICE_NOT_FOUND: 404,
    DEVICE_RETIRED: 409,
  });

const CODE_BY_STATUS: ReadonlyMap<number, string> = new Map(
  Object.entries(GENERIC_ERROR_HTTP_STATUS).map(([code, status]) => [
    status,
    code,
  ]),
);

export function httpStatusForCode(code: string): number | undefined {
  // hasOwn guards against inherited keys such as 'constructor' or 'toString'.
  return Object.hasOwn(ERROR_HTTP_STATUS, code)
    ? ERROR_HTTP_STATUS[code]
    : undefined;
}

export function codeForHttpStatus(status: number): string {
  const code = CODE_BY_STATUS.get(status);
  if (code !== undefined) return code;
  return status >= 400 && status < 500 ? 'BAD_REQUEST' : 'INTERNAL_ERROR';
}
