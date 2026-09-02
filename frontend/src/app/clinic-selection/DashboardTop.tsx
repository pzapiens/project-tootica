"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiFetch, type AnalyticsSummary } from "@/lib/api";
import { analyticsRangeQuery } from "@/lib/analytics";

import BranchFilter, { type BranchOption } from "./BranchFilter";
import { type Branch } from "./BranchList";
import TimeFilter, { type TimeFrame } from "./TimeFilter";

export type BranchStats = {
  total: number;
  completed: number;
  pending: number;
  cancelled: number;
};

const EMPTY_STATS: BranchStats = { total: 0, completed: 0, pending: 0, cancelled: 0 };

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
}: {
  greetingName: string;
  branches: Branch[];
}) {
  const router = useRouter();
  const [branchFilter, setBranchFilter] = useState("all");
  const [timeFrame, setTimeFrame] = useState<TimeFrame>({ kind: "all" });
  const [stats, setStats] = useState<BranchStats>(EMPTY_STATS);

  // Real per-clinic appointment stats for the selected time window. (The backend
  // analytics are clinic-wide, so the branch dropdown filters the list below but
  // not these totals.)
  useEffect(() => {
    let active = true;
    apiFetch<AnalyticsSummary>(`/analytics/summary${analyticsRangeQuery(timeFrame)}`)
      .then((data) => {
        if (active) setStats(data.byStatus);
      })
      .catch(() => {
        if (active) setStats(EMPTY_STATS);
      });
    return () => {
      active = false;
    };
  }, [timeFrame]);

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

  return (
    <>
      {/* Header */}
      <header className="flex shrink-0 flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
        <h1 className="font-inter text-[26px] font-semibold leading-tight text-ink md:text-[35px] md:leading-[42px]">
          Welcome back, {greetingName}
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
