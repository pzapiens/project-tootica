import * as storage from '../../common/storage/fileStorage';
import { HttpError } from '../../common/utils/httpError';
import { recordsRepository as repo } from './repository';
import type { CreateToothRemarkInput, DocumentCategory, UpdateToothRemarkInput } from './schema';
import type { Role } from '../../generated/prisma/enums';

type ToothRow = Awaited<ReturnType<typeof repo.createTooth>>;
type MedRow = Awaited<ReturnType<typeof repo.createMed>>;
type ObservationRow = Awaited<ReturnType<typeof repo.createObservation>>;
type DocRow = Awaited<ReturnType<typeof repo.createDocument>>;

// Shape rows for the client — never leak clinicId/patientId or the storageKey.
const toTooth = (r: ToothRow) => ({
  id: r.id,
  toothNo: r.toothNo,
  remarks: r.remarks,
  createdById: r.createdById,
  createdAt: r.createdAt,
});
const toMed = (r: MedRow) => ({
  id: r.id,
  text: r.text,
  createdById: r.createdById,
  createdAt: r.createdAt,
});
const toObservation = (r: ObservationRow) => ({
  id: r.id,
  text: r.text,
  createdById: r.createdById,
  createdAt: r.createdAt,
});
const toDoc = (r: DocRow) => ({
  id: r.id,
  category: r.category,
  name: r.name,
  size: r.size,
  mimeType: r.mimeType,
  // Uploader — shown on the document card.
  createdByName: r.createdByName,
  createdAt: r.createdAt,
});

async function ensurePatient(clinicId: string, patientId: string) {
  const patient = await repo.findPatient(clinicId, patientId);
  if (!patient) {
    throw new HttpError(404, 'Patient not found');
  }
  return patient;
}

/** Resolve the acting user's id + display name (denormalized onto rows/logs). */
async function actor(userId: string): Promise<{ id: string; name: string }> {
  const user = await repo.findUser(userId);
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
  return { id: userId, name: name || user?.email || 'Unknown user' };
}

/** Guard: only the row's creator may edit/delete it — except admins and super
 *  admins, who may edit/delete any entry. Legacy rows (no recorded creator) stay
 *  editable by anyone. */
function ensureOwner(createdById: string | null, userId: string, role: Role): void {
  if (role === 'SUPER_ADMIN' || role === 'CLIENT_ADMIN') return;
  if (createdById && createdById !== userId) {
    throw new HttpError(403, 'Only the user who created this entry can edit or delete it');
  }
}

// --- audit log ---------------------------------------------------------------

// Each records table that carries an audit log. The three document-upload
// sections log under their own category so each section shows only its history.
type LogTable = 'observation' | 'tooth' | 'medical-history' | DocumentCategory;

// Human-readable one-line snapshots stored in the log (shown as previous/updated).
const snapText = (r: { text: string }) => r.text;
const snapTooth = (r: { toothNo: string; remarks: string }) => `Tooth ${r.toothNo}: ${r.remarks}`;
const snapDoc = (r: { name: string }) => r.name;

const toLog = (r: Awaited<ReturnType<typeof repo.listLogs>>[number]) => ({
  id: r.id,
  table: r.table,
  action: r.action,
  entryId: r.entryId,
  previous: r.previous,
  updated: r.updated,
  userName: r.userName,
  createdAt: r.createdAt,
});

/** Record an edit/delete against a records table, denormalizing the actor's name
 *  so the log outlives the account. Best-effort: a logging failure must not fail
 *  the underlying mutation the user already performed. */
async function logChange(entry: {
  clinicId: string;
  patientId: string;
  table: LogTable;
  // Text tables use CREATE/UPDATE/DELETE; document sections use UPLOAD/DOWNLOAD/DELETE.
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'UPLOAD' | 'DOWNLOAD';
  entryId: string;
  previous: string | null;
  updated: string | null;
  userId: string;
}): Promise<void> {
  try {
    const user = await repo.findUser(entry.userId);
    const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
    const userName = name || user?.email || 'Unknown user';
    await repo.createLog({ ...entry, userName });
  } catch (err) {
    console.error('Records audit-log write failed:', err);
  }
}

