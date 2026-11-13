"use client";

import Image from "next/image";
import { useEffect } from "react";

/**
 * SMS reminder confirmation, opened from the appointment row's overflow menu.
 * Delivery remains a placeholder until the appointment SMS backend is connected;
 * confirming currently closes the dialog.
 */
export default function AppointmentNotifyDialog({
  patientName,
  appointmentCode,
  onConfirm,
  onClose,
}: {
  patientName: string;
  /** The appointment's display code (e.g. "TDG-AT000239"). */
  appointmentCode: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="app-dialog-backdrop fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/40 p-3.5"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="appt-notify-title"
        className="app-dialog my-auto flex w-full max-w-[448px] flex-col gap-[13px] rounded-[13px] border-[1.167px] border-black bg-white p-[clamp(13px,3vw,20px)] shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)]"
      >
        {/* Header */}
        <div className="flex items-center gap-[12px]">
          <Image
            src="/dashboard/notifications_active.svg"
            alt=""
            width={24}
            height={24}
            className="size-5 shrink-0"
          />
          <h2 id="appt-notify-title" className="font-manrope text-[18px] font-semibold leading-[25px] text-[#1e1e24]">
            Send SMS Reminder
          </h2>
        </div>

        {/* Body */}
        <p className="font-inter text-[14px] leading-[20px] text-[#1e1e24]">
          Are you sure you want to send an SMS reminder for appointment{" "}
          <span className="font-bold text-[#0077c0]">{appointmentCode}</span> to{" "}
          <span className="font-bold text-[#0077c0]">{patientName}</span>?
        </p>

        {/* Footer */}
        <div className="app-toolbar flex items-center justify-end gap-[12px] pt-[13px]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border-[1.167px] border-black px-[18px] py-[11px] font-inter text-[12px] font-semibold uppercase tracking-[0.6px] text-[#1e1e24] transition-colors hover:text-[#0077c0]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full bg-[#0077c0] px-[17px] py-[10px] font-inter text-[12px] font-semibold uppercase tracking-[0.6px] text-white shadow-[0px_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#0069a8]"
          >
            Send SMS Reminder
          </button>
        </div>
      </div>
    </div>
  );
}
