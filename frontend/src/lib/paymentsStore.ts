"use client";

import { useEffect, useState } from "react";

/**
 * Client-only cache for an appointment's payments, kept in `localStorage` until
 * a real payments backend exists. The Payment Management dialog reads/writes a
 * record per appointment; the appointments table reads the same record to show
 * the payment-status glyph (pending hourglass / complete tick).
 *
 * Mirrors {@link ../lib/appointmentsBus}: writers persist + dispatch an event,
 * readers subscribe with {@link usePaymentsRevision} and add the revision to
 * their deps so they re-read on any change (including from another tab).
 */

export interface Payment {
  id: string;
  description: string;
  /** dd/mm/yyyy, stamped when the payment was added. */
  date: string;
  amount: number;
}

export interface PaymentRecord {
  payments: Payment[];
  /** Whether the clinic marked this appointment's payments complete. */
  complete: boolean;
}

const KEY = "tootica.appointmentPayments.v1";
const EVENT = "tootica:payments-changed";
const EMPTY: PaymentRecord = { payments: [], complete: false };

function readAll(): Record<string, PaymentRecord> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, PaymentRecord>) : {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, PaymentRecord>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage full / disabled — the in-memory dialog state still works.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** The cached record for an appointment (empty record when none stored). */
export function getPaymentRecord(appointmentId: string): PaymentRecord {
  return readAll()[appointmentId] ?? EMPTY;
}

/** Persist (or clear, when empty) an appointment's payment record. */
export function setPaymentRecord(appointmentId: string, record: PaymentRecord): void {
  const all = readAll();
  if (record.payments.length === 0 && !record.complete) {
    delete all[appointmentId];
  } else {
    all[appointmentId] = record;
  }
  writeAll(all);
}

/** Re-render signal: bumps on any payment change (this tab or another). */
export function usePaymentsRevision(): number {
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
