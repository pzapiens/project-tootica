"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useExclusiveDropdown } from "@/lib/useExclusiveDropdown";
import { emailError, phoneDigits } from "@/lib/validation";

import AppointmentFormStep, {
  type AppointmentEditResult,
  type AppointmentInitial,
} from "./AppointmentFormStep";
import { DateInput } from "./DateInput";

/**
 * New Appointment flow (Figma "Dashboard3 - NewAppts*" / "Patient Profile
 * Create*"). Steps:
 *  1. search      — "First-Time or Returning Patient?" (find patient by ID/phone)
 *  2. newPatient  — "New Patient Profile" form (when no record exists)
 *  3. created     — "Profile Created" success with the generated Patient ID
 *  4. form        — appointment form (built next; placeholder for now)
 *
 * Portaled to `document.body` so it isn't affected by the dashboard content's
 * `zoom: 0.9` and stays viewport-centered.
 */

interface FoundPatient {
  name: string;
  id: string;
  dob: string;
  gender: string;
  phone: string;
  email: string;
}

// Mock directory. `registered` collects patients created this session so a newly
// created profile becomes searchable (its ID then enables "New Appointment").
const KNOWN: FoundPatient[] = [
  { name: "Connor Mass", id: "TDG-PT00140", dob: "23/12/1999", gender: "M", phone: "9548625874", email: "" },
];
const registered: FoundPatient[] = [];
let nextIdSeq = 141;

function nextPatientId(): string {
  return `TDG-PT${String(nextIdSeq++).padStart(5, "0")}`;
}

function lookup(query: string): FoundPatient | null {
  const s = query.trim().toLowerCase();
  if (!s) return null;
  const digits = s.replace(/\D/g, "");
  return (
    [...KNOWN, ...registered].find(
      (p) => (digits && p.phone.includes(digits)) || p.id.toLowerCase().includes(s),
    ) ?? null
  );
}

type Step = "search" | "newPatient" | "created" | "form";

const TITLES: Record<Step, string> = {
  search: "First-Time or Returning Patient?",
  newPatient: "New Patient Profile",
  created: "New Patient Profile",
  form: "New Appointment",
};

/** Opens the modal straight to a pre-filled form to edit an existing appointment. */
export interface EditAppointment {
  patient: { name: string; dob: string; gender: string; phone: string; email: string };
  initial: AppointmentInitial;
}