export const recordsService = {
  /** The full records bundle for a patient (the four lists). */
  bundle: async (clinicId: string, patientId: string) => {
    await ensurePatient(clinicId, patientId);
    const [teeth, medHistory, observations, documents] = await Promise.all([
      repo.listTeeth(clinicId, patientId),
      repo.listMedHistory(clinicId, patientId),
      repo.listObservations(clinicId, patientId),
      repo.listDocuments(clinicId, patientId),
    ]);
    return {
      teeth: teeth.map(toTooth),
      medHistory: medHistory.map(toMed),
      observations: observations.map(toObservation),
      documents: documents.map(toDoc),
    };
  },

  // --- observations ---------------------------------------------------------
  addObservation: async (clinicId: string, patientId: string, text: string, userId: string) => {
    await ensurePatient(clinicId, patientId);
    const row = await repo.createObservation(clinicId, patientId, text, await actor(userId));
    await logChange({
      clinicId,
      patientId,
      table: 'observation',
      action: 'CREATE',
      entryId: row.id,
      previous: null,
      updated: snapText(row),
      userId,
    });
    return toObservation(row);
  },

  updateObservation: async (clinicId: string, id: string, text: string, userId: string, role: Role) => {
    const before = await repo.findObservation(clinicId, id);
    if (!before) {
      throw new HttpError(404, 'Observation entry not found');
    }
    ensureOwner(before.createdById, userId, role);
    await repo.updateObservation(clinicId, id, text);
    const after = await repo.findObservation(clinicId, id);
    if (!after) {
      throw new HttpError(404, 'Observation entry not found');
    }
    await logChange({
      clinicId,
      patientId: before.patientId,
      table: 'observation',
      action: 'UPDATE',
      entryId: id,
      previous: snapText(before),
      updated: snapText(after),
      userId,
    });
    return toObservation(after);
  },

  removeObservation: async (clinicId: string, id: string, userId: string, role: Role) => {
    const before = await repo.findObservation(clinicId, id);
    if (!before) {
      throw new HttpError(404, 'Observation entry not found');
    }
    ensureOwner(before.createdById, userId, role);
    await repo.deleteObservation(clinicId, id);
    await logChange({
      clinicId,
      patientId: before.patientId,
      table: 'observation',
      action: 'DELETE',
      entryId: id,
      previous: snapText(before),
      updated: null,
      userId,
    });
  },

  // --- tooth-wise remarks ---------------------------------------------------
  addTooth: async (
    clinicId: string,
    patientId: string,
    data: CreateToothRemarkInput,
    userId: string,
  ) => {
    await ensurePatient(clinicId, patientId);
    const row = await repo.createTooth(clinicId, patientId, data, await actor(userId));
    await logChange({
      clinicId,
      patientId,
      table: 'tooth',
      action: 'CREATE',
      entryId: row.id,
      previous: null,
      updated: snapTooth(row),
      userId,
    });
    return toTooth(row);
  },

  updateTooth: async (clinicId: string, id: string, data: UpdateToothRemarkInput, userId: string, role: Role) => {
    const before = await repo.findTooth(clinicId, id);
    if (!before) {
      throw new HttpError(404, 'Tooth remark not found');
    }
    ensureOwner(before.createdById, userId, role);
    await repo.updateTooth(clinicId, id, data);
    const after = await repo.findTooth(clinicId, id);
    if (!after) {
      throw new HttpError(404, 'Tooth remark not found');
    }
    await logChange({
      clinicId,
      patientId: before.patientId,
      table: 'tooth',
      action: 'UPDATE',
      entryId: id,
      previous: snapTooth(before),
      updated: snapTooth(after),
      userId,
    });
    return toTooth(after);
  },

  removeTooth: async (clinicId: string, id: string, userId: string, role: Role) => {
    const before = await repo.findTooth(clinicId, id);
    if (!before) {
      throw new HttpError(404, 'Tooth remark not found');
    }
    ensureOwner(before.createdById, userId, role);
    await repo.deleteTooth(clinicId, id);
    await logChange({
      clinicId,
      patientId: before.patientId,
      table: 'tooth',
      action: 'DELETE',
      entryId: id,
      previous: snapTooth(before),
      updated: null,
      userId,
    });
  },

  // --- medical history ------------------------------------------------------
  addMed: async (clinicId: string, patientId: string, text: string, userId: string) => {
    await ensurePatient(clinicId, patientId);
    const row = await repo.createMed(clinicId, patientId, text, await actor(userId));
    await logChange({
      clinicId,
      patientId,
      table: 'medical-history',
      action: 'CREATE',
      entryId: row.id,
      previous: null,
      updated: snapText(row),
      userId,
    });
    return toMed(row);
  },

  updateMed: async (clinicId: string, id: string, text: string, userId: string, role: Role) => {
    const before = await repo.findMed(clinicId, id);
    if (!before) {
      throw new HttpError(404, 'Medical history entry not found');
    }
    ensureOwner(before.createdById, userId, role);
    await repo.updateMed(clinicId, id, text);
    const after = await repo.findMed(clinicId, id);
    if (!after) {
      throw new HttpError(404, 'Medical history entry not found');
    }
    await logChange({
      clinicId,
      patientId: before.patientId,
      table: 'medical-history',
      action: 'UPDATE',
      entryId: id,
      previous: snapText(before),
      updated: snapText(after),
      userId,
    });
    return toMed(after);
  },

  removeMed: async (clinicId: string, id: string, userId: string, role: Role) => {
    const before = await repo.findMed(clinicId, id);
    if (!before) {
      throw new HttpError(404, 'Medical history entry not found');
    }
    ensureOwner(before.createdById, userId, role);
    await repo.deleteMed(clinicId, id);
    await logChange({
      clinicId,
      patientId: before.patientId,
      table: 'medical-history',
      action: 'DELETE',
      entryId: id,
      previous: snapText(before),
      updated: null,
      userId,
    });
  },

  // --- documents ------------------------------------------------------------
  addDocument: async (
    clinicId: string,
    patientId: string,
    category: DocumentCategory,
    file: Express.Multer.File | undefined,
    userId: string,
  ) => {
    await ensurePatient(clinicId, patientId);
    if (!file) {
      throw new HttpError(400, 'No file uploaded');
    }
    const storageKey = await storage.save(clinicId, file.buffer, file.originalname);
    const row = await repo.createDocument(
      clinicId,
      patientId,
      {
        category,
        name: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
        storageKey,
      },
      await actor(userId),
    );
    await logChange({
      clinicId,
      patientId,
      table: category,
      action: 'UPLOAD',
      entryId: row.id,
      previous: null,
      updated: snapDoc(row),
      userId,
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

  /** Record that a user downloaded a document (called once the file is confirmed
   *  present, so a failed/404 download isn't logged as a successful one). */
  noteDocumentDownload: async (
    clinicId: string,
    doc: { id: string; patientId: string; category: string; name: string },
    userId: string,
  ) => {
    await logChange({
      clinicId,
      patientId: doc.patientId,
      table: doc.category as DocumentCategory,
      action: 'DOWNLOAD',
      entryId: doc.id,
      previous: null,
      updated: snapDoc(doc),
      userId,
    });
  },

  removeDocument: async (clinicId: string, id: string, userId: string) => {
    const doc = await repo.findDocument(clinicId, id);
    if (!doc) {
      throw new HttpError(404, 'Document not found');
    }
    await repo.deleteDocument(clinicId, id);
    await storage.remove(doc.storageKey);
    await logChange({
      clinicId,
      patientId: doc.patientId,
      table: doc.category as DocumentCategory,
      action: 'DELETE',
      entryId: id,
      previous: snapDoc(doc),
      updated: null,
      userId,
    });
  },

  // --- audit log ------------------------------------------------------------
  /** The edit/delete history for a patient's records tables (newest first). */
  listLogs: async (clinicId: string, patientId: string) => {
    await ensurePatient(clinicId, patientId);
    const rows = await repo.listLogs(clinicId, patientId);
    return rows.map(toLog);
  },
};
