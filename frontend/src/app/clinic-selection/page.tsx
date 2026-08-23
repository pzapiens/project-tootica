import type { Metadata } from "next";

import ClinicSelectionClient from "./ClinicSelectionClient";
import { type StatsByBranch } from "./DashboardTop";

export const metadata: Metadata = {
  title: "Select Branch — Tootica",
};

// All-time appointment stats per branch; "all" aggregates every branch. The
// branch + time-frame filters read these — swap for a backend fetch (per clinic,
// per window) when available.
const STATS_BY_BRANCH: StatsByBranch = {
  all: { total: 574, completed: 488, pending: 76, cancelled: 10 },
  kasargod: { total: 220, completed: 190, pending: 28, cancelled: 2 },
  kannur: { total: 156, completed: 130, pending: 22, cancelled: 4 },
  kozhikode: { total: 198, completed: 168, pending: 26, cancelled: 4 },
};

// Today's appointment stats per branch, surfaced when the time filter is set to
// "Today". Custom ranges scale the all-time baseline (see resolveStats).
const TODAY_STATS_BY_BRANCH: StatsByBranch = {
  all: { total: 36, completed: 23, pending: 11, cancelled: 2 },
  kasargod: { total: 14, completed: 9, pending: 5, cancelled: 0 },
  kannur: { total: 10, completed: 6, pending: 3, cancelled: 1 },
  kozhikode: { total: 12, completed: 8, pending: 3, cancelled: 1 },
};

export default function ClinicSelectionPage() {
  // The greeting + branch list are driven by the signed-in user (fetched client
  // side from /api/auth/me); the stat cards use the seed data above until the
  // backend exposes per-branch / per-status analytics.
  return (
    <ClinicSelectionClient
      statsByBranch={STATS_BY_BRANCH}
      todayStatsByBranch={TODAY_STATS_BY_BRANCH}
    />
  );
}
