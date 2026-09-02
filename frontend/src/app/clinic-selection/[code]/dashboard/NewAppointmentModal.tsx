"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  apiFetch,
  ApiError,
  type AppointmentStatus,
  type DoctorSummary,
  type Patient,
} from "@/lib/api";
import { notifyAppointmentsChanged } from "@/lib/appointmentsBus";
import { useExclusiveDropdown } from "@/lib/useExclusiveDropdown";
import { emailError, phoneDigits, phoneLocalPart, phoneWithCc } from "@/lib/validation";

import AppointmentFormStep, {
  type AppointmentEditResult,
  type AppointmentInitial,
} from "./AppointmentFormStep";
import { DateInput, parseDmy } from "./DateInput";

/**
 * New Appointment flow (Figma "Dashboard3 - NewAppts*" / "Patient Profile
 * Create*"). Steps:
 *  1. search      — "First-Time or Returning Patient?" (find patient by ID/phone)
 *  2. newPatient  — "New Patient Profile" form (when no record exists)
 *  3. created     — "Profile Created" success with the Patient ID
 *  4. form        — appointment form
 *
 * Search and creation hit the real backend (`/api/patients`, `/api/doctors`,
 * `/api/appointments`). Portaled to `document.body` so it isn't affected by the
 * dashboard content's `zoom: 0.9` and stays viewport-centered.
 */

