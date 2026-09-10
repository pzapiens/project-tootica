"use client";

import Image from "next/image";
import { useEffect } from "react";

/**
 * "Proceed to Chat?" dialog (Figma "PTC"). Opened from the row overflow menu's
 * **Chat** action: reminds the user to be logged into WhatsApp Web on this PC,
 * then opens WhatsApp for the patient's number on "Proceed to WhatsApp".
 */
export default function AppointmentChatDialog({
  patientName,
  patientCode,
  phone,
  onClose,
}: {
  patientName: string;
  patientCode: string;
  /** The patient's contact number as stored (e.g. "+91 0000000000"). */
  phone: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const digits = phone.replace(/\D/g, "");

  function proceed() {
    if (digits) window.open(`https://wa.me/${digits}`, "_blank", "noopener,noreferrer");
    onClose();
  }

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
        aria-labelledby="appt-chat-title"
        className="my-auto flex w-full max-w-[448px] flex-col gap-[16px] rounded-[15px] border border-[#c2c6d4] bg-white p-[24px] shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)]"
      >
        {/* Header */}
        <div className="flex items-center gap-[12px]">
          <Image
            src="/dashboard/chat.svg"
            alt=""
            width={24}
            height={24}
            className="size-6 shrink-0"
          />
          <h2 id="appt-chat-title" className="font-manrope text-[20px] font-semibold leading-[28px] text-[#1e1e24]">
            Proceed to Chat?
          </h2>
        </div>

        {/* Body */}
        <p className="font-inter text-[14px] leading-[20px] text-[#1e1e24]">
          Please login to the WhatsApp web in this PC before proceeding to chat with{" "}
          <span className="font-bold text-[#0077c0]">
            {patientName} ({patientCode})
          </span>
          .
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
            onClick={proceed}
            disabled={!digits}
            className="rounded-full bg-[#0077c0] px-[20px] py-[10px] font-inter text-[12px] font-semibold uppercase tracking-[0.6px] text-white shadow-[0px_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#0069a8] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Proceed to WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}
