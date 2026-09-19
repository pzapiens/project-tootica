import { prisma } from '../../common/db/prisma';
import type {
  CreateToothRemarkInput,
  DocumentCategory,
  UpdateToothRemarkInput,
} from './schema';

// Every query is scoped by clinicId (and patientId where relevant) so one tenant
// can never read or mutate another tenant's records.
export const recordsRepository = {
  /** The patient's own row; null when not in the clinic. */
  findPatient: (clinicId: string, patientId: string) =>
    prisma.patient.findFirst({
      where: { id: patientId, clinicId },
      select: { id: true },
    }),

  listTeeth: (clinicId: string, patientId: string) =>
    prisma.toothRemark.findMany({ where: { clinicId, patientId }, orderBy: { createdAt: 'asc' } }),

  listMedHistory: (clinicId: string, patientId: string) =>
    prisma.medicalHistoryEntry.findMany({
      where: { clinicId, patientId },
      orderBy: { createdAt: 'asc' },
    }),

  listObservations: (clinicId: string, patientId: string) =>
    prisma.observationEntry.findMany({
      where: { clinicId, patientId },
      orderBy: { createdAt: 'asc' },
    }),

  listDocuments: (clinicId: string, patientId: string) =>
    prisma.patientDocument.findMany({
      where: { clinicId, patientId },
      orderBy: { createdAt: 'asc' },
    }),

  // --- observations ---------------------------------------------------------
  createObservation: (
    clinicId: string,
    patientId: string,
    text: string,
    createdBy: { id: string; name: string },
  ) =>
    prisma.observationEntry.create({
      data: { clinicId, patientId, text, createdById: createdBy.id, createdByName: createdBy.name },
    }),

  updateObservation: (clinicId: string, id: string, text: string) =>
    prisma.observationEntry.updateMany({ where: { id, clinicId }, data: { text } }),

  findObservation: (clinicId: string, id: string) =>
    prisma.observationEntry.findFirst({ where: { id, clinicId } }),

  deleteObservation: (clinicId: string, id: string) =>
    prisma.observationEntry.deleteMany({ where: { id, clinicId } }),

  // --- tooth-wise remarks ---------------------------------------------------
  createTooth: (
    clinicId: string,
    patientId: string,
    data: CreateToothRemarkInput,
    createdBy: { id: string; name: string },
  ) =>
    prisma.toothRemark.create({
      data: { clinicId, patientId, ...data, createdById: createdBy.id, createdByName: createdBy.name },
    }),

  updateTooth: (clinicId: string, id: string, data: UpdateToothRemarkInput) =>
    prisma.toothRemark.updateMany({ where: { id, clinicId }, data }),

  findTooth: (clinicId: string, id: string) =>
    prisma.toothRemark.findFirst({ where: { id, clinicId } }),

  deleteTooth: (clinicId: string, id: string) =>
    prisma.toothRemark.deleteMany({ where: { id, clinicId } }),

  // --- medical history ------------------------------------------------------
  createMed: (
    clinicId: string,
    patientId: string,
    text: string,
    createdBy: { id: string; name: string },
  ) =>
    prisma.medicalHistoryEntry.create({
      data: { clinicId, patientId, text, createdById: createdBy.id, createdByName: createdBy.name },
    }),

  updateMed: (clinicId: string, id: string, text: string) =>
    prisma.medicalHistoryEntry.updateMany({ where: { id, clinicId }, data: { text } }),

  findMed: (clinicId: string, id: string) =>
    prisma.medicalHistoryEntry.findFirst({ where: { id, clinicId } }),

  deleteMed: (clinicId: string, id: string) =>
    prisma.medicalHistoryEntry.deleteMany({ where: { id, clinicId } }),

  // --- documents ------------------------------------------------------------
  createDocument: (
    clinicId: string,
    patientId: string,
    data: {
      category: DocumentCategory;
      name: string;
      size: number;
      mimeType: string;
      storageKey: string;
    },
    createdBy: { id: string; name: string },
  ) =>
    prisma.patientDocument.create({
      data: { clinicId, patientId, ...data, createdById: createdBy.id, createdByName: createdBy.name },
    }),

  findDocument: (clinicId: string, id: string) =>
    prisma.patientDocument.findFirst({ where: { id, clinicId } }),

  deleteDocument: (clinicId: string, id: string) =>
    prisma.patientDocument.deleteMany({ where: { id, clinicId } }),

  // --- audit log ------------------------------------------------------------
  /** The acting user's name parts (for the denormalized log author). */
  findUser: (id: string) =>
    prisma.user.findUnique({
      where: { id },
      select: { firstName: true, lastName: true, email: true },
    }),

  createLog: (data: {
    clinicId: string;
    patientId: string;
    table: string;
    action: string;
    entryId: string;
    previous: string | null;
    updated: string | null;
    userId: string;
    userName: string;
  }) => prisma.recordAuditLog.create({ data }),

  listLogs: (clinicId: string, patientId: string) =>
    prisma.recordAuditLog.findMany({
      where: { clinicId, patientId },
      orderBy: { createdAt: 'desc' },
    }),
};
