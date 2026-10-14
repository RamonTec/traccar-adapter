import type { IncomingMessage, ServerResponse } from 'node:http';
import pino from 'pino';
import type { Options } from 'pino-http';
import type { AppConfig } from '../config/app-config.js';
import {
  CORRELATION_ID_HEADER,
  resolveCorrelationId,
} from './correlation-id.js';

export const SERVICE_NAME = 'traccar-adapter';

export function buildPinoHttpOptions(
  config: Pick<AppConfig, 'logLevel'>,
): Options {
  return {
    level: config.logLevel,
    base: { service: SERVICE_NAME },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label: string) => ({ level: label }),
    },
    genReqId: (req: IncomingMessage, res: ServerResponse) => {
      const id = resolveCorrelationId(req.headers[CORRELATION_ID_HEADER]);
      res.setHeader(CORRELATION_ID_HEADER, id);
      return id;
    },
    customAttributeKeys: {
      reqId: 'correlationId',
    },
    quietReqLogger: true,
    customLogLevel: (
      req: IncomingMessage,
      res: ServerResponse,
      err?: Error,
    ) => {
      if (req.url?.startsWith('/health')) {
        return 'debug';
      }
      const statusCode = res.statusCode;
      if (err || (statusCode !== undefined && statusCode >= 500)) {
        return 'error';
      }
      if (statusCode !== undefined && statusCode >= 400) {
        return 'warn';
      }
      return 'info';
    },
    customSuccessObject: (
      _req: IncomingMessage,
      _res: ServerResponse,
      val: Record<string, unknown>,
    ) => ({
      ...(typeof val === 'object' && val !== null ? val : {}),
      context: 'HTTP',
    }),
    customErrorObject: (
      _req: IncomingMessage,
      _res: ServerResponse,
      _err: Error,
      val: Record<string, unknown>,
    ) => ({
      ...(typeof val === 'object' && val !== null ? val : {}),
      context: 'HTTP',
    }),
    serializers: {
      req: (req: IncomingMessage) => ({
        method: req.method,
        url: req.url,
      }),
      res: (res: ServerResponse) => ({
        statusCode: res.statusCode,
      }),
    },
    redact: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
    ],
  };
}
