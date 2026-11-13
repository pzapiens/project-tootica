"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { apiFetch, ApiError, type DoctorSummary } from "@/lib/api";
import { saveShifts, type StoredShift } from "@/lib/shifts";
import { useExclusiveDropdown } from "@/lib/useExclusiveDropdown";
import { emailError, phoneDigitsError, phoneWithCc } from "@/lib/validation";
import PhoneNumberInput from "@/components/PhoneNumberInput";

import { SPECIALIZATIONS } from "./constants";
import ShiftBuilder from "./ShiftBuilder";

/**
 * New Doctor Profile modal (Figma "Doctors4 - new"). Collects name / email /
 * phone / specialization and creates a GUEST doctor with `POST /api/doctors`.
 *
 * A guest doctor is a visiting doctor added directly on the Doctors page; the
 * backend provisions a GUEST_DOCTOR user + doctor profile inside the current
 * clinic (no branch picker — creation is already clinic-scoped). Employed
 * doctors with logins are created through the account/staff flow instead.
 */

const LABEL =
  "font-inter text-[11px] font-normal uppercase tracking-[0.5px] text-[#1e1e24]";
const FIELD =
  "w-full border-b-[1.167px] border-black bg-transparent pb-2 pt-1 font-inter text-[14px] text-[#1e1e24] outline-none placeholder:text-field-placeholder focus:border-brand";
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
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [specialization, setSpecialization] = useState("");
  const [shifts, setShifts] = useState<StoredShift[]>([]);
  const [createdDoctorId, setCreatedDoctorId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useLayoutEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) {
        if (createdDoctorId) onCreated();
        else onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, onCreated, saving, createdDoctorId]);

  function close() {
    if (saving) return;
    if (createdDoctorId) onCreated();
    else onClose();
  }

  const phoneValidationError = phoneDigitsError(phone, true)
    ? "Enter a valid 10-digit phone number."
    : null;
  const emailValidationError = emailError(email, false)
    ? "Enter a valid email address, e.g. name@gmail.com."
    : null;
  const showPhoneError = (phoneTouched || phone.length > 0) && phoneValidationError;

  const canCreate =
    name.trim().length > 0 &&
    specialization.length > 0 &&
    !saving;

  async function create() {
    if (!canCreate) return;
    setError("");
    setPhoneTouched(true);

    // Email is optional; only validate the format when one is entered.
    if (emailValidationError || phoneValidationError) return;

    setSaving(true);
    let doctorId = createdDoctorId;
    try {
      if (!doctorId) {
        const doctor = await apiFetch<DoctorSummary>("/doctors", {
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
        doctorId = doctor.id;
        setCreatedDoctorId(doctorId);
      }
      if (shifts.length > 0) await saveShifts(doctorId, shifts);
      onCreated();
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Please try again.";
      setError(
        doctorId
          ? `The profile was created, but shifts could not be saved. Click Save Shifts to retry. ${message}`
          : `Couldn't create the doctor. ${message}`,
      );
      setSaving(false);
    }
  }

  return (
    <div
      className="app-dialog-backdrop fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-3.5"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-doctor-title"
        aria-busy={saving}
        className="app-dialog my-auto flex w-full max-w-[720px] flex-col overflow-hidden rounded-[24px] bg-white shadow-[0_10px_40px_rgba(0,0,0,0.15)]"
      >
        {/* Header */}
        <div className="app-toolbar flex shrink-0 items-center justify-between border-b-[1.167px] border-black/20 px-6 py-5">
          <h2
            id="new-doctor-title"
            className="font-manrope text-[23px] font-semibold leading-[30px] tracking-[-0.5px] text-[#1e1e24]"
          >
            New Doctor Profile
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            disabled={saving}
            className="disabled:opacity-50"
          >
            <CloseIcon className="size-5 text-[#1e1e24]" />
          </button>
        </div>

        {/* Fields */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-3.5 sm:px-6">
          <fieldset
            disabled={saving || !!createdDoctorId}
            className="app-form-grid grid grid-cols-1 gap-x-[29px] gap-y-6 border-0 p-0 sm:grid-cols-2 disabled:opacity-60"
          >
            <Field label="Doctor Name" required>
              <input
                value={name}
                aria-label="Doctor name"
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter doctor name"
                className={FIELD}
              />
            </Field>
            <Field label="Email">
              <input
                value={email}
                type="email"
                aria-label="Email"
                aria-invalid={emailValidationError ? true : undefined}
                aria-describedby={
                  emailValidationError ? "new-doctor-email-error" : undefined
                }
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter email address"
                className={`${FIELD} ${emailValidationError ? "border-[#ba1a1a] focus:border-[#ba1a1a]" : ""}`}
              />
              {emailValidationError && (
                <p
                  id="new-doctor-email-error"
                  role="alert"
                  className="font-inter text-[12px] text-[#ba1a1a]"
                >
                  {emailValidationError}
                </p>
              )}
            </Field>
            <Field label="Phone" required>
              <div
                className={`flex items-center gap-3 border-b-[1.167px] pb-2 pt-1 ${showPhoneError ? "border-[#ba1a1a] focus-within:border-[#ba1a1a]" : "border-black focus-within:border-brand"}`}
              >
                <PhoneNumberInput
                  value={phone}
                  onChange={setPhone}
                  onBlur={() => setPhoneTouched(true)}
                  aria-invalid={showPhoneError ? true : undefined}
                  aria-describedby={
                    showPhoneError ? "new-doctor-phone-error" : undefined
                  }
                  placeholder="0000000000"
                  className="min-w-0 flex-1 bg-transparent font-inter text-[14px] text-[#1e1e24] outline-none placeholder:text-field-placeholder"
                />
              </div>
              {showPhoneError && (
                <p
                  id="new-doctor-phone-error"
                  role="alert"
                  className="font-inter text-[12px] text-[#ba1a1a]"
                >
                  {phoneValidationError}
                </p>
              )}
            </Field>
            <Field label="Specialization" required>
              <SelectDropdown
                value={specialization}
                onChange={setSpecialization}
                options={SPECIALIZATIONS as readonly string[]}
                placeholder="Select"
              />
            </Field>
          </fieldset>

          <div className="-mx-1.5 mt-12">
            <ShiftBuilder
              compact
              shifts={shifts}
              onChange={setShifts}
              disabled={saving}
            />
          </div>

          {error && (
            <p
              role="alert"
              className="mt-4 font-inter text-[13px] text-[#ba1a1a]"
            >
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="app-toolbar flex shrink-0 items-center justify-end gap-[20px] border-t-[1.167px] border-black/20 px-4 pb-4 pt-4 sm:px-6">
          <button
            type="button"
            onClick={close}
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
              canCreate
                ? "cursor-pointer bg-[#0077c0] hover:bg-[#0069a8]"
                : "bg-[#0077c0] opacity-50"
            }`}
          >
            {saving
              ? createdDoctorId
                ? "Saving Shifts…"
                : "Creating…"
              : createdDoctorId
                ? "Save Shifts"
                : "Create Profile"}
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
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
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
        <div className="absolute left-0 top-[calc(100%+6px)] z-30 flex max-h-[260px] w-full flex-col gap-[5px] overflow-y-auto rounded-[13px] border-[1.167px] border-black bg-white p-[14px] drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-[8px] bg-[#f1f5f9] px-[13px] py-[10px] transition-colors app-option-hover"
            >
              <span className="font-inter text-[14px] font-normal text-[#1e1e24]">
                {opt}
              </span>
              <span className="flex size-3 items-center justify-center rounded-full border-[1.167px] border-black">
                {value === opt && (
                  <span className="size-1.5 rounded-full bg-[#1e1e24]" />
                )}
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
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden
    >
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}
