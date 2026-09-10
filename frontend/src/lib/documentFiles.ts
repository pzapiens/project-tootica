"use client";

/**
 * IndexedDB store for uploaded document bytes (Patient Records → Consent Form /
 * X-ray / Other Documents). The document *metadata* lives in `patientRecordsStore`
 * (localStorage); the actual file blobs are kept here so they survive reloads and
 * can be downloaded later — localStorage can't hold multi-MB binaries, IndexedDB
 * can. Keyed by the document id issued by `patientRecordsStore.addDocument`.
 *
 * This is the client-only stand-in until a real upload backend exists.
 */

const DB_NAME = "tootica-doc-files";
const STORE = "files";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Persist a document's bytes under its id. Resolves false on any failure. */
export async function putDocFile(id: string, file: Blob): Promise<boolean> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(file, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

/** Read a document's bytes (undefined when not stored / on failure). */
export async function getDocFile(id: string): Promise<Blob | undefined> {
  try {
    const db = await openDb();
    const blob = await new Promise<Blob | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result as Blob | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return blob;
  } catch {
    return undefined;
  }
}

/** Delete a document's bytes. */
export async function deleteDocFile(id: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Best-effort — metadata removal already happened.
  }
}
