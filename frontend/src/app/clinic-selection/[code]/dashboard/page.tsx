import type { Metadata } from "next";

import DashboardClient from "./DashboardClient";

export const metadata: Metadata = {
  title: "Dashboard — Tootica",
};

/**
 * Main dashboard (Figma "Dashboard1"): greeting header, appointment stat cards,
 * and the lower section with the appointments table + a mini calendar. The
 * interactive filter state lives in DashboardClient (a client component) so the
 * timeframe filter can drive both the cards and the table.
 */
export default function DashboardPage() {
  return <DashboardClient />;
}
