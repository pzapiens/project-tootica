"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { apiFetch, type AvailabilityResponse } from "@/lib/api";
import { useExclusiveDropdown } from "@/lib/useExclusiveDropdown";
import { isSlotOnShift, isSlotBlocked } from "@/lib/shifts";

import { DateInput, parseDmy } from "./DateInput";
import DoctorAvailabilityModal from "./DoctorAvailabilityModal";

/**
 * Appointment form (Figma "Edit Appointment" / NewAppts5–7), reached after a
 * patient is selected in the search step. The first five fields (Patient Name,
 * Date of Birth, Gender, Phone, Email) are auto-filled from the selected patient
 * and are inactive (read-only). Status and Source are fixed defaults; the rest
 * (Consultation Type, Lead Source, Message, and the scheduling section) are
 * editable. Scheduling can be done by date & time or by doctor.
 */

export interface AppointmentPatient {
  name: string;
  dob: string;
  gender: string;
  phone: string;
  email: string;
}

/**
 * Prefill for editing an existing appointment. `mode` selects which scheduling
 * flow (Select by Date & Time / Select by Doctor) the appointment was created
 * with, and only that flow's fields are populated.
 */
export interface AppointmentInitial {
  consultation: string[];
  leadSource: string;
  message: string;
  mode: "datetime" | "doctor";
  date: string;
  from: Time;
  to: Time;
  doctor: string;
  status?: string;
}

/** A clinic doctor the form can pick + resolve to an id for availability/booking. */
export interface DoctorOption {
  id: string;
  name: string;
}

/** The saved values produced when Confirm Appointment is clicked. */
export interface AppointmentEditResult {
  doctor: string;
  /** Resolved backend doctor id (empty if the picked name didn't match). */
  doctorId: string;
  startTime: string;
  endTime: string;
  consultationType: string;
  leadSource: string;
  message: string;
  scheduleMode: "datetime" | "doctor";
  date: string;
  /** When true, the appointment bypasses business-hours + conflict checks. */
  nonMandatory: boolean;
  /** Chosen appointment status label (e.g. "Upcoming"). */
  status: string;
}

const CONSULTATION_TYPES = [
  "GENERAL CONSULTATION / XRAY",
  "ROOT CANAL TREATMENT",
  "RE ROOT CANAL TREATMENT",
  "CROWN / VENEER / FPD",
  "EXTRACTION / SURGICAL EXTRACTION",
  "SCALING",
  "RESTORATION",
  "TEETH WHITENING",
  "ORTHODONTIC TREATMENT BRACES / ALIGNERS",
  "PEDODONTIC TREATMENT",
  "RPD / CD",
  "IMPLANTS",
  "TMJ DISORDERS",
  "GUM RELATED TREATMENTS",
  "INTRAORAL SCANNING",
  "OTHER LASER TREATMENTS",
  "OTHERS",
];
const LEAD_SOURCES = [
  "INSTAGRAM",
  "FACEBOOK",
  "WHATSAPP",
  "GOOGLE SEARCH",
  "WEBSITE",
  "BOARD / SIGNBOARD",
  "PATIENT REFERRAL",
  "DOCTOR REFERRAL",
  "CAMP / DENTAL CAMP",
  "ONLINE ADS",
  "OTHERS",
];
// Editable appointment status; "Upcoming" is the default for a new booking.
// (Each maps 1:1 to a backend status when the appointment is saved.)
const STATUS_OPTIONS = ["Upcoming", "Confirmed", "Completed", "Cancelled", "No Show"];
// Clinic working hours (for the fast client-side time-range check): 9 AM – 6 PM.
// The backend is authoritative — it re-checks hours + real doctor conflicts.
const OPEN_MIN = 9 * 60;
const CLOSE_MIN = 18 * 60;

const pad2 = (n: number) => String(n).padStart(2, "0");
/** "dd/mm/yyyy" → "yyyy-mm-dd" for the availability query (or "" if invalid). */
function ymd(dmy: string): string {
  const d = parseDmy(dmy);
  return d ? `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` : "";
}
/** A 12-hour Time → 24-hour "HH:mm" for the availability query. */
function hhmm24(t: Time): string {
  const h = (Number(t.h) % 12) + (t.p === "PM" ? 12 : 0);
  return `${pad2(h)}:${pad2(Number(t.m))}`;
}

const LABEL = "font-inter text-[11px] font-normal uppercase tracking-[0.5px] text-[#1e1e24]";
const REQ = <span className="text-red-500">*</span>;

