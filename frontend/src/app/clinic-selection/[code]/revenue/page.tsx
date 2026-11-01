import type { Metadata } from "next";

import RevenueClient from "./RevenueClient";

export const metadata: Metadata = {
  title: "Revenue — Tootica",
};

/**
 * Revenue: received-revenue trends alongside an interactive received/pending
 * breakdown, a CSV export, and a per-timeframe "Recent Transactions" table (search +
 * Apply Filter: ID sort, payment status, consultation type). Totals + rows are
 * derived client-side from `GET /api/revenue/transactions`. State lives in
 * RevenueClient.
 */
export default function RevenuePage() {
  return <RevenueClient />;
}
