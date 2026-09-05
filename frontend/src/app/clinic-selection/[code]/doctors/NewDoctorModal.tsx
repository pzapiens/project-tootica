"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { apiFetch, ApiError } from "@/lib/api";
import { useExclusiveDropdown } from "@/lib/useExclusiveDropdown";
import { emailError, phoneDigits, phoneDigitsError, phoneWithCc } from "@/lib/validation";

import { SPECIALIZATIONS } from "./constants";

/**
 * New Doctor Profile modal (Figma "Doctors4 - new"). Collects name / email /
 * phone / specialization and creates a GUEST doctor with `POST /api/doctors`.
 *
 * A guest doctor is a visiting doctor added directly on the Doctors page; the
 * backend provisions a GUEST_DOCTOR user + doctor profile inside the current
 * clinic (no branch picker — creation is already clinic-scoped). Employed
 * doctors with logins are created through the account/staff flow instead.
 */

const LABEL = "font-inter text-[11px] font-normal uppercase tracking-[0.5px] text-[#1e1e24]";
const FIELD =
  "w-full border-b border-[#c2c6d4] bg-transparent pb-2 pt-1 font-inter text-[15px] text-[#1e1e24] outline-none placeholder:text-[#1e1e24]/50 focus:border-[#0077c0]";
const REQ = <span className="text-red-500">*</span>;

export default function NewDoctorModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [specialization, setSpecialization] = useState("");

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
    specialization.length > 0 &&
    !saving;

  async function create() {
    if (!canCreate) return;
    setError("");

    // Email is optional; only validate the format when one is entered.
    const emailErr = emailError(email, false);
    if (emailErr) {
      setError(emailErr);
      return;
    }
    const phoneErr = phoneDigitsError(phone, true);
    if (phoneErr) {
      setError(phoneErr);
      return;
    }

    setSaving(true);
    try {
      await apiFetch("/doctors", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          // Omit when blank — the backend provisions a placeholder for
          // login-less guest doctors.
          email: email.trim() || undefined,
          phone: phoneWithCc(phone),
          specialization,
        }),
      });
      onCreated();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't create the doctor. Please try again.",
      );
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
        aria-labelledby="new-doctor-title"
        className="my-auto flex w-full max-w-[680px] flex-col gap-[28px] rounded-[24px] bg-white p-[36px] shadow-[0_10px_40px_rgba(0,0,0,0.15)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 id="new-doctor-title" className="font-manrope text-[26px] font-bold tracking-[-0.5px] text-[#1e1e24]">
            New Doctor Profile
          </h2>
          <button type="button" aria-label="Close" onClick={onClose}>
            <CloseIcon className="size-6 text-[#1e1e24]" />
          </button>
        </div>

        {/* Fields */}
        <div className="grid grid-cols-2 gap-x-[40px] gap-y-[24px]">
          <Field label="Doctor Name" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter doctor name"
              className={FIELD}
            />
          </Field>
          <Field label="Email">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter email address (optional)"
              className={FIELD}
            />
          </Field>
          <Field label="Phone" required>
            <div className="flex items-center gap-2 border-b border-[#c2c6d4] pb-2 pt-1 focus-within:border-[#0077c0]">
              <span className="shrink-0 font-inter text-[15px] text-[#1e1e24]">+91</span>
              <input
                value={phone}
                onChange={(e) => setPhone(phoneDigits(e.target.value))}
                inputMode="numeric"
                placeholder="0000000000"
                className="min-w-0 flex-1 bg-transparent font-inter text-[15px] text-[#1e1e24] outline-none placeholder:text-[#1e1e24]/50"
              />
            </div>
          </Field>
          <Field label="Specialization" required>
            <SelectDropdown
              value={specialization}
              onChange={setSpecialization}
              options={SPECIALIZATIONS as readonly string[]}
              placeholder="Select"
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
            onClick={create}
            disabled={!canCreate}
            className={`rounded-full px-[28px] py-[13px] font-inter text-[13px] font-semibold uppercase tracking-[0.6px] text-white transition-colors ${
              canCreate ? "bg-[#0077c0] hover:bg-[#0069a8]" : "bg-[#0077c0] opacity-50"
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

/** Underline-styled select opening radio-style option rows (Figma "Select"). */
function SelectDropdown({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  placeholder: string;
}) {
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
          {value || placeholder}
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
        <div className="absolute left-0 top-[calc(100%+6px)] z-30 flex max-h-[260px] w-full flex-col gap-[5px] overflow-y-auto rounded-[15px] border border-[#c2c6d4] bg-white p-[17px] drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
          {options.map((opt) => (
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
