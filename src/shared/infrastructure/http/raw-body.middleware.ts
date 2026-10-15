import type { NextFunction, Request, Response } from 'express';

export interface RawWebhookBody {
  readonly body: Buffer;
  readonly oversized: boolean;
}

export const WEBHOOK_PATH_PREFIX = '/webhooks/traccar';

interface RawBodyRequest extends Request {
  rawWebhookBody?: RawWebhookBody;
  /** body-parser skips requests already marked as read. */
  _body?: boolean;
}

/**
 * Keeps the webhook body as raw bytes (even when it is not valid JSON) and caps
 * the memory used: past maxBodyBytes the stream is drained without storing it.
 */
export function rawBodyMiddleware(
  maxBodyBytes: number,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: RawBodyRequest, _res, next) => {
    const chunks: Buffer[] = [];
    let stored = 0;
    let oversized = false;

    req.on('data', (chunk: Buffer) => {
      if (oversized) return;
      const room = maxBodyBytes - stored;
      if (chunk.length > room) {
        oversized = true;
        chunks.push(chunk.subarray(0, room));
        stored += room;
        return;
      }
      chunks.push(chunk);
      stored += chunk.length;
    });
    req.on('end', () => {
      req.rawWebhookBody = { body: Buffer.concat(chunks), oversized };
      req._body = true;
      next();
    });
    req.on('error', (err) => next(err));
  };
}
