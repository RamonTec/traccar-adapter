import {
  createRemoteJWKSet,
  errors,
  jwtVerify,
  type JWTVerifyGetKey,
} from 'jose';
import type { AuthConfig } from '../config/app-config.js';

export interface VerifiedPrincipal {
  readonly actor: string;
  readonly roles: readonly string[];
}

export type InvalidTokenReason =
  | 'MALFORMED'
  | 'SIGNATURE'
  | 'EXPIRED'
  | 'CLAIMS'
  | 'ALGORITHM'
  | 'JWKS_UNAVAILABLE';

export class InvalidTokenError extends Error {
  constructor(readonly reason: InvalidTokenReason) {
    super(`Invalid token: ${reason}`);
    this.name = 'InvalidTokenError';
  }
}

function isNetworkError(err: unknown): boolean {
  if (err instanceof Error) {
    if ('code' in err && typeof err.code === 'string') {
      const codes = [
        'ECONNREFUSED',
        'ECONNRESET',
        'ENOTFOUND',
        'ETIMEDOUT',
        'EAI_AGAIN',
        'ERR_NETWORK_ERROR',
      ];
      if (codes.includes(err.code)) {
        return true;
      }
    }
    if (
      err.name === 'TimeoutError' ||
      err.name === 'AbortError' ||
      err.message.includes('ECONNREFUSED') ||
      err.message.includes('fetch failed')
    ) {
      return true;
    }
    if ('cause' in err && err.cause) {
      return isNetworkError(err.cause);
    }
  }
  return false;
}

export class JwtVerifier {
  private readonly getKey: JWTVerifyGetKey;

  constructor(
    private readonly config: AuthConfig,
    getKey?: JWTVerifyGetKey,
  ) {
    this.getKey =
      getKey ??
      createRemoteJWKSet(
        new URL(
          `${config.issuerUrl.replace(/\/+$/, '')}/protocol/openid-connect/certs`,
        ),
        { cooldownDuration: 30_000 },
      );
  }

  async verify(token: string): Promise<VerifiedPrincipal> {
    if (typeof token !== 'string' || token.trim().length === 0) {
      throw new InvalidTokenError('MALFORMED');
    }

    try {
      const { payload } = await jwtVerify(token, this.getKey, {
        issuer: this.config.issuerUrl,
        audience: this.config.audience,
        algorithms: ['RS256'],
        clockTolerance: 30,
      });

      const actor = payload.azp;
      if (typeof actor !== 'string' || actor.trim() === '') {
        throw new InvalidTokenError('CLAIMS');
      }

      const resourceAccess =
        typeof payload.resource_access === 'object' &&
        payload.resource_access !== null
          ? (payload.resource_access as Record<string, { roles?: unknown }>)
          : undefined;
      const clientAccess = resourceAccess?.[this.config.audience];
      const rawRoles =
        typeof clientAccess === 'object' && clientAccess !== null
          ? clientAccess.roles
          : undefined;
      const roles: readonly string[] = Array.isArray(rawRoles)
        ? rawRoles.filter((r): r is string => typeof r === 'string')
        : [];

      return {
        actor,
        roles,
      };
    } catch (err: unknown) {
      if (err instanceof InvalidTokenError) {
        throw err;
      }
      if (
        err instanceof errors.JWSSignatureVerificationFailed ||
        err instanceof errors.JWKSNoMatchingKey
      ) {
        throw new InvalidTokenError('SIGNATURE');
      }
      if (err instanceof errors.JWTExpired) {
        throw new InvalidTokenError('EXPIRED');
      }
      if (err instanceof errors.JWTClaimValidationFailed) {
        throw new InvalidTokenError('CLAIMS');
      }
      if (err instanceof errors.JOSEAlgNotAllowed) {
        throw new InvalidTokenError('ALGORITHM');
      }
      if (
        err instanceof errors.JWSInvalid ||
        err instanceof errors.JWTInvalid
      ) {
        throw new InvalidTokenError('MALFORMED');
      }
      if (
        err instanceof errors.JWKSTimeout ||
        err instanceof errors.JWKSInvalid ||
        err instanceof TypeError ||
        (err instanceof errors.JOSEError &&
          (err.code === 'ERR_JOSE_GENERIC' ||
            err.message.includes('JSON Web Key Set'))) ||
        isNetworkError(err)
      ) {
        throw new InvalidTokenError('JWKS_UNAVAILABLE');
      }

      throw err;
    }
  }
}