/** Title-case a value for display (e.g. "ROOT CANAL TREATMENT" → "Root Canal Treatment"). */
function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AppointmentFormStep({
  patient,
  initial,
  doctors = [],
  excludeAppointmentId,
  submitting = false,
  error,
  onCancel,
  onConfirm,
}: {
  patient: AppointmentPatient;
  /** When present, the form opens pre-filled to edit an existing appointment. */
  initial?: AppointmentInitial;
  /** This clinic's doctors (from `GET /api/doctors`) for the pickers + checks. */
  doctors?: DoctorOption[];
  /** The appointment being edited — excluded from availability so its own
   *  booking doesn't count as a conflict against the new slot. */
  excludeAppointmentId?: string;
  /** True while the parent is saving the appointment to the backend. */
  submitting?: boolean;
  /** A save error from the backend, shown above the footer. */
  error?: string;
  onCancel: () => void;
  onConfirm: (result: AppointmentEditResult) => void;
}) {
  // Only the flow the appointment was created with is pre-filled.
  const editDatetime = initial?.mode === "datetime" ? initial : undefined;
  const editDoctor = initial?.mode === "doctor" ? initial : undefined;

  const doctorNames = doctors.map((d) => d.name);
  const resolveDoctorId = (name: string) => doctors.find((d) => d.name === name)?.id ?? "";

  // Availability query suffix that excludes the appointment being edited, so its
  // own booking never registers as a conflict against the (possibly moved) slot.
  const excludeParam = excludeAppointmentId
    ? `&excludeAppointmentId=${encodeURIComponent(excludeAppointmentId)}`
    : "";

  const [consultation, setConsultation] = useState<string[]>(initial?.consultation ?? []);
  const [leadSource, setLeadSource] = useState(initial?.leadSource ?? "");
  const [message, setMessage] = useState(initial?.message ?? "");
  const [status, setStatus] = useState(initial?.status ?? "Upcoming");

  const [mode, setMode] = useState<"datetime" | "doctor">(initial?.mode ?? "datetime");

  // Select by Date & Time — its own scheduling state (kept fully independent
  // from Select by Doctor even though the field names overlap).
  const [dtDate, setDtDate] = useState(editDatetime?.date ?? "");
  const [dtFrom, setDtFrom] = useState<Time>(editDatetime?.from ?? { h: "", m: "", p: "AM" });
  const [dtTo, setDtTo] = useState<Time>(editDatetime?.to ?? { h: "", m: "", p: "AM" });
  const [dtDoctor, setDtDoctor] = useState(editDatetime?.doctor ?? "");
  const [dtNonMandatory, setDtNonMandatory] = useState(false);
  // Editing a date-&-time appointment starts already verified (doctor assigned).
  const [availabilityChecked, setAvailabilityChecked] = useState(Boolean(editDatetime));
  const [availableDoctors, setAvailableDoctors] = useState<string[]>(
    editDatetime ? doctorNames : [],
  );
  const [checkingAvail, setCheckingAvail] = useState(false);
  const [availError, setAvailError] = useState("");
  // Whether the availability result message should show — only after the user
  // clicks the button (never on an edit prefill).
  const [availShown, setAvailShown] = useState(false);

  // Select by Doctor — its own separate scheduling state.
  const [docDoctor, setDocDoctor] = useState(editDoctor?.doctor ?? "");
  const [docDate, setDocDate] = useState(editDoctor?.date ?? "");
  const [docFrom, setDocFrom] = useState<Time>(editDoctor?.from ?? { h: "", m: "", p: "AM" });
  const [docTo, setDocTo] = useState<Time>(editDoctor?.to ?? { h: "", m: "", p: "AM" });
  const [docNonMandatory, setDocNonMandatory] = useState(false);
  // Editing a by-doctor appointment starts already verified as available.
  const [docAvailChecked, setDocAvailChecked] = useState(Boolean(editDoctor));
  const [docAvailable, setDocAvailable] = useState(Boolean(editDoctor));
  const [docAvailError, setDocAvailError] = useState("");
  const [docAvailShown, setDocAvailShown] = useState(false);
  const [checkingDoc, setCheckingDoc] = useState(false);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);

  const dtTimeFilled = Boolean(dtFrom.h && dtFrom.m && dtTo.h && dtTo.m);
  // Doctor options for the date-&-time flow. After a real availability check we
  // use the free doctors; when editing (opens already verified) we fall back to
  // the full loaded list so the pre-filled doctor shows even before the async
  // `/doctors` fetch had resolved at mount.
  const dtDoctorOptions =
    availableDoctors.length > 0 ? availableDoctors : editDatetime ? doctorNames : [];
  // Doctors were found free for the slot — drives the dropdown + the success line.
  const doctorAvailable = availabilityChecked && dtDoctorOptions.length > 0;
  // ...but the user must still pick one from the dropdown (even when only one is
  // free); Confirm stays disabled until a doctor is actually selected.
  const doctorSelected = doctorAvailable && dtDoctorOptions.includes(dtDoctor);

  // Consultation Type is the only shared mandatory field above the tabs; the
  // Source of Enquiry is optional.
  const coreOk = consultation.length > 0;

  // Select-by-Date-&-Time: core + Date + a Time Range verified via "Available
  // Doctors" (no doctor pick needed). Non-mandatory drops the time range →
  // Confirm with core + just the Date.
  const datetimeOk =
    coreOk &&
    (dtNonMandatory ? Boolean(dtDate) : Boolean(dtDate && dtTimeFilled && doctorSelected));

  // Select-by-Doctor: core + doctor + date. When a time range is required (not
  // non-mandatory), it must have been verified free — which now happens
  // automatically once the time range is filled (see the effect below).
  const docTimeFilled = Boolean(docFrom.h && docFrom.m && docTo.h && docTo.m);
  const doctorTimeOk = docNonMandatory
    ? true
    : docTimeFilled && docAvailChecked && docAvailable;
  const doctorModeOk = coreOk && Boolean(docDate && docDoctor) && doctorTimeOk;

  // View Availability activates once a doctor + date are chosen.
  const canViewAvailability = Boolean(docDoctor && docDate);

  // Any change to the doctor-flow doctor/date/time invalidates a prior result.
  function resetDocAvailability() {
    setDocAvailChecked(false);
    setDocAvailable(false);
    setDocAvailError("");
    setDocAvailShown(false);
  }

  // Check the chosen doctor against the backend (real bookings + business hours).
  async function checkDoctorAvailability() {
    setDocAvailShown(true);
    const f = toMinutes(docFrom);
    const t = toMinutes(docTo);
    if (f === null || t === null || f < OPEN_MIN || t > CLOSE_MIN || f >= t) {
      setDocAvailError("Please select a time range between 9:00 AM and 6:00 PM.");
      setDocAvailChecked(true);
      setDocAvailable(false);
      return;
    }
    const doctorId = resolveDoctorId(docDoctor);
    if (!doctorId) {
      setDocAvailError("Please select a doctor first.");
      return;
    }
    setCheckingDoc(true);
    setDocAvailError("");
    try {
      const res = await apiFetch<AvailabilityResponse>(
        `/appointments/availability?date=${ymd(docDate)}&from=${hhmm24(docFrom)}&to=${hhmm24(docTo)}&doctorId=${doctorId}${excludeParam}`,
      );
      // A doctor is only available inside a shift they've marked for the date,
      // and not during a slot they've blocked in the availability popup.
      const day = parseDmy(docDate);
      const onShift = day !== null && isSlotOnShift(doctorId, day, f, t);
      const blocked = day !== null && isSlotBlocked(doctorId, day, f, t);
      const d = res.doctors[0];
      const ok = Boolean(d?.available) && onShift && !blocked;
      setDocAvailable(ok);
      setDocAvailError(
        ok
          ? ""
          : !onShift
            ? "Doctor has no shift covering the selected time."
            : blocked
              ? "This time is blocked for the doctor."
              : d?.reason === "conflict"
                ? "Doctor is already booked in this time range."
                : d?.reason === "break"
                  ? "This time falls within the clinic lunch break (1:00 PM – 2:00 PM)."
                  : "Doctor is not available in the selected time range.",
      );
    } catch {
      setDocAvailable(false);
      setDocAvailError("Couldn't check availability. Please try again.");
    } finally {
      setDocAvailChecked(true);
      setCheckingDoc(false);
    }
  }

  // Keep the latest checker for the debounced auto-check effect below.
  const checkDoctorRef = useRef(checkDoctorAvailability);
  useEffect(() => {
    checkDoctorRef.current = checkDoctorAvailability;
  });

  // Auto-validate the doctor's availability shortly after the time range is
  // complete — no manual "Check Availability" click needed. Debounced so it
  // waits for the user to finish typing the From/To times.
  useEffect(() => {
    if (mode !== "doctor" || docNonMandatory) return;
    if (!docDoctor || !docDate || !docTimeFilled || docAvailChecked) return;
    const id = window.setTimeout(() => checkDoctorRef.current(), 500);
    return () => window.clearTimeout(id);
  }, [mode, docDoctor, docDate, docTimeFilled, docNonMandatory, docAvailChecked, docFrom, docTo]);

  const canConfirm = mode === "datetime" ? datetimeOk : doctorModeOk;

  function handleConfirm() {
    if (!canConfirm) return;
    const isDoctor = mode === "doctor";
    const doctorName = isDoctor ? docDoctor : dtDoctor;
    onConfirm({
      doctor: doctorName,
      doctorId: resolveDoctorId(doctorName),
      startTime: formatTime(isDoctor ? docFrom : dtFrom),
      endTime: formatTime(isDoctor ? docTo : dtTo),
      // Persist the full selection (the field is one string); split back on edit.
      consultationType: consultation.join(", "),
      leadSource,
      message,
      scheduleMode: mode,
      date: isDoctor ? docDate : dtDate,
      nonMandatory: isDoctor ? docNonMandatory : dtNonMandatory,
      status,
    });
  }

  // Any change to date/time invalidates a previous availability result.
  function resetAvailability() {
    setAvailabilityChecked(false);
    setAvailableDoctors([]);
    setDtDoctor("");
    setAvailError("");
    setAvailShown(false);
  }

  // Ask the backend which doctors are free for the chosen date + time.
  async function findAvailableDoctors() {
    setAvailShown(true);
    const f = toMinutes(dtFrom);
    const t = toMinutes(dtTo);
    if (f === null || t === null || f < OPEN_MIN || t > CLOSE_MIN || f >= t) {
      setAvailError("Please select a time range between 9:00 AM and 6:00 PM.");
      setAvailabilityChecked(false);
      setAvailableDoctors([]);
      return;
    }
    setCheckingAvail(true);
    setAvailError("");
    try {
      const res = await apiFetch<AvailabilityResponse>(
        `/appointments/availability?date=${ymd(dtDate)}&from=${hhmm24(dtFrom)}&to=${hhmm24(dtTo)}${excludeParam}`,
      );
      // Keep only doctors who are free AND on a shift they've marked for the date.
      const day = parseDmy(dtDate);
      const free = res.doctors
        .filter(
          (d) =>
            d.available &&
            d.name &&
            day !== null &&
            isSlotOnShift(d.id, day, f, t) &&
            !isSlotBlocked(d.id, day, f, t),
        )
        .map((d) => d.name as string);
      if (free.length === 0) {
        // If every doctor is blocked by the break, say so specifically.
        const allBreak =
          res.doctors.length > 0 && res.doctors.every((d) => d.reason === "break");
        setAvailError(
          allBreak
            ? "This time falls within the clinic lunch break (1:00 PM – 2:00 PM). Pick another slot."
            : "No doctors are on shift and free in the selected time. Try another slot.",
        );
        setAvailableDoctors([]);
        setAvailabilityChecked(false);
      } else {
        setAvailableDoctors(free);
        setAvailabilityChecked(true);
        // Do NOT auto-assign a doctor — the user must pick one from the dropdown
        // (even when only one is free). Keep an existing pick only if still free.
        setDtDoctor((cur) => (free.includes(cur) ? cur : ""));
      }
    } catch {
      setAvailError("Couldn't check availability. Please try again.");
      setAvailableDoctors([]);
      setAvailabilityChecked(false);
    } finally {
      setCheckingAvail(false);
    }
  }

  // Keep the latest finder for the debounced auto-check effect below.
  const findAvailRef = useRef(findAvailableDoctors);
  useEffect(() => {
    findAvailRef.current = findAvailableDoctors;
  });

  // Auto-find available doctors shortly after the date + time range are set — no
  // manual "Available Doctors" click needed (debounced for typing).
  useEffect(() => {
    if (mode !== "datetime" || dtNonMandatory) return;
    if (!dtDate || !dtTimeFilled || availabilityChecked) return;
    const id = window.setTimeout(() => findAvailRef.current(), 500);
    return () => window.clearTimeout(id);
  }, [mode, dtDate, dtTimeFilled, dtNonMandatory, availabilityChecked, dtFrom, dtTo]);

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-[20px] overflow-y-auto px-[32px] py-[28px]">
        {/* Patient details — auto-filled, read-only */}
        <div className="grid grid-cols-2 gap-x-[32px] gap-y-[20px]">
          <ReadonlyField label="Patient Name" value={patient.name} dim />
          <ReadonlyField label="Date of Birth" value={patient.dob} icon="calendar" dim />
          <ReadonlyField label="Gender" value={patient.gender} icon="block" dim />
          <ReadonlyField label="Phone" value={`+91 ${patient.phone}`} dim />
          <ReadonlyField label="Email" value={patient.email || "--"} dim />
          <MultiSelectDropdown
            label="Consultation Type"
            values={consultation}
            options={CONSULTATION_TYPES}
            onChange={setConsultation}
          />
          <BoxedDropdown
            label="Source of Enquiry"
            required={false}
            value={leadSource}
            options={LEAD_SOURCES}
            onChange={setLeadSource}
          />
          <BoxedDropdown
            label="Status"
            required={false}
            value={status}
            options={STATUS_OPTIONS}
            onChange={setStatus}
            format={(s) => s}
          />
          <ReadonlyField label="Booking Channel" value="Web" icon="block" />
          <div className="flex flex-col gap-2">
            <span className={LABEL}>Message</span>
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add any additional notes..."
              className="w-full border-b border-[#c2c6d4] bg-transparent pb-2 pt-1 font-inter text-[15px] text-[#1e1e24] outline-none placeholder:text-[#1e1e24]/70 focus:border-[#0077c0]"
            />
          </div>
        </div>

        {/* Scheduling tabs */}
        <div className="mt-[20px] flex justify-center gap-6 border-b border-[#c2c6d4]/50">
          <Tab active={mode === "datetime"} onClick={() => setMode("datetime")}>
            Select by Date &amp; Time
          </Tab>
          <Tab active={mode === "doctor"} onClick={() => setMode("doctor")}>
            Select by Doctor
          </Tab>
        </div>

        {mode === "datetime" ? (
          <div className="flex flex-col gap-[20px]">
            <div className="grid grid-cols-2 gap-x-[32px]">
              <div className="flex flex-col gap-2">
                <span className={LABEL}>Date {REQ}</span>
                <DateInput
                  value={dtDate}
                  disablePast
                  onChange={(v) => {
                    setDtDate(v);
                    resetAvailability();
                  }}
                />
              </div>
            </div>
            <TimeRange
              from={dtFrom}
              to={dtTo}
              required={!dtNonMandatory}
              onFrom={(t) => {
                setDtFrom(t);
                resetAvailability();
              }}
              onTo={(t) => {
                setDtTo(t);
                resetAvailability();
              }}
              action={
                !dtNonMandatory && checkingAvail ? (
                  <span className="whitespace-nowrap font-inter text-[13px] text-[#1e1e24]/60">
                    Finding available doctor…
                  </span>
                ) : undefined
              }
            >
              <NonMandatory checked={dtNonMandatory} onChange={setDtNonMandatory} />
            </TimeRange>
            {availShown && availError && <ErrorLine text={availError} />}
            {availShown && !availError && doctorAvailable && (
              <SuccessLine text="Doctor available in the preferred time." />
            )}
            <div className="grid grid-cols-2 gap-x-[32px]">
              {doctorAvailable ? (
                <BoxedDropdown
                  label="Doctor"
                  value={dtDoctor}
                  options={dtDoctorOptions}
                  onChange={setDtDoctor}
                  format={(s) => s}
                />
              ) : (
                <div className="flex flex-col gap-2">
                  <span className={LABEL}>Doctor</span>
                  <div className="flex items-center justify-between border-b border-[#c2c6d4] pb-2 pt-1">
                    <span className="font-inter text-[15px] text-[#1e1e24]/70">Select</span>
                    <BlockIcon className="size-[18px] text-[#c2c6d4]" />
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-[20px]">
            <div className="grid grid-cols-2 gap-x-[32px]">
              <BoxedDropdown
                label="Doctor"
                value={docDoctor}
                options={doctorNames}
                onChange={(v) => {
                  setDocDoctor(v);
                  resetDocAvailability();
                }}
                format={(s) => s}
              />
              <div className="flex flex-col gap-2">
                <span className={LABEL}>Date {REQ}</span>
                <DateInput
                  value={docDate}
                  disablePast
                  onChange={(v) => {
                    setDocDate(v);
                    resetDocAvailability();
                  }}
                />
              </div>
            </div>
            <TimeRange
              from={docFrom}
              to={docTo}
              required={!docNonMandatory}
              onFrom={(t) => {
                setDocFrom(t);
                resetDocAvailability();
              }}
              onTo={(t) => {
                setDocTo(t);
                resetDocAvailability();
              }}
              action={
                <button
                  type="button"
                  disabled={!canViewAvailability}
                  onClick={() => setAvailabilityOpen(true)}
                  className={`inline-flex h-[38px] items-center justify-center whitespace-nowrap rounded-full px-4 font-inter text-[11px] font-normal uppercase tracking-[0.5px] text-white ${
                    canViewAvailability ? "bg-[#0077c0]" : "cursor-not-allowed bg-[#0077c0]/40"
                  }`}
                >
                  View Availability
                </button>
              }
            >
              <NonMandatory
                checked={docNonMandatory}
                onChange={(v) => {
                  setDocNonMandatory(v);
                  resetDocAvailability();
                }}
              />
            </TimeRange>
            {!docNonMandatory && checkingDoc && (
              <p className="font-inter text-[13px] text-[#1e1e24]/60">Checking availability…</p>
            )}
            {!docNonMandatory && !checkingDoc && docAvailShown && docAvailError && (
              <ErrorLine text={docAvailError} />
            )}
            {!docNonMandatory &&
              !checkingDoc &&
              docAvailShown &&
              !docAvailError &&
              docAvailChecked &&
              docAvailable && <SuccessLine text="Doctor available in the preferred time." />}
          </div>
        )}
      </div>

      {/* Footer (fixed) */}
      <div className="flex shrink-0 flex-col gap-3 border-t border-[#c2c6d4]/40 px-[32px] py-[20px]">
        {error && <ErrorLine text={error} />}
        <div className="flex items-center justify-end gap-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="font-inter text-[12px] font-semibold uppercase tracking-[0.6px] text-black disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canConfirm || submitting}
            onClick={handleConfirm}
            className={`rounded-full px-[25px] py-[12px] font-inter text-[13px] font-normal uppercase tracking-[0.5px] text-white ${
              canConfirm && !submitting ? "bg-[#0077c0] hover:bg-[#0069a8]" : "bg-[#0077c0] opacity-50"
            }`}
          >
            {submitting
              ? "Saving…"
              : initial
                ? "Update Appointment"
                : "Confirm Appointment"}
          </button>
        </div>
      </div>

      {availabilityOpen && (
        <DoctorAvailabilityModal
          doctor={docDoctor}
          doctorId={resolveDoctorId(docDoctor)}
          date={docDate}
          onClose={() => setAvailabilityOpen(false)}
          viewOnly
        />
      )}
    </>
  );
}

