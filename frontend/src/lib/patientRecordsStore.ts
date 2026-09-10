"use client";

import { useEffect, useState } from "react";

/**
 * Client-only cache for a patient's records (the "Patient Records" view reached
 * from an appointment's ⋮ → Records): the doctor/clinic observation note and the
 * tooth-wise remarks table. Kept in `localStorage` until a real records backend
 * exists, so entries survive reloads.
 *
 * Mirrors {@link ./paymentsStore}: writers persist + dispatch an event, readers
 * subscribe with {@link useRecordsRevision} and add the revision to their deps so
 * they re-read on any change (including from another tab).
 */

export interface ToothEntry {
  id: string;
  toothNo: string;
  remarks: string;
  /** dd/mm/yyyy, stamped when the entry was added. */
  date: string;
}

export interface MedHistoryEntry {
  id: string;
  text: string;
  /** dd/mm/yyyy, stamped when the entry was added. */
  date: string;
}

/** Which document upload section a file belongs to. */
export type DocCategory = "consent" | "xray" | "other";

/** An uploaded document. Only metadata is persisted (no backend for the bytes
 *  yet); the actual file is kept in memory for the session so it can be opened
 *  until upload storage lands. */
export interface DocEntry {
  id: string;
  /** The section this document belongs to. */
  category: DocCategory;
  name: string;
  /** File size in bytes. */
  size: number;
  /** MIME type, e.g. "application/pdf". */
  type: string;
  /** dd/mm/yyyy, stamped when the file was added. */
  date: string;
}

export interface PatientRecord {
  observation: string;
  teeth: ToothEntry[];
  medHistory: MedHistoryEntry[];
  documents: DocEntry[];
}

const KEY = "tootica.patientRecords.v1";
const EVENT = "tootica:patient-records-changed";
const EMPTY: PatientRecord = { observation: "", teeth: [], medHistory: [], documents: [] };

function readAll(): Record<string, PatientRecord> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, PatientRecord>) : {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, PatientRecord>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage full / disabled — the in-memory view state still works this session.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** dd/mm/yyyy for today (the stamp shown in the tooth-wise table's Date column). */
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Fill in any fields missing from an older stored record (e.g. medHistory
 *  added after some records were already saved). */
function normalize(r: Partial<PatientRecord> | undefined): PatientRecord {
  return {
    observation: r?.observation ?? "",
    teeth: r?.teeth ?? [],
    medHistory: r?.medHistory ?? [],
    // Older records may pre-date document categories — default to "consent".
    documents: (r?.documents ?? []).map((d) => ({ ...d, category: d.category ?? "consent" })),
  };
}

/** The cached record for a patient (empty record when none stored). */
export function getPatientRecord(patientId: string): PatientRecord {
  return normalize(readAll()[patientId]);
}

function update(patientId: string, fn: (r: PatientRecord) => PatientRecord): void {
  const all = readAll();
  const next = fn(normalize(all[patientId]));
  if (
    !next.observation &&
    next.teeth.length === 0 &&
    next.medHistory.length === 0 &&
    next.documents.length === 0
  )
    delete all[patientId];
  else all[patientId] = next;
  writeAll(all);
}

/** Persist the doctor/clinic observation note. */
export function setObservation(patientId: string, observation: string): void {
  update(patientId, (r) => ({ ...r, observation }));
}

/** Append a tooth-wise remark; returns nothing (subscribers re-read). */
export function addToothEntry(patientId: string, toothNo: string, remarks: string): void {
  const entry: ToothEntry = {
    id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    toothNo,
    remarks,
    date: today(),
  };
  update(patientId, (r) => ({ ...r, teeth: [...r.teeth, entry] }));
}

/** Edit an existing tooth entry's number/remarks (keeps its original date). */
export function updateToothEntry(patientId: string, id: string, toothNo: string, remarks: string): void {
  update(patientId, (r) => ({
    ...r,
    teeth: r.teeth.map((t) => (t.id === id ? { ...t, toothNo, remarks } : t)),
  }));
}

/** Remove a tooth entry. */
export function removeToothEntry(patientId: string, id: string): void {
  update(patientId, (r) => ({ ...r, teeth: r.teeth.filter((t) => t.id !== id) }));
}

/** Append a medical-history entry (stamped with today's date). */
export function addMedHistory(patientId: string, text: string): void {
  const entry: MedHistoryEntry = {
    id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text,
    date: today(),
  };
  update(patientId, (r) => ({ ...r, medHistory: [...r.medHistory, entry] }));
}

/** Edit an existing medical-history entry's text (keeps its original date). */
export function updateMedHistory(patientId: string, id: string, text: string): void {
  update(patientId, (r) => ({
    ...r,
    medHistory: r.medHistory.map((m) => (m.id === id ? { ...m, text } : m)),
  }));
}

/** Remove a medical-history entry. */
export function removeMedHistory(patientId: string, id: string): void {
  update(patientId, (r) => ({ ...r, medHistory: r.medHistory.filter((m) => m.id !== id) }));
}

/** Record an uploaded document (metadata only) under a section; returns its id so
 *  the caller can map the in-memory file/URL for this session. */
export function addDocument(
  patientId: string,
  category: DocCategory,
  name: string,
  size: number,
  type: string,
): string {
  const id = `d-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  update(patientId, (r) => ({
    ...r,
    documents: [...r.documents, { id, category, name, size, type, date: today() }],
  }));
  return id;
}

/** Remove an uploaded document. */
export function removeDocument(patientId: string, id: string): void {
  update(patientId, (r) => ({ ...r, documents: r.documents.filter((d) => d.id !== id) }));
}

/** Re-render signal: bumps on any records change (this tab or another). */
export function useRecordsRevision(): number {
  const [rev, setRev] = useState(0);
  useEffect(() => {
    const handler = () => setRev((r) => r + 1);
    window.addEventListener(EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);
  return rev;
}
