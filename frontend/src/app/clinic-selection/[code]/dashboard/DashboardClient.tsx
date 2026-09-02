"use client";

import { useState } from "react";

import DashboardOverview from "./DashboardOverview";
import LowerSection from "./LowerSection";
import { STATUS_FILTER_OPTIONS, type Timeframe } from "./mock";

/**
 * Client shell that owns the dashboard's independent filters:
 *  - `timeframe` — the top-right window (All-Time / Today / custom range). It
 *    drives ONLY the four stat cards, not the appointments table.
 *  - `statusFilter` — the appointments table's status filter (the table's only
 *    filter, besides its own search).
 *
 * The mini calendar and the appointments table are intentionally decoupled — the
 * calendar is display-only (dots per day) and the table shows today's
 * appointments, filtered by status.
 */
export default function DashboardClient() {
  const [timeframe, setTimeframe] = useState<Timeframe>({ kind: "all" });
  const [statusFilter, setStatusFilter] = useState<string>(STATUS_FILTER_OPTIONS[0]);

  return (
    <div className="flex flex-col gap-[28px]">
      <DashboardOverview timeframe={timeframe} onTimeframeChange={setTimeframe} />
      <LowerSection status={statusFilter} onStatusChange={setStatusFilter} />
    </div>
  );
}