/* --------------------------------------------------------- read-only field */

function ReadonlyField({
  label,
  value,
  icon,
  dim,
}: {
  label: string;
  value: string;
  icon?: "calendar" | "block";
  /** Auto-filled patient values render at 50% opacity to read as inactive. */
  dim?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className={LABEL}>
        {label} {REQ}
      </span>
      <div className="flex items-center justify-between border-b border-[#c2c6d4] pb-2 pt-1">
        <span className={`font-inter text-[15px] text-[#1e1e24] ${dim ? "opacity-50" : ""}`}>{value}</span>
        {icon === "calendar" && (
          <Image src="/dashboard/calendar_today.svg" alt="" width={18} height={18} className="size-[18px] opacity-40" />
        )}
        {icon === "block" && <BlockIcon className="size-[18px] text-[#c2c6d4]" />}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- boxed dropdown */

/**
 * Boxed dropdown (Figma "LD Dropdown" / "Doctors Dropdown"): light option rows
 * with a radio-circle indicator on the selected row. Shows ~5 rows; the rest
 * scroll. Single-select — used for Lead Source and the Doctor selects.
 */
function BoxedDropdown({
  label,
  value,
  options,
  onChange,
  required = true,
  placeholder = "Select",
  format = titleCase,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  /** Show the required `*` after the label (Lead Source & doctor-flow doctor). */
  required?: boolean;
  placeholder?: string;
  /** How to render an option/value (doctors are already cased, so use identity). */
  format?: (v: string) => string;
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
    <div className="flex flex-col gap-2">
      <span className={LABEL}>{label} {required && REQ}</span>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 border-b border-[#c2c6d4] pb-2 pt-1 text-left focus:border-[#0077c0]"
        >
          <span className={`truncate font-inter text-[15px] ${value ? "text-[#1e1e24]" : "text-[#1e1e24]/70"}`}>
            {value ? format(value) : placeholder}
          </span>
          <Image
            src="/dashboard/chevron_dark.svg"
            alt=""
            width={20}
            height={20}
            className={`size-5 shrink-0 transition-transform ${open ? "rotate-90" : "-rotate-90"}`}
          />
        </button>
        {open && (
          <div className="absolute left-0 top-[calc(100%+6px)] z-30 flex max-h-[260px] w-full flex-col gap-[5px] overflow-y-auto rounded-[15px] border border-[#c2c6d4] bg-white p-[17px] drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
            {options.map((opt) => {
              const selected = opt === value;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    onChange(opt);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-[8px] bg-[#f1f5f9] px-[16px] py-[10px] text-left transition-colors hover:bg-[#e9eef4]"
                >
                  <span className="font-inter text-[14px] text-[#1e1e24]">{format(opt)}</span>
                  {selected ? (
                    <span className="flex size-3 shrink-0 items-center justify-center rounded-full border border-[#1e1e24]">
                      <span className="size-1.5 rounded-full bg-[#1e1e24]" />
                    </span>
                  ) : (
                    <span className="size-3 shrink-0 rounded-full border border-[#1e1e24]" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Multi-select boxed dropdown (checkbox rows) for Consultation Type. The trigger
 * shows every picked option; selecting toggles it without closing the panel.
 */
function MultiSelectDropdown({
  label,
  values,
  options,
  onChange,
}: {
  label: string;
  values: string[];
  options: string[];
  onChange: (v: string[]) => void;
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

  function toggle(opt: string) {
    onChange(values.includes(opt) ? values.filter((v) => v !== opt) : [...values, opt]);
  }

  const display = values.length ? values.map(titleCase).join(", ") : "Select";

  return (
    <div className="flex flex-col gap-2">
      <span className={LABEL}>{label} {REQ}</span>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 border-b border-[#c2c6d4] pb-2 pt-1 text-left focus:border-[#0077c0]"
        >
          <span className={`truncate font-inter text-[15px] ${values.length ? "text-[#1e1e24]" : "text-[#1e1e24]/70"}`}>
            {display}
          </span>
          <Image
            src="/dashboard/chevron_dark.svg"
            alt=""
            width={20}
            height={20}
            className={`size-5 shrink-0 transition-transform ${open ? "rotate-90" : "-rotate-90"}`}
          />
        </button>
        {open && (
          <div className="absolute left-0 top-[calc(100%+6px)] z-30 flex max-h-[260px] w-full flex-col gap-[5px] overflow-y-auto rounded-[15px] border border-[#c2c6d4] bg-white p-[17px] drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
            {options.map((opt) => {
              const selected = values.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggle(opt)}
                  className="flex w-full items-center justify-between gap-3 rounded-[8px] bg-[#f1f5f9] px-[16px] py-[10px] text-left transition-colors hover:bg-[#e9eef4]"
                >
                  <span className="font-inter text-[14px] text-[#1e1e24]">{titleCase(opt)}</span>
                  {selected ? (
                    <span className="flex size-3 shrink-0 items-center justify-center rounded-[2px] border border-[#1e1e24]">
                      <svg viewBox="0 0 12 12" fill="none" stroke="#1e1e24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-2" aria-hidden>
                        <path d="M2.5 6l2 2 5-5" />
                      </svg>
                    </span>
                  ) : (
                    <span className="size-3 shrink-0 rounded-[2px] border border-[#1e1e24]" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- time range */

export interface Time {
  h: string;
  m: string;
  p: "AM" | "PM";
}

function TimeRange({
  from,
  to,
  onFrom,
  onTo,
  required = true,
  action,
  children,
}: {
  from: Time;
  to: Time;
  onFrom: (t: Time) => void;
  onTo: (t: Time) => void;
  required?: boolean;
  /** Optional control shown near the top of the right column (e.g. a button). */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-[32px]">
      {/* Left column (aligned with the Date field above) */}
      <div className="flex flex-col gap-2">
        <span className={LABEL}>Time Range {required && REQ}</span>
        <div className="flex items-start gap-3">
          <TimeGroup label="From" value={from} onChange={onFrom} />
          <TimeGroup label="To" value={to} onChange={onTo} />
        </div>
      </div>
      {/* Right column. The `action` (e.g. "View Availability") is pinned near the
          top; the two invisible spacers drop the `children` (the checkbox) onto
          the time-input row so it lines up with the From/To boxes on the left. */}
      <div className="relative flex flex-col gap-2">
        <span className={`${LABEL} opacity-0`} aria-hidden>
          x
        </span>
        <div className="flex flex-col gap-1.5">
          <span
            className="font-inter text-[10px] uppercase tracking-[0.5px] opacity-0"
            aria-hidden
          >
            x
          </span>
          <div className="flex min-h-[38px] items-center">{children}</div>
        </div>
        {action && <div className="absolute left-0 top-0">{action}</div>}
      </div>
    </div>
  );
}

const TIME_BOX =
  "h-[38px] w-[34px] rounded-[8px] border border-[#c2c6d4] bg-white text-center font-inter text-[13px] text-[#1e1e24] outline-none placeholder:text-[#1e1e24]/40 focus:border-[#0077c0]";

function TimeGroup({ label, value, onChange }: { label: string; value: Time; onChange: (t: Time) => void }) {
  const two = (s: string, max: number) => {
    const n = s.replace(/\D/g, "").slice(0, 2);
    if (n && Number(n) > max) return String(max);
    return n;
  };
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-inter text-[10px] uppercase tracking-[0.5px] text-[#1e1e24]">{label}</span>
      <div className="flex items-center gap-1">
        <input
          value={value.h}
          onChange={(e) => onChange({ ...value, h: two(e.target.value, 12) })}
          placeholder="HH"
          inputMode="numeric"
          className={TIME_BOX}
        />
        <span className="text-[#1e1e24]">:</span>
        <input
          value={value.m}
          onChange={(e) => onChange({ ...value, m: two(e.target.value, 59) })}
          placeholder="MM"
          inputMode="numeric"
          className={TIME_BOX}
        />
        <button
          type="button"
          onClick={() => onChange({ ...value, p: value.p === "AM" ? "PM" : "AM" })}
          className="h-[38px] w-[38px] rounded-[8px] bg-[#cbd5e1] font-inter text-[12px] text-[#1e1e24]"
        >
          {value.p}
        </button>
      </div>
    </div>
  );
}

function NonMandatory({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <span className="relative flex size-5 items-center justify-center rounded-[4px] border border-[#1e1e24]">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 cursor-pointer opacity-0"
        />
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="#0077c0"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="hidden size-3.5 peer-checked:block"
          aria-hidden
        >
          <path d="M5 12l5 5L20 7" />
        </svg>
      </span>
      <span className="font-inter text-[13px] text-[#1e1e24]">Skip time &amp; availability check</span>
    </label>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 pb-2 font-inter text-[13px] font-normal uppercase tracking-[0.5px] ${
        active ? "border-[#0077c0] text-[#0077c0]" : "border-transparent text-[#94a3b8]"
      }`}
    >
      {children}
    </button>
  );
}

/** Convert a Time (12-hour) to minutes-from-midnight; null if incomplete. */
function toMinutes(t: Time): number | null {
  if (!t.h || !t.m) return null;
  let h = Number(t.h) % 12;
  if (t.p === "PM") h += 12;
  return h * 60 + Number(t.m);
}

/** A Time back to a display string, e.g. `{ h:"9", m:"0", p:"AM" }` → "09:00 AM". */
function formatTime(t: Time): string {
  if (!t.h || !t.m) return "";
  return `${t.h.padStart(2, "0")}:${t.m.padStart(2, "0")} ${t.p}`;
}

/** Inline error with the red cross symbol. */
function ErrorLine({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-1.5" role="alert">
      <RedCross className="size-[18px] shrink-0" />
      <span className="font-inter text-[13px] text-[#ba1a1a]">{text}</span>
    </div>
  );
}

function RedCross({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="12" r="10" fill="#ba1a1a" />
      <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Inline success message with a green tick. */
function SuccessLine({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <GreenTick className="size-[18px] shrink-0" />
      <span className="font-inter text-[13px] text-[#16a34a]">{text}</span>
    </div>
  );
}

function GreenTick({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="12" r="10" fill="#16a34a" />
      <path d="M7.5 12.5l3 3 6-6.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BlockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6l12.8 12.8" strokeLinecap="round" />
    </svg>
  );
}
