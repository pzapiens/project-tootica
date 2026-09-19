import { z } from 'zod';

/** A Doctor/Clinic observation entry (mirrors a medical-history entry). */
export const createObservationSchema = z.object({
  text: z.string().min(1).max(5000),
});
export const updateObservationSchema = createObservationSchema;

/** A tooth-wise remark: FDI tooth number + free-text. */
export const createToothRemarkSchema = z.object({
  toothNo: z.string().min(1).max(8),
  remarks: z.string().min(1).max(5000),
});
export const updateToothRemarkSchema = createToothRemarkSchema.partial();

/** A medical-history entry. */
export const createMedHistorySchema = z.object({
  text: z.string().min(1).max(5000),
});
export const updateMedHistorySchema = createMedHistorySchema;

/** Which upload section a document belongs to. */
export const documentCategorySchema = z.enum(['consent', 'xray', 'other']);

export type ObservationInput = z.infer<typeof createObservationSchema>;
export type CreateToothRemarkInput = z.infer<typeof createToothRemarkSchema>;
export type UpdateToothRemarkInput = z.infer<typeof updateToothRemarkSchema>;
export type MedHistoryInput = z.infer<typeof createMedHistorySchema>;
export type DocumentCategory = z.infer<typeof documentCategorySchema>;
