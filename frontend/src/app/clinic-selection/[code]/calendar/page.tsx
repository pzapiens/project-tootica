import type { Metadata } from "next";
import { Suspense } from "react";

import FullCalendarView from "./FullCalendarView";

export const metadata: Metadata = {
  title: "Calendar — Tootica",
};

/**
 * Full calendar (Figma "Calendar"): month grid of the selected doctor's
 * appointments, colour-coded by status. Clicking a day opens a slide-over with
 * that day's appointments; clicking one shows its full detail. Deep-linkable
 * via `?date=YYYY-MM-DD` (used by the dashboard mini calendar), which requires
 * the Suspense boundary around the `useSearchParams` consumer.
 */
export default function CalendarPage() {
  return (
    <Suspense>
      <FullCalendarView />
    </Suspense>
  );
}
