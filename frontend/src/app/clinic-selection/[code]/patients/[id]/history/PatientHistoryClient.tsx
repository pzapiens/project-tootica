"use client";

import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { apiFetch, type AppointmentListItem, type DoctorSummary, type Patient } from "@/lib/api";
import {
  getPatientRecord,
  loadPatientRecord,
  useRecordsRevision,
} from "@/lib/patientRecordsStore";
import BackButton from "@/components/BackButton";

/**
 * Patient History Summary (Figma "Appts8 - Records3").
 *
 * A read-only companion to the editable {@link PatientRecordsView}: it lists the
 * patient's PAST appointments (newest first) as cards. Each card carries the
 * three record tabs — Doctor/Clinical observation, Perio dental chart, Medical
 * history — showing the entries logged on that visit's date. Records aren't
 * stored per-appointment, so they're bucketed onto a card by matching the
 * entry's date to the appointment's date (mirroring the Figma).
 */

const p2 = (n: number) => String(n).padStart(2, "0");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Whole years between `dob` and today; null when no/invalid DOB. */
function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
  return age >= 0 && age < 200 ? age : null;
}

/** ISO datetime → "10 Oct 2023" (local). */
function fmtDayMonYear(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** ISO datetime → "11:00 AM" (local). */
function fmtClock(iso: string): string {
  const d = new Date(iso);
  const period = d.getHours() >= 12 ? "PM" : "AM";
  const h = d.getHours() % 12 || 12;
  return `${p2(h)}:${p2(d.getMinutes())} ${period}`;
}

/** Upper-case-ish gender code → "Male" / "Female" / title-cased fallback. */
function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
}

/** One patient's PAST appointments (a "previous appointment"), newest first. */
function pastAppointmentsFor(
  appts: AppointmentListItem[],
  patientId: string,
): AppointmentListItem[] {
  const now = Date.now();
  return appts
    .filter((a) => a.patient.id === patientId && new Date(a.startTime).getTime() <= now)
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
}

/** A tab and the entries shown under it (already formatted for display). */
type TabKey = "observation" | "perio" | "medical";
interface TabEntry {
  id: string;
  text: string;
  /** dd/mm/yyyy of the entry. */
  date: string;
  /** Resolved "Dr. Name" of the author, or null when unknown. */
  author: string | null;
}

const TAB_LABELS: Record<TabKey, string> = {
  observation: "Doctor/Clinical observation",
  perio: "Perio dental chart",
  medical: "Medical history",
};

