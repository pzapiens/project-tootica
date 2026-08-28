/**
 * Mock data for the full-calendar view (Figma "Calendar" frames). Appointments
 * are keyed by day-of-month and generated per viewed month so any month shows a
 * representative sample. Swap for a real per-doctor appointments fetch later.
 */

export type CalStatus = "Completed" | "Ongoing" | "Upcoming";

export interface CalAppointment {
  id: string;
  apptId: string;
  patientId: string;
  patientName: string;
  /** Short name shown on the compact month-grid chip (e.g. "M. Chang"). */
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

/** The doctor whose calendar is shown (matches the header subtitle). */
export const CAL_DOCTOR = "Dr. Vance Jacob - Endodontics";

// A fixed sample keyed by a nominal day-of-month; clamped to the real month
// length when generated so late days never fall off short months.
const SAMPLE: Record<number, CalAppointment[]> = {
  2: [
    {
      id: "a-2-1", apptId: "TGD-AT000008", patientId: "TGD-PT000002",
      patientName: "John Kenny", shortName: "J. Kenny", consultationType: "Teeth Whitening",
      doctor: "Dr. Vance", phone: "+91 1234567890", email: "johnkenny@gmail.com",
      start: "09:00 AM", end: "09:30 AM", status: "Completed",
      message: "Routine whitening follow-up.",
    },
  ],
  9: [
    {
      id: "a-9-1", apptId: "TGD-AT000009", patientId: "TGD-PT000001",
      patientName: "Jacob Sam", shortName: "Jacob Sam", consultationType: "Dental Checkup",
      doctor: "Dr. Vance", phone: "+91 9876543210", email: "jacobsam@gmail.com",
      start: "09:00 AM", end: "09:30 AM", status: "Completed",
      message: "General checkup and cleaning.",
    },
  ],
  17: [
    {
      id: "a-17-1", apptId: "TGD-AT000010", patientId: "TGD-PT000003",
      patientName: "John Kenny", shortName: "J. Kenny", consultationType: "Teeth Whitening",
      doctor: "Dr. Vance", phone: "+91 1234567890", email: "johnkenny@gmail.com",
      start: "09:00 AM", end: "09:30 AM", status: "Completed",
      message: "Whitening session completed without issues.",
    },
    {
      id: "a-17-2", apptId: "TGD-AT000011", patientId: "TGD-PT000004",
      patientName: "Michael Chang", shortName: "M. Chang", consultationType: "Root Canal",
      doctor: "Dr. Vance", phone: "+91 1234567890", email: "michaelchang@gmail.com",
      start: "09:30 AM", end: "10:30 AM", status: "Ongoing",
      message:
        "\"Patient experiencing mild sensitivity to cold in lower right quadrant. Requesting evaluation prior to procedure.\"",
    },
    {
      id: "a-17-3", apptId: "TGD-AT000012", patientId: "TGD-PT000005",
      patientName: "Gia Moran", shortName: "G. Moran", consultationType: "Root Canal",
      doctor: "Dr. Vance", phone: "+91 2223334444", email: "giamoran@gmail.com",
      start: "10:30 AM", end: "11:30 AM", status: "Upcoming",
      message: "First root-canal sitting.",
    },
  ],
  18: [
    {
      id: "a-18-1", apptId: "TGD-AT000013", patientId: "TGD-PT000006",
      patientName: "Bruce Wayne", shortName: "B. Wayne", consultationType: "Scaling & Polishing",
      doctor: "Dr. Vance", phone: "+91 5556667777", email: "bwayne@gmail.com",
      start: "08:00 AM", end: "08:30 AM", status: "Upcoming",
      message: "Requested early-morning slot.",
    },
  ],
};

/** Appointments for a given month, keyed by day-of-month (1-based). */
export function getMonthAppointments(year: number, month: number): Record<number, CalAppointment[]> {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const out: Record<number, CalAppointment[]> = {};
  for (const [dayStr, appts] of Object.entries(SAMPLE)) {
    const day = Math.min(Number(dayStr), daysInMonth);
    out[day] = appts;
  }
  return out;
}

/** Time part of a chip label, dropping the AM/PM suffix ("09:00 AM" → "09:00"). */
export function chipTime(start: string): string {
  return start.replace(/\s?[AP]M$/i, "");
}
