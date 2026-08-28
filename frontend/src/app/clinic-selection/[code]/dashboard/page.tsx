import type { Metadata } from "next";

import DashboardOverview from "./DashboardOverview";
import LowerSection from "./LowerSection";

export const metadata: Metadata = {
  title: "Dashboard — Tootica",
};

/**
 * Main dashboard (Figma "Dashboard1"): greeting header, appointment stat cards,
 * and the lower section with today's appointments table + a mini calendar.
 * The table + calendar top-align so a short (or filtered) table starts at the
 * top rather than being pushed to the bottom.
 */
export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-[28px]">
      <DashboardOverview />
      <LowerSection />
    </div>
  );
}
