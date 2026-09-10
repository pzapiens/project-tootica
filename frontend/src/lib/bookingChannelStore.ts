"use client";

/**
 * Client-only marker for which appointments were booked via WhatsApp, until a
 * real booking-channel column exists on the backend.
 *
 * Appointments the patient booked through WhatsApp arrive as `SCHEDULED`
 * (shown as "Pending"); staff accept them, turning them into `CONFIRMED`
 * ("Upcoming"). Once accepted we can no longer tell them apart from a
 * web-created appointment by status alone, so accepting records the id here.
 * The appointment form then shows "WhatsApp" (frozen, same as "Web") for it.
 */
const KEY = "tootica.whatsappBookings.v1";

function readSet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

/** Remember that an appointment came in via WhatsApp (called on accept). */
export function markWhatsAppBooking(appointmentId: string): void {
  if (typeof window === "undefined") return;
  const set = readSet();
  set.add(appointmentId);
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...set]));
  } catch {
    // Storage full / disabled — channel just falls back to "Web".
  }
}

/**
 * The booking-channel label for the appointment form's (read-only) field.
 * WhatsApp when it's still pending (`SCHEDULED`) or was accepted from pending;
 * otherwise Web.
 */
export function bookingChannelLabel(appointmentId: string, status = ""): "Web" | "WhatsApp" {
  return status === "SCHEDULED" || readSet().has(appointmentId) ? "WhatsApp" : "Web";
}
