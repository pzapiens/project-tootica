import type { Metadata } from "next";
import { Suspense } from "react";

import AppointmentsClient from "./AppointmentsClient";

export const metadata: Metadata = {
  title: "Appointments — Tootica",
};

/**
 * Appointments (Figma "Appts1"): the clinic's appointment list — a searchable,
 * filterable, paginated table scoped by a timeframe, with per-row Edit / more
 * actions, a "New Appointment" wizard, an Apply Filter panel, and a CSV export.
 * All state lives in AppointmentsClient.
 *
 * Deep-linkable via `?q=` (auto-search) and `?status=` (auto-apply a status
 * filter) — used by the dashboard stat cards, the calendar's "View Appointment",
 * and the patients page — which requires the Suspense boundary around the
 * `useSearchParams` consumer.
 */
export default function AppointmentsPage() {
  return (
    <Suspense>
      <AppointmentsClient />
    </Suspense>
  );
}
