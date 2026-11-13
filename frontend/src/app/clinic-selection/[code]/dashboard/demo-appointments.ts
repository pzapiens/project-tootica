import type { AppointmentStatus, DashboardAppointment } from "./mock";

// Display-only samples for Sunrise Family Dental · Kozhikode.
const DEMO_BRANCH_CODE = "SFD001-B001";
const DEMO_ID_PREFIX = "demo-today-sunrise-kozhikode-";
const SAMPLES: Array<[string, string, string, AppointmentStatus]> = [
  ["Arun Menon", "Anjali Nair", "Dental Checkup", "Completed"],
  ["Meera Nair", "Rahul Menon", "Teeth Cleaning", "Completed"],
  ["Nikhil Varma", "Anjali Nair", "Root Canal", "On going"],
  ["Anjali Das", "Rahul Menon", "Dental Filling", "Upcoming"],
  ["Vishnu Krishnan", "Anjali Nair", "Teeth Whitening", "Upcoming"],
  ["Lakshmi Pillai", "Rahul Menon", "Orthodontic Consultation", "Upcoming"],
  ["Fathima Ali", "Anjali Nair", "Tooth Extraction", "Upcoming"],
  ["Adithya Kumar", "Rahul Menon", "Crown Consultation", "Upcoming"],
  ["Diya Thomas", "Anjali Nair", "Dental Checkup", "Cancelled"],
  ["Rohan Joseph", "Rahul Menon", "Teeth Cleaning", "Cancelled"],
];

export function isDemoAppointment(id: string): boolean {
  return id.startsWith(DEMO_ID_PREFIX);
}

export function createTodayDemoAppointments(
  branchCode: string,
  today: Date,
): DashboardAppointment[] {
  if (branchCode !== DEMO_BRANCH_CODE) return [];
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = [pad(today.getDate()), pad(today.getMonth() + 1), today.getFullYear()].join("/");
  const clock = (minutes: number) => {
    const hour = Math.floor(minutes / 60);
    return pad(hour % 12 || 12) + ":" + pad(minutes % 60) + (hour >= 12 ? " PM" : " AM");
  };
  return SAMPLES.map(([patient, doctor, treatment, status], index) => ({
    id: DEMO_ID_PREFIX + (index + 1),
    patientName: patient + " (Demo)",
    treatment,
    doctor: "Dr. " + doctor,
    date,
    startTime: clock(9 * 60 + index * 45),
    endTime: clock(9 * 60 + index * 45 + 30),
    nonMandatory: false,
    status,
    dob: "",
    gender: "",
    phone: "",
    email: "",
    consultationType: treatment,
    leadSource: "",
    message: "Frontend demo appointment",
    bookingChannel: "WEB",
    scheduleMode: "datetime",
  }));
}
