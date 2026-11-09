import { readFile } from 'node:fs/promises';
import * as files from './fileStorage';

/** Swap this adapter for S3 later; database keys and avatar routes stay unchanged. */
export interface AvatarStorage {
  save(userId: string, bytes: Buffer): Promise<string>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

export const avatarStorage: AvatarStorage = {
  save: (userId, bytes) => files.save('avatars/' + userId, bytes, 'profile.webp'),
  read: (key) => readFile(files.resolvePath(key)),
  remove: (key) => files.remove(key),
};
