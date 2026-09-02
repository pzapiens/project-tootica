"use client";

import { useEffect, useState } from "react";

/**
 * Tiny app-wide signal that appointment data changed (e.g. after creating an
 * appointment). Data components subscribe with {@link useAppointmentsRevision}
 * and add the returned number to their fetch effect's deps to refetch; writers
 * call {@link notifyAppointmentsChanged} after a successful mutation.
 *
 * This keeps the dashboard's independent fetchers (stat cards, appointments
 * table, calendar dots) in sync without threading refresh callbacks through the
 * whole tree.
 */
const EVENT = "tootica:appointments-changed";

export function notifyAppointmentsChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

export function useAppointmentsRevision(): number {
  const [rev, setRev] = useState(0);
  useEffect(() => {
    const handler = () => setRev((r) => r + 1);
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);
  return rev;
}
