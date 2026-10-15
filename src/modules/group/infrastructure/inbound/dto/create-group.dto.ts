import { z } from 'zod';

// The name is kept as received (no trim): matching in Traccar is exact.
export const createGroupSchema = z
  .object({
    name: z
      .string()
      .max(128)
      .refine((s) => s.trim().length > 0, {
        message: 'name must not be blank',
      }),
  })
  .strict();

export type CreateGroupDto = z.infer<typeof createGroupSchema>;
