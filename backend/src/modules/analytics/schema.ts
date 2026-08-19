import { z } from 'zod';

export const analyticsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
