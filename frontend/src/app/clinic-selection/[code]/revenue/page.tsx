import type { Metadata } from "next";

import RevenueClient from "./RevenueClient";

export const metadata: Metadata = {
  title: "Revenue — Tootica",
};

/**
 * Revenue (Figma "Revenues1"): the clinic's Revenue Summary — two revenue stat
 * cards (Total Generated / Pending, each with a Review link that filters the
 * table), a CSV export, a per-timeframe "Recent Transactions" table (search +
 * Apply Filter: ID sort, payment status, consultation type). Totals + rows are
 * derived client-side from `GET /api/revenue/transactions`. State lives in
 * RevenueClient.
 */
export default function RevenuePage() {
  return <RevenueClient />;
}