interface FoundPatient {
  name: string;
  /** Database id (used for the appointment payload). */
  id: string;
  /** Human-friendly code shown to the user (e.g. "PAT-000001"). */
  code: string;
  dob: string;
  gender: string;
  phone: string;
  email: string;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** ISO date → "dd/mm/yyyy" (UTC, since dob is stored at UTC midnight). */
function isoToDmy(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/** "dd/mm/yyyy" → "yyyy-mm-dd" for the backend (or undefined if blank/invalid). */
function dmyToIso(dmy: string): string | undefined {
  const d = parseDmy(dmy);
  if (!d) return undefined;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Backend patient → the modal's display shape. */
function toFound(p: Patient): FoundPatient {
  return {
    id: p.id,
    code: p.code ?? p.id,
    name: p.name,
    dob: isoToDmy(p.dob),
    gender: p.gender ?? "",
    phone: phoneLocalPart(p.phone),
    email: p.email ?? "",
  };
}


/** The form's status labels → backend appointment status enum. */
const STATUS_TO_BACKEND: Record<string, AppointmentStatus> = {
  Upcoming: "SCHEDULED",
  Confirmed: "CONFIRMED",
  Completed: "COMPLETED",
  Cancelled: "CANCELLED",
  "No Show": "NO_SHOW",
};

/** Combine a `dd/mm/yyyy` date + `hh:mm AM` clock into an ISO datetime. */
function combineDateTime(dmy: string, clock: string, fallbackHour: number): string | null {
  const d = parseDmy(dmy);
  if (!d) return null;
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(clock.trim());
  let hh = fallbackHour;
  let mm = 0;
  if (m) {
    hh = Number(m[1]) % 12;
    if (/pm/i.test(m[3])) hh += 12;
    mm = Number(m[2]);
  }
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
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
  /** Appointment id — the target of the update PATCH. */
  id: string;
  patient: { name: string; dob: string; gender: string; phone: string; email: string };
  initial: AppointmentInitial;
}

export default function NewAppointmentModal({
  onClose,
  edit,
}: {
  onClose: () => void;
  edit?: EditAppointment;
}) {
  const [step, setStep] = useState<Step>(edit ? "form" : "search");
  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState(false);
  const [results, setResults] = useState<FoundPatient[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<FoundPatient | null>(
    edit ? { id: "", code: "", ...edit.patient } : null,
  );
  const [created, setCreated] = useState<FoundPatient | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<DoctorSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Load the clinic's patients (for search) and doctors (for the form).
  useEffect(() => {
    let active = true;
    apiFetch<Patient[]>("/patients")
      .then((list) => active && setPatients(list))
      .catch(() => {})
      .finally(() => active && setLoadingPatients(false));
    apiFetch<DoctorSummary[]>("/doctors")
      .then((list) => active && setDoctors(list))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Doctors with a resolved name, as {id, name} options for the form's pickers
  // and availability checks.
  const doctorOptions = useMemo(
    () =>
      doctors
        .filter((d): d is typeof d & { name: string } => Boolean(d.name))
        .map((d) => ({ id: d.id, name: d.name })),
    [doctors],
  );
  const doctorByName = useMemo(
    () => new Map(doctorOptions.map((d) => [d.name, d.id])),
    [doctorOptions],
  );

  // Auto-run the patient search as the user types (debounced) — no "Check" click
  // needed. Lists every match; the user clicks a row to select it, which is what
  // enables "New Appointment". The synchronous resets here derive result state
  // from the (cleared) query — an intentional pattern for a debounced search.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const s = query.trim().toLowerCase();
    if (!s) {
      setChecked(false);
      setResults([]);
      setSearching(false);
      return;
    }
    // Show the spinner while we debounce and/or the patient list is still loading.
    setSearching(true);
    const timer = setTimeout(() => {
      // Hold the spinner until the list has actually loaded, so we don't flash a
      // false "No records found." over an empty in-flight list.
      if (loadingPatients) return;
      const digits = s.replace(/\D/g, "");
      const matches = patients.filter(
        (p) =>
          (digits.length > 0 && (p.phone ?? "").replace(/\D/g, "").includes(digits)) ||
          p.id.toLowerCase().includes(s) ||
          p.name.toLowerCase().includes(s),
      );
      setChecked(true);
      setResults(matches.map(toFound));
      setSearching(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, patients, loadingPatients]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (typeof document === "undefined") return null;

  // POST a new patient, make it searchable immediately, and show the success step.
  async function handleCreatePatient(input: {
    name: string;
    dob: string;
    phone: string;
    gender: string;
    email: string;
  }): Promise<void> {
    const patient = await apiFetch<Patient>("/patients", {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        phone: phoneWithCc(input.phone) || undefined,
        email: input.email || undefined,
        gender: input.gender || undefined,
        dob: dmyToIso(input.dob),
      }),
    });
    setPatients((prev) => [patient, ...prev]);
    setCreated(toFound(patient));
    setStep("created");
  }

  // Resolve the doctor id + start/end datetimes shared by create and update.
  function buildBooking(result: AppointmentEditResult): {
    doctorId: string;
    start: string;
    end: string;
  } {
    const doctorId =
      result.doctorId || (result.doctor && doctorByName.get(result.doctor)) || doctors[0]?.id;
    if (!doctorId) throw new Error("No doctor available to assign.");
    const hasTime = Boolean(result.startTime);
    const start = combineDateTime(result.date, result.startTime, hasTime ? 9 : 0);
    if (!start) throw new Error("Pick a valid appointment date.");
    let end: string;
    if (!hasTime) {
      // No time picked (non-mandatory) → zero-duration; the UI shows this as "--".
      end = start;
    } else {
      const chosen = result.endTime ? combineDateTime(result.date, result.endTime, 9) : null;
      end =
        !chosen || new Date(chosen) <= new Date(start)
          ? new Date(new Date(start).getTime() + 30 * 60_000).toISOString()
          : chosen;
    }
    return { doctorId, start, end };
  }

  // POST a new appointment for the selected patient.
  async function createAppointment(result: AppointmentEditResult): Promise<void> {
    if (!selected) throw new Error("Select a patient first.");
    const { doctorId, start, end } = buildBooking(result);
    await apiFetch("/appointments", {
      method: "POST",
      body: JSON.stringify({
        patientId: selected.id,
        doctorId,
        startTime: start,
        endTime: end,
        status: STATUS_TO_BACKEND[result.status] ?? "SCHEDULED",
        // Consultation type is now a structured field; `notes` holds the free
        // message only.
        consultationType: result.consultationType || undefined,
        sourceOfEnquiry: result.leadSource || undefined,
        notes: result.message || undefined,
        // When ticked, the backend skips business-hours + conflict checks.
        nonMandatory: result.nonMandatory,
      }),
    });
  }

  // PATCH an existing appointment (edit mode). Fields are sent as-is so clearing
  // one persists; the backend update just writes what it's given.
  async function updateAppointment(result: AppointmentEditResult): Promise<void> {
    if (!edit) throw new Error("No appointment to update.");
    const { doctorId, start, end } = buildBooking(result);
    await apiFetch(`/appointments/${edit.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        doctorId,
        startTime: start,
        endTime: end,
        status: STATUS_TO_BACKEND[result.status] ?? "SCHEDULED",
        consultationType: result.consultationType,
        sourceOfEnquiry: result.leadSource,
        notes: result.message,
      }),
    });
  }

  function resetSearch() {
    setQuery("");
    setChecked(false);
    setResults([]);
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
          // A new query invalidates the prior selection; the debounced effect
          // recomputes `results`/`checked`.
          setSelected(null);
        }}
        checked={checked}
        results={results}
        searching={searching}
        selected={selected}
        onSelect={setSelected}
        onCancel={onClose}
        onCreateProfile={() => setStep("newPatient")}
        onNewAppointment={() => setStep("form")}
      />
    );
  } else if (step === "newPatient") {
    body = <NewPatientStep onCancel={() => setStep("search")} onCreate={handleCreatePatient} />;
  } else if (step === "created" && created) {
    body = <CreatedStep patient={created} />;
  } else if (step === "form" && selected) {
    body = (
      <AppointmentFormStep
        patient={selected}
        initial={edit?.initial}
        doctors={doctorOptions}
        excludeAppointmentId={edit?.id}
        submitting={creating}
        error={createError}
        onCancel={edit ? onClose : () => setStep("search")}
        onConfirm={async (result) => {
          setCreating(true);
          setCreateError("");
          try {
            if (edit) {
              await updateAppointment(result);
            } else {
              await createAppointment(result);
            }
            notifyAppointmentsChanged();
            onClose();
          } catch (err) {
            setCreateError(
              err instanceof ApiError
                ? err.message
                : err instanceof Error
                  ? err.message
                  : `Couldn't ${edit ? "update" : "create"} the appointment. Please try again.`,
            );
            setCreating(false);
          }
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
      className="animate-fade-in fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
      // Close only on a backdrop click, so open dropdowns inside the form still
      // close on outside-click (their listeners need the mousedown to bubble).
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="na-title"
        className={`animate-modal-in my-auto flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-[16px] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.2)] [zoom:1] ${
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
  results,
  searching,
  selected,
  onSelect,
  onCancel,
  onCreateProfile,
  onNewAppointment,
}: {
  query: string;
  setQuery: (v: string) => void;
  checked: boolean;
  results: FoundPatient[];
  searching: boolean;
  selected: FoundPatient | null;
  onSelect: (p: FoundPatient) => void;
  onCancel: () => void;
  onCreateProfile: () => void;
  onNewAppointment: () => void;
}) {
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
            <div className="relative w-full">
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
          </div>

          {(searching || checked) && (
          <div className="mt-5">
            <p className="font-inter text-[10px] font-normal uppercase tracking-[0.5px] text-[#424752]">
              Search Results
              {!searching && checked && results.length > 0 && (
                <span className="text-[#1e1e24]/40"> · {results.length}</span>
              )}
            </p>
            {searching && (
              <div className="mt-2 flex items-center gap-2 text-[#1e1e24]/50">
                <Spinner className="size-4 text-[#0077c0]" />
                <span className="font-inter text-[13px]">Searching…</span>
              </div>
            )}
            {!searching && checked && results.length === 0 && (
              <p className="mt-2 font-inter text-[13px] text-[#1e1e24]/50">No records found.</p>
            )}
            {!searching && results.length > 0 && (
              <div className="mt-3 flex max-h-[220px] flex-col gap-2 overflow-y-auto">
                {results.map((p) => {
                  const isSelected = selected?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onSelect(p)}
                      className={`flex flex-col items-start gap-1 rounded-[8px] px-4 py-3 text-left transition-colors ${
                        isSelected
                          ? "border-2 border-[#0077c0] bg-[#f1f5f9]"
                          : "border border-[#c2c6d4] bg-white hover:bg-[#f8fafc]"
                      }`}
                    >
                      <span
                        className={`font-inter text-[14px] font-normal ${isSelected ? "text-[#0077c0]" : "text-[#1e1e24]"}`}
                      >
                        {p.name}
                      </span>
                      <span
                        className={`font-inter text-[11px] font-normal tracking-[0.5px] ${isSelected ? "text-[#0077c0]" : "text-[#1e1e24]"}`}
                      >
                        ID: {p.code}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          )}
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
  onCreate,
}: {
  onCancel: () => void;
  /** POSTs the new patient; resolves on success, rejects with a message. */
  onCreate: (input: {
    name: string;
    dob: string;
    phone: string;
    gender: string;
    email: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const emailErr = emailError(email);
  const canCreate =
    Boolean(name.trim() && dob.trim() && phone.length === 10 && gender && !emailErr) && !submitting;

  async function submit() {
    if (!canCreate) return;
    setSubmitting(true);
    setError("");
    try {
      await onCreate({
        name: name.trim(),
        dob: dob.trim(),
        gender,
        phone: phone.trim(),
        email: email.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the profile. Please try again.");
      setSubmitting(false);
    }
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
        <Field label="Date of Birth" required>
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

      <div className="flex shrink-0 flex-col gap-3 border-t border-[#c2c6d4]/40 px-[32px] py-[20px]">
        {error && (
          <p role="alert" className="font-inter text-[13px] text-red-500">
            {error}
          </p>
        )}
        <div className="flex items-center justify-end gap-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="font-inter text-[12px] font-normal uppercase tracking-[0.6px] text-[#424752] disabled:opacity-50"
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
            {submitting ? "Creating…" : "Create Profile"}
          </button>
        </div>
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
      await navigator.clipboard.writeText(patient.code);
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
            <span className="font-inter text-[18px] font-normal text-[#1e1e24]">{patient.code}</span>
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

function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`animate-spin ${className ?? ""}`} role="status" aria-label="Searching">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-20" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
