import { z } from 'zod';
export const sendTemplateSchema = z
  .object({
    requestKey: z.string().uuid(),
    parameters: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(500)
          .regex(/^[^\r\n\t]+$/, 'Use single-line parameter values'),
      )
      .max(10)
      .default([]),
    consentConfirmed: z.literal(true),
  })
  .strict();
export type SendTemplateInput = z.infer<typeof sendTemplateSchema>;
export const provisionSchema = z.object({
  clinicId: z.string().uuid(),
  wabaId: z.string().regex(/^\d+$/),
  phoneNumberId: z.string().regex(/^\d+$/),
  accessToken: z.string().trim().min(20),
  templateName: z.string().regex(/^[a-z\d_]+$/),
  templateLanguage: z.string().regex(/^[a-z]{2,3}(?:_[A-Z]{2})?$/),
});
export function normalizeRecipient(value: string): string {
  const digits = value.replace(/[+\s().-]/g, '');
  if (!/^[1-9]\d{7,14}$/.test(digits))
    throw new Error('Patient phone must include a country code and contain 8-15 digits');
  return digits;
}
