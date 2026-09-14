import { z } from 'zod';

/** A single payment entry: a description + a positive amount. */
export const createPaymentSchema = z.object({
  description: z.string().min(1).max(500),
  // Money as a plain number; capped to a sane maximum and rounded to 2 dp.
  amount: z
    .number()
    .positive()
    .max(100_000_000)
    .transform((n) => Math.round(n * 100) / 100),
});

/** Toggle whether a single payment entry has been paid. */
export const setPaidSchema = z.object({
  paid: z.boolean(),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type SetPaidInput = z.infer<typeof setPaidSchema>;
