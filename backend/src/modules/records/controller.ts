import type { Request, Response } from 'express';

import * as storage from '../../common/storage/fileStorage';
import { requireClinicId } from '../../common/middleware/tenant.middleware';
import { HttpError } from '../../common/utils/httpError';
import {
  createMedHistorySchema,
  createObservationSchema,
  createToothRemarkSchema,
  documentCategorySchema,
  updateMedHistorySchema,
  updateObservationSchema,
  updateToothRemarkSchema,
} from './schema';
import { recordsService } from './service';

export const recordsController = {
  bundle: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    res.json(await recordsService.bundle(clinicId, req.params.patientId));
  },

  // --- observations ---------------------------------------------------------
  addObservation: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    const { text } = createObservationSchema.parse(req.body);
    res
      .status(201)
      .json(await recordsService.addObservation(clinicId, req.params.patientId, text, req.user!.id));
  },

  updateObservation: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    const { text } = updateObservationSchema.parse(req.body);
    res.json(
      await recordsService.updateObservation(clinicId, req.params.entryId, text, req.user!.id, req.user!.role),
    );
  },

  removeObservation: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    await recordsService.removeObservation(clinicId, req.params.entryId, req.user!.id, req.user!.role);
    res.status(204).send();
  },

  // --- tooth-wise remarks ---------------------------------------------------
  addTooth: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    const data = createToothRemarkSchema.parse(req.body);
    res
      .status(201)
      .json(await recordsService.addTooth(clinicId, req.params.patientId, data, req.user!.id));
  },

  updateTooth: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    const data = updateToothRemarkSchema.parse(req.body);
    res.json(
      await recordsService.updateTooth(clinicId, req.params.entryId, data, req.user!.id, req.user!.role),
    );
  },

  removeTooth: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    await recordsService.removeTooth(clinicId, req.params.entryId, req.user!.id, req.user!.role);
    res.status(204).send();
  },

  // --- medical history ------------------------------------------------------
  addMed: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    const { text } = createMedHistorySchema.parse(req.body);
    res
      .status(201)
      .json(await recordsService.addMed(clinicId, req.params.patientId, text, req.user!.id));
  },

  updateMed: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    const { text } = updateMedHistorySchema.parse(req.body);
    res.json(
      await recordsService.updateMed(clinicId, req.params.entryId, text, req.user!.id, req.user!.role),
    );
  },

  removeMed: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    await recordsService.removeMed(clinicId, req.params.entryId, req.user!.id, req.user!.role);
    res.status(204).send();
  },

  // --- documents ------------------------------------------------------------
  addDocument: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    const category = documentCategorySchema.parse(req.body.category);
    res
      .status(201)
      .json(
        await recordsService.addDocument(
          clinicId,
          req.params.patientId,
          category,
          req.file,
          req.user!.id,
        ),
      );
  },

  downloadDocument: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    const doc = await recordsService.documentForDownload(clinicId, req.params.documentId);
    if (!storage.exists(doc.storageKey)) {
      throw new HttpError(404, 'File is no longer available');
    }
    await recordsService.noteDocumentDownload(clinicId, doc, req.user!.id);
    res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
    // `inline` so PDFs/images open in a browser tab; the filename is used if saved.
    res.setHeader('Content-Disposition', `inline; filename="${doc.name.replace(/["\r\n]/g, '')}"`);
    const stream = storage.createStream(doc.storageKey);
    stream.on('error', () => {
      if (!res.headersSent) res.status(500).end();
    });
    stream.pipe(res);
  },

  removeDocument: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    await recordsService.removeDocument(clinicId, req.params.documentId, req.user!.id);
    res.status(204).send();
  },

  // --- audit log ------------------------------------------------------------
  logs: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    res.json(await recordsService.listLogs(clinicId, req.params.patientId));
  },
};
