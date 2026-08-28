/**
 * Mock dashboard data matching the Figma "Dashboard1" frame. Swap these for
 * backend fetches (per-clinic analytics + today's appointments) once the
 * endpoints exist.
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

/**
 * Mock appointment counts per timeframe. All-Time and Today are fixed dummy
 * numbers; a custom range is derived from its length so the cards visibly change
 * with the selection. Swap for a real per-window analytics fetch later.
 */
export function resolveStatCounts(tf: Timeframe): StatCounts {
  if (tf.kind === "all") return { total: 238, completed: 200, pending: 20, cancelled: 8 };
  if (tf.kind === "today") return { total: 12, completed: 8, pending: 3, cancelled: 1 };

  const from = new Date(tf.from);
  const to = new Date(tf.to);
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);
  const total = days * 7;
  const completed = Math.round(total * 0.84);
  const cancelled = Math.round(total * 0.03);
  const pending = total - completed - cancelled;
  return { total, completed, pending, cancelled };
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

/** Card metadata; the numeric value comes from the resolved counts. */
export const STAT_CARDS = [
  { key: "total", label: "Total Appointments", icon: "/dashboard/stat_productivity.svg" },
  { key: "completed", label: "Total Appointments Completed", icon: "/dashboard/stat_event_available.svg" },
  { key: "pending", label: "Total Appointments Pending", icon: "/dashboard/stat_hourglass_empty.svg" },
  { key: "cancelled", label: "Total Appointments Cancelled", icon: "/dashboard/stat_cancel.svg" },
] as const;

export const TODAYS_APPOINTMENTS: DashboardAppointment[] = [
  { id: "1", patientName: "John Kenny", treatment: "Teeth Whitening", doctor: "Dr. Vance Jacob", startTime: "09:00 AM", endTime: "09:30 AM", status: "Completed", dob: "14/03/1990", gender: "M", phone: "9876543210", email: "john.kenny@example.com", consultationType: "TEETH WHITENING", leadSource: "INSTAGRAM", message: "Whitening touch-up.", scheduleMode: "datetime" },
  { id: "2", patientName: "Emma Watson", treatment: "Dental Checkup", doctor: "Dr. Aadhinath", startTime: "09:30 AM", endTime: "10:00 AM", status: "Completed", dob: "02/07/1988", gender: "F", phone: "9812345678", email: "emma.watson@example.com", consultationType: "GENERAL CONSULTATION / XRAY", leadSource: "GOOGLE SEARCH", message: "", scheduleMode: "doctor" },
  { id: "3", patientName: "Michael Chang", treatment: "Teeth Aligning", doctor: "Dr. Vance Jacob", startTime: "10:00 AM", endTime: "11:00 AM", status: "On going", dob: "20/11/1995", gender: "M", phone: "9900112233", email: "michael.chang@example.com", consultationType: "ORTHODONTIC TREATMENT BRACES / ALIGNERS", leadSource: "WEBSITE", message: "Aligner review.", scheduleMode: "datetime" },
  { id: "4", patientName: "Gia Moran", treatment: "Root canal", doctor: "Dr. Aadhinath", startTime: "11:00 AM", endTime: "11:45 AM", status: "Upcoming", dob: "09/09/1992", gender: "F", phone: "9765432109", email: "gia.moran@example.com", consultationType: "ROOT CANAL TREATMENT", leadSource: "PATIENT REFERRAL", message: "", scheduleMode: "doctor" },
  { id: "5", patientName: "Lara Croft", treatment: "Teeth Whitening", doctor: "Dr. Vance Jacob", startTime: "11:45 AM", endTime: "12:30 PM", status: "Upcoming", dob: "25/01/1991", gender: "F", phone: "9871234560", email: "lara.croft@example.com", consultationType: "TEETH WHITENING", leadSource: "FACEBOOK", message: "", scheduleMode: "datetime" },
  { id: "6", patientName: "Priya Nair", treatment: "Braces Adjustment", doctor: "Dr. Aadhinath", startTime: "11:00 AM", endTime: "11:30 AM", status: "Rescheduled", dob: "17/05/1998", gender: "F", phone: "9753186420", email: "priya.nair@example.com", consultationType: "ORTHODONTIC TREATMENT BRACES / ALIGNERS", leadSource: "DOCTOR REFERRAL", message: "Braces tightening.", scheduleMode: "doctor" },
  { id: "7", patientName: "David Kim", treatment: "Dental Implant", doctor: "Dr. Vance Jacob", startTime: "02:00 PM", endTime: "03:00 PM", status: "Cancelled", dob: "30/08/1985", gender: "M", phone: "9634871250", email: "david.kim@example.com", consultationType: "IMPLANTS", leadSource: "ONLINE ADS", message: "", scheduleMode: "datetime" },
  { id: "8", patientName: "Nina Patel", treatment: "Scaling & Polishing", doctor: "Dr. Aadhinath", startTime: "02:00 PM", endTime: "02:30 PM", status: "Upcoming", dob: "11/12/1993", gender: "F", phone: "9845127630", email: "nina.patel@example.com", consultationType: "SCALING", leadSource: "WHATSAPP", message: "Scaling and polishing.", scheduleMode: "doctor" },
];

export const TIMEFRAME_OPTIONS = ["All-Time", "Today", "This Week", "This Month"] as const;
export const STATUS_FILTER_OPTIONS = [
  "All status",
  "Upcoming",
  "On going",
  "Completed",
  "Rescheduled",
  "Cancelled",
] as const;
