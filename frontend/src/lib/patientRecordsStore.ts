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
 * the view always reflects the server. Nothing is drafted — the observation note
 * only persists when Saved.
 */

export interface ToothEntry {
  id: string;
  toothNo: string;
  remarks: string;
  /** dd/mm/yyyy, from the entry's createdAt. */
  date: string;
  /** The user who created it — only they may edit/delete (null for legacy rows). */
  createdById: string | null;
}

export interface MedHistoryEntry {
  id: string;
  text: string;
  /** dd/mm/yyyy, from the entry's createdAt. */
  date: string;
  /** The user who created it — only they may edit/delete (null for legacy rows). */
  createdById: string | null;
}

export interface ObservationEntry {
  id: string;
  text: string;
  /** dd/mm/yyyy, from the entry's createdAt. */
  date: string;
  /** The user who created it — only they may edit/delete (null for legacy rows). */
  createdById: string | null;
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
  /** dd/mm/yyyy, hh:mm AM/PM — the upload date & time (shown on the card). */
  dateTime: string;
  /** The uploader's display name (null for legacy uploads). */
  createdByName: string | null;
}

export interface PatientRecord {
  teeth: ToothEntry[];
  medHistory: MedHistoryEntry[];
  observations: ObservationEntry[];
  documents: DocEntry[];
}

const EVENT = "tootica:patient-records-changed";
const EMPTY: PatientRecord = { teeth: [], medHistory: [], observations: [], documents: [] };

// In-memory cache, keyed by patientId. The view reads this synchronously.
const cache = new Map<string, PatientRecord>();

/* -------------------------------------------------- backend bundle → view shape */

interface BundleDto {
  teeth: { id: string; toothNo: string; remarks: string; createdById: string | null; createdAt: string }[];
  medHistory: { id: string; text: string; createdById: string | null; createdAt: string }[];
  observations: { id: string; text: string; createdById: string | null; createdAt: string }[];
  documents: {
    id: string;
    category: string;
    name: string;
    size: number;
    mimeType: string;
    createdByName: string | null;
    createdAt: string;
  }[];
}

/** ISO timestamp → dd/mm/yyyy (local). */
function fmtDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** ISO timestamp → "dd/mm/yyyy, hh:mm AM/PM" (local). */
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const period = d.getHours() >= 12 ? "PM" : "AM";
  const h = d.getHours() % 12 || 12;
  return `${fmtDate(iso)}, ${pad(h)}:${pad(d.getMinutes())} ${period}`;
}

function toRecord(b: BundleDto): PatientRecord {
  return {
    teeth: b.teeth.map((t) => ({
      id: t.id,
      toothNo: t.toothNo,
      remarks: t.remarks,
      date: fmtDate(t.createdAt),
      createdById: t.createdById,
    })),
    medHistory: b.medHistory.map((m) => ({
      id: m.id,
      text: m.text,
      date: fmtDate(m.createdAt),
      createdById: m.createdById,
    })),
    observations: b.observations.map((o) => ({
      id: o.id,
      text: o.text,
      date: fmtDate(o.createdAt),
      createdById: o.createdById,
    })),
    documents: b.documents.map((d) => ({
      id: d.id,
      category: (d.category as DocCategory) ?? "consent",
      name: d.name,
      size: d.size,
      type: d.mimeType,
      date: fmtDate(d.createdAt),
      dateTime: fmtDateTime(d.createdAt),
      createdByName: d.createdByName,
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

/* ---------------------------------------------------------------- observations */

export function addObservation(patientId: string, text: string): Promise<void> {
  return mutate(patientId, () =>
    apiFetch(`/patients/${patientId}/records/observations`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  );
}

export function updateObservation(patientId: string, id: string, text: string): Promise<void> {
  return mutate(patientId, () =>
    apiFetch(`/patients/${patientId}/records/observations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ text }),
    }),
  );
}

export function removeObservation(patientId: string, id: string): Promise<void> {
  return mutate(patientId, () =>
    apiFetch(`/patients/${patientId}/records/observations/${id}`, { method: "DELETE" }),
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

/* ------------------------------------------------------------------ audit log */

/** Which records table a log entry belongs to. The three document-upload
 *  sections each log under their own category ("consent" / "xray" / "other"). */
export type LogTable = "observation" | "tooth" | "medical-history" | DocCategory;

/** One create/edit/delete audit entry for a records table (admins only). */
export interface RecordLogEntry {
  id: string;
  table: LogTable;
  /** "CREATE" | "UPDATE" | "DELETE". */
  action: string;
  entryId: string;
  /** Human-readable snapshot of the row before the change; null for a create. */
  previous: string | null;
  /** Snapshot after the change; null for a delete. */
  updated: string | null;
  /** The acting user's display name (denormalized on the server). */
  userName: string;
  /** ISO timestamp of the change. */
  createdAt: string;
}

/** The edit/delete history for a patient's records tables (newest first). Not
 *  cached — the log dialog fetches it fresh each time it opens. Admins only
 *  (the backend gates the endpoint to CLIENT_ADMIN / SUPER_ADMIN). */
export function fetchRecordsLog(patientId: string): Promise<RecordLogEntry[]> {
  return apiFetch<RecordLogEntry[]>(`/patients/${patientId}/records/logs`);
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
