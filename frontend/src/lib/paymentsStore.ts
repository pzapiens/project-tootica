"use client";

import { apiFetch } from "@/lib/api";

/**
 * Backend-backed payments for an appointment (Payment Management dialog).
 * Each appointment has zero or more payment entries plus a "settled" flag; the
 * appointments list carries a per-row summary (`paymentCount` / `paymentComplete`)
 * for the status glyph, so this module is only used by the dialog itself.
 *
 * Endpoints (nested under the appointment):
 *   GET    /appointments/:id/payments                  → { payments }
 *   POST   /appointments/:id/payments                  → PaymentEntry
 *   PATCH  /appointments/:id/payments/:paymentId/paid  → { paid }
 *   DELETE /appointments/:id/payments/:paymentId       → 204
 */

export interface PaymentEntry {
  id: string;
  description: string;
  amount: number;
  /** Whether this entry has been paid (per-entry checkbox). */
  paid: boolean;
  /** ISO timestamp the entry was created. */
  createdAt: string;
}

export interface PaymentsBundle {
  payments: PaymentEntry[];
}

/** All payments for an appointment plus its settled flag. */
export function fetchPayments(appointmentId: string): Promise<PaymentsBundle> {
  return apiFetch<PaymentsBundle>(`/appointments/${appointmentId}/payments`);
}

/** Add a payment entry; resolves to the created row. */
export function addPayment(
  appointmentId: string,
  description: string,
  amount: number,
): Promise<PaymentEntry> {
  return apiFetch<PaymentEntry>(`/appointments/${appointmentId}/payments`, {
    method: "POST",
    body: JSON.stringify({ description, amount }),
  });
}

/** Remove a payment entry. */
export function removePayment(appointmentId: string, paymentId: string): Promise<void> {
  return apiFetch(`/appointments/${appointmentId}/payments/${paymentId}`, { method: "DELETE" });
}

/** Mark a single payment entry paid / unpaid. */
export function setPaymentPaid(
  appointmentId: string,
  paymentId: string,
  paid: boolean,
): Promise<void> {
  return apiFetch(`/appointments/${appointmentId}/payments/${paymentId}/paid`, {
    method: "PATCH",
    body: JSON.stringify({ paid }),
  });
}
