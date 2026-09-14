"use client";

import { apiFetch, type AppointmentListItem } from "@/lib/api";

/**
 * Single source of truth for every WhatsApp touchpoint in the app, so switching
 * from the current click-to-chat links to the real **Meta WhatsApp Cloud API**
 * later means editing only this file — no dialog or page changes.
 *
 * Two seams live here:
 *  1. Outbound chat links ({@link whatsappChatUrl} / {@link openWhatsAppChat}) —
 *     today they open wa.me / WhatsApp Web; later they can point at a Meta-hosted
 *     conversation or trigger a Cloud API "send message" call instead.
 *  2. Inbound bookings ({@link postWhatsAppBooking}) — today the app/tests post a
 *     normalised booking to the backend's `/appointments/whatsapp/inbound`
 *     endpoint; later Meta's webhook will call that same endpoint server-side, so
 *     the appointment-creation path is already the final one.
 */

/**
 * Base for click-to-chat deep links. Overridable via
 * `NEXT_PUBLIC_WHATSAPP_LINK_BASE` (e.g. to point at a branded wa.me/business
 * short link). Defaults to the public wa.me endpoint.
 */
const CHAT_LINK_BASE =
  process.env.NEXT_PUBLIC_WHATSAPP_LINK_BASE?.replace(/\/+$/, "") || "https://wa.me";

/** Digits-only phone (drops "+", spaces, dashes) — what wa.me expects. */
function toDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Click-to-chat URL for a patient's number, or null when there's no usable
 * number. Optionally prefills a message (`?text=`). Swap the body here for a Meta
 * Cloud API conversation link when that integration lands.
 */
export function whatsappChatUrl(phone: string, message?: string): string | null {
  const digits = toDigits(phone);
  if (!digits) return null;
  const query = message ? `?text=${encodeURIComponent(message)}` : "";
  return `${CHAT_LINK_BASE}/${digits}${query}`;
}

/** Open a WhatsApp chat for the number in a new tab. No-op without a number. */
export function openWhatsAppChat(phone: string, message?: string): boolean {
  const url = whatsappChatUrl(phone, message);
  if (!url) return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

/** The normalised inbound booking the backend webhook accepts. */
export interface WhatsAppBookingInput {
  /** Patient's WhatsApp number — how the backend matches/creates the patient. */
  phone: string;
  name?: string;
  email?: string;
  consultationType?: string;
  notes?: string;
}

/**
 * Feed a WhatsApp booking into the backend (creates a pending, WHATSAPP-channel
 * appointment that surfaces in the "WhatsApp Appointments" popup). Used for
 * manual/dev ingestion; in production Meta's webhook hits this endpoint directly.
 */
export function postWhatsAppBooking(input: WhatsAppBookingInput): Promise<AppointmentListItem> {
  return apiFetch<AppointmentListItem>("/appointments/whatsapp/inbound", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * The booking-channel label for the appointment form's read-only field, derived
 * straight from the backend `bookingChannel` (no client-side guessing).
 */
export function bookingChannelLabel(channel: AppointmentListItem["bookingChannel"]): "Web" | "WhatsApp" {
  return channel === "WHATSAPP" ? "WhatsApp" : "Web";
}
