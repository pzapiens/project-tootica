"use client";

import { useEffect, useState } from "react";

import { apiFetch, type AnalyticsSummary } from "@/lib/api";
import { analyticsRangeQuery } from "@/lib/analytics";
import { useAppointmentsRevision } from "@/lib/appointmentsBus";

import DashboardHeader from "./DashboardHeader";
import { type StatCounts, type Timeframe } from "./mock";
import StatCards from "./StatCards";

const EMPTY_COUNTS: StatCounts = { total: 0, completed: 0, pending: 0, cancelled: 0 };

/**
 * Ties the header's timeframe filter to the stat cards: changing the timeframe
 * re-fetches the real per-clinic appointment counts (`/api/analytics/summary`)
 * so the cards update with the selection. The timeframe drives ONLY these four
 * cards — the appointments table below is independent of it.
 */
export default function DashboardOverview({
  timeframe,
  onTimeframeChange,
}: {
  timeframe: Timeframe;
  onTimeframeChange: (t: Timeframe) => void;
}) {
  const [counts, setCounts] = useState<StatCounts>(EMPTY_COUNTS);
  const rev = useAppointmentsRevision();

  useEffect(() => {
    let active = true;
    apiFetch<AnalyticsSummary>(`/analytics/summary${analyticsRangeQuery(timeframe)}`)
      .then((data) => {
        if (active) setCounts(data.byStatus);
      })
      .catch(() => {
        if (active) setCounts(EMPTY_COUNTS);
      });
    return () => {
      active = false;
    };
  }, [timeframe, rev]);

  return (
    <>
      <DashboardHeader timeframe={timeframe} onTimeframeChange={onTimeframeChange} />
      <StatCards counts={counts} />
    </>
  );
}
