"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { apiFetch } from "@/lib/api";

import BranchFilter, { type BranchOption } from "./BranchFilter";
import { type Branch } from "./BranchList";
import TimeFilter, { type TimeFrame } from "./TimeFilter";

export type BranchStats = {
  total: number;
  completed: number;
  pending: number;
  cancelled: number;
};
export type StatsByBranch = Record<string, BranchStats>;

/**
 * Resolve the stat card values for the active branch + time frame. `all` and
 * `today` read seeded per-branch data; a custom range scales the all-time
 * baseline by its share of a year (mock behaviour until the backend serves
 * per-window counts).
 */
function resolveStats(
  allTime: StatsByBranch,
  today: StatsByBranch,
  branchId: string,
  timeFrame: TimeFrame,
): BranchStats {
  const base = allTime[branchId] ?? allTime.all;
  if (timeFrame.kind === "all") return base;
  if (timeFrame.kind === "today") return today[branchId] ?? today.all;

  const start = new Date(timeFrame.from);
  const end = new Date(timeFrame.to);
  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const factor = Math.min(1, Math.max(0, days / 365));
  const scale = (n: number) => Math.max(0, Math.round(n * factor));
  return {
    total: scale(base.total),
    completed: scale(base.completed),
    pending: scale(base.pending),
    cancelled: scale(base.cancelled),
  };
}

const STAT_CARDS: { key: keyof BranchStats; label: string; icon: string }[] = [
  { key: "total", label: "Total Appointments", icon: "/clinic/productivity.svg" },
  { key: "completed", label: "Total Appointments Completed", icon: "/clinic/event_available.svg" },
  { key: "pending", label: "Total Appointments Pending", icon: "/clinic/hourglass_empty.svg" },
  { key: "cancelled", label: "Total Appointments Cancelled", icon: "/clinic/cancel.svg" },
];

/**
 * Header (greeting + filters + logout) and the appointment stat cards. The "All
 * Branch" dropdown filters the cards: selecting a clinic swaps the card values
 * to that branch's appointment data (falls back to "all" if a branch has none).
 */
export default function DashboardTop({
  greetingName,
  branches,
  statsByBranch,
  todayStatsByBranch,
}: {
  greetingName: string;
  branches: Branch[];
  statsByBranch: StatsByBranch;
  todayStatsByBranch: StatsByBranch;
}) {
  const router = useRouter();
  const [branchFilter, setBranchFilter] = useState("all");
  const [timeFrame, setTimeFrame] = useState<TimeFrame>({ kind: "all" });

  async function handleLogout() {
    // Clear the session cookies server-side; navigate home regardless of outcome.
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // Ignore — the cookie may already be gone; still send the user to login.
    }
    router.push("/login");
  }

  const options: BranchOption[] = [
    { id: "all", label: "All Branch" },
    ...branches.map((b) => ({ id: b.id, label: b.branch })),
  ];

  const stats = resolveStats(statsByBranch, todayStatsByBranch, branchFilter, timeFrame);

  return (
    <>
      {/* Header */}
      <header className="flex shrink-0 flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
        <h1 className="font-inter text-[26px] font-semibold leading-tight text-ink md:text-[35px] md:leading-[42px]">
          Hi, {greetingName}
        </h1>
        <div className="flex flex-wrap items-center gap-3 md:gap-[19px]">
          <BranchFilter options={options} selectedId={branchFilter} onSelect={setBranchFilter} />
          <TimeFilter value={timeFrame} onChange={setTimeFrame} />
          <button
            type="button"
            onClick={handleLogout}
            className="flex h-[55px] items-center gap-[9.333px] rounded-full bg-brand px-[25px] font-inter text-[16.333px] font-semibold leading-[23.333px] tracking-[0.408px] text-white transition-opacity hover:opacity-90"
          >
            <Image src="/clinic/logout.svg" alt="" width={24} height={24} className="size-6" />
            LOGOUT
          </button>
        </div>
      </header>

      {/* Stat cards */}
      <section className="grid shrink-0 grid-cols-1 gap-5 sm:grid-cols-2 md:gap-[28px] xl:grid-cols-4">
        {STAT_CARDS.map((card) => (
          <StatCard key={card.key} value={stats[card.key]} label={card.label} icon={card.icon} />
        ))}
      </section>
    </>
  );
}

function StatCard({ value, label, icon }: { value: number; label: string; icon: string }) {
  return (
    <div className="flex h-[184px] flex-col justify-between overflow-hidden rounded-[28px] bg-brand p-6">
      <div className="flex flex-col gap-[4.667px]">
        <span className="font-inter text-[34px] font-bold leading-[38px] text-white">
          {value}
        </span>
        <span className="font-inter text-[16px] font-medium leading-[22px] text-white">
          {label}
        </span>
      </div>
      <Image src={icon} alt="" width={32} height={32} className="size-8" />
    </div>
  );
}