export default function NewAppointmentModal({
  onClose,
  edit,
  onSave,
}: {
  onClose: () => void;
  edit?: EditAppointment;
  /** Called with the edited values when Confirm is clicked (edit mode). */
  onSave?: (result: AppointmentEditResult) => void;
}) {
  const [step, setStep] = useState<Step>(edit ? "form" : "search");
  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState(false);
  const [found, setFound] = useState<FoundPatient | null>(null);
  const [selected, setSelected] = useState<FoundPatient | null>(
    edit ? { id: "", ...edit.patient } : null,
  );
  const [created, setCreated] = useState<FoundPatient | null>(null);

  if (typeof document === "undefined") return null;

  function runCheck() {
    const result = lookup(query);
    setChecked(true);
    setFound(result);
    // List the match but don't auto-select it — the user clicks the row to
    // select, which is what enables "New Appointment".
    setSelected(null);
  }

  function handleCreated(patient: FoundPatient) {
    registered.push(patient);
    setCreated(patient);
    setStep("created");
  }

  function resetSearch() {
    setQuery("");
    setChecked(false);
    setFound(null);
    setSelected(null);
    setCreated(null);
  }

  // The header close: on the "Profile Created" page it returns to the search
  // popup (so the user can paste the copied ID); elsewhere it closes the modal.
  function handleHeaderClose() {
    if (step === "created") {
      resetSearch();
      setStep("search");
    } else {
      onClose();
    }
  }

  let body: React.ReactNode;
  if (step === "search") {
    body = (
      <SearchStep
        query={query}
        setQuery={(v) => {
          setQuery(v);
          setChecked(false);
          setFound(null);
          setSelected(null);
        }}
        checked={checked}
        found={found}
        selected={selected}
        onCheck={runCheck}
        onSelect={setSelected}
        onCancel={onClose}
        onCreateProfile={() => setStep("newPatient")}
        onNewAppointment={() => setStep("form")}
      />
    );
  } else if (step === "newPatient") {
    body = (
      <NewPatientStep
        onCancel={() => setStep("search")}
        onCreated={handleCreated}
        makeId={nextPatientId}
      />
    );
  } else if (step === "created" && created) {
    body = <CreatedStep patient={created} />;
  } else if (step === "form" && selected) {
    body = (
      <AppointmentFormStep
        patient={selected}
        initial={edit?.initial}
        onCancel={edit ? onClose : () => setStep("search")}
        onConfirm={(result) => {
          onSave?.(result);
          onClose();
        }}
      />
    );
  } else {
    body = (
      <Placeholder
        title="Appointment details"
        note="Select a patient to continue."
        onBack={() => setStep("search")}
        onClose={onClose}
      />
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="na-title"
        onMouseDown={(e) => e.stopPropagation()}
        className={`my-auto flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-[16px] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.2)] [zoom:1] ${
          step === "form" ? "max-w-[612px]" : "max-w-[540px]"
        }`}
      >
        {/* Header (fixed) */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#c2c6d4]/40 px-[32px] py-[22px]">
          <h2 id="na-title" className="font-inter text-[24px] font-normal tracking-[-0.5px] text-[#1e1e24]">
            {step === "form" && edit ? "Edit Appointment" : TITLES[step]}
          </h2>
          <button type="button" onClick={handleHeaderClose} aria-label="Close">
            <CloseIcon className="size-6 text-[#1e1e24]" />
          </button>
        </div>
        {/* Body (header + footer stay fixed; this region scrolls) */}
        <div className="flex min-h-0 flex-1 flex-col">{body}</div>
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------- Step 1: search */

function SearchStep({
  query,
  setQuery,
  checked,
  found,
  selected,
  onCheck,
  onSelect,
  onCancel,
  onCreateProfile,
  onNewAppointment,
}: {
  query: string;
  setQuery: (v: string) => void;
  checked: boolean;
  found: FoundPatient | null;
  selected: FoundPatient | null;
  onCheck: () => void;
  onSelect: (p: FoundPatient) => void;
  onCancel: () => void;
  onCreateProfile: () => void;
  onNewAppointment: () => void;
}) {
  const canCheck = query.trim().length > 0;
  const canProceed = selected !== null;

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-[24px] overflow-y-auto px-[32px] py-[24px]">
        <div className="rounded-[8px] border border-[#c2c6d4]/30 px-[24px] pb-[24px] pt-[18px] shadow-[0px_3px_10px_rgba(0,0,0,0.02)]">
          <h3 className="font-inter text-[23px] font-normal tracking-[-0.7px] text-[#1e1e24]">
            Patient Search
          </h3>
          <p className="mt-2 font-inter text-[15px] text-[#1e1e24]">
            Verify existing patient records in the system.
          </p>

          <div className="mt-5 flex items-center gap-[13px]">
            <div className="relative flex-1">
              <Image
                src="/dashboard/search.svg"
                alt=""
                width={20}
                height={20}
                className="pointer-events-none absolute left-[16px] top-1/2 size-5 -translate-y-1/2"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by patient ID or registered phone number..."
                aria-label="Search patient by ID or phone"
                className="h-[45px] w-full rounded-full border border-[#c2c6d4] pl-[44px] pr-[40px] font-inter text-[14px] text-[#1e1e24] outline-none placeholder:text-[#1e1e24]/70 focus:border-[#0077c0]"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear"
                  className="absolute right-[12px] top-1/2 -translate-y-1/2"
                >
                  <CloseIcon className="size-5 text-[#1e1e24]" />
                </button>
              )}
            </div>
            <button
              type="button"
              disabled={!canCheck}
              onClick={onCheck}
              className={`h-[38px] rounded-[8px] px-[26px] font-inter text-[15px] font-normal uppercase tracking-[0.5px] text-white drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)] ${
                canCheck ? "bg-[#0077c0] hover:bg-[#0069a8]" : "bg-[#0077c0] opacity-50"
              }`}
            >
              Check
            </button>
          </div>

          <div className="mt-5">
            <p className="font-inter text-[10px] font-normal uppercase tracking-[0.5px] text-[#424752]">
              Search Result
            </p>
            {checked && !found && (
              <p className="mt-2 font-inter text-[13px] text-[#1e1e24]/50">No records found.</p>
            )}
            {found && (
              <button
                type="button"
                onClick={() => onSelect(found)}
                className={`mt-3 flex flex-col items-start gap-1 rounded-[8px] px-4 py-3 text-left transition-colors ${
                  selected
                    ? "border-2 border-[#0077c0] bg-[#f1f5f9]"
                    : "border border-[#c2c6d4] bg-white hover:bg-[#f8fafc]"
                }`}
              >
                <span className={`font-inter text-[14px] font-normal ${selected ? "text-[#0077c0]" : "text-[#1e1e24]"}`}>
                  {found.name}
                </span>
                <span className={`font-inter text-[11px] font-normal tracking-[0.5px] ${selected ? "text-[#0077c0]" : "text-[#1e1e24]"}`}>
                  ID: {found.id}
                </span>
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col items-center gap-[15px] rounded-[13px] border border-[#c2c6d4]/50 bg-[#f1f5f9] p-[27px]">
          <Image src="/dashboard/na_person.svg" alt="" width={40} height={40} className="size-10" />
          <div className="flex flex-col items-center gap-[5px]">
            <p className="font-inter text-[13px] font-normal text-[#1e1e24]">New Patient?</p>
            <p className="max-w-[416px] text-center font-inter text-[11.6px] leading-[16.6px] text-[#1e1e24]">
              If the patient record isn&apos;t found, register a new profile and search using the
              Patient ID above to continue creating the appointment.
            </p>
          </div>
          <button
            type="button"
            onClick={onCreateProfile}
            className="rounded-[6px] border-2 border-[#0077c0] px-[35px] py-[11px] font-inter text-[10px] font-normal uppercase tracking-[0.5px] text-[#0077c0] transition-colors hover:bg-[#0077c0]/[.06]"
          >
            Create New Patient Profile
          </button>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-6 border-t border-[#c2c6d4]/40 px-[32px] py-[20px]">
        <button
          type="button"
          onClick={onCancel}
          className="font-inter text-[12px] font-normal uppercase tracking-[0.6px] text-[#424752]"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canProceed}
          onClick={onNewAppointment}
          className={`flex items-center gap-2 rounded-full px-[25px] py-[12px] font-inter text-[13px] font-normal uppercase tracking-[0.5px] text-white ${
            canProceed ? "bg-[#0077c0] hover:bg-[#0069a8]" : "bg-[#0077c0] opacity-50"
          }`}
        >
          <Image src="/dashboard/add.svg" alt="" width={20} height={20} className="size-5" />
          New Appointment
        </button>
      </div>
    </>
  );
}

/* -------------------------------------------------- Step 2: new patient form */

const GENDER_OPTIONS = ["M", "F"];

function NewPatientStep({
  onCancel,
  onCreated,
  makeId,
}: {
  onCancel: () => void;
  onCreated: (p: FoundPatient) => void;
  makeId: () => string;
}) {
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [email, setEmail] = useState("");

  const emailErr = emailError(email);
  const canCreate = name.trim() && dob.trim() && phone.length === 10 && gender && !emailErr;

  function submit() {
    if (!canCreate) return;
    onCreated({
      name: name.trim(),
      id: makeId(),
      dob: dob.trim(),
      gender,
      phone: phone.trim(),
      email: email.trim(),
    });
  }

  return (
    <>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-x-[32px] gap-y-[24px] overflow-y-auto px-[32px] py-[28px]">
        <Field label="Patient Name" required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter patient name"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Date" required>
          <DateInput value={dob} onChange={setDob} />
        </Field>
        <Field label="Phone" required>
          <div className="flex items-center gap-2 border-b border-[#c2c6d4] pb-2 pt-1 focus-within:border-[#0077c0]">
            <span className="font-inter text-[15px] text-[#1e1e24]">+91</span>
            <span className="h-4 w-px bg-[#c2c6d4]" />
            <input
              value={phone}
              onChange={(e) => setPhone(phoneDigits(e.target.value))}
              placeholder="10-digit mobile number"
              inputMode="numeric"
              type="tel"
              className="min-w-0 flex-1 bg-transparent font-inter text-[15px] text-[#1e1e24] outline-none placeholder:text-[#1e1e24]/70"
            />
          </div>
          {phone.length > 0 && phone.length < 10 && (
            <span className="font-inter text-[12px] text-red-500">
              Enter 10 digits after +91.
            </span>
          )}
        </Field>
        <Field label="Gender" required>
          <GenderDropdown value={gender} onChange={setGender} />
        </Field>
        <Field label="Email">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter email address"
            type="email"
            className={INPUT_CLASS}
          />
          {emailErr && <span className="font-inter text-[12px] text-red-500">{emailErr}</span>}
        </Field>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-6 border-t border-[#c2c6d4]/40 px-[32px] py-[20px]">
        <button
          type="button"
          onClick={onCancel}
          className="font-inter text-[12px] font-normal uppercase tracking-[0.6px] text-[#424752]"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canCreate}
          onClick={submit}
          className={`rounded-full px-[25px] py-[12px] font-inter text-[13px] font-normal uppercase tracking-[0.5px] text-white ${
            canCreate ? "bg-[#0077c0] hover:bg-[#0069a8]" : "bg-[#0077c0] opacity-50"
          }`}
        >
          Create Profile
        </button>
      </div>
    </>
  );
}

const INPUT_CLASS =
  "w-full border-b border-[#c2c6d4] bg-transparent pb-2 pt-1 font-inter text-[15px] text-[#1e1e24] outline-none placeholder:text-[#1e1e24]/70 focus:border-[#0077c0]";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-inter text-[11px] font-normal uppercase tracking-[0.5px] text-[#1e1e24]">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </div>
  );
}

/**
 * Gender dropdown (Figma "Gender Dropdown"): an underline trigger that opens a
 * white panel of radio-style option rows (M / F) on light backgrounds; the
 * selected option shows a filled radio.
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
          {GENDER_OPTIONS.map((opt) => (
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

/* --------------------------------------------------- Step 3: created success */

function CreatedStep({ patient }: { patient: FoundPatient }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(patient.id);
      setCopied(true);
    } catch {
      setCopied(true);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-[32px] py-[28px]">
      <Image src="/dashboard/check_circle.svg" alt="" width={34} height={34} className="size-[34px]" />
      <h3 className="mt-3 font-inter text-[30px] font-normal tracking-[-0.6px] text-[#1e1e24]">
        Profile Created
      </h3>
      <p className="mt-2 max-w-[420px] text-center font-inter text-[14px] leading-[20px] text-[#1e1e24]">
        Patient profile created successfully. They are now registered in the system.
      </p>

      <div className="mt-6 w-[366px] max-w-full">
        <div className="flex flex-col items-center gap-1 rounded-[8px] border border-[#c2c6d4] bg-[#eff4ff] p-[25px]">
          <span className="font-inter text-[12px] uppercase tracking-[0.6px] text-[#1e1e24]">
            Patient ID
          </span>
          <div className="flex items-center gap-2">
            <span className="font-inter text-[18px] font-normal text-[#1e1e24]">{patient.id}</span>
            <button type="button" onClick={copy} aria-label="Copy patient ID">
              <Image src="/dashboard/content_copy.svg" alt="" width={24} height={24} className="size-6" />
            </button>
          </div>
        </div>
        {copied && (
          <div className="mt-3 flex items-center justify-center gap-1.5">
            <Image src="/dashboard/check_circle.svg" alt="" width={20} height={20} className="size-5" />
            <span className="font-inter text-[12px] tracking-[0.6px] text-[#1e1e24]">
              Patient id copied successfully
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- placeholder */

function Placeholder({
  title,
  note,
  onBack,
  onClose,
}: {
  title: string;
  note: string;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-6 px-[32px] py-[40px]">
      <div className="flex flex-col items-center gap-2 text-center">
        <h3 className="font-inter text-[20px] font-normal text-[#1e1e24]">{title}</h3>
        <p className="font-inter text-[14px] text-[#1e1e24]/60">{note}</p>
      </div>
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-[#c2c6d4] px-6 py-3 font-inter text-[14px] font-normal text-[#1e1e24] hover:bg-black/[.02]"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-[#0077c0] px-6 py-3 font-inter text-[14px] font-normal text-white hover:bg-[#0069a8]"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className} aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
