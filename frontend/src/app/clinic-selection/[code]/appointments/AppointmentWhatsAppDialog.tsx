"use client";

import Image from "next/image";
import { useEffect } from "react";

/**
 * "WhatsApp Appointments" popup (opened from the WhatsApp button on the
 * Appointments page). It lists the clinic's PENDING bookings — appointments that
 * arrived via WhatsApp (`SCHEDULED`) and are awaiting the clinic's accept/reject.
 *
 * These rows are deliberately kept OUT of the main appointments table: a WhatsApp
 * booking carries no doctor and no time slot (the patient can't choose either),
 * so it only becomes a real, listed appointment once staff accept it here (→
 * `CONFIRMED`, "Upcoming"). Rejecting discards it. Each row shows just what the
 * clinic needs to triage the request: patient, consultation type, date and
 * age/gender, plus the accept / reject actions.
 */

/** The minimal row shape the popup renders (a subset of the table's row). */
export interface WhatsAppRow {
  id: string;
  code: string;
  patientName: string;
  consultationType: string;
  date: string;
  age: number | null;
  gender: string;
}

const COLS = "grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1.4fr)_minmax(0,1.2fr)]";

export default function AppointmentWhatsAppDialog({
  rows,
  onClose,
  onAccept,
  onReject,
}: {
  rows: WhatsAppRow[];
  onClose: () => void;
  onAccept: (row: WhatsAppRow) => void;
  onReject: (row: WhatsAppRow) => void;
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
      className="animate-fade-in fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="whatsapp-appts-title"
        className="animate-modal-in my-auto flex max-h-[85vh] w-full max-w-[880px] flex-col overflow-hidden rounded-[20px] border border-[#c2c6d4] bg-white shadow-[0px_20px_60px_rgba(0,0,0,0.2)]"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center gap-[14px] border-b border-[rgba(194,198,212,0.6)] px-[28px] py-[22px]">
          <Image src="/dashboard/whatsapp.svg" alt="" width={40} height={40} className="size-[40px] shrink-0" />
          <div className="flex-1">
            <h2 id="whatsapp-appts-title" className="font-manrope text-[22px] font-bold leading-[28px] text-[#1e1e24]">
              WhatsApp Appointments
            </h2>
            <p className="font-inter text-[13px] leading-[18px] text-[#727783]">
              Bookings received via WhatsApp — accept to add them to the appointments list, or reject to discard.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-[#fef3c7] px-[14px] py-[5px] font-inter text-[13px] font-semibold text-[#b45309]">
            {rows.length} pending
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-[36px] shrink-0 items-center justify-center rounded-full text-[#1e1e24] transition-colors hover:bg-[#f1f5f9]"
          >
            <CloseIcon className="size-5" />
          </button>
        </div>

        {/* Table */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Column header — not sticky so a first-row action tooltip paints in
              front of it instead of being covered by the sticky (opaque) header. */}
          <div className={`grid ${COLS} items-center border-b border-[rgba(194,198,212,0.6)] bg-[#f8fafc] px-[28px]`}>
            {["Patient Name", "Consultation Type", "Date", "Age / Gender", "Actions"].map((h) => (
              <span
                key={h}
                className={`py-[15px] font-inter text-[12px] font-semibold uppercase leading-[16px] tracking-[0.5px] text-[#727783] ${
                  h === "Actions" ? "text-center" : ""
                }`}
              >
                {h}
              </span>
            ))}
          </div>

          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-[28px] py-16 text-center">
              <span className="flex size-[52px] items-center justify-center rounded-full bg-[#f1f5f9]">
                <Image src="/dashboard/whatsapp.svg" alt="" width={26} height={26} className="size-[26px] opacity-40" />
              </span>
              <p className="font-inter text-[15px] font-medium text-[#1e1e24]">No pending WhatsApp appointments</p>
              <p className="max-w-[360px] font-inter text-[13px] leading-[18px] text-[#94a3b8]">
                New bookings that patients send through WhatsApp will appear here for you to accept or reject.
              </p>
            </div>
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                className={`grid ${COLS} items-center border-b border-[rgba(194,198,212,0.4)] px-[28px] transition-colors last:border-b-0 hover:bg-[#f8fafc]`}
              >
                <span className="py-[18px] pr-3 font-inter text-[15px] font-medium leading-[21px] text-[#1e1e24]">
                  {row.patientName}
                </span>
                <span className="py-[18px] pr-3 font-inter text-[14px] font-medium leading-[20px] text-[#1e1e24]">
                  {row.consultationType}
                </span>
                <span className="py-[18px] pr-3 font-inter text-[13px] font-medium leading-[18px] text-[#1e1e24]">
                  {row.date}
                </span>
                <span className="py-[18px] pr-3 font-inter text-[14px] font-medium leading-[20px] text-[#1e1e24]">
                  {row.age === null ? "--" : row.age} / {row.gender || "--"}
                </span>
                <div className="flex items-center justify-center gap-[14px] py-[18px]">
                  <button
                    type="button"
                    onClick={() => onAccept(row)}
                    aria-label={`Approve ${row.patientName}'s appointment`}
                    className="group relative flex size-[36px] items-center justify-center text-[#16a34a] transition-transform hover:scale-110"
                  >
                    <CircleGlyph kind="check" className="size-7" />
                    <Tip label="Approve" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onReject(row)}
                    aria-label={`Reject ${row.patientName}'s appointment`}
                    className="group relative flex size-[36px] items-center justify-center text-[#dc2626] transition-transform hover:scale-110"
                  >
                    <CircleGlyph kind="x" className="size-7" />
                    <Tip label="Reject" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/** A circled check / cross glyph for the Approve / Reject row actions — matches
 *  the icon shown in the accept/reject confirmation dialog (AppointmentConfirmDialog). */
function CircleGlyph({ kind, className }: { kind: "check" | "x"; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      {kind === "check" ? <path d="M8.5 12l2.5 2.5L15.5 9" /> : <path d="M9 9l6 6M15 9l-6 6" />}
    </svg>
  );
}

/** Small dark hover tooltip shown above an action button (parent needs `group relative`). */
function Tip({ label }: { label: string }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-[110] -translate-x-1/2 whitespace-nowrap rounded-[6px] bg-[#1e1e24] px-[8px] py-[4px] font-inter text-[12px] font-medium leading-[16px] text-white opacity-0 shadow-[0px_4px_12px_rgba(0,0,0,0.15)] transition-opacity duration-150 group-hover:opacity-100"
    >
      {label}
    </span>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