export default function PatientHistoryClient() {
  const router = useRouter();
  const { id } = useParams<{ code: string; id: string }>();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [appointments, setAppointments] = useState<AppointmentListItem[]>([]);
  const [doctors, setDoctors] = useState<DoctorSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const rev = useRecordsRevision();
  const record = useMemo(() => getPatientRecord(id), [id, rev]);

  useEffect(() => {
    let active = true;
    // Hydrate the patient's records into the store (read synchronously below).
    loadPatientRecord(id).catch(() => {});
    Promise.all([
      apiFetch<Patient[]>("/patients").catch(() => [] as Patient[]),
      apiFetch<AppointmentListItem[]>("/appointments?limit=500").catch(() => [] as AppointmentListItem[]),
      apiFetch<DoctorSummary[]>("/doctors").catch(() => [] as DoctorSummary[]),
    ])
      .then(([ps, as, ds]) => {
        if (!active) return;
        setPatient(ps.find((p) => p.id === id) ?? null);
        setAppointments(as);
        setDoctors(ds);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  // createdById (a user id) → "Dr. Name", so entry meta can show "Added by …".
  const authorById = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of doctors) {
      const name = d.name ? `Dr. ${d.name}` : null;
      if (!name) continue;
      if (d.userId) m.set(d.userId, name);
      m.set(d.id, name);
    }
    return m;
  }, [doctors]);

  // The patient's PAST appointments, newest first (a "previous appointment").
  const pastAppointments = useMemo(() => pastAppointmentsFor(appointments, id), [appointments, id]);

  // Records aren't stored per-appointment, so every card surfaces the patient's
  // FULL record set per tab — each entry keeps its own input date + author.
  const tabEntries = useMemo<Record<TabKey, TabEntry[]>>(() => {
    const authorFor = (createdById: string | null) =>
      createdById ? authorById.get(createdById) ?? null : null;
    return {
      observation: record.observations.map((e) => ({
        id: e.id,
        text: e.text,
        date: e.date,
        author: authorFor(e.createdById),
      })),
      perio: record.teeth.map((e) => ({
        id: e.id,
        text: `Tooth ${e.toothNo} : ${e.remarks}`,
        date: e.date,
        author: authorFor(e.createdById),
      })),
      medical: record.medHistory.map((e) => ({
        id: e.id,
        text: e.text,
        date: e.date,
        author: authorFor(e.createdById),
      })),
    };
  }, [record, authorById]);

  const age = ageFromDob(patient?.dob ?? null);
  const lastVisit = pastAppointments[0] ? fmtDayMonYear(pastAppointments[0].startTime) : "--";

  return (
    <div className="flex flex-1 flex-col gap-[40px]">
      {/* Header: back + title on the left, patient badge on the right. */}
      <div className="flex shrink-0 items-start justify-between gap-6">
        <div className="flex items-center gap-[14px]">
          <BackButton onClick={() => router.back()} ariaLabel="Back" />
          <div>
            <h1 className="font-manrope text-[32px] font-bold leading-[40px] tracking-[-0.6px] text-[#1e1e24]">
              Patient history summary
            </h1>
            <p className="font-manrope text-[15px] font-medium leading-[21px] text-[#1e1e24]">
              A detailed view of previous appointments and the patient&rsquo;s overall care journey.
            </p>
          </div>
        </div>

        {patient && (
          <div className="flex shrink-0 flex-col items-start gap-[2px]">
            <div className="flex items-center gap-[8px]">
              <span className="font-manrope text-[27px] font-semibold leading-[normal] text-[#1e1e24]">
                {patient.name}
              </span>
              {patient.code && (
                <span className="rounded-[6px] bg-[rgba(0,94,184,0.1)] px-[8px] py-[2px] font-manrope text-[15px] font-semibold text-[#0077c0]">
                  {patient.code}
                </span>
              )}
            </div>
            <span className="font-manrope text-[15px] leading-[normal] text-[#727783]">
              Age {age ?? "--"} • {patient.gender ? titleCase(patient.gender) : "--"} • Last Visit: {lastVisit}
            </span>
          </div>
        )}
      </div>

      {/* Appointment cards */}
      {loading ? (
        <p className="font-inter text-[16px] text-[#94a3b8]">Loading patient history…</p>
      ) : pastAppointments.length === 0 ? (
        <p className="font-inter text-[16px] text-[#94a3b8]">
          No previous appointments for this patient yet.
        </p>
      ) : (
        <div className="flex flex-col gap-[25px]">
          {pastAppointments.map((appt) => {
            const noTime = appt.startTime === appt.endTime;
            return (
              <AppointmentHistoryCard
                key={appt.id}
                code={appt.code ?? "—"}
                date={fmtDayMonYear(appt.startTime)}
                time={noTime ? "" : `${fmtClock(appt.startTime)} - ${fmtClock(appt.endTime)}`}
                entries={tabEntries}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/** One past-appointment card with the three record tabs (Figma "Appointment
 *  Section Card"). Each card keeps its own active tab, defaulting to the
 *  Doctor/Clinical observation tab. */
function AppointmentHistoryCard({
  code,
  date,
  time,
  entries,
}: {
  code: string;
  date: string;
  time: string;
  entries: Record<TabKey, TabEntry[]>;
}) {
  const [active, setActive] = useState<TabKey>("observation");
  const rows = entries[active];

  return (
    <section className="flex flex-col gap-[16px] rounded-[20px] border-[1.2px] border-[#c2c6d4] bg-white p-[20px]">
      {/* Card header: appointment id + date/time */}
      <div className="flex items-center justify-between gap-4">
        <span className="font-manrope text-[20px] font-bold leading-[normal] text-[#1e1e24]">{code}</span>
        <div className="flex items-center gap-[8px]">
          <Image src="/dashboard/calendar_today.svg" alt="" width={16} height={16} className="size-[16px]" />
          <span className="font-manrope text-[15px] font-semibold leading-[normal] text-[#1e1e24]">{date}</span>
          {time && (
            <span className="font-manrope text-[15px] font-normal leading-[normal] text-[#1e1e24]">{time}</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-[4px]">
        {(Object.keys(TAB_LABELS) as TabKey[]).map((key) => {
          const selected = key === active;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActive(key)}
              aria-pressed={selected}
              className={`rounded-[8px] px-[16px] py-[10px] font-manrope text-[15px] leading-[normal] transition-colors ${
                selected
                  ? "border border-[#0077c0] bg-[rgba(0,94,184,0.1)] font-bold text-[#0077c0]"
                  : "font-medium text-[#727783] hover:text-[#0077c0]"
              }`}
            >
              {TAB_LABELS[key]}
            </button>
          );
        })}
      </div>

      {/* Tab panel */}
      <div className="rounded-[12px] bg-[rgba(0,94,184,0.1)] p-[16px]">
        {rows.length === 0 ? (
          <p className="font-manrope text-[14px] text-[#727783]">
            No {TAB_LABELS[active].toLowerCase()} records for this appointment.
          </p>
        ) : (
          <div className="flex flex-col gap-[12px]">
            {rows.map((e) => (
              <div key={e.id} className="flex flex-col gap-[6px]">
                <p className="font-manrope text-[15px] font-normal leading-[1.4] text-[#1e1e24]">{e.text}</p>
                <p className="font-manrope text-[11px] leading-[normal] text-[#727783]">
                  <span className="font-semibold text-[#0077c0]">{e.date}</span>
                  {e.author && (
                    <>
                      {" | Added by "}
                      <span className="font-semibold text-[#0077c0]">{e.author}</span>
                    </>
                  )}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
