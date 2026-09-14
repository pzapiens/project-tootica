import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { env } from '../../config/env';

/**
 * Local-disk storage for uploaded patient documents (the bytes; metadata lives
 * in the `patient_documents` table). Files are written under
 * `${UPLOAD_DIR}/<clinicId>/<uuid><ext>` and referenced by a relative "key".
 *
 * This is deliberately a tiny interface — `save` / `resolvePath` / `remove` — so
 * it can be swapped for object storage (S3) later without touching callers or
 * the DB schema: only these functions change.
 */

/** Absolute path of the configured upload root (resolved from the backend cwd). */
const ROOT = path.resolve(env.uploadDir);

/** A stored key is `<clinicId>/<uuid><ext>` — always forward-slashed, tenant-scoped. */
function keyFor(clinicId: string, originalName: string): string {
  const ext = path.extname(originalName).toLowerCase().slice(0, 12); // guard odd names
  return `${clinicId}/${randomUUID()}${ext}`;
}

/** Persist a file's bytes for a clinic; returns the storage key to save in the DB. */
export async function save(clinicId: string, buffer: Buffer, originalName: string): Promise<string> {
  const key = keyFor(clinicId, originalName);
  const abs = path.join(ROOT, key);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, buffer);
  return key;
}

/** Absolute filesystem path for a stored key (for streaming a download). */
export function resolvePath(key: string): string {
  // Normalise + confine to ROOT so a crafted key can't escape the upload dir.
  const abs = path.resolve(ROOT, key);
  if (!abs.startsWith(ROOT + path.sep) && abs !== ROOT) {
    throw new Error('Invalid storage key');
  }
  return abs;
}

/** True if the bytes for a key are present on disk. */
export function exists(key: string): boolean {
  return existsSync(resolvePath(key));
}

/** Open a readable stream for a stored key (caller pipes it to the response). */
export function createStream(key: string): NodeJS.ReadableStream {
  return createReadStream(resolvePath(key));
}

/** Best-effort delete of a stored key's bytes (metadata removal already happened). */
export async function remove(key: string): Promise<void> {
  try {
    await unlink(resolvePath(key));
  } catch {
    // Missing file / already gone — nothing to do.
  }
}
