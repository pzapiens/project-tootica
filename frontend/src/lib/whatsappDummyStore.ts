"use client";

import { useEffect, useState } from "react";

/**
 * Client-only cache of DUMMY WhatsApp bookings, kept in `localStorage` purely for
 * testing the "WhatsApp Appointments" popup's accept / reject flow without a
 * backend. These rows are merged into the popup alongside the real (`SCHEDULED`)
 * ones; accepting or rejecting a dummy removes it from this cache (it never hits
 * the API, since it has no backend row), so it disappears from the popup.
 *
 * Mirrors {@link ./paymentsStore}: writers persist + dispatch an event, readers
 * subscribe with {@link useWhatsAppDummyRevision} and add the revision to their
 * deps so they re-read on any change (including from another tab).
 *
 * NOTE: a dummy that's accepted only disappears from the popup — it can't appear
 * in the main appointments table, which is API-backed. For an end-to-end test
 * (accept → row shows in the table), seed real rows with `npm run
 * db:seed:whatsapp` in the backend instead.
 */

/** A cached dummy row — the exact subset the popup renders (see WhatsAppRow). */
export interface WhatsAppDummy {
  id: string;
  code: string;
  patientName: string;
  consultationType: string;
  date: string;
  age: number | null;
  gender: string;
}

const KEY = "tootica.whatsappDummies.v1";
const SEEDED_KEY = "tootica.whatsappDummies.seeded.v1";
const EVENT = "tootica:whatsapp-dummies-changed";

/** Dummy ids carry this prefix so callers can tell a cache row from a real one. */
export const DUMMY_PREFIX = "wa-dummy-";

/** True when the id belongs to a cached dummy (vs. a real backend appointment). */
export function isDummyId(id: string): boolean {
  return id.startsWith(DUMMY_PREFIX);
}

/** dd/mm/yyyy for a date `days` from today (matches the popup's date format). */
function dmyFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** The initial dummy set written on first load. */
function defaultDummies(): WhatsAppDummy[] {
  return [
    { patientName: "Aarav Sharma", consultationType: "General Consultation / Xray", age: 28, gender: "M" },
    { patientName: "Diya Patel", consultationType: "Scaling", age: 34, gender: "F" },
    { patientName: "Vivaan Reddy", consultationType: "Root Canal Treatment", age: 45, gender: "M" },
    { patientName: "Ananya Nair", consultationType: "Teeth Whitening", age: 22, gender: "F" },
    { patientName: "Kabir Singh", consultationType: "Orthodontic Treatment Braces / Aligners", age: 17, gender: "M" },
  ].map((d, i) => ({
    ...d,
    id: `${DUMMY_PREFIX}${i + 1}`,
    code: `WA-${String(i + 1).padStart(3, "0")}`,
    date: dmyFromNow((i + 1) * 2),
  }));
}

function readAll(): WhatsAppDummy[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as WhatsAppDummy[]) : [];
  } catch {
    return [];
  }
}

function writeAll(list: WhatsAppDummy[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage full / disabled — the in-memory popup still works this session.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** The cached dummy WhatsApp bookings (empty when none). */
export function readWhatsAppDummies(): WhatsAppDummy[] {
  return readAll();
}

/**
 * Seed the default dummy set ONCE per browser (guarded by a flag), so testers get
 * data on first load but the popup can be emptied by accepting/rejecting without
 * silently re-filling. Call {@link resetWhatsAppDummies} to deliberately refill.
 */
export function ensureWhatsAppDummiesSeeded(): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(SEEDED_KEY)) return;
    window.localStorage.setItem(SEEDED_KEY, "1");
  } catch {
    return;
  }
  writeAll(defaultDummies());
}

/** Refill the cache with a fresh default set (e.g. to test again). */
export function resetWhatsAppDummies(): void {
  writeAll(defaultDummies());
}

/** Remove one dummy from the cache (called on accept / reject). */
export function removeWhatsAppDummy(id: string): void {
  writeAll(readAll().filter((d) => d.id !== id));
}

/** Re-render signal: bumps on any dummy change (this tab or another). */
export function useWhatsAppDummyRevision(): number {
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
