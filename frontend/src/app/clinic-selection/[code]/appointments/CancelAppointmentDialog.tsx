"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { apiFetch, ApiError } from "@/lib/api";

/**
 * Cancel Appointment dialog (Figma "Cancel Appointment?"). Requires a reason,
 * then marks the appointment `CANCELLED` (`PATCH /api/appointments/:id`). The
 * reason is appended to the appointment's notes so the original patient message
 * is kept.
 */
export default function CancelAppointmentDialog({
  appointmentId,
  patientName,
  patientCode,
  existingNotes,
  onClose,
  onDone,
}: {
  appointmentId: string;
  patientName: string;
  patientCode: string;
  existingNotes: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const canCancel = reason.trim().length > 0;

  async function cancel() {
    if (!canCancel) return;
    setBusy(true);
    setError("");
    const note = `Cancellation reason: ${reason.trim()}`;
    const notes = existingNotes.trim() ? `${existingNotes.trim()}\n\n${note}` : note;
    try {
      await apiFetch(`/appointments/${appointmentId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "CANCELLED", notes }),
      });
      onDone();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't cancel the appointment. Please try again.",
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
        aria-labelledby="appt-cancel-title"
        className="my-auto flex w-full max-w-[448px] flex-col gap-[16px] rounded-[15px] border border-[#c2c6d4] bg-white p-[24px] shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)]"
      >
        {/* Header */}
        <div className="flex items-center gap-[12px]">
          <Image
            src="/dashboard/cancel.svg"
            alt=""
            width={24}
            height={24}
            className="size-6 shrink-0"
          />
          <h2 id="appt-cancel-title" className="font-manrope text-[20px] font-semibold leading-[28px] text-[#1e1e24]">
            Cancel Appointment?
          </h2>
        </div>

        {/* Body */}
        <p className="font-inter text-[14px] leading-[20px] text-[#1e1e24]">
          Are you sure you want to cancel the appointment for{" "}
          <span className="font-bold text-[#0077c0]">
            {patientName} ({patientCode})
          </span>
          ? This action cannot be undone.
        </p>

        {/* Reason */}
        <div className="flex flex-col gap-[16px]">
          <label htmlFor="cancel-reason" className="font-manrope text-[14px] leading-[21px] text-[#1e1e24]">
            Reason for cancellation <span className="text-[#ff0000]">*</span>
          </label>
          <textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Please input the reason"
            rows={5}
            className="min-h-[136px] w-full resize-none rounded-[9px] border border-[#c2c6d4] border-b-2 px-[18px] py-[18px] font-inter text-[14px] leading-[21px] text-[#1e1e24] shadow-[0px_1px_2px_rgba(0,0,0,0.05)] outline-none placeholder:text-[#c2c6d4] focus:border-[#0077c0]"
          />
        </div>

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
            onClick={cancel}
            disabled={busy || !canCancel}
            className={`rounded-full bg-[#0077c0] px-[20px] py-[10px] font-inter text-[12px] font-semibold uppercase tracking-[0.6px] text-white shadow-[0px_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#0069a8] ${
              busy || !canCancel ? "cursor-not-allowed opacity-50 hover:bg-[#0077c0]" : ""
            }`}
          >
            {busy ? "Cancelling…" : "Cancel Appointment"}
          </button>
        </div>
      </div>
    </div>
  );
}
