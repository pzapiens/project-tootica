import type { Metadata } from "next";

import { type Branch } from "./BranchList";
import DashboardTop, { type StatsByBranch } from "./DashboardTop";
import SelectBranchSection from "./SelectBranchSection";

export const metadata: Metadata = {
  title: "Select Branch — Tootica",
};

// Seeded from the Figma frame. Real data will come from the backend.
const BRANCHES: Branch[] = [
  { id: "kasargod", branch: "The Dental Garage, Kasargod", pic: "Dr. Aadhinath", contact: "+91 9654781236" },
  { id: "kannur", branch: "The Dental Garage, Kannur", pic: "Abhishek TK", contact: "+91 9654235874" },
  { id: "kozhikode", branch: "The Dental Garage, Kozhikode", pic: "Dr. Meera", contact: "+91 9654098765" },
];

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
  return (
    // Fixed to the viewport on desktop (no page scroll); header, stat cards and
    // the "Select Branch" toolbar stay put — only the branch list scrolls.
    <div className="flex min-h-dvh flex-col bg-white lg:h-dvh lg:overflow-hidden">
      <div className="mx-auto flex w-full max-w-[1402px] flex-1 flex-col gap-6 p-6 md:gap-7 md:p-7 lg:min-h-0">
        <DashboardTop
          branches={BRANCHES}
          statsByBranch={STATS_BY_BRANCH}
          todayStatsByBranch={TODAY_STATS_BY_BRANCH}
        />
        <SelectBranchSection branches={BRANCHES} />
      </div>
    </div>
  );
}
