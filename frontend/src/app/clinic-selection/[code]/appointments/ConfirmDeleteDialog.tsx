"use client";

import { useEffect } from "react";

/**
 * Generic "are you sure?" prompt shown before any destructive delete that isn't
 * already covered by a purpose-built dialog. Mirrors the app's other delete
 * prompts (e.g. DeleteShiftDialog / DeleteDoctorDialog): a small centered card
 * with a red trash glyph, a Cancel button and a red confirm button.
 *
 * Sits at a high z-index so it stacks above any dialog that opened it (e.g. the
 * Payment Management modal).
 */
export default function ConfirmDeleteDialog({
  title,
  message,
  confirmLabel = "Delete",
  onClose,
  onConfirm,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: () => void;
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
      className="fixed inset-0 z-[130] flex items-center justify-center overflow-y-auto bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        className="my-auto flex w-full max-w-[460px] flex-col gap-[20px] rounded-[20px] bg-white p-[28px] shadow-[0_10px_40px_rgba(0,0,0,0.15)]"
      >
        <div className="flex items-center gap-[10px]">
          <TrashIcon className="size-6 text-[#ba1a1a]" />
          <h2 id="confirm-delete-title" className="font-manrope text-[22px] font-bold tracking-[-0.4px] text-[#1e1e24]">
            {title}
          </h2>
        </div>
        <p className="font-inter text-[15px] leading-[23px] text-[#1e1e24]">{message}</p>

        <div className="flex items-center justify-end gap-[16px]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border-[1.2px] border-[#c2c6d4] px-[24px] py-[11px] font-inter text-[13px] font-semibold uppercase tracking-[0.6px] text-[#1e1e24] transition-colors hover:border-[#0077c0]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full bg-[#ba1a1a] px-[24px] py-[11px] font-inter text-[13px] font-semibold uppercase tracking-[0.6px] text-white transition-opacity hover:opacity-90"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
    </svg>
  );
}
