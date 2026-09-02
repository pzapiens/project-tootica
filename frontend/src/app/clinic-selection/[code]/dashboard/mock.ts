/**
 * Shared dashboard types + display metadata for the "Dashboard1" frame. The
 * live data now comes from the backend (`/api/analytics/summary` for the stat
 * cards, `/api/appointments` for the table); this file only holds the types,
 * the timeframe helpers, and the static card/label metadata.
 */

export type AppointmentStatus =
  | "Upcoming"
  | "On going"
  | "Completed"
  | "Rescheduled"
  | "Cancelled";

export interface DashboardAppointment {
  id: string;
  patientName: string;
  treatment: string;
  doctor: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  // Extra detail used to pre-fill the Edit Appointment form.
  /** Appointment date as dd/mm/yyyy (so an edit keeps its real day). */
  date: string;
  dob: string;
  gender: string;
  phone: string;
  email: string;
  consultationType: string;
  leadSource: string;
  message: string;
  /** Which scheduling flow this appointment was created with. */
  scheduleMode: "datetime" | "doctor";
}

/** Today's date as dd/mm/yyyy — the date pre-filled when editing today's rows. */
export function todayDmy(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/* -------------------------------------------------------------- Timeframe */

/** The dashboard timeframe filter selection. `from`/`to` are ISO `yyyy-mm-dd`. */
export type Timeframe =
  | { kind: "all" }
  | { kind: "today" }
  | { kind: "range"; from: string; to: string };

export interface StatCounts {
  total: number;
  completed: number;
  pending: number;
  cancelled: number;
}

function fmt2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Button label for the current timeframe (e.g. "All-Time", "01/10/23 - 23/10/23"). */
export function timeframeLabel(tf: Timeframe): string {
  if (tf.kind === "all") return "All-Time";
  if (tf.kind === "today") return "Today";
  const f = new Date(tf.from);
  const t = new Date(tf.to);
  const short = (d: Date) =>
    `${fmt2(d.getDate())}/${fmt2(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)}`;
  return `${short(f)} - ${short(t)}`;
}

export type StatKey = keyof StatCounts;

/** Card metadata; the numeric value comes from the resolved counts. */
export const STAT_CARDS = [
  { key: "total", label: "Total Appointments", icon: "/dashboard/stat_productivity.svg" },
  { key: "completed", label: "Total Appointments Completed", icon: "/dashboard/stat_event_available.svg" },
  { key: "pending", label: "Total Appointments Pending", icon: "/dashboard/stat_hourglass_empty.svg" },
  { key: "cancelled", label: "Total Appointments Cancelled", icon: "/dashboard/stat_cancel.svg" },
] as const;

/**
 * Clicking a stat card's "Review" focuses the appointments table on that metric:
 * it drives the table's status filter and its heading. `status` matches one of
 * STATUS_FILTER_OPTIONS; the card counts and the filtered rows line up because
 * they resolve to the same backend statuses (pending = Upcoming = SCHEDULED +
 * CONFIRMED, completed = Completed, cancelled = Cancelled, total = All status).
 */
export const STAT_CARD_REVIEW: Record<StatKey, { status: string; heading: string }> = {
  total: { status: "All status", heading: "Total Appointments" },
  completed: { status: "Completed", heading: "Completed Appointments" },
  pending: { status: "Upcoming", heading: "Pending Appointments" },
  cancelled: { status: "Cancelled", heading: "Cancelled Appointments" },
};

export const TIMEFRAME_OPTIONS = ["All-Time", "Today", "This Week", "This Month"] as const;
export const STATUS_FILTER_OPTIONS = [
  "All status",
  "Upcoming",
  "On going",
  "Completed",
  "Rescheduled",
  "Cancelled",
] as const;
