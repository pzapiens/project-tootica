"use client";

import Image from "next/image";
import { useEffect } from "react";

/**
 * Additional Info dialog (Figma "Info"). A read-only view of the appointment's
 * patient message/notes, opened from the row overflow menu's **Info** action.
 */
export default function AppointmentInfoDialog({
  patientName,
  patientCode,
  message,
  onClose,
}: {
  patientName: string;
  patientCode: string;
  message: string;
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
        aria-labelledby="appt-info-title"
        className="my-auto flex w-full max-w-[448px] flex-col gap-[16px] rounded-[15px] border border-[#c2c6d4] bg-white p-[24px] shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)]"
      >
        {/* Header */}
        <div className="flex items-center gap-[12px]">
          <Image
            src="/dashboard/error.svg"
            alt=""
            width={24}
            height={24}
            className="size-6 shrink-0"
          />
          <h2 id="appt-info-title" className="font-manrope text-[20px] font-semibold leading-[28px] text-[#1e1e24]">
            Additional Info
          </h2>
        </div>

        {/* Intro + divider */}
        <div className="flex flex-col gap-[15px]">
          <p className="font-inter text-[14px] leading-[20px] text-[#1e1e24]">
            Please find the message of{" "}
            <span className="font-bold text-[#0077c0]">
              {patientName} ({patientCode})
            </span>{" "}
            below.
          </p>
          <div className="h-px w-full bg-[#c2c6d4]" />
        </div>

        {/* Message */}
        <div className="flex flex-col gap-[14px]">
          <span className="font-inter text-[11px] font-semibold tracking-[0.55px] text-[#1e1e24]">
            Message
          </span>
          <div className="rounded-[10px] border border-[rgba(194,198,212,0.5)] bg-white p-[15px]">
            <p className="whitespace-pre-wrap font-inter text-[13px] italic leading-[18px] text-[#1e1e24]">
              {message.trim() ? `"${message.trim()}"` : "No message provided."}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#1e1e24] px-[21px] py-[11px] font-inter text-[12px] font-semibold uppercase tracking-[0.6px] text-[#1e1e24] transition-colors hover:border-[#0077c0] hover:text-[#0077c0]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
