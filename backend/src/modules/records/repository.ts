import { prisma } from '../../common/db/prisma';
import type {
  CreateToothRemarkInput,
  DocumentCategory,
  UpdateToothRemarkInput,
} from './schema';

// Every query is scoped by clinicId (and patientId where relevant) so one tenant
// can never read or mutate another tenant's records.
export const recordsRepository = {
  /** The patient's own row (carries the observation note); null when not in the clinic. */
  findPatient: (clinicId: string, patientId: string) =>
    prisma.patient.findFirst({
      where: { id: patientId, clinicId },
      select: { id: true, observation: true, observationUpdatedAt: true },
    }),

  listTeeth: (clinicId: string, patientId: string) =>
    prisma.toothRemark.findMany({ where: { clinicId, patientId }, orderBy: { createdAt: 'asc' } }),

  listMedHistory: (clinicId: string, patientId: string) =>
    prisma.medicalHistoryEntry.findMany({
      where: { clinicId, patientId },
      orderBy: { createdAt: 'asc' },
    }),

  listDocuments: (clinicId: string, patientId: string) =>
    prisma.patientDocument.findMany({
      where: { clinicId, patientId },
      orderBy: { createdAt: 'asc' },
    }),

  setObservation: (
    clinicId: string,
    patientId: string,
    observation: string | null,
    observationUpdatedAt: Date | null,
  ) =>
    prisma.patient.updateMany({
      where: { id: patientId, clinicId },
      data: { observation, observationUpdatedAt },
    }),

  // --- tooth-wise remarks ---------------------------------------------------
  createTooth: (clinicId: string, patientId: string, data: CreateToothRemarkInput) =>
    prisma.toothRemark.create({ data: { clinicId, patientId, ...data } }),

  updateTooth: (clinicId: string, id: string, data: UpdateToothRemarkInput) =>
    prisma.toothRemark.updateMany({ where: { id, clinicId }, data }),

  findTooth: (clinicId: string, id: string) =>
    prisma.toothRemark.findFirst({ where: { id, clinicId } }),

  deleteTooth: (clinicId: string, id: string) =>
    prisma.toothRemark.deleteMany({ where: { id, clinicId } }),

  // --- medical history ------------------------------------------------------
  createMed: (clinicId: string, patientId: string, text: string) =>
    prisma.medicalHistoryEntry.create({ data: { clinicId, patientId, text } }),

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
  ) => prisma.patientDocument.create({ data: { clinicId, patientId, ...data } }),

  findDocument: (clinicId: string, id: string) =>
    prisma.patientDocument.findFirst({ where: { id, clinicId } }),

  deleteDocument: (clinicId: string, id: string) =>
    prisma.patientDocument.deleteMany({ where: { id, clinicId } }),
};
