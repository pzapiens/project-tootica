import sharp from 'sharp';
import { avatarStorage, type AvatarStorage } from '../../common/storage/avatarStorage';
import { HttpError } from '../../common/utils/httpError';
import { authRepository } from './repository';

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
interface AvatarUser {
  id: string;
  status: string;
  avatarKey: string | null;
}
interface AvatarRepository {
  findById(id: string): Promise<AvatarUser | null>;
  replaceAvatar(
    id: string,
    expected: string | null,
    next: string | null,
  ): Promise<{ count: number }>;
}

export async function normalizeAvatar(bytes: Buffer): Promise<Buffer> {
  if (bytes.length > MAX_AVATAR_BYTES)
    throw new HttpError(413, 'Profile photos must be 2 MB or smaller.');
  if (!bytes.length) throw new HttpError(400, 'Please choose an image.');
  try {
    const image = sharp(bytes, { limitInputPixels: 25_000_000, failOn: 'warning' });
    const metadata = await image.metadata();
    if (
      !metadata.format ||
      !['jpeg', 'png', 'webp'].includes(metadata.format) ||
      (metadata.pages ?? 1) > 1
    ) {
      throw new HttpError(415, 'Please choose a JPG, PNG, or non-animated WebP image.');
    }
    // Re-encoding strips original metadata and serves only decoded image content.
    return await image.rotate().resize(256, 256, { fit: 'cover' }).webp({ quality: 82 }).toBuffer();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      400,
      'This image could not be read. Please choose a valid JPG, PNG, or WebP image.',
    );
  }
}

export function createAvatarService(
  repository: AvatarRepository = authRepository,
  storage: AvatarStorage = avatarStorage,
) {
  async function userFor(id: string) {
    const user = await repository.findById(id);
    if (!user) throw new HttpError(401, 'Authentication required');
    if (user.status !== 'ACTIVE') throw new HttpError(403, 'Account is not active');
    return user;
  }
  async function cleanup(key: string) {
    try {
      await storage.remove(key);
    } catch {
      console.warn('Could not remove an unused profile photo.');
    }
  }
  return {
    upload: async (userId: string, bytes: Buffer): Promise<void> => {
      const user = await userFor(userId);
      const image = await normalizeAvatar(bytes);
      const nextKey = await storage.save(user.id, image);
      try {
        const updated = await repository.replaceAvatar(user.id, user.avatarKey, nextKey);
        if (!updated.count)
          throw new HttpError(409, 'Your profile photo changed. Please try again.');
      } catch (error) {
        await cleanup(nextKey);
        throw error;
      }
      if (user.avatarKey) await cleanup(user.avatarKey);
    },
    read: async (userId: string): Promise<Buffer> => {
      const user = await userFor(userId);
      if (!user.avatarKey) throw new HttpError(404, 'No profile photo is saved.');
      try {
        return await storage.read(user.avatarKey);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
          throw new HttpError(404, 'Profile photo not found.');
        throw error;
      }
    },
    remove: async (userId: string): Promise<void> => {
      const user = await userFor(userId);
      if (!user.avatarKey) return;
      const updated = await repository.replaceAvatar(user.id, user.avatarKey, null);
      if (!updated.count) throw new HttpError(409, 'Your profile photo changed. Please try again.');
      await cleanup(user.avatarKey);
    },
  };
}
export const avatarService = createAvatarService();
