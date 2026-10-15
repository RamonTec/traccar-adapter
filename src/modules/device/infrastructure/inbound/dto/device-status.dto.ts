import { z } from 'zod';

export const deviceIdParamSchema = z
  .string()
  .regex(/^[1-9]\d*$/, { message: 'deviceId must be a positive integer' })
  .transform(Number)
  .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));

export const emptyBodySchema = z.union([z.undefined(), z.object({}).strict()]);
