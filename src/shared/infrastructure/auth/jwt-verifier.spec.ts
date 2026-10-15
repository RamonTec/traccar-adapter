import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type GenerateKeyPairResult,
  type JWTVerifyGetKey,
  SignJWT,
} from 'jose';
import type { AuthConfig } from '../config/app-config.js';
import { InvalidTokenError, JwtVerifier } from './jwt-verifier.js';

describe('JwtVerifier', () => {
  const authConfig: AuthConfig = {
    issuerUrl: 'https://keycloak.example.com/realms/telemetry',
    audience: 'traccar-adapter',
  };

  let primaryKeys: GenerateKeyPairResult;
  let untrustedKeys: GenerateKeyPairResult;
  let localJWKS: JWTVerifyGetKey;

  beforeAll(async () => {
    primaryKeys = await generateKeyPair('RS256');
    untrustedKeys = await generateKeyPair('RS256');

    const primaryJwk = await exportJWK(primaryKeys.publicKey);
    primaryJwk.kid = 'primary-key-id';
    primaryJwk.alg = 'RS256';

    localJWKS = createLocalJWKSet({ keys: [primaryJwk] });
  });

  async function createToken(
    claims: Record<string, unknown> = {},
    options?: {
      key?: CryptoKey;
      kid?: string;
      alg?: string;
      issuer?: string;
      audience?: string | string[];
      expiresIn?: number | string;
      notBefore?: number | string;
    },
  ): Promise<string> {
    const payload: Record<string, unknown> = {
      azp: 'test-client',
      ...claims,
    };

    if ('azp' in claims && claims.azp === undefined) {
      delete payload.azp;
    }

    const alg = options?.alg ?? 'RS256';
    const header: { alg: string; kid?: string } = { alg };
    if (options?.kid !== undefined) {
      header.kid = options.kid;
    } else if (alg === 'RS256') {
      header.kid = 'primary-key-id';
    }

    const jwt = new SignJWT(payload).setProtectedHeader(header);
    jwt.setIssuer(options?.issuer ?? authConfig.issuerUrl);
    jwt.setAudience(options?.audience ?? authConfig.audience);

    if (options?.expiresIn !== undefined) {
      jwt.setExpirationTime(options.expiresIn);
    } else {
      jwt.setExpirationTime('1h');
    }

    if (options?.notBefore !== undefined) {
      jwt.setNotBefore(options.notBefore);
    }

    const key = options?.key ?? primaryKeys.privateKey;
    return jwt.sign(key);
  }

  describe('AC-2: signature and malformed token', () => {
    it('AC-2: rejects token signed with an untrusted key with SIGNATURE', async () => {
      const verifier = new JwtVerifier(authConfig, localJWKS);
      const token = await createToken({}, { key: untrustedKeys.privateKey });

      await expect(verifier.verify(token)).rejects.toThrow(InvalidTokenError);
      await expect(verifier.verify(token)).rejects.toMatchObject({
        reason: 'SIGNATURE',
      });
    });

    it.each(['abc', '', 'not-a-jwt', 'a.b'])(
      'AC-2: rejects malformed token %j with MALFORMED',
      async (malformed) => {
        const verifier = new JwtVerifier(authConfig, localJWKS);

        await expect(verifier.verify(malformed)).rejects.toThrow(
          InvalidTokenError,
        );
        await expect(verifier.verify(malformed)).rejects.toMatchObject({
          reason: 'MALFORMED',
        });
      },
    );
  });

  describe('AC-3: expiration and not-before claims', () => {
    it('AC-3: rejects token expired 60s ago with EXPIRED', async () => {
      const verifier = new JwtVerifier(authConfig, localJWKS);
      const expiredTime = Math.floor(Date.now() / 1000) - 60;
      const token = await createToken({}, { expiresIn: expiredTime });

      await expect(verifier.verify(token)).rejects.toThrow(InvalidTokenError);
      await expect(verifier.verify(token)).rejects.toMatchObject({
        reason: 'EXPIRED',
      });
    });

    it('AC-3: accepts token expired 10s ago due to 30s clock tolerance', async () => {
      const verifier = new JwtVerifier(authConfig, localJWKS);
      const graceTime = Math.floor(Date.now() / 1000) - 10;
      const token = await createToken(
        { azp: 'gps-gateway' },
        { expiresIn: graceTime },
      );

      const principal = await verifier.verify(token);
      expect(principal.actor).toBe('gps-gateway');
    });

    it('AC-3: rejects token with nbf 60s in the future with CLAIMS', async () => {
      const verifier = new JwtVerifier(authConfig, localJWKS);
      const futureTime = Math.floor(Date.now() / 1000) + 60;
      const token = await createToken({}, { notBefore: futureTime });

      await expect(verifier.verify(token)).rejects.toThrow(InvalidTokenError);
      await expect(verifier.verify(token)).rejects.toMatchObject({
        reason: 'CLAIMS',
      });
    });
  });

  describe('AC-4: issuer, audience, algorithm, and actor validation', () => {
    it('AC-4: rejects token with different issuer with CLAIMS', async () => {
      const verifier = new JwtVerifier(authConfig, localJWKS);
      const token = await createToken(
        {},
        { issuer: 'https://evil-issuer.com' },
      );

      await expect(verifier.verify(token)).rejects.toThrow(InvalidTokenError);
      await expect(verifier.verify(token)).rejects.toMatchObject({
        reason: 'CLAIMS',
      });
    });

    it('AC-4: rejects token without configured audience with CLAIMS', async () => {
      const verifier = new JwtVerifier(authConfig, localJWKS);
      const token = await createToken({}, { audience: 'different-audience' });

      await expect(verifier.verify(token)).rejects.toThrow(InvalidTokenError);
      await expect(verifier.verify(token)).rejects.toMatchObject({
        reason: 'CLAIMS',
      });
    });

    it('AC-4: rejects token signed with HS256 with ALGORITHM', async () => {
      const verifier = new JwtVerifier(authConfig, localJWKS);
      const hmacSecret = new TextEncoder().encode(
        'secret-key-at-least-32-chars-long!',
      );
      const token = await new SignJWT({ azp: 'test-client' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer(authConfig.issuerUrl)
        .setAudience(authConfig.audience)
        .setExpirationTime('1h')
        .sign(hmacSecret);

      await expect(verifier.verify(token)).rejects.toThrow(InvalidTokenError);
      await expect(verifier.verify(token)).rejects.toMatchObject({
        reason: 'ALGORITHM',
      });
    });

    it('AC-4: rejects token missing azp claim with CLAIMS', async () => {
      const verifier = new JwtVerifier(authConfig, localJWKS);
      const token = await createToken({ azp: undefined });

      await expect(verifier.verify(token)).rejects.toThrow(InvalidTokenError);
      await expect(verifier.verify(token)).rejects.toMatchObject({
        reason: 'CLAIMS',
      });
    });
  });

  describe('AC-4b: actor and roles extraction', () => {
    it('AC-4b: returns actor and roles when resource_access contains audience roles', async () => {
      const verifier = new JwtVerifier(authConfig, localJWKS);
      const token = await createToken({
        azp: 'telemetry-backend',
        resource_access: {
          'traccar-adapter': {
            roles: ['devices:write', 'groups:write'],
          },
          'other-service': {
            roles: ['admin'],
          },
        },
      });

      const principal = await verifier.verify(token);
      expect(principal).toEqual({
        actor: 'telemetry-backend',
        roles: ['devices:write', 'groups:write'],
      });
    });

    it('AC-4b: returns empty roles when resource_access is omitted', async () => {
      const verifier = new JwtVerifier(authConfig, localJWKS);
      const token = await createToken({ azp: 'telemetry-backend' });

      const principal = await verifier.verify(token);
      expect(principal).toEqual({
        actor: 'telemetry-backend',
        roles: [],
      });
    });

    it('AC-4b: returns empty roles when resource_access does not contain target audience', async () => {
      const verifier = new JwtVerifier(authConfig, localJWKS);
      const token = await createToken({
        azp: 'telemetry-backend',
        resource_access: {
          'another-client': {
            roles: ['read'],
          },
        },
      });

      const principal = await verifier.verify(token);
      expect(principal).toEqual({
        actor: 'telemetry-backend',
        roles: [],
      });
    });
  });

  describe('AC-8: remote JWKS caching and cooldown', () => {
    let server: Server;
    let serverUrl: string;
    let requestCount = 0;
    let remoteKeys: GenerateKeyPairResult;

    beforeEach(async () => {
      requestCount = 0;
      remoteKeys = await generateKeyPair('RS256');
      const jwk = await exportJWK(remoteKeys.publicKey);
      jwk.kid = 'remote-key-1';
      jwk.alg = 'RS256';

      server = createServer((_req, res) => {
        requestCount++;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ keys: [jwk] }));
      });

      await new Promise<void>((resolve) => server.listen(0, resolve));
      const port = (server.address() as AddressInfo).port;
      serverUrl = `http://127.0.0.1:${port}`;
    });

    afterEach(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('AC-8: caches remote JWKS for valid tokens and limits extra requests for unknown kid', async () => {
      const verifier = new JwtVerifier({
        issuerUrl: serverUrl,
        audience: 'traccar-adapter',
      });

      const validToken = await new SignJWT({ azp: 'remote-client' })
        .setProtectedHeader({ alg: 'RS256', kid: 'remote-key-1' })
        .setIssuer(serverUrl)
        .setAudience('traccar-adapter')
        .setExpirationTime('1h')
        .sign(remoteKeys.privateKey);

      // Two consecutive valid verifications make 1 request to JWKS
      const p1 = await verifier.verify(validToken);
      expect(p1.actor).toBe('remote-client');
      expect(requestCount).toBe(1);

      const p2 = await verifier.verify(validToken);
      expect(p2.actor).toBe('remote-client');
      expect(requestCount).toBe(1);

      // Unknown kid triggers at most 1 extra request within 30s
      const unknownKeys = await generateKeyPair('RS256');
      const unknownToken = await new SignJWT({ azp: 'unknown-client' })
        .setProtectedHeader({ alg: 'RS256', kid: 'unknown-kid' })
        .setIssuer(serverUrl)
        .setAudience('traccar-adapter')
        .setExpirationTime('1h')
        .sign(unknownKeys.privateKey);

      await expect(verifier.verify(unknownToken)).rejects.toMatchObject({
        reason: 'SIGNATURE',
      });
      const extraRequestsFirst = requestCount - 1;
      expect(extraRequestsFirst).toBeLessThanOrEqual(1);

      // Second attempt with unknown kid within 30s cooldown makes 0 extra requests
      await expect(verifier.verify(unknownToken)).rejects.toMatchObject({
        reason: 'SIGNATURE',
      });
      const extraRequestsTotal = requestCount - 1;
      expect(extraRequestsTotal).toBeLessThanOrEqual(1);
    });
  });

  describe('AC-9: JWKS unavailable', () => {
    it('AC-9: throws JWKS_UNAVAILABLE when JWKS server is unreachable', async () => {
      const probeServer = createServer();
      await new Promise<void>((resolve) => probeServer.listen(0, resolve));
      const port = (probeServer.address() as AddressInfo).port;
      await new Promise<void>((resolve) => probeServer.close(() => resolve()));

      const closedUrl = `http://127.0.0.1:${port}`;
      const verifier = new JwtVerifier({
        issuerUrl: closedUrl,
        audience: 'traccar-adapter',
      });

      const kp = await generateKeyPair('RS256');
      const token = await new SignJWT({ azp: 'any' })
        .setProtectedHeader({ alg: 'RS256', kid: 'any' })
        .setIssuer(closedUrl)
        .setAudience('traccar-adapter')
        .setExpirationTime('1h')
        .sign(kp.privateKey);

      await expect(verifier.verify(token)).rejects.toThrow(InvalidTokenError);
      await expect(verifier.verify(token)).rejects.toMatchObject({
        reason: 'JWKS_UNAVAILABLE',
      });
    });
  });
});
