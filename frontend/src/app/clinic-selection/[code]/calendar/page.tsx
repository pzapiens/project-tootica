import type { Metadata } from "next";

import FullCalendarView from "./FullCalendarView";

export const metadata: Metadata = {
  title: "Calendar — Tootica",
};

/**
 * Full calendar (Figma "Calendar"): month grid of the selected doctor's
 * appointments, colour-coded by status. Clicking a day opens a slide-over with
 * that day's appointments; clicking one shows its full detail.
 */
export default function CalendarPage() {
  return <FullCalendarView />;
}
