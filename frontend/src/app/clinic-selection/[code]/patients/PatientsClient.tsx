"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import { apiFetch, type AppointmentListItem, type Patient } from "@/lib/api";
import { useExclusiveDropdown } from "@/lib/useExclusiveDropdown";

import DeletePatientDialog from "./DeletePatientDialog";
import EditPatientModal from "./EditPatientModal";
import FilterPanel, { type SortKey } from "./FilterPanel";

/** A patient row enriched with the derived age + most-recent visit. */
export interface PatientRow extends Patient {
  age: number | null;
  /** Most recent past appointment, or null when the patient has never visited. */
  lastVisit: { date: string; time: string } | null;
}

const PER_PAGE_OPTIONS = [10, 20, 50, 100];

const p2 = (n: number) => String(n).padStart(2, "0");

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

/** ISO datetime → "09:00 AM" (local). */
function fmtClock(iso: string): string {
  const d = new Date(iso);
  const period = d.getHours() >= 12 ? "PM" : "AM";
  const h = d.getHours() % 12 || 12;
  return `${p2(h)}:${p2(d.getMinutes())} ${period}`;
}

/** ISO datetime → "dd/mm/yy" (local). */
function fmtShortDate(iso: string): string {
  const d = new Date(iso);
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)}`;
}

/** Display a stored phone as "+91 9876543210" (last 10 digits); "--" if none. */
function fmtPhone(phone: string | null): string {
  if (!phone) return "--";
  const digits = phone.replace(/\D/g, "");
  const local = digits.slice(-10);
  return local ? `+91 ${local}` : "--";
}

/**
 * Fold the clinic's appointments into a map of patientId → most-recent PAST
 * appointment (the "last clinic visit"). Future/scheduled appointments don't
 * count as a visit yet.
 */
function lastVisitsByPatient(
  appts: AppointmentListItem[],
): Record<string, { date: string; time: string }> {
  const now = Date.now();
  const latest: Record<string, string> = {};
  const out: Record<string, { date: string; time: string }> = {};
  for (const a of appts) {
    const start = new Date(a.startTime).getTime();
    if (start > now) continue; // not a past visit
    if (!latest[a.patient.id] || start > new Date(latest[a.patient.id]).getTime()) {
      latest[a.patient.id] = a.startTime;
      out[a.patient.id] = {
        date: fmtShortDate(a.startTime),
        time: `${fmtClock(a.startTime)}- ${fmtClock(a.endTime)}`,
      };
    }
  }
  return out;
}

/** Build the visible page-number list, e.g. [1,2,3,"…",7] for the pagination. */
function pageList(current: number, total: number): Array<number | "…"> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: Array<number | "…"> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) out.push("…");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < total - 1) out.push("…");
  out.push(total);
  return out;
}

/** Escape one CSV cell (wrap in quotes when it contains a comma/quote/newline). */
function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export default function PatientsClient() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [visits, setVisits] = useState<Record<string, { date: string; time: string }>>({});
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  // Applied sort criteria (one per card in the Apply Filter panel); the count
  // drives the filter icon badge and the list's multi-key sort.
  const [sorts, setSorts] = useState<SortKey[]>([]);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  const [filterOpen, setFilterOpen] = useState(false);
  const [editing, setEditing] = useState<PatientRow | null>(null);
  const [deleting, setDeleting] = useState<PatientRow | null>(null);

  // Bumped after a create/edit/delete to refetch the list.
  const [rev, setRev] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<Patient[]>("/patients"),
      apiFetch<AppointmentListItem[]>("/appointments?limit=500").catch(() => []),
    ])
      .then(([list, appts]) => {
        if (!active) return;
        setPatients(list);
        setVisits(lastVisitsByPatient(appts));
      })
      .catch(() => {
        if (active) {
          setPatients([]);
          setVisits({});
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [rev]);

  // Enrich → search → sort. Pagination is applied after, over the result.
  const rows = useMemo<PatientRow[]>(() => {
    const enriched: PatientRow[] = patients.map((p) => ({
      ...p,
      age: ageFromDob(p.dob),
      lastVisit: visits[p.id] ?? null,
    }));

    // Match name / ID / phone / email. The email is matched by its LOCAL part
    // (before "@") and the phone by digits only, so a query isn't swallowed by a
    // shared domain (e.g. "@example.com") or the "+91" country code — otherwise
    // common single letters would match every row and look like no filtering.
    const q = query.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    const filtered = q
      ? enriched.filter((p) => {
          const emailLocal = (p.email ?? "").split("@")[0];
          const phoneDigits = (p.phone ?? "").replace(/\D/g, "");
          const textHit = [p.code, p.name, emailLocal].some((f) =>
            (f ?? "").toLowerCase().includes(q),
          );
          const phoneHit = qDigits.length > 0 && phoneDigits.includes(qDigits);
          return textHit || phoneHit;
        })
      : enriched;

    if (sorts.length === 0) return filtered;
    // Multi-key sort: compare by each active criterion in priority order until
    // one breaks the tie. Missing ages sort last (treated as +∞).
    return [...filtered].sort((a, b) => {
      for (const s of sorts) {
        let cmp: number;
        if (s.key === "id") cmp = (a.code ?? "").localeCompare(b.code ?? "");
        else if (s.key === "name") cmp = a.name.localeCompare(b.name);
        else cmp = (a.age ?? Infinity) - (b.age ?? Infinity);
        if (s.dir === "desc") cmp = -cmp;
        if (cmp !== 0) return cmp;
      }
      return 0;
    });
  }, [patients, visits, query, sorts]);

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(page, pageCount);
  const pageRows = useMemo(
    () => rows.slice((safePage - 1) * perPage, safePage * perPage),
    [rows, safePage, perPage],
  );
  const firstRow = total === 0 ? 0 : (safePage - 1) * perPage + 1;
  const lastRow = Math.min(safePage * perPage, total);

  function exportCsv() {
    const header = ["ID", "Patient Name", "Phone", "Email", "Age", "Gender", "Last Clinic Visit"];
    const lines = rows.map((p) =>
      [
        p.code ?? "",
        p.name,
        fmtPhone(p.phone).replace("--", ""),
        p.email ?? "",
        p.age === null ? "" : String(p.age),
        p.gender ?? "",
        p.lastVisit ? `${p.lastVisit.date} ${p.lastVisit.time}` : "",
      ]
        .map(csvCell)
        .join(","),
    );
    const csv = [header.join(","), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `patients-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // The Apply Filter panel replaces the whole content area (Figma "Patients - Filter").
  if (filterOpen) {
    return (
      <FilterPanel
        applied={sorts}
        onApply={(s) => {
          setSorts(s);
          setPage(1);
        }}
        onClose={() => setFilterOpen(false)}
      />
    );
  }

  return (
    // Fill the panel's content area so the pagination pins to the bottom and only
    // the table body scrolls (Figma "Patients": fixed pagination bar under a
    // scrolling table). Height ≈ viewport − main padding (19*2) − panel padding
    // (24*2 base / 42*2 md), divided by the shell's 0.9 zoom. The constant is
    // trimmed by 10px so the bottom gap matches the top (no extra space below).
    <div className="flex h-[calc((100dvh-76px)/0.9)] flex-col gap-[24px] md:h-[calc((100dvh-112px)/0.9)]">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-[19px]">
        <h1 className="flex-1 font-manrope text-[35px] font-bold leading-[44px] tracking-[-0.7px] text-[#1e1e24]">
          Patients
        </h1>
        <IconButton
          label="Filter patients"
          onClick={() => setFilterOpen(true)}
          icon="/dashboard/filter_alt.svg"
          badge={sorts.length}
        />
        <IconButton label="Export patients to CSV" onClick={exportCsv} icon="/dashboard/download.svg" />
      </div>

      {/* Search + count */}
      <div className="flex shrink-0 items-center gap-[24px]">
        <div className="relative flex-1">
          <Image
            src="/dashboard/search.svg"
            alt=""
            width={24}
            height={24}
            className="pointer-events-none absolute left-[22px] top-1/2 size-6 -translate-y-1/2"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search patient by id,Patient name etc..."
            aria-label="Search patients"
            className="h-[54px] w-full rounded-[27px] border-[1.2px] border-[#c2c6d4] pl-[58px] pr-[20px] font-inter text-[16px] text-[#1e1e24] outline-none placeholder:text-[#94a3b8] focus:border-[#0077c0]"
          />
        </div>
        <p className="shrink-0 font-inter text-[19px] leading-[28px] text-[#1e1e24]">
          Counts : <span className="font-bold">{loading ? "—" : total}</span>
        </p>
      </div>

      {/* Table — fills the space between search and pagination; the body scrolls. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border-[1.2px] border-[#c2c6d4] bg-white">
        {/* Header row (fixed) */}
        <div className="grid shrink-0 grid-cols-[104fr_198fr_150fr_212fr_94fr_204fr_164fr] border-b-[1.2px] border-[rgba(194,198,212,0.5)]">
          {["ID", "Patient Name", "Phone", "Email", "Age / Gender", "Last Clinic Visit", "Actions"].map(
            (h) => (
              <span
                key={h}
                className="px-[29px] py-[26px] text-left font-inter text-[14px] font-semibold uppercase leading-[19px] tracking-[0.7px] text-[#727783]"
              >
                {h}
              </span>
            ),
          )}
        </div>

        {/* Body (scrolls) */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <p className="px-[29px] py-10 font-inter text-[16px] text-[#94a3b8]">Loading patients…</p>
          ) : total === 0 ? (
            <p className="px-[29px] py-10 font-inter text-[16px] text-[#94a3b8]">
              {query.trim() ? "No patients match your search." : "No patients yet."}
            </p>
          ) : (
            pageRows.map((p) => (
              <PatientRowView
                key={p.id}
                patient={p}
                onEdit={() => setEditing(p)}
                onDelete={() => setDeleting(p)}
              />
            ))
          )}
        </div>
      </div>

      {/* Footer: records + per-page + pagination. A fixed bar at the bottom of
          the panel (Figma "Pagination"); the table body above it scrolls. */}
      {!loading && total > 0 && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-[24px]">
            <span className="font-inter text-[15px] leading-[22px] text-[#1e1e24]">
              Showing {firstRow}-{lastRow} of {total} records
            </span>
            <div className="flex items-center gap-[10px]">
              <span className="font-inter text-[12px] font-semibold uppercase tracking-[0.6px] text-[#727783]">
                Show:
              </span>
              <PerPageDropdown
                value={perPage}
                onChange={(n) => {
                  setPerPage(n);
                  setPage(1);
                }}
              />
            </div>
          </div>
          <Pagination current={safePage} total={pageCount} onChange={setPage} />
        </div>
      )}

      {editing && (
        <EditPatientModal
          patient={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setRev((r) => r + 1);
          }}
        />
      )}
      {deleting && (
        <DeletePatientDialog
          patient={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            setRev((r) => r + 1);
          }}
        />
      )}
    </div>
  );
}

