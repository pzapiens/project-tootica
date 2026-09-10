"use client";

import Image from "next/image";
import { useEffect } from "react";

/**
 * "Notify the Patient" dialog (Figma "NTP"). Opened from the row overflow menu's
 * **Notify** action: confirms sending an appointment notification to the patient.
 * The send itself is a placeholder until the notification backend lands, so
 * "Notify" currently just confirms and closes.
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
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="appt-notify-title"
        className="my-auto flex w-full max-w-[448px] flex-col gap-[16px] rounded-[15px] border border-[#c2c6d4] bg-white p-[24px] shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)]"
      >
        {/* Header */}
        <div className="flex items-center gap-[12px]">
          <Image
            src="/dashboard/notifications_active.svg"
            alt=""
            width={24}
            height={24}
            className="size-6 shrink-0"
          />
          <h2 id="appt-notify-title" className="font-manrope text-[20px] font-semibold leading-[28px] text-[#1e1e24]">
            Notify the Patient
          </h2>
        </div>

        {/* Body */}
        <p className="font-inter text-[14px] leading-[20px] text-[#1e1e24]">
          Are you sure you want to send a notification related to the appointment{" "}
          <span className="font-bold text-[#0077c0]">{appointmentCode}</span> to{" "}
          <span className="font-bold text-[#0077c0]">{patientName}</span>?
        </p>

        {/* Footer */}
        <div className="flex items-center justify-end gap-[12px] pt-[16px]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#1e1e24] px-[21px] py-[11px] font-inter text-[12px] font-semibold uppercase tracking-[0.6px] text-[#1e1e24] transition-colors hover:border-[#0077c0] hover:text-[#0077c0]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full bg-[#0077c0] px-[20px] py-[10px] font-inter text-[12px] font-semibold uppercase tracking-[0.6px] text-white shadow-[0px_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#0069a8]"
          >
            Notify
          </button>
        </div>
      </div>
    </div>
  );
}
