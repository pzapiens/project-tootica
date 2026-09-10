"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { apiFetch, ApiError } from "@/lib/api";
import { markWhatsAppBooking } from "@/lib/bookingChannelStore";

/**
 * Shared confirm dialog for the appointment row actions that need a yes/no
 * prompt (Figma "Appts3 - Accept", "Appts2 - Reject", "Delete Appts"). All three
 * share the common dialog shell; each variant swaps the icon, tone colour and
 * wording. Accept PATCHes the status to CONFIRMED; reject and delete both DELETE
 * the appointment (a rejected WhatsApp booking is discarded, not kept).
 */

export type ConfirmVariant = "accept" | "reject" | "delete";

const VARIANTS: Record<
  ConfirmVariant,
  {
    title: string;
    verb: string;
    confirm: string;
    busy: string;
    tone: string;
    icon: "check" | "x" | "trash";
    /** Exported Material glyph, when the frame uses one instead of a stroked icon. */
    iconSrc?: string;
  }
> = {
  accept: {
    title: "Accept Appointment?",
    verb: "accept",
    confirm: "Accept Appointment",
    busy: "Accepting…",
    tone: "#16a34a",
    icon: "check",
  },
  reject: {
    title: "Reject Appointment?",
    verb: "reject",
    confirm: "Reject Appointment",
    busy: "Rejecting…",
    tone: "#dc2626",
    icon: "x",
  },
  delete: {
    title: "Delete Appointment?",
    verb: "delete",
    confirm: "Delete Appointment",
    busy: "Deleting…",
    tone: "#ff0000",
    icon: "trash",
    iconSrc: "/dashboard/delete.svg",
  },
};

export default function AppointmentConfirmDialog({
  variant,
  appointmentId,
  patientName,
  patientCode,
  localAction,
  onClose,
  onDone,
}: {
  variant: ConfirmVariant;
  appointmentId: string;
  patientName: string;
  patientCode: string;
  /** When set, run this instead of the API call — used for cache-only dummy
   *  bookings that have no backend row (accept/reject just clears the cache). */
  localAction?: () => void | Promise<void>;
  onClose: () => void;
  onDone: () => void;
}) {
  const v = VARIANTS[variant];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      if (localAction) {
        // Cache-only dummy booking — no backend row to mutate; just run the
        // local update (remove it from the cache) so the popup drops the row.
        await localAction();
      } else if (variant === "delete" || variant === "reject") {
        // Reject discards the WhatsApp booking entirely — it isn't kept as a
        // cancelled row, same as an outright delete.
        await apiFetch(`/appointments/${appointmentId}`, { method: "DELETE" });
      } else {
        // Accept confirms the appointment (→ "Upcoming") and remembers it came
        // in via WhatsApp so the form's Booking Channel reads "WhatsApp".
        await apiFetch(`/appointments/${appointmentId}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "CONFIRMED" }),
        });
        markWhatsAppBooking(appointmentId);
      }
      onDone();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : `Couldn't ${v.verb} the appointment. Please try again.`,
      );
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="appt-confirm-title"
        className="my-auto flex w-full max-w-[448px] flex-col gap-[16px] rounded-[15px] border border-[#c2c6d4] bg-white p-[24px] shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)]"
      >
        {/* Header */}
        <div className="flex items-center gap-[12px]">
          {v.iconSrc ? (
            <Image src={v.iconSrc} alt="" width={24} height={24} className="size-6 shrink-0" />
          ) : (
            <Glyph kind={v.icon} className="size-6 shrink-0" style={{ color: v.tone }} />
          )}
          <h2 id="appt-confirm-title" className="font-manrope text-[20px] font-semibold leading-[28px] text-[#1e1e24]">
            {v.title}
          </h2>
        </div>

        {/* Body */}
        <p className="font-inter text-[14px] leading-[20px] text-[#1e1e24]">
          Are you sure you want to {v.verb} the appointment for{" "}
          <span className="font-bold text-[#0077c0]">
            {patientName} ({patientCode})
          </span>
          ? This action cannot be undone.
        </p>

        {error && (
          <p role="alert" className="font-inter text-[13px] text-[#ba1a1a]">
            {error}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-[12px] pt-[16px]">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full border border-[#1e1e24] px-[21px] py-[11px] font-inter text-[12px] font-semibold uppercase tracking-[0.6px] text-[#1e1e24] transition-colors hover:border-[#0077c0] hover:text-[#0077c0] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            style={{ backgroundColor: v.tone }}
            className="rounded-full px-[20px] py-[10px] font-inter text-[12px] font-semibold uppercase tracking-[0.6px] text-white shadow-[0px_1px_1px_rgba(0,0,0,0.05)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? v.busy : v.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

function Glyph({
  kind,
  className,
  style,
}: {
  kind: "check" | "x" | "trash";
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
      {kind === "trash" ? (
        <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
      ) : (
        <>
          <circle cx="12" cy="12" r="9" />
          {kind === "check" ? <path d="M8.5 12l2.5 2.5L15.5 9" /> : <path d="M9 9l6 6M15 9l-6 6" />}
        </>
      )}
    </svg>
  );
}
