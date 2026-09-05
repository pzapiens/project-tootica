"use client";

import { useEffect, useState } from "react";

import { apiFetch, ApiError, type DoctorSummary } from "@/lib/api";

/**
 * Delete Doctor Profile confirm dialog (Figma "Doctors" — row trash action).
 * Removes the doctor profile with `DELETE /api/doctors/:id`.
 */
export default function DeleteDoctorDialog({
  doctor,
  onClose,
  onDeleted,
}: {
  doctor: DoctorSummary;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/doctors/${doctor.id}`, { method: "DELETE" });
      onDeleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't delete the doctor. Please try again.");
      setBusy(false);
    }
  }

  const label = doctor.name ? `Dr. ${doctor.name}` : "this doctor";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-doctor-title"
        className="my-auto flex w-full max-w-[460px] flex-col gap-[20px] rounded-[20px] bg-white p-[28px] shadow-[0_10px_40px_rgba(0,0,0,0.15)]"
      >
        <div className="flex items-center gap-[10px]">
          <TrashIcon className="size-6 text-[#ba1a1a]" />
          <h2 id="delete-doctor-title" className="font-manrope text-[22px] font-bold tracking-[-0.4px] text-[#1e1e24]">
            Delete Doctor Profile?
          </h2>
        </div>
        <p className="font-inter text-[15px] leading-[23px] text-[#1e1e24]">
          Are you sure you want to delete the profile of{" "}
          <span className="font-semibold text-[#0077c0]">
            {label} ({doctor.code ?? "—"})
          </span>
          ? This action cannot be undone.
        </p>

        {error && (
          <p role="alert" className="font-inter text-[13px] text-[#ba1a1a]">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-[16px]">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full border-[1.2px] border-[#c2c6d4] px-[24px] py-[11px] font-inter text-[13px] font-semibold uppercase tracking-[0.6px] text-[#1e1e24] transition-colors hover:border-[#0077c0] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="rounded-full bg-[#ba1a1a] px-[24px] py-[11px] font-inter text-[13px] font-semibold uppercase tracking-[0.6px] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Delete Profile"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
    </svg>
  );
}
