export interface AppointmentTime {
  h: string;
  m: string;
  p: "AM" | "PM";
}

export function timeToMinutes(time: AppointmentTime): number | null {
  if (!/^\d{1,2}$/.test(time.h) || !/^\d{1,2}$/.test(time.m)) return null;
  const hour = Number(time.h);
  const minute = Number(time.m);
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
  return (hour % 12 + (time.p === "PM" ? 12 : 0)) * 60 + minute;
}

export function isAppointmentDateValid(date: Date | null, allowPast = false, now = new Date()): boolean {
  if (!date || !Number.isFinite(date.getTime())) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return allowPast || date >= today;
}

export function appointmentTimeError(from: AppointmentTime, to: AppointmentTime, skipChecks = false): string | null {
  const empty = !from.h && !from.m && !to.h && !to.m;
  if (empty && skipChecks) return null;
  const start = timeToMinutes(from);
  const end = timeToMinutes(to);
  if (start === null || end === null) return "Enter valid From and To times (hours 1–12 and minutes 00–59).";
  if (start >= end) return "The end time must be after the start time.";
  if (!skipChecks && (start < 9 * 60 || end > 18 * 60)) return "Please select a time range between 9:00 AM and 6:00 PM.";
  return null;
}
