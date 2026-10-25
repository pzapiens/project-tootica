import { z } from 'zod';

/** The appointment a record is entered under (Patient History Summary groups by
 *  it). Optional — the editable Records view always sends it, but it stays
 *  nullable for legacy rows / API callers that omit it. Not editable: an edit
 *  keeps the entry under its original appointment. Exported for the document
 *  upload (a multipart field, parsed in the controller). */
export const optionalAppointmentIdSchema = z.string().uuid().optional();
const appointmentId = optionalAppointmentIdSchema;

/** A Doctor/Clinic observation entry (mirrors a medical-history entry). */
export const createObservationSchema = z.object({
  text: z.string().min(1).max(5000),
  appointmentId,
});
export const updateObservationSchema = createObservationSchema.pick({ text: true });

/** A tooth-wise remark: FDI tooth number + free-text. */
export const createToothRemarkSchema = z.object({
  toothNo: z.string().min(1).max(8),
  remarks: z.string().min(1).max(5000),
  appointmentId,
});
export const updateToothRemarkSchema = createToothRemarkSchema
  .pick({ toothNo: true, remarks: true })
  .partial();

/** A medical-history entry. */
export const createMedHistorySchema = z.object({
  text: z.string().min(1).max(5000),
  appointmentId,
});
export const updateMedHistorySchema = createMedHistorySchema.pick({ text: true });

/** Which upload section a document belongs to. */
export const documentCategorySchema = z.enum(['consent', 'xray', 'other']);

export type ObservationInput = z.infer<typeof createObservationSchema>;
export type CreateToothRemarkInput = z.infer<typeof createToothRemarkSchema>;
export type UpdateToothRemarkInput = z.infer<typeof updateToothRemarkSchema>;
export type MedHistoryInput = z.infer<typeof createMedHistorySchema>;
export type DocumentCategory = z.infer<typeof documentCategorySchema>;
