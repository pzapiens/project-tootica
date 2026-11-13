"use client";

import { useEffect, useMemo, useState } from "react";

import { apiFetch, type AppointmentListItem } from "@/lib/api";
import { useAppointmentsRevision } from "@/lib/appointmentsBus";

import AppointmentsTable from "./AppointmentsTable";
import MiniCalendar from "./MiniCalendar";
import styles from "./dashboard.module.css";
import { CalendarGridSkeleton, LoadingFrame } from "@/components/loading/PageSkeletons";

/** Table and calendar share a row only when their content container has room. */
export default function LowerSection({
  status,
  onStatusChange,
}: {
  /** Table status filter. */
  status: string;
  onStatusChange: (status: string) => void;
}) {
  // Full list (recent) — only used to mark which days have appointments and to
  // pick the initial calendar month. The table fetches its own filtered slice.
  const [allAppointments, setAllAppointments] = useState<AppointmentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const rev = useAppointmentsRevision();

  useEffect(() => {
    let active = true;
    apiFetch<AppointmentListItem[]>("/appointments?limit=500")
      .then((list) => {
        if (active) setAllAppointments(list);
      })
      .catch(() => {
        if (active) setAllAppointments([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [rev]);

  // Start the calendar on the most recent appointment's month (list is newest
  // first), so the dots are visible immediately even though today may be empty.
  const initialMonth = useMemo(() => {
    if (allAppointments.length > 0) {
      const d = new Date(allAppointments[0].startTime);
      return { year: d.getFullYear(), month: d.getMonth() };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  }, [allAppointments]);

  // The table shows today's appointments.
  const heading = "Today's Appointments";

  return (
    <div className={styles.lower}>
      <AppointmentsTable
        heading={heading}
        status={status}
        onStatusChange={onStatusChange}
      />
      <div className={styles.calendarSlot}>
        {loading ? (
          <LoadingFrame name="appointment calendar"><CalendarGridSkeleton compact /></LoadingFrame>
        ) : <MiniCalendar appointments={allAppointments} initialMonth={initialMonth} />}
      </div>
    </div>
  );
}
