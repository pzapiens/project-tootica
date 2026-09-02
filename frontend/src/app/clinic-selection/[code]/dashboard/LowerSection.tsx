"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { apiFetch, type AppointmentListItem } from "@/lib/api";
import { useAppointmentsRevision } from "@/lib/appointmentsBus";

import AppointmentsTable from "./AppointmentsTable";
import MiniCalendar from "./MiniCalendar";

/**
 * Lower dashboard row: the appointments table and the mini calendar side by
 * side. On desktop the table is capped to the calendar's height so their
 * bottoms line up; if the appointment list is taller, the table body scrolls.
 * On smaller screens they stack and the table grows naturally.
 *
 * The two are independent: the table filters only by its own status filter +
 * search, and the calendar is display-only (a dot per day that has an
 * appointment). Clicking a calendar day does nothing to the table.
 */
export default function LowerSection({
  status,
  onStatusChange,
}: {
  /** Table status filter. */
  status: string;
  onStatusChange: (status: string) => void;
}) {
  const calRef = useRef<HTMLDivElement>(null);
  const [calHeight, setCalHeight] = useState<number>();
  const [isDesktop, setIsDesktop] = useState(false);

  // Full list (recent) — only used to mark which days have appointments and to
  // pick the initial calendar month. The table fetches its own filtered slice.
  const [allAppointments, setAllAppointments] = useState<AppointmentListItem[]>([]);
  const rev = useAppointmentsRevision();

  useEffect(() => {
    let active = true;
    apiFetch<AppointmentListItem[]>("/appointments?limit=500")
      .then((list) => {
        if (active) setAllAppointments(list);
      })
      .catch(() => {
        if (active) setAllAppointments([]);
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

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const el = calRef.current;
    if (!el) return;
    const measure = () => setCalHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="flex flex-col items-stretch gap-[37.333px] xl:flex-row xl:items-start">
      <AppointmentsTable
        height={isDesktop ? calHeight : undefined}
        heading={heading}
        status={status}
        onStatusChange={onStatusChange}
      />
      <div ref={calRef} className="shrink-0 self-start">
        <MiniCalendar appointments={allAppointments} initialMonth={initialMonth} />
      </div>
    </div>
  );
}
