import { Logger } from '@nestjs/common';
import { UpstreamUnavailableError } from '../../domain/upstream-unavailable.error.js';
import type { TraccarConfig } from '../config/app-config.js';
import { currentCorrelationId } from '../context/request-context.js';

export class TraccarRequestError extends Error {
  constructor(
    readonly status: number,
    readonly traccarMessage: string,
  ) {
    super(`Traccar request failed with status ${status}: ${traccarMessage}`);
    this.name = 'TraccarRequestError';
  }
}

export type TraccarMethod = 'GET' | 'POST' | 'PUT';

export class TraccarHttpClient {
  private readonly logger = new Logger(TraccarHttpClient.name);

  constructor(
    private readonly config: TraccarConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async request<T>(
    op: string,
    method: TraccarMethod,
    path: string,
    opts?: {
      query?: Record<string, string | number | boolean>;
      body?: unknown;
    },
  ): Promise<T> {
    const baseUrl = this.config.baseUrl.replace(/\/+$/, '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const loggedPath = normalizedPath.split('?')[0];

    const url = new URL(`${baseUrl}${normalizedPath}`);
    if (opts?.query) {
      for (const [key, value] of Object.entries(opts.query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiToken}`,
      Accept: 'application/json',
    };
    if (opts?.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const correlationId = currentCorrelationId();
    if (correlationId !== undefined) {
      headers['x-correlation-id'] = correlationId;
    }

    const body =
      opts?.body !== undefined ? JSON.stringify(opts.body) : undefined;
    const signal = AbortSignal.timeout(this.config.timeoutMs);
    const start = performance.now();

    let res: Response;
    try {
      res = await this.fetchFn(url.toString(), {
        method,
        headers,
        body,
        signal,
      });
    } catch {
      const durationMs = Math.round(performance.now() - start);
      this.logger.error({
        op,
        method,
        path: loggedPath,
        status: undefined,
        durationMs,
      });
      throw new UpstreamUnavailableError('traccar');
    }

    const durationMs = Math.round(performance.now() - start);
    const status = res.status;

    if (status === 401 || status === 403) {
      this.logger.error({ op, status }, 'Traccar credentials rejected');
      this.logger.warn({
        op,
        method,
        path: loggedPath,
        status,
        durationMs,
      });
      throw new UpstreamUnavailableError('traccar');
    }

    if (status >= 400 && status < 500) {
      const traccarMessage = await res.text();
      this.logger.warn({
        op,
        method,
        path: loggedPath,
        status,
        durationMs,
      });
      throw new TraccarRequestError(status, traccarMessage);
    }

    if (status >= 200 && status < 300) {
      this.logger.log({
        op,
        method,
        path: loggedPath,
        status,
        durationMs,
      });
      if (status === 204) {
        return undefined as unknown as T;
      }
      return (await res.json()) as T;
    }

    this.logger.error({
      op,
      method,
      path: loggedPath,
      status,
      durationMs,
    });
    throw new UpstreamUnavailableError('traccar');
  }
}
