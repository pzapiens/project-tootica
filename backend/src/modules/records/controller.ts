import type { Request, Response } from 'express';

import * as storage from '../../common/storage/fileStorage';
import { requireClinicId } from '../../common/middleware/tenant.middleware';
import { HttpError } from '../../common/utils/httpError';
import {
  createMedHistorySchema,
  createToothRemarkSchema,
  documentCategorySchema,
  observationSchema,
  updateMedHistorySchema,
  updateToothRemarkSchema,
} from './schema';
import { recordsService } from './service';

export const recordsController = {
  bundle: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    res.json(await recordsService.bundle(clinicId, req.params.patientId));
  },

  setObservation: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    const { text } = observationSchema.parse(req.body);
    res.json(await recordsService.setObservation(clinicId, req.params.patientId, text));
  },

  // --- tooth-wise remarks ---------------------------------------------------
  addTooth: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    const data = createToothRemarkSchema.parse(req.body);
    res.status(201).json(await recordsService.addTooth(clinicId, req.params.patientId, data));
  },

  updateTooth: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    const data = updateToothRemarkSchema.parse(req.body);
    res.json(await recordsService.updateTooth(clinicId, req.params.entryId, data));
  },

  removeTooth: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    await recordsService.removeTooth(clinicId, req.params.entryId);
    res.status(204).send();
  },

  // --- medical history ------------------------------------------------------
  addMed: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    const { text } = createMedHistorySchema.parse(req.body);
    res.status(201).json(await recordsService.addMed(clinicId, req.params.patientId, text));
  },

  updateMed: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    const { text } = updateMedHistorySchema.parse(req.body);
    res.json(await recordsService.updateMed(clinicId, req.params.entryId, text));
  },

  removeMed: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    await recordsService.removeMed(clinicId, req.params.entryId);
    res.status(204).send();
  },

  // --- documents ------------------------------------------------------------
  addDocument: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    const category = documentCategorySchema.parse(req.body.category);
    res
      .status(201)
      .json(await recordsService.addDocument(clinicId, req.params.patientId, category, req.file));
  },

  downloadDocument: async (req: Request, res: Response) => {
    const clinicId = requireClinicId(req);
    const doc = await recordsService.documentForDownload(clinicId, req.params.documentId);
    if (!storage.exists(doc.storageKey)) {
      throw new HttpError(404, 'File is no longer available');
    }
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
    await recordsService.removeDocument(clinicId, req.params.documentId);
    res.status(204).send();
  },
};
