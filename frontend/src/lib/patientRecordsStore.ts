"use client";

import { useEffect, useState } from "react";

import { apiFetch, apiUpload } from "@/lib/api";

/**
 * Backend-backed patient records (the "Patient Records" view reached from an
 * appointment's ⋮ → Records): the observation note, tooth-wise remarks, medical
 * history, and uploaded documents. Endpoints are nested under the patient
 * (`/api/patients/:patientId/records/...`).
 *
 * The view reads synchronously from an in-memory cache and re-renders on a
 * revision bump (see {@link useRecordsRevision}); {@link loadPatientRecord}
 * hydrates the cache from the backend, and every writer reloads it afterwards so
 * the view always reflects the server. In-progress observation drafts stay in
 * `localStorage` (purely client-side, so a reload doesn't lose typing).
 */

export interface ToothEntry {
  id: string;
  toothNo: string;
  remarks: string;
  /** dd/mm/yyyy, from the entry's createdAt. */
  date: string;
}

export interface MedHistoryEntry {
  id: string;
  text: string;
  /** dd/mm/yyyy, from the entry's createdAt. */
  date: string;
}

/** Which document upload section a file belongs to. */
export type DocCategory = "consent" | "xray" | "other";

export interface DocEntry {
  id: string;
  category: DocCategory;
  name: string;
  /** File size in bytes. */
  size: number;
  /** MIME type, e.g. "application/pdf". */
  type: string;
  /** dd/mm/yyyy, from the document's createdAt. */
  date: string;
}

export interface PatientRecord {
  observation: string;
  /** dd/mm/yyyy the observation note was last saved (undefined when never/empty). */
  observationUpdatedAt?: string;
  teeth: ToothEntry[];
  medHistory: MedHistoryEntry[];
  documents: DocEntry[];
}

const EVENT = "tootica:patient-records-changed";
const EMPTY: PatientRecord = { observation: "", teeth: [], medHistory: [], documents: [] };

// In-memory cache, keyed by patientId. The view reads this synchronously.
const cache = new Map<string, PatientRecord>();

/* -------------------------------------------------- backend bundle → view shape */

interface BundleDto {
  observation: string;
  observationUpdatedAt: string | null;
  teeth: { id: string; toothNo: string; remarks: string; createdAt: string }[];
  medHistory: { id: string; text: string; createdAt: string }[];
  documents: {
    id: string;
    category: string;
    name: string;
    size: number;
    mimeType: string;
    createdAt: string;
  }[];
}

/** ISO timestamp → dd/mm/yyyy (local). */
function fmtDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function toRecord(b: BundleDto): PatientRecord {
  return {
    observation: b.observation ?? "",
    observationUpdatedAt: b.observationUpdatedAt ? fmtDate(b.observationUpdatedAt) : undefined,
    teeth: b.teeth.map((t) => ({ id: t.id, toothNo: t.toothNo, remarks: t.remarks, date: fmtDate(t.createdAt) })),
    medHistory: b.medHistory.map((m) => ({ id: m.id, text: m.text, date: fmtDate(m.createdAt) })),
    documents: b.documents.map((d) => ({
      id: d.id,
      category: (d.category as DocCategory) ?? "consent",
      name: d.name,
      size: d.size,
      type: d.mimeType,
      date: fmtDate(d.createdAt),
    })),
  };
}

