import { z } from 'zod';

export const registerDeviceSchema = z
  .object({
    uniqueId: z
      .string()
      .regex(/^\d{15}$/, { message: 'uniqueId must be exactly 15 digits' }),
    name: z.string().min(1).max(128),
    groupId: z.number().int().positive(),
  })
  .strict();

export type RegisterDeviceDto = z.infer<typeof registerDeviceSchema>;
