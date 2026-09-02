/**
 * Types + mappers for the full-calendar view. Real appointments (from
 * `GET /api/appointments`) are mapped into the compact shape the month grid +
 * slide-over use, and grouped by day-of-month. The calendar status mirrors the
 * appointment's stored status (it is NOT derived from the current time).
 */
import type { AppointmentListItem } from "@/lib/api";

export type CalStatus = "Completed" | "Ongoing" | "Upcoming" | "Cancelled";

export interface CalAppointment {
  id: string;
  apptId: string;
  patientId: string;
  /** Patient's first name only — the calendar never shows the full name. */
  patientName: string;
  /** Short name shown on the compact month-grid chip (also first name only). */
  shortName: string;
  consultationType: string;
  doctor: string;
  phone: string;
  email: string;
  start: string;
  end: string;
  status: CalStatus;
  message: string;
}

/** A Date → "hh:mm AM". */
function fmt12(d: Date): string {
  const period = d.getHours() >= 12 ? "PM" : "AM";
  const h = d.getHours() % 12 || 12;
  return `${String(h).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${period}`;
}

/** Map the backend appointment status straight onto a calendar status — no
 *  time-of-day logic, so an entry shows exactly the status it was given.
 *  CONFIRMED reads as in-progress → "Ongoing"; SCHEDULED stays "Upcoming". */
export function computeCalStatus(item: AppointmentListItem): CalStatus {
  switch (item.status) {
    case "CANCELLED":
    case "NO_SHOW":
      return "Cancelled";
    case "COMPLETED":
      return "Completed";
    case "CONFIRMED":
      return "Ongoing";
    default:
      return "Upcoming";
  }
}

/** Map a backend appointment into the calendar's compact shape. */
export function toCalAppointment(item: AppointmentListItem): CalAppointment {
  const start = new Date(item.startTime);
  const end = new Date(item.endTime);
  // Zero-duration (start == end) means no time was picked → show "--".
  const noTime = item.startTime === item.endTime;
  const name = item.patient.name;
  // Calendar shows first name only — the first whitespace-separated token, or
  // the whole (trimmed) name when there's no space.
  const firstName = name.trim().split(/\s+/)[0] || name;
  return {
    id: item.id,
    apptId: item.code ?? item.id,
    patientId: item.patient.code ?? item.patient.id,
    patientName: firstName,
    shortName: firstName,
    consultationType: item.consultationType?.trim() || item.notes?.trim() || "Consultation",
    doctor: item.doctor.name ? `Dr. ${item.doctor.name}` : "Unassigned",
    phone: item.patient.phone ?? "—",
    email: item.patient.email ?? "—",
    start: noTime ? "--" : fmt12(start),
    end: noTime ? "--" : fmt12(end),
    status: computeCalStatus(item),
    message: item.notes ?? "",
  };
}

/** Group appointments by day-of-month (1-based), each day chronological. */
export function groupByDay(
  items: AppointmentListItem[],
): Record<number, CalAppointment[]> {
  const out: Record<number, CalAppointment[]> = {};
  const sorted = [...items].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );
  for (const item of sorted) {
    const day = new Date(item.startTime).getDate();
    (out[day] ??= []).push(toCalAppointment(item));
  }
  return out;
}

/** Time part of a chip label, dropping the AM/PM suffix ("09:00 AM" → "09:00"). */
export function chipTime(start: string): string {
  return start.replace(/\s?[AP]M$/i, "");
}
