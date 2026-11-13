"use client";

import { ShiftSkeleton } from "@/components/loading/PageSkeletons";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiFetch, ApiError, type DoctorSummary } from "@/lib/api";
import { phoneLocalPart, phoneWithCc } from "@/lib/validation";
import PhoneNumberInput from "@/components/PhoneNumberInput";
import {
  fetchShifts,
  saveShifts,
  type StoredShift as Shift,
} from "@/lib/shifts";
import BackButton from "@/components/BackButton";

import { SPECIALIZATIONS } from "../../constants";
import ShiftBuilder, { Dropdown, Field } from "../../ShiftBuilder";

/**
 * Edit Doctor Shift (Figma "Doctors2 - Edit"): the per-doctor shift editor
 * reached from the Doctors table's edit action, for BOTH doctor kinds.
 *
 * The detail fields (name / consultation type / phone / email) are FROZEN for
 * employed doctors (role DOCTOR — their identity is managed via the account
 * flow) and EDITABLE + saveable for guest doctors (created here). Below the
 * details is an "Add Shifts" builder — pick one or more calendar dates, a
 * recurrence and a time range, then add them to the shifts table.
 *
 * Shift controls are shared with doctor creation and persisted through the
 * existing doctor-shifts endpoints.
 */

export default function ShiftClient() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const doctorId = params.id;

  const [doctor, setDoctor] = useState<DoctorSummary | null>(null);
  const [loadingDoctor, setLoadingDoctor] = useState(true);
  const [loadingShifts, setLoadingShifts] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [spec, setSpec] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [detailsSaved, setDetailsSaved] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch<DoctorSummary[]>("/doctors")
      .then((list) => {
        if (!active) return;
        const found = list.find((d) => d.id === doctorId) ?? null;
        setDoctor(found);
        if (found) {
          setName(found.name ? `Dr. ${found.name}` : "");
          setEmail(found.email ?? "");
          setPhone(phoneLocalPart(found.phone));
          setSpec(found.specialization ?? "");
        }
      })
      .catch(() => {
        if (active) setDoctor(null);
      })
      .finally(() => {
        if (active) setLoadingDoctor(false);
      });
    return () => {
      active = false;
    };
  }, [doctorId]);

  const [shifts, setShifts] = useState<Shift[]>([]);
  // Shifts are persisted per doctor on the backend. Load on mount, and gate
  // saving until a SUCCESSFUL load has happened — so a fetch failure never
  // leaves saving enabled with an empty list that would clobber real data.
  const [shiftsLoaded, setShiftsLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    fetchShifts(doctorId)
      .then((list) => {
        if (!active) return;
        setShifts(list);
        setShiftsLoaded(true);
      })
      .catch(() => {
        // Leave saving disabled on load failure.
      })
      .finally(() => {
        if (active) setLoadingShifts(false);
      });
    return () => {
      active = false;
    };
  }, [doctorId]);
  useEffect(() => {
    // Replace-all save on every change once loaded (mirrors the editor's
    // save-the-whole-table model). The first run re-saves the just-loaded set,
    // which is a harmless idempotent PUT.
    if (shiftsLoaded) void saveShifts(doctorId, shifts).catch(() => {});
  }, [shiftsLoaded, doctorId, shifts]);

  // Only guest doctors can have their details edited here; employed doctors
  // (role DOCTOR) are frozen — their identity is managed via the account flow.
  const isGuest = doctor?.role === "GUEST_DOCTOR";

  async function saveDetails() {
    if (!isGuest || savingDetails) return;
    setSavingDetails(true);
    setDetailsError("");
    try {
      await apiFetch(`/doctors/${doctorId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone ? phoneWithCc(phone) : undefined,
          specialization: spec || undefined,
        }),
      });
      setDoctor((d) =>
        d
          ? {
              ...d,
              name: name.trim().replace(/^dr\.?\s+/i, ""),
              email,
              phone: phone ? phoneWithCc(phone) : null,
              specialization: spec,
            }
          : d,
      );
      setDetailsSaved(true);
      setTimeout(() => setDetailsSaved(false), 1600);
    } catch (err) {
      setDetailsError(
        err instanceof ApiError
          ? err.message
          : "Couldn't save the details. Please try again.",
      );
    } finally {
      setSavingDetails(false);
    }
  }

  if (loadingDoctor || loadingShifts) return <ShiftSkeleton />;

  return (
    <div className="app-page flex flex-col gap-[27px] pb-[20px]">
      {/* Header */}
      <div className="app-toolbar flex items-center gap-[13px]">
        <BackButton onClick={() => router.back()} ariaLabel="Back to doctors" />
        <h1 className="app-page-title font-manrope text-[31px] font-bold leading-[39px] tracking-[-0.7px] text-[#1e1e24]">
          Edit Doctor Shift
        </h1>
      </div>

      {/* Doctor details — frozen for employed doctors, editable for guests. */}
      <div className="app-form-grid grid grid-cols-2 gap-x-[54px] gap-y-[24px]">
        <TextField
          label="Doctor Name"
          value={name}
          onChange={setName}
          disabled={!isGuest}
          required
        />
        {isGuest ? (
          <Field label="Consultation Type" required>
            <Dropdown
              value={spec}
              onChange={setSpec}
              options={SPECIALIZATIONS as readonly string[]}
              placeholder="Select"
            />
          </Field>
        ) : (
          <LockedField
            label="Consultation Type"
            value={doctor?.specialization ?? "—"}
          />
        )}
        <PhoneField value={phone} onChange={setPhone} disabled={!isGuest} />
        <TextField
          label="Email"
          value={email}
          onChange={setEmail}
          disabled={!isGuest}
        />
      </div>

      {isGuest && (
        <div className="app-toolbar flex items-center gap-[13px]">
          <button
            type="button"
            onClick={saveDetails}
            disabled={savingDetails || name.trim() === ""}
            className="rounded-full bg-[#0077c0] px-[20px] py-[11px] font-inter text-[13px] font-semibold uppercase tracking-[0.6px] text-white transition-colors hover:bg-[#0069a8] disabled:opacity-50"
          >
            {savingDetails ? "Saving…" : "Update Details"}
          </button>
          {detailsSaved && (
            <span className="font-inter text-[13px] font-medium text-[#16a34a]">
              Saved
            </span>
          )}
          {detailsError && (
            <span
              role="alert"
              className="font-inter text-[13px] text-[#ba1a1a]"
            >
              {detailsError}
            </span>
          )}
        </div>
      )}

      <ShiftBuilder
        shifts={shifts}
        onChange={setShifts}
        disabled={!shiftsLoaded}
      />
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  disabled = false,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <Field label={label} required={required}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`w-full border-b-[1.167px] border-black bg-transparent pb-2 pt-1 font-inter text-[14px] outline-none focus:border-[#0077c0] ${
          disabled ? "cursor-not-allowed text-[#1e1e24]/50" : "text-[#1e1e24]"
        }`}
      />
    </Field>
  );
}

function PhoneField({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <Field label="Phone" required>
      <div className="flex items-center gap-2 border-b-[1.167px] border-black pb-2 pt-1 focus-within:border-[#0077c0]">
        <PhoneNumberInput
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={`min-w-0 flex-1 bg-transparent font-inter text-[14px] outline-none ${
            disabled ? "cursor-not-allowed text-[#1e1e24]/50" : "text-[#1e1e24]"
          }`}
        />
      </div>
    </Field>
  );
}

/** A locked/read-only field (shows a no-edit glyph) for employed doctors. */
function LockedField({ label, value }: { label: string; value: string }) {
  return (
    <Field label={label}>
      <div className="flex items-center justify-between border-b-[1.167px] border-black pb-2 pt-1">
        <span className="font-inter text-[14px] text-[#1e1e24]/50">
          {value}
        </span>
        <NoEditIcon className="size-5 text-[#94a3b8]" />
      </div>
    </Field>
  );
}

/* --------------------------------------------------------------- calendar */

function NoEditIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M6 6l12 12" strokeLinecap="round" />
    </svg>
  );
}
