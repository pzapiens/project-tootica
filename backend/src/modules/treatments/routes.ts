import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../common/db/prisma';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import { requireRole } from '../../common/middleware/auth.middleware';
import { requireClinicId } from '../../common/middleware/tenant.middleware';
import { HttpError } from '../../common/utils/httpError';

export const treatmentRoutes = Router();
export const favouritesSchema = z.object({
  favourites: z.array(z.string().trim().min(1).max(200)).max(5)
    .refine(values => new Set(values).size === values.length, 'Favourites must be unique'),
});

treatmentRoutes.get('/preferences', asyncHandler(async (req, res) => {
  const clinic = await prisma.clinic.findUnique({
    where: { id: requireClinicId(req) }, select: { treatmentFavourites: true },
  });
  if (!clinic) throw new HttpError(404, 'Clinic not found');
  res.json({ favourites: clinic.treatmentFavourites, canManage: ['CLIENT_ADMIN', 'SUPER_ADMIN'].includes(req.user!.role) });
}));

treatmentRoutes.patch('/preferences', requireRole('CLIENT_ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req, res) => {
  const { favourites } = favouritesSchema.parse(req.body);
  const clinic = await prisma.clinic.update({
    where: { id: requireClinicId(req) }, data: { treatmentFavourites: favourites },
    select: { treatmentFavourites: true },
  });
  res.json({ favourites: clinic.treatmentFavourites });
}));