function fire(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

/** The cached record for a patient (empty until {@link loadPatientRecord} runs). */
export function getPatientRecord(patientId: string): PatientRecord {
  return cache.get(patientId) ?? EMPTY;
}

/** Fetch a patient's records into the cache and notify subscribers. */
export async function loadPatientRecord(patientId: string): Promise<void> {
  const bundle = await apiFetch<BundleDto>(`/patients/${patientId}/records`);
  cache.set(patientId, toRecord(bundle));
  fire();
}

/** Run a write, then refresh the cache from the server. Errors are logged (the
 *  view fire-and-forgets these), and the reload reflects the true server state. */
async function mutate(patientId: string, write: () => Promise<unknown>): Promise<void> {
  try {
    await write();
    await loadPatientRecord(patientId);
  } catch (err) {
    console.error("Patient records update failed:", err);
  }
}

/* ----------------------------------------------------------------- observation */

/** Persist the doctor/clinic observation note (empty clears it). */
export async function setObservation(patientId: string, observation: string): Promise<void> {
  clearObservationDraft(patientId);
  await mutate(patientId, () =>
    apiFetch(`/patients/${patientId}/records/observation`, {
      method: "PUT",
      body: JSON.stringify({ text: observation }),
    }),
  );
}

/* ------------------------------------------------------------ tooth-wise remarks */

export function addToothEntry(patientId: string, toothNo: string, remarks: string): Promise<void> {
  return mutate(patientId, () =>
    apiFetch(`/patients/${patientId}/records/teeth`, {
      method: "POST",
      body: JSON.stringify({ toothNo, remarks }),
    }),
  );
}

export function updateToothEntry(
  patientId: string,
  id: string,
  toothNo: string,
  remarks: string,
): Promise<void> {
  return mutate(patientId, () =>
    apiFetch(`/patients/${patientId}/records/teeth/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ toothNo, remarks }),
    }),
  );
}

export function removeToothEntry(patientId: string, id: string): Promise<void> {
  return mutate(patientId, () =>
    apiFetch(`/patients/${patientId}/records/teeth/${id}`, { method: "DELETE" }),
  );
}

/* ------------------------------------------------------------- medical history */

export function addMedHistory(patientId: string, text: string): Promise<void> {
  return mutate(patientId, () =>
    apiFetch(`/patients/${patientId}/records/medical-history`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  );
}

export function updateMedHistory(patientId: string, id: string, text: string): Promise<void> {
  return mutate(patientId, () =>
    apiFetch(`/patients/${patientId}/records/medical-history/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ text }),
    }),
  );
}

export function removeMedHistory(patientId: string, id: string): Promise<void> {
  return mutate(patientId, () =>
    apiFetch(`/patients/${patientId}/records/medical-history/${id}`, { method: "DELETE" }),
  );
}

/* ------------------------------------------------------------------- documents */

/** Upload a document (multipart) under a section. */
export function addDocument(patientId: string, category: DocCategory, file: File): Promise<void> {
  const form = new FormData();
  form.append("category", category);
  form.append("file", file);
  return mutate(patientId, () => apiUpload(`/patients/${patientId}/records/documents`, form));
}

/** Remove an uploaded document. */
export function removeDocument(patientId: string, id: string): Promise<void> {
  return mutate(patientId, () =>
    apiFetch(`/patients/${patientId}/records/documents/${id}`, { method: "DELETE" }),
  );
}

/** Same-origin URL to open/download a document (cookies authorise the GET). */
export function documentDownloadUrl(patientId: string, id: string): string {
  return `/api/patients/${patientId}/records/documents/${id}/download`;
}

/* ----------------------------------------- in-progress observation drafts (local) */

const DRAFT_KEY = "tootica.patientRecords.draft.v1";

function readAllDrafts(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeAllDrafts(all: Record<string, string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(all));
  } catch {
    // Storage full / disabled — the in-memory draft still works this session.
  }
}

/** The saved in-progress observation draft for a patient, if any. */
export function getObservationDraft(patientId: string): string | undefined {
  return readAllDrafts()[patientId];
}

/** Persist an in-progress observation draft (debounced by the caller). */
export function saveObservationDraft(patientId: string, text: string): void {
  const all = readAllDrafts();
  all[patientId] = text;
  writeAllDrafts(all);
}

/** Drop a patient's in-progress observation draft (on Save or Discard). */
export function clearObservationDraft(patientId: string): void {
  const all = readAllDrafts();
  if (patientId in all) {
    delete all[patientId];
    writeAllDrafts(all);
  }
}

/** Re-render signal: bumps on any records change (this tab). */
export function useRecordsRevision(): number {
  const [rev, setRev] = useState(0);
  useEffect(() => {
    const handler = () => setRev((r) => r + 1);
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);
  return rev;
}
