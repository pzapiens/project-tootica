"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { apiFetch, ApiError } from "@/lib/api";
import PhoneNumberInput from "@/components/PhoneNumberInput";
import { useExclusiveDropdown } from "@/lib/useExclusiveDropdown";

import { DateInput, parseDmy, toIso } from "../dashboard/DateInput";

/**
 * New Patient Profile modal (Figma "New Patient"). Collects name / DOB / phone /
 * gender / email and creates the patient with `POST /api/patients` (clinic-scoped
 * server-side; the backend assigns the code, e.g. TDG001-P000001).
 */

const LABEL = "font-inter text-[11px] font-normal uppercase tracking-[0.5px] text-[#1e1e24]";
const FIELD =
  "w-full border-b-[1.167px] border-black bg-transparent pb-2 pt-1 font-inter text-[14px] text-[#1e1e24] outline-none placeholder:text-field-placeholder focus:border-[#0077c0]";
const REQ = <span className="text-red-500">*</span>;
const GENDERS = ["M", "F"];

export default function NewPatientModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canCreate =
    name.trim().length > 0 &&
    phone.length === 10 &&
    gender.length > 0 &&
    parseDmy(dob) !== null &&
    !saving;

  async function create() {
    if (!canCreate) return;
    setSaving(true);
    setError("");
    const body: Record<string, string> = { name: name.trim(), phone: `+91${phone}`, gender };
    const parsedDob = parseDmy(dob);
    if (parsedDob) body.dob = toIso(parsedDob);
    if (email.trim()) body.email = email.trim();
    try {
      await apiFetch("/patients", { method: "POST", body: JSON.stringify(body) });
      onCreated();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't create the patient. Please try again.",
      );
      setSaving(false);
    }
  }

  return (
    <div
      className="app-dialog-backdrop fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-3.5"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-patient-title"
        className="app-dialog my-auto flex w-full max-w-[600px] flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_10px_40px_rgba(0,0,0,0.15)]"
      >
        {/* Header */}
        <div className="app-toolbar flex shrink-0 items-center justify-between border-b-[1.167px] border-black/20 px-6 py-5">
          <h2 id="new-patient-title" className="font-manrope text-[23px] font-bold leading-[30px] tracking-[-0.5px] text-[#1e1e24]">
            New Patient Profile
          </h2>
          <button type="button" aria-label="Close" onClick={onClose}>
            <CloseIcon className="size-5 text-[#1e1e24]" />
          </button>
        </div>

        {/* Fields */}
        <div className="flex min-h-0 flex-1 flex-col gap-[24px] overflow-y-auto overscroll-contain px-4 pb-4 pt-3.5 sm:px-6">
          <div className="app-form-grid grid grid-cols-2 gap-x-[27px] gap-y-[20px]">
            <Field label="Patient Name" required>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter patient name"
                className={FIELD}
              />
            </Field>
            <Field label="Date of Birth" required>
              <DateInput value={dob} onChange={setDob} disableFuture />
            </Field>
            <Field label="Phone" required>
              <div className="flex items-center gap-2 border-b-[1.167px] border-black pb-2 pt-1 focus-within:border-[#0077c0]">
                <PhoneNumberInput
                  value={phone}
                  onChange={setPhone}
                  placeholder="0000000000"
                  className="min-w-0 flex-1 bg-transparent font-inter text-[14px] text-[#1e1e24] outline-none placeholder:text-field-placeholder"
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
                placeholder="Enter email address (optional)"
                className={FIELD}
              />
            </Field>
          </div>

          {error && (
            <p role="alert" className="font-inter text-[13px] text-[#ba1a1a]">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="app-toolbar flex shrink-0 items-center justify-end gap-[20px] border-t-[1.167px] border-black/20 px-4 pb-4 pt-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="cursor-pointer font-inter text-[13px] font-semibold uppercase tracking-[0.6px] text-[#1e1e24] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={create}
            disabled={!canCreate}
            className={`rounded-full px-[clamp(13px,3vw,24px)] py-[13px] font-inter text-[13px] font-semibold uppercase tracking-[0.6px] text-white transition-colors ${
              canCreate ? "cursor-pointer bg-[#0077c0] hover:bg-[#0069a8]" : "bg-[#0077c0] opacity-50"
            }`}
          >
            {saving ? "Creating…" : "Create Profile"}
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

/** Gender dropdown (M / F) — matches the Edit Patient / New Appointment forms. */
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
        className="flex w-full items-center justify-between border-b-[1.167px] border-black pb-2 pt-1 text-left focus:border-[#0077c0]"
      >
        <span className={`font-inter text-[14px] ${value ? "text-[#1e1e24]" : "text-field-placeholder"}`}>
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
        <div className="absolute left-0 top-[calc(100%+6px)] z-30 flex w-full flex-col gap-[5px] rounded-[13px] border-[1.167px] border-black bg-white p-[14px] drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
          {GENDERS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-[8px] bg-[#f1f5f9] px-[13px] py-[10px] transition-colors app-option-hover"
            >
              <span className="font-inter text-[14px] font-normal text-[#1e1e24]">{opt}</span>
              <span className="flex size-3 items-center justify-center rounded-full border-[1.167px] border-black">
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
