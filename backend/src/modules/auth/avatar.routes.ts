import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import { HttpError } from '../../common/utils/httpError';
import { avatarService, MAX_AVATAR_BYTES } from './avatar.service';
import { authService } from './service';

export const avatarRoutes = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_BYTES, files: 1, fields: 0 },
});
const parseImage: RequestHandler = (req, res, next) => {
  upload.single('file')(req, res, (error?: unknown) => {
    if (error instanceof multer.MulterError) {
      next(
        new HttpError(
          error.code === 'LIMIT_FILE_SIZE' ? 413 : 400,
          error.code === 'LIMIT_FILE_SIZE'
            ? 'Profile photos must be 2 MB or smaller.'
            : 'Please upload one image using the file field.',
        ),
      );
    } else if (error) next(new HttpError(400, 'The image upload could not be read.'));
    else next();
  });
};

// Authentication is applied before this router, including multipart parsing.
// Every operation uses the signed-in user, never a user id supplied by the client.
avatarRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    const image = await avatarService.read(req.user!.id);
    res.set('Cache-Control', 'private, no-cache');
    res.type('image/webp').send(image);
  }),
);
avatarRoutes.post(
  '/',
  parseImage,
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Please choose an image.');
    await avatarService.upload(req.user!.id, req.file.buffer);
    res.json(await authService.me(req.user!.id));
  }),
);
avatarRoutes.delete(
  '/',
  asyncHandler(async (req, res) => {
    await avatarService.remove(req.user!.id);
    res.json(await authService.me(req.user!.id));
  }),
);
