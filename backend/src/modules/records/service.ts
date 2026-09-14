import * as storage from '../../common/storage/fileStorage';
import { HttpError } from '../../common/utils/httpError';
import { recordsRepository as repo } from './repository';
import type { CreateToothRemarkInput, DocumentCategory, UpdateToothRemarkInput } from './schema';

type ToothRow = Awaited<ReturnType<typeof repo.createTooth>>;
type MedRow = Awaited<ReturnType<typeof repo.createMed>>;
type DocRow = Awaited<ReturnType<typeof repo.createDocument>>;

// Shape rows for the client — never leak clinicId/patientId or the storageKey.
const toTooth = (r: ToothRow) => ({
  id: r.id,
  toothNo: r.toothNo,
  remarks: r.remarks,
  createdAt: r.createdAt,
});
const toMed = (r: MedRow) => ({ id: r.id, text: r.text, createdAt: r.createdAt });
const toDoc = (r: DocRow) => ({
  id: r.id,
  category: r.category,
  name: r.name,
  size: r.size,
  mimeType: r.mimeType,
  createdAt: r.createdAt,
});

async function ensurePatient(clinicId: string, patientId: string) {
  const patient = await repo.findPatient(clinicId, patientId);
  if (!patient) {
    throw new HttpError(404, 'Patient not found');
  }
  return patient;
}

export const recordsService = {
  /** The full records bundle for a patient (observation + the three lists). */
  bundle: async (clinicId: string, patientId: string) => {
    const patient = await ensurePatient(clinicId, patientId);
    const [teeth, medHistory, documents] = await Promise.all([
      repo.listTeeth(clinicId, patientId),
      repo.listMedHistory(clinicId, patientId),
      repo.listDocuments(clinicId, patientId),
    ]);
    return {
      observation: patient.observation ?? '',
      observationUpdatedAt: patient.observationUpdatedAt,
      teeth: teeth.map(toTooth),
      medHistory: medHistory.map(toMed),
      documents: documents.map(toDoc),
    };
  },

  setObservation: async (clinicId: string, patientId: string, text: string) => {
    await ensurePatient(clinicId, patientId);
    const trimmed = text.trim();
    const observationUpdatedAt = trimmed ? new Date() : null;
    await repo.setObservation(clinicId, patientId, trimmed || null, observationUpdatedAt);
    return { observation: trimmed, observationUpdatedAt };
  },

  // --- tooth-wise remarks ---------------------------------------------------
  addTooth: async (clinicId: string, patientId: string, data: CreateToothRemarkInput) => {
    await ensurePatient(clinicId, patientId);
    return toTooth(await repo.createTooth(clinicId, patientId, data));
  },

  updateTooth: async (clinicId: string, id: string, data: UpdateToothRemarkInput) => {
    await repo.updateTooth(clinicId, id, data);
    const tooth = await repo.findTooth(clinicId, id);
    if (!tooth) {
      throw new HttpError(404, 'Tooth remark not found');
    }
    return toTooth(tooth);
  },

  removeTooth: async (clinicId: string, id: string) => {
    const { count } = await repo.deleteTooth(clinicId, id);
    if (count === 0) {
      throw new HttpError(404, 'Tooth remark not found');
    }
  },

  // --- medical history ------------------------------------------------------
  addMed: async (clinicId: string, patientId: string, text: string) => {
    await ensurePatient(clinicId, patientId);
    return toMed(await repo.createMed(clinicId, patientId, text));
  },

  updateMed: async (clinicId: string, id: string, text: string) => {
    await repo.updateMed(clinicId, id, text);
    const entry = await repo.findMed(clinicId, id);
    if (!entry) {
      throw new HttpError(404, 'Medical history entry not found');
    }
    return toMed(entry);
  },

  removeMed: async (clinicId: string, id: string) => {
    const { count } = await repo.deleteMed(clinicId, id);
    if (count === 0) {
      throw new HttpError(404, 'Medical history entry not found');
    }
  },

  // --- documents ------------------------------------------------------------
  addDocument: async (
    clinicId: string,
    patientId: string,
    category: DocumentCategory,
    file: Express.Multer.File | undefined,
  ) => {
    await ensurePatient(clinicId, patientId);
    if (!file) {
      throw new HttpError(400, 'No file uploaded');
    }
    const storageKey = await storage.save(clinicId, file.buffer, file.originalname);
    const row = await repo.createDocument(clinicId, patientId, {
      category,
      name: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
      storageKey,
    });
    return toDoc(row);
  },

  /** The document row (incl. storageKey/mimeType) for streaming a download. */
  documentForDownload: async (clinicId: string, id: string) => {
    const doc = await repo.findDocument(clinicId, id);
    if (!doc) {
      throw new HttpError(404, 'Document not found');
    }
    return doc;
  },

  removeDocument: async (clinicId: string, id: string) => {
    const doc = await repo.findDocument(clinicId, id);
    if (!doc) {
      throw new HttpError(404, 'Document not found');
    }
    await repo.deleteDocument(clinicId, id);
    await storage.remove(doc.storageKey);
  },
};
