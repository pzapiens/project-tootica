import type { Metadata } from "next";

import AnalyticsClient from "./AnalyticsClient";

export const metadata: Metadata = {
  title: "Analytics — Tootica",
};

/**
 * Analytics (Figma "Analytics"): the clinic's Analytics Summary — four appointment
 * stat cards (Total / Completed / Pending / Cancelled) scoped by a timeframe, each
 * with a "Review" deep-link into the filtered appointments list, plus a CSV export.
 * Below the cards a segmented toggle swaps between "Doctor Performance" (search +
 * per-doctor table with eye drill-downs) and "Consultation Type & Lead Source"
 * (two "Appointment Counts" cards with a count-sorting filter). State lives in
 * AnalyticsClient.
 */
export default function AnalyticsPage() {
  return <AnalyticsClient />;
}
