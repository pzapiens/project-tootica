"use client";

import Image from "next/image";
import { useEffect } from "react";

/**
 * "Proceed to Call?" dialog (Figma "Appts - Call"). Opened from the row overflow
 * menu's **Call** action: shows the patient's contact number and lets the user
 * place the call by tapping the number (a `tel:` link) or dismiss with Cancel.
 */
export default function AppointmentCallDialog({
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
        aria-labelledby="appt-call-title"
        className="my-auto flex w-full max-w-[448px] flex-col gap-[16px] rounded-[15px] border border-[#c2c6d4] bg-white p-[24px] shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)]"
      >
        {/* Header */}
        <div className="flex items-center gap-[12px]">
          <Image
            src="/dashboard/phone_in_talk.svg"
            alt=""
            width={24}
            height={24}
            className="size-6 shrink-0"
          />
          <h2 id="appt-call-title" className="font-manrope text-[20px] font-semibold leading-[28px] text-[#1e1e24]">
            Proceed to Call?
          </h2>
        </div>

        {/* Contact number */}
        <div className="flex flex-col gap-[15px]">
          <p className="font-inter text-[14px] leading-[20px] text-[#1e1e24]">
            Please find the contact number of{" "}
            <span className="font-bold text-[#0077c0]">
              {patientName} ({patientCode})
            </span>{" "}
            below.
          </p>
          <div className="h-px w-full bg-[#c2c6d4]" />
          {digits ? (
            <a
              href={`tel:${digits}`}
              onClick={onClose}
              className="font-inter text-[14px] font-bold leading-[20px] text-[#1e1e24] transition-colors hover:text-[#0077c0]"
            >
              {phone}
            </a>
          ) : (
            <span className="font-inter text-[14px] font-bold leading-[20px] text-[#1e1e24]">
              No number on file.
            </span>
          )}
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