/** Circular outlined icon button used in the header (Filter / Export). Shows a
 *  small count badge (e.g. active filters) when `badge` is a positive number. */
function IconButton({
  label,
  onClick,
  icon,
  badge = 0,
}: {
  label: string;
  onClick: () => void;
  icon: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      aria-label={badge > 0 ? `${label} (${badge} active)` : label}
      onClick={onClick}
      className="relative flex size-[54px] items-center justify-center rounded-full border-[1.4px] border-[#c2c6d4] transition-colors hover:border-[#0077c0]"
    >
      <Image src={icon} alt="" width={28} height={28} className="size-7" />
      {badge > 0 && (
        <span className="absolute -right-[2px] -top-[2px] flex size-[22px] items-center justify-center rounded-full border-2 border-white bg-[#0077c0] font-inter text-[12px] font-semibold leading-none text-white">
          {badge}
        </span>
      )}
    </button>
  );
}

function PatientRowView({
  patient,
  onEdit,
  onDelete,
}: {
  patient: PatientRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="grid grid-cols-[104fr_198fr_150fr_212fr_94fr_204fr_164fr] items-start border-b-[1.2px] border-[rgba(194,198,212,0.5)] last:border-b-0">
      {/* ID */}
      <span className="px-[29px] py-[24px] text-left font-inter text-[16px] font-medium leading-[24px] text-[#1e1e24]">
        {patient.code ?? "—"}
      </span>
      {/* Name */}
      <span className="px-[29px] py-[24px] text-left font-inter text-[16px] font-medium leading-[24px] text-[#1e1e24]">
        {patient.name}
      </span>
      {/* Phone */}
      <span className="px-[29px] py-[24px] text-left font-inter text-[14px] font-medium leading-[19px] text-[#1e1e24]">
        {fmtPhone(patient.phone)}
      </span>
      {/* Email — wraps within the column (long addresses break onto a new line). */}
      <span className="[overflow-wrap:anywhere] px-[29px] py-[24px] text-left font-inter text-[14px] font-medium leading-[19px] text-[#1e1e24]">
        {patient.email || "--"}
      </span>
      {/* Age / Gender */}
      <span className="px-[29px] py-[24px] text-left font-inter text-[14px] font-medium leading-[19px] text-[#1e1e24]">
        {patient.age === null ? "--" : patient.age} / {patient.gender || "--"}
      </span>
      {/* Last clinic visit — date + time, each kept on its own single line. */}
      <div className="px-[29px] py-[24px] text-left font-inter text-[14px] font-medium leading-[22px] text-[#1e1e24]">
        {patient.lastVisit ? (
          <>
            <p className="whitespace-nowrap">{patient.lastVisit.date}</p>
            <p className="whitespace-nowrap">{patient.lastVisit.time}</p>
          </>
        ) : (
          <p>--</p>
        )}
      </div>
      {/* Actions */}
      <div className="flex items-center justify-start gap-[8px] px-[20px] py-[24px]">
        <button type="button" onClick={onEdit} aria-label={`Edit ${patient.name}`} className="flex size-[34px] items-center justify-center">
          <Image src="/dashboard/edit_square.svg" alt="" width={24} height={24} className="size-6" />
        </button>
        <button
          type="button"
          aria-label={`Book appointment for ${patient.name}`}
          className="flex size-[34px] items-center justify-center opacity-90"
        >
          <Image src="/dashboard/book_appointment.svg" alt="" width={24} height={24} className="size-6" />
        </button>
        <button type="button" onClick={onDelete} aria-label={`Delete ${patient.name}`} className="flex size-[34px] items-center justify-center">
          <Image src="/dashboard/delete.svg" alt="" width={24} height={24} className="size-6" />
        </button>
      </div>
    </div>
  );
}

