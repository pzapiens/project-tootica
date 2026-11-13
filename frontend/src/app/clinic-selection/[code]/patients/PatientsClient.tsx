"use client";

import TableViewport from "@/components/TableViewport";

import { PatientsSkeleton } from "@/components/loading/PageSkeletons";

import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { apiFetch, type AppointmentListItem, type Patient } from "@/lib/api";
import { useExclusiveDropdown } from "@/lib/useExclusiveDropdown";

import DeletePatientDialog from "./DeletePatientDialog";
import EditPatientModal from "./EditPatientModal";
import NewPatientModal from "./NewPatientModal";
import { Tip } from "@/components/HoverTip";

import FilterPanel, { type SortKey } from "./FilterPanel";

/** A patient row enriched with the derived age + most-recent visit. */
export interface PatientRow extends Patient {
  age: number | null;
  /** Most recent past appointment, or null when the patient has never visited. */
  lastVisit: { date: string; time: string; ts: number } | null;
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
): Record<string, { date: string; time: string; ts: number }> {
  const now = Date.now();
  const latest: Record<string, string> = {};
  const out: Record<string, { date: string; time: string; ts: number }> = {};
  for (const a of appts) {
    // Pending WhatsApp leads have no patient yet — skip them.
    const pid = a.patient.id;
    if (!pid) continue;
    const start = new Date(a.startTime).getTime();
    if (start > now) continue; // not a past visit
    if (!latest[pid] || start > new Date(latest[pid]).getTime()) {
      latest[pid] = a.startTime;
      out[pid] = {
        date: fmtShortDate(a.startTime),
        time: `${fmtClock(a.startTime)}- ${fmtClock(a.endTime)}`,
        ts: start,
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
  const router = useRouter();
  const { code } = useParams<{ code: string }>();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [visits, setVisits] = useState<Record<string, { date: string; time: string; ts: number }>>({});
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  // Applied sort criteria (one per card in the Apply Filter panel); the count
  // drives the filter icon badge and the list's multi-key sort.
  const [sorts, setSorts] = useState<SortKey[]>([]);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  const [filterOpen, setFilterOpen] = useState(false);
  const [creating, setCreating] = useState(false);
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

    // Default order (no active sort criterion) is by ID (patient code), highest
    // first.
    if (sorts.length === 0) {
      return [...filtered].sort((a, b) => (b.code ?? "").localeCompare(a.code ?? ""));
    }
    // Multi-key sort: compare by each active criterion in priority order until
    // one breaks the tie. Missing ages sort last (treated as +∞).
    return [...filtered].sort((a, b) => {
      for (const s of sorts) {
        let cmp: number;
        if (s.key === "id") cmp = (a.code ?? "").localeCompare(b.code ?? "");
        else if (s.key === "name") cmp = a.name.localeCompare(b.name);
        else if (s.key === "age") cmp = (a.age ?? Infinity) - (b.age ?? Infinity);
        else {
          // Last clinic visit; "never visited" is treated as the oldest so it
          // sorts to the bottom of "Latest to Old". (-Inf === -Inf → tie.)
          const at = a.lastVisit?.ts ?? -Infinity;
          const bt = b.lastVisit?.ts ?? -Infinity;
          cmp = at === bt ? 0 : at - bt;
        }
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
  if (loading) return <PatientsSkeleton />;

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
    // flex-1 fills the shell's content column (which is sized to the scroll
    // viewport) so the pagination footer pins to the page bottom via mt-auto
    // when the table is short; once the rows overflow, the page scrolls and the
    // footer follows the last row (Figma "Patients": pagination bar under the
    // table).
    <div className="app-page flex flex-1 flex-col gap-[20px]">
      {/* Header */}
      <div className="app-toolbar flex shrink-0 items-center gap-[16px]">
        <h1 className="app-page-title flex-1 font-manrope text-[31px] font-bold leading-[39px] tracking-[-0.7px] text-[#1e1e24]">
          Patients
        </h1>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="app-action-button flex h-[40px] cursor-pointer items-center rounded-[50px] bg-[#0077c0] font-inter text-[14px] font-semibold uppercase tracking-[0.5px] text-white transition-colors hover:bg-[#0069a8]"
        >
          <Image src="/dashboard/add.svg" alt="" width={14} height={14} className="size-3.5 shrink-0" />
          Create Patient
        </button>
        <IconButton
          label="Filter patients"
          tip="Filter"
          onClick={() => setFilterOpen(true)}
          icon="/dashboard/filter_alt.svg"
          badge={sorts.length}
        />
        <IconButton label="Export patients to CSV" tip="Export" onClick={exportCsv} icon="/dashboard/download.svg" />
      </div>

      {/* Search + count */}
      <div className="app-toolbar flex shrink-0 items-center gap-[20px]">
        <div className="app-search-field app-search-field-half relative flex-1">
          <Image
            src="/dashboard/search.svg"
            alt=""
            width={24}
            height={24}
            className="pointer-events-none absolute left-[22px] top-1/2 size-5 -translate-y-1/2"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search here..."
            aria-label="Search patients"
            className="app-search-input h-[40px] w-full rounded-[23px] border-[1.167px] border-black pl-[49px] pr-[17px] font-inter text-[14px] text-[#1e1e24] outline-none "
          />
        </div>
        <p className="shrink-0 font-inter text-[17px] leading-[25px] text-[#1e1e24]">
          Counts : <span className="font-bold">{loading ? "—" : total}</span>
        </p>
      </div>

      {/* Table — fills the space between search and pagination; the body scrolls. */}
      <TableViewport label="Patients" minWidth="1200px" className="flex flex-col rounded-[24px] border border-black bg-white">
        {/* Header row (fixed) */}
        <div className="app-table-header grid shrink-0 grid-cols-[minmax(0,104fr)_minmax(0,198fr)_minmax(0,150fr)_minmax(0,212fr)_minmax(0,94fr)_minmax(0,204fr)_148px] items-center border-b border-black">
          {["ID", "Patient Name", "Phone", "Email", "Age / Gender", "Last Clinic Visit", "Actions"].map(
            (h) => (
              <span
                key={h}
                className="px-[24px] py-[22px] text-left font-inter text-[14px] font-semibold uppercase leading-[19px] tracking-[0.7px] text-[#727783]"
              >
                {h}
              </span>
            ),
          )}
        </div>

        {/* Body */}
        <div>
          {loading ? (
            <p className="px-[24px] py-8 font-inter text-[14px] text-[#94a3b8]">Loading patients…</p>
          ) : total === 0 ? (
            <p className="px-[24px] py-8 font-inter text-[14px] text-[#94a3b8]">
              {query.trim() ? "No patients match your search." : "No patients yet."}
            </p>
          ) : (
            pageRows.map((p) => (
              <PatientRowView
                key={p.id}
                patient={p}
                onEdit={() => setEditing(p)}
                onDelete={() => setDeleting(p)}
                onOpenHistory={() =>
                  // Clicking the name opens the read-only Patient History Summary.
                  router.push(`/clinic-selection/${code}/patients/${p.id}/history`)
                }
                onAppointments={() =>
                  // Deep-link to the appointments page filtered to exactly this
                  // patient (by id).
                  router.push(`/clinic-selection/${code}/appointments?patientId=${p.id}`)
                }
              />
            ))
          )}
        </div>
      </TableViewport>

      {/* Footer: records + per-page + pagination. mt-auto pins it to the page
          bottom when the table is too short to scroll; it follows the rows once
          the table overflows (Figma "Pagination"). */}
      {!loading && total > 0 && (
        <div className="mt-auto flex shrink-0 flex-wrap items-center justify-between gap-3.5">
          <div className="app-pagination flex items-center gap-[20px]">
            <span className="font-inter text-[14px] leading-[20px] text-[#1e1e24]">
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

      {creating && (
        <NewPatientModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            setRev((r) => r + 1);
          }}
        />
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
  tip,
  onClick,
  icon,
  badge = 0,
}: {
  label: string;
  /** Short hover-tooltip text (falls back to `label`). */
  tip?: string;
  onClick: () => void;
  icon: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      aria-label={badge > 0 ? `${label} (${badge} active)` : label}
      onClick={onClick}
      className="group relative flex size-[40px] items-center justify-center rounded-full border-[1.167px] border-black transition-colors"
    >
      <Image src={icon} alt="" width={28} height={28} className="size-5" />
      {badge > 0 && (
        <span className="absolute -right-[2px] -top-[2px] flex size-[22px] items-center justify-center rounded-full border-2 border-white bg-[#0077c0] font-inter text-[12px] font-semibold leading-none text-white">
          {badge}
        </span>
      )}
      <Tip label={tip ?? label} below />
    </button>
  );
}

function PatientRowView({
  patient,
  onEdit,
  onDelete,
  onOpenHistory,
  onAppointments,
}: {
  patient: PatientRow;
  onEdit: () => void;
  onDelete: () => void;
  onOpenHistory: () => void;
  onAppointments: () => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,104fr)_minmax(0,198fr)_minmax(0,150fr)_minmax(0,212fr)_minmax(0,94fr)_minmax(0,204fr)_148px] items-center border-b border-black last:border-b-0">
      {/* ID */}
      <span className="px-[24px] py-[20px] text-left font-inter text-[14px] font-medium leading-[21px] text-[#1e1e24]">
        {patient.code ?? "—"}
      </span>
      {/* Name — opens the patient's history summary. */}
      <span className="px-[24px] py-[20px] text-left">
        <button
          type="button"
          onClick={onOpenHistory}
          className="cursor-pointer font-inter text-[14px] font-medium leading-[21px] text-[#1e1e24] transition-colors hover:text-[#0077c0]"
        >
          {patient.name}
        </button>
      </span>
      {/* Phone */}
      <span className="px-[24px] py-[20px] text-left font-inter text-[14px] font-medium leading-[19px] text-[#1e1e24]">
        {fmtPhone(patient.phone)}
      </span>
      {/* Keep long emails on one line so adjacent cells remain aligned. */}
      <span title={patient.email || undefined} className="min-w-0 truncate px-[24px] py-[20px] text-left font-inter text-[14px] font-medium leading-[19px] text-[#1e1e24]">
        {patient.email || "--"}
      </span>
      {/* Age / Gender */}
      <span className="px-[24px] py-[20px] text-left font-inter text-[14px] font-medium leading-[19px] text-[#1e1e24]">
        {patient.age === null ? "--" : patient.age} / {patient.gender || "--"}
      </span>
      {/* Last clinic visit — date + time, each kept on its own single line. */}
      <div className="px-[24px] py-[20px] text-left font-inter text-[14px] font-medium leading-[20px] text-[#1e1e24]">
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
      <div className="flex items-center justify-start gap-[8px] px-[24px] py-[20px]">
        <button type="button" onClick={onEdit} aria-label={`Edit ${patient.name}`} className="group relative flex size-[28px] items-center justify-center">
          <Image src="/dashboard/edit_square.svg" alt="" width={24} height={24} className="size-5" />
          <Tip label="Edit" />
        </button>
        <button
          type="button"
          onClick={onAppointments}
          aria-label={`View ${patient.name}'s appointments`}
          className="group relative flex size-[28px] items-center justify-center opacity-90"
        >
          <Image src="/dashboard/book_appointment.svg" alt="" width={24} height={24} className="size-5" />
          <Tip label="Appointments" />
        </button>
        <button type="button" onClick={onDelete} aria-label={`Delete ${patient.name}`} className="group relative flex size-[28px] items-center justify-center">
          <Image src="/dashboard/delete.svg" alt="" width={24} height={24} className="size-5" />
          <Tip label="Delete" />
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
        className="flex h-[44px] items-center gap-[10px] rounded-[10px] border-[1.167px] border-black px-[13px] font-inter text-[14px] text-[#1e1e24] transition-colors"
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
        <div className="absolute bottom-[calc(100%+8px)] left-0 z-30 flex w-[176px] flex-col gap-[5px] rounded-[13px] border-[1.167px] border-black bg-white p-[14px] drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
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
                className="flex w-full items-center justify-between rounded-[8px] bg-[#f1f5f9] p-[10px] text-left transition-colors app-option-hover"
              >
                <span className="font-manrope text-[14px] font-semibold leading-[20px] text-[#1e1e24]">
                  {n} per page
                </span>
                {selected ? (
                  <span className="flex size-3 shrink-0 items-center justify-center rounded-full border-[1.167px] border-black">
                    <span className="size-1.5 rounded-full bg-[#1e1e24]" />
                  </span>
                ) : (
                  <span className="size-3 shrink-0 rounded-full border-[1.167px] border-black" />
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
    <div className="app-pagination-controls flex items-center gap-[8px]">
      <PageArrow
        label="Previous page"
        disabled={current === 1}
        onClick={() => onChange(current - 1)}
        flip
      />
      {pageList(current, total).map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} className="px-[6px] font-inter text-[14px] text-[#94a3b8]">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            aria-current={p === current ? "page" : undefined}
            onClick={() => onChange(p)}
            className={`flex size-[40px] items-center justify-center rounded-[10px] font-inter text-[14px] transition-colors ${
              p === current
                ? "bg-[#0077c0] font-semibold text-white"
                : "text-[#1e1e24] app-option-hover"
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
      className="flex size-[40px] items-center justify-center rounded-[10px] border-[1.167px] border-black transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-black"
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
