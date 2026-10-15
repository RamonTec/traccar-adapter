import { z } from 'zod';

// Shapes observed in real Traccar 6.15.3 forwards (test/fixtures/traccar/README.md).
// Plain z.object: unknown fields are ignored.

const traccarDate = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'invalid date',
  });

const attributes = z.record(z.string(), z.unknown()).default({});

export const traccarDeviceSchema = z.object({
  id: z.number().int().positive(),
  groupId: z.number().int().nullable().optional(),
});

export const traccarPositionSchema = z.object({
  // 0 in position forwards: Traccar forwards before persisting (ADR-0004 amendment).
  id: z.number().int().nonnegative(),
  deviceId: z.number().int().positive(),
  fixTime: traccarDate,
  deviceTime: traccarDate,
  serverTime: traccarDate,
  valid: z.boolean(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  altitude: z.number(),
  speed: z.number(),
  course: z.number(),
  accuracy: z.number().default(0),
  attributes,
});

export const traccarPositionPayloadSchema = z.object({
  position: traccarPositionSchema,
  device: traccarDeviceSchema,
});

export const traccarEventSchema = z.object({
  id: z.number().int().positive(),
  type: z.string().min(1),
  eventTime: traccarDate,
  deviceId: z.number().int().positive(),
  positionId: z.number().int().nonnegative().nullable().optional(),
  attributes,
});

export const traccarEventPayloadSchema = z.object({
  event: traccarEventSchema,
  device: traccarDeviceSchema,
  // Forwarded alongside the event but not part of device.event.
  position: z.unknown().optional(),
});