/** "20 per page" dropdown for the pagination footer. */
function PerPageDropdown({ value, onChange }: { value: number; onChange: (n: number) => void }) {
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
        className="flex h-[44px] items-center gap-[10px] rounded-[10px] border-[1.2px] border-[#c2c6d4] px-[16px] font-inter text-[15px] text-[#1e1e24] transition-colors hover:border-[#0077c0]"
      >
        {value} per page
        <Image
          src="/dashboard/chevron_dark.svg"
          alt=""
          width={20}
          height={20}
          className={`size-5 transition-transform ${open ? "rotate-90" : "-rotate-90"}`}
        />
      </button>
      {open && (
        <div className="absolute bottom-[calc(100%+8px)] left-0 z-30 flex w-[176px] flex-col gap-[5px] rounded-[15px] border border-[#c2c6d4] bg-white p-[17px] drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
          {PER_PAGE_OPTIONS.map((n) => {
            const selected = n === value;
            return (
              <button
                key={n}
                type="button"
                onClick={() => {
                  onChange(n);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-[8px] bg-[#f1f5f9] p-[10px] text-left transition-colors hover:bg-[#e9eef4]"
              >
                <span className="font-manrope text-[14px] font-semibold leading-[20px] text-[#1e1e24]">
                  {n} per page
                </span>
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
  );
}

/** Numbered pagination with ellipsis + prev/next chevrons (Figma "Pagination"). */
function Pagination({
  current,
  total,
  onChange,
}: {
  current: number;
  total: number;
  onChange: (page: number) => void;
}) {
  if (total <= 1) return null;
  return (
    <div className="flex items-center gap-[8px]">
      <PageArrow
        label="Previous page"
        disabled={current === 1}
        onClick={() => onChange(current - 1)}
        flip
      />
      {pageList(current, total).map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} className="px-[6px] font-inter text-[15px] text-[#94a3b8]">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            aria-current={p === current ? "page" : undefined}
            onClick={() => onChange(p)}
            className={`flex size-[40px] items-center justify-center rounded-[10px] font-inter text-[15px] transition-colors ${
              p === current
                ? "bg-[#0077c0] font-semibold text-white"
                : "text-[#1e1e24] hover:bg-[#f1f5f9]"
            }`}
          >
            {p}
          </button>
        ),
      )}
      <PageArrow
        label="Next page"
        disabled={current === total}
        onClick={() => onChange(current + 1)}
      />
    </div>
  );
}

function PageArrow({
  label,
  disabled,
  onClick,
  flip = false,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  flip?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-[40px] items-center justify-center rounded-[10px] border-[1.2px] border-[#c2c6d4] transition-colors hover:border-[#0077c0] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#c2c6d4]"
    >
      <Image
        src="/dashboard/chevron_dark.svg"
        alt=""
        width={20}
        height={20}
        className={`size-5 ${flip ? "" : "rotate-180"}`}
      />
    </button>
  );
}
