"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { apiFetch, ApiError } from "@/lib/api";
import { phoneDigits } from "@/lib/validation";
import { useExclusiveDropdown } from "@/lib/useExclusiveDropdown";

import { DateInput, parseDmy, toIso } from "../dashboard/DateInput";
import type { PatientRow } from "./PatientsClient";

/**
 * Edit Patient Profile modal (Figma "Edit Patient"). Pre-filled from the row and
 * saved with `PATCH /api/patients/:id`. Name is required; email is optional.
 */

const LABEL = "font-inter text-[11px] font-normal uppercase tracking-[0.5px] text-[#1e1e24]";
const FIELD =
  "w-full border-b border-[#c2c6d4] bg-transparent pb-2 pt-1 font-inter text-[15px] text-[#1e1e24] outline-none placeholder:text-[#1e1e24]/50 focus:border-[#0077c0]";
const REQ = <span className="text-red-500">*</span>;
const GENDERS = ["M", "F"];

const pad2 = (n: number) => String(n).padStart(2, "0");

/** ISO datetime → "dd/mm/yyyy" (UTC — dob is stored at UTC midnight). */
function isoToDmy(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

export default function EditPatientModal({
  patient,
  onClose,
  onSaved,
}: {
  patient: PatientRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(patient.name);
  const [dob, setDob] = useState(isoToDmy(patient.dob));
  const [phone, setPhone] = useState(phoneDigits(patient.phone ?? ""));
  const [gender, setGender] = useState(patient.gender ?? "");
  const [email, setEmail] = useState(patient.email ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canSave = name.trim().length > 0 && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError("");
    // PATCH is partial — only send the fields the form owns. Email must be a
    // valid address when present, so omit it entirely when left blank.
    const body: Record<string, string> = { name: name.trim() };
    // dob is "dd/mm/yyyy"; send the backend an ISO date only when it parses.
    const parsedDob = parseDmy(dob);
    if (parsedDob) body.dob = toIso(parsedDob);
    if (phone) body.phone = `+91${phone}`;
    if (gender) body.gender = gender;
    if (email.trim()) body.email = email.trim();
    try {
      await apiFetch(`/patients/${patient.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't update the patient. Please try again.");
      setSaving(false);
    }
  }

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
        aria-labelledby="edit-patient-title"
        className="my-auto flex w-full max-w-[600px] flex-col gap-[28px] rounded-[24px] bg-white p-[36px] shadow-[0_10px_40px_rgba(0,0,0,0.15)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 id="edit-patient-title" className="font-manrope text-[26px] font-bold tracking-[-0.5px] text-[#1e1e24]">
            Edit Patient Profile
          </h2>
          <button type="button" aria-label="Close" onClick={onClose}>
            <CloseIcon className="size-6 text-[#1e1e24]" />
          </button>
        </div>

        {/* Fields */}
        <div className="grid grid-cols-2 gap-x-[32px] gap-y-[24px]">
          <Field label="Patient Name" required>
            <input value={name} onChange={(e) => setName(e.target.value)} className={FIELD} />
          </Field>
          <Field label="Date of Birth" required>
            <DateInput value={dob} onChange={setDob} />
          </Field>
          <Field label="Phone" required>
            <div className="flex items-center gap-2 border-b border-[#c2c6d4] pb-2 pt-1 focus-within:border-[#0077c0]">
              <span className="shrink-0 font-inter text-[15px] text-[#1e1e24]">+91</span>
              <input
                value={phone}
                onChange={(e) => setPhone(phoneDigits(e.target.value))}
                inputMode="numeric"
                className="min-w-0 flex-1 bg-transparent font-inter text-[15px] text-[#1e1e24] outline-none"
              />
            </div>
          </Field>
          <Field label="Gender" required>
            <GenderDropdown value={gender} onChange={setGender} />
          </Field>
          <Field label="Email">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter email address"
              className={FIELD}
            />
          </Field>
        </div>

        {error && (
          <p role="alert" className="font-inter text-[13px] text-[#ba1a1a]">
            {error}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-[24px]">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="font-inter text-[13px] font-semibold uppercase tracking-[0.6px] text-[#1e1e24] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className={`rounded-full px-[28px] py-[13px] font-inter text-[13px] font-semibold uppercase tracking-[0.6px] text-white transition-colors ${
              canSave ? "bg-[#0077c0] hover:bg-[#0069a8]" : "bg-[#0077c0] opacity-50"
            }`}
          >
            {saving ? "Saving…" : "Update Profile"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className={LABEL}>
        {label} {required && REQ}
      </span>
      {children}
    </div>
  );
}

/**
 * Gender dropdown — same as the New Appointment patient form (Figma "Gender
 * Dropdown"): an underline trigger opening radio-style option rows (M / F) on
 * light backgrounds, with a filled radio on the selected option.
 */
function GenderDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useExclusiveDropdown();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [setOpen]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between border-b border-[#c2c6d4] pb-2 pt-1 text-left focus:border-[#0077c0]"
      >
        <span className={`font-inter text-[15px] ${value ? "text-[#1e1e24]" : "text-[#1e1e24]/70"}`}>
          {value || "Select"}
        </span>
        <Image
          src="/dashboard/chevron_dark.svg"
          alt=""
          width={20}
          height={20}
          className={`size-5 transition-transform ${open ? "rotate-90" : "-rotate-90"}`}
        />
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-30 flex w-full flex-col gap-[5px] rounded-[15px] border border-[#c2c6d4] bg-white p-[17px] drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
          {GENDERS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-[8px] bg-[#f1f5f9] px-[16px] py-[10px] transition-colors hover:bg-[#e9eef4]"
            >
              <span className="font-inter text-[14px] font-normal text-[#1e1e24]">{opt}</span>
              <span className="flex size-3 items-center justify-center rounded-full border border-[#1e1e24]">
                {value === opt && <span className="size-1.5 rounded-full bg-[#1e1e24]" />}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}
