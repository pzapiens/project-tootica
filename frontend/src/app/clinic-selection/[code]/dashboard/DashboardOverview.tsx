"use client";

import { useState } from "react";

import DashboardHeader from "./DashboardHeader";
import { resolveStatCounts, type Timeframe } from "./mock";
import StatCards from "./StatCards";

/**
 * Ties the header's timeframe filter to the stat cards: changing the timeframe
 * re-resolves the appointment counts so the cards update with the selection.
 */
export default function DashboardOverview() {
  const [timeframe, setTimeframe] = useState<Timeframe>({ kind: "all" });
  const counts = resolveStatCounts(timeframe);

  return (
    <>
      <DashboardHeader timeframe={timeframe} onTimeframeChange={setTimeframe} />
      <StatCards counts={counts} />
    </>
  );
}
