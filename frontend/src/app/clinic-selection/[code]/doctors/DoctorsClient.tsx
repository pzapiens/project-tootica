"use client";

import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { apiFetch, type DoctorSummary } from "@/lib/api";
import { useExclusiveDropdown } from "@/lib/useExclusiveDropdown";

import DoctorAvailabilityModal from "../dashboard/DoctorAvailabilityModal";
import DeleteDoctorDialog from "./DeleteDoctorDialog";
import DoctorFilterPanel, {
  EMPTY_FILTERS,
  filterCount,
  type DoctorFilters,
} from "./DoctorFilterPanel";
import NewDoctorModal from "./NewDoctorModal";

const PER_PAGE_OPTIONS = [10, 20, 50, 100];

/** Display a stored phone as "+91 9876543210" (last 10 digits); "--" if none. */
function fmtPhone(phone: string | null): string {
  if (!phone) return "--";
  const digits = phone.replace(/\D/g, "");
  const local = digits.slice(-10);
  return local ? `+91 ${local}` : "--";
}

/** A doctor's display name with the "Dr." honorific (Figma "Dr. Vance Jacob"). */
function drName(name: string | null): string {
  if (!name) return "—";
  return /^dr\.?\s/i.test(name) ? name : `Dr. ${name}`;
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

export default function DoctorsClient() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = params.code;

  const [doctors, setDoctors] = useState<DoctorSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<DoctorFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  const [filterOpen, setFilterOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [availabilityFor, setAvailabilityFor] = useState<DoctorSummary | null>(null);
  const [deleting, setDeleting] = useState<DoctorSummary | null>(null);

  // Bumped after a delete (and future create/edit) to refetch the list.
  const [rev, setRev] = useState(0);

  useEffect(() => {
    let active = true;
    apiFetch<DoctorSummary[]>("/doctors")
      .then((list) => {
        if (active) setDoctors(list);
      })
      .catch(() => {
        if (active) setDoctors([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [rev]);

  // Search → specialization filter → ID sort. Pagination is applied after.
  const rows = useMemo<DoctorSummary[]>(() => {
    const q = query.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    let out = doctors;

    if (q) {
      out = out.filter((d) => {
        const phoneDigits = (d.phone ?? "").replace(/\D/g, "");
        const textHit = [d.code, d.name, d.specialization].some((f) =>
          (f ?? "").toLowerCase().includes(q),
        );
        const phoneHit = qDigits.length > 0 && phoneDigits.includes(qDigits);
        return textHit || phoneHit;
      });
    }

    if (filters.specializations.length > 0) {
      const set = new Set(filters.specializations.map((s) => s.toLowerCase()));
      out = out.filter((d) => d.specialization && set.has(d.specialization.toLowerCase()));
    }

    if (filters.sort) {
      out = [...out].sort((a, b) => {
        const cmp = (a.code ?? "").localeCompare(b.code ?? "");
        return filters.sort === "desc" ? -cmp : cmp;
      });
    }

    return out;
  }, [doctors, query, filters]);

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
    const header = ["ID", "Doctor Name", "Phone", "Specialization"];
    const lines = rows.map((d) =>
      [
        d.code ?? "",
        drName(d.name).replace("—", ""),
        fmtPhone(d.phone).replace("--", ""),
        d.specialization ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
    const csv = [header.join(","), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `doctors-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Open the per-doctor shift editor (Figma "Edit Doctor Shift"). */
  function openShift(doctor: DoctorSummary) {
    router.push(`/clinic-selection/${code}/doctors/${doctor.id}/shift`);
  }

  // dd/mm/yyyy today — the seed date the availability modal opens on.
  const today = (() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  })();

  // The Apply Filter panel replaces the whole content area (Figma "Doctors3 - filter").
  if (filterOpen) {
    return (
      <DoctorFilterPanel
        applied={filters}
        onApply={(f) => {
          setFilters(f);
          setPage(1);
        }}
        onClose={() => setFilterOpen(false)}
      />
    );
  }

  return (
    // Fill the panel's content area so the pagination pins to the bottom and only
    // the table body scrolls (same layout as Patients).
    <div className="flex h-[calc((100dvh-76px)/0.9)] flex-col gap-[24px] md:h-[calc((100dvh-112px)/0.9)]">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-[19px]">
        <h1 className="flex-1 font-manrope text-[35px] font-bold leading-[44px] tracking-[-0.7px] text-[#1e1e24]">
          Doctors
        </h1>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex h-[54px] items-center gap-[10px] rounded-[50px] bg-[#0077c0] px-[26px] font-inter text-[15px] font-semibold uppercase tracking-[0.5px] text-white transition-colors hover:bg-[#0069a8]"
        >
          <Image src="/dashboard/add.svg" alt="" width={22} height={22} className="size-[22px] [filter:brightness(0)_invert(1)]" />
          Create Doctor
        </button>
        <IconButton
          label="Filter doctors"
          onClick={() => setFilterOpen(true)}
          icon="/dashboard/filter_alt.svg"
          badge={filterCount(filters)}
        />
        <IconButton label="Export doctors to CSV" onClick={exportCsv} icon="/dashboard/download.svg" />
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
            placeholder="Search doctor by id,doctor name etc..."
            aria-label="Search doctors"
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
        <div className="grid shrink-0 grid-cols-[130fr_250fr_190fr_240fr_150fr] border-b-[1.2px] border-[rgba(194,198,212,0.5)]">
          {["ID", "Doctor Name", "Phone", "Specialization", "Actions"].map((h) => (
            <span
              key={h}
              className="px-[29px] py-[26px] text-left font-inter text-[14px] font-semibold uppercase leading-[19px] tracking-[0.7px] text-[#727783]"
            >
              {h}
            </span>
          ))}
        </div>

        {/* Body (scrolls) */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <p className="px-[29px] py-10 font-inter text-[16px] text-[#94a3b8]">Loading doctors…</p>
          ) : total === 0 ? (
            <p className="px-[29px] py-10 font-inter text-[16px] text-[#94a3b8]">
              {query.trim() || filterCount(filters) > 0
                ? "No doctors match your search."
                : "No doctors yet."}
            </p>
          ) : (
            pageRows.map((d) => (
              <DoctorRowView
                key={d.id}
                doctor={d}
                onEdit={() => openShift(d)}
                onSchedule={() => setAvailabilityFor(d)}
                onDelete={() => setDeleting(d)}
              />
            ))
          )}
        </div>
      </div>

      {/* Footer: records + per-page + pagination pinned to the bottom. */}
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

      {creating && (
        <NewDoctorModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            setRev((r) => r + 1);
          }}
        />
      )}
      {availabilityFor && (
        <DoctorAvailabilityModal
          doctor={drName(availabilityFor.name)}
          doctorId={availabilityFor.id}
          date={today}
          onClose={() => setAvailabilityFor(null)}
        />
      )}
      {deleting && (
        <DeleteDoctorDialog
          doctor={deleting}
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

/** Circular outlined icon button used in the header (Filter / Export). */
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

function DoctorRowView({
  doctor,
  onEdit,
  onSchedule,
  onDelete,
}: {
  doctor: DoctorSummary;
  onEdit: () => void;
  onSchedule: () => void;
  onDelete: () => void;
}) {
  // Only guest doctors (created here) can be deleted; employed doctors
  // (role DOCTOR) are managed through the account flow.
  const deletable = doctor.role === "GUEST_DOCTOR";
  return (
    <div className="grid grid-cols-[130fr_250fr_190fr_240fr_150fr] items-center border-b-[1.2px] border-[rgba(194,198,212,0.5)] last:border-b-0">
      {/* ID */}
      <span className="px-[29px] py-[24px] text-left font-inter text-[16px] font-medium leading-[24px] text-[#1e1e24]">
        {doctor.code ?? "—"}
      </span>
      {/* Name */}
      <span className="px-[29px] py-[24px] text-left font-inter text-[16px] font-medium leading-[24px] text-[#1e1e24]">
        {drName(doctor.name)}
      </span>
      {/* Phone */}
      <span className="px-[29px] py-[24px] text-left font-inter text-[14px] font-medium leading-[19px] text-[#1e1e24]">
        {fmtPhone(doctor.phone)}
      </span>
      {/* Specialization */}
      <span className="px-[29px] py-[24px] text-left font-inter text-[16px] font-medium leading-[24px] text-[#1e1e24]">
        {doctor.specialization || "—"}
      </span>
      {/* Actions — edit (add shifts) + availability for all; delete only for guests. */}
      <div className="flex items-center justify-start gap-[10px] px-[20px] py-[24px]">
        <button type="button" onClick={onEdit} aria-label={`Edit ${drName(doctor.name)}`} className="flex size-[34px] items-center justify-center">
          <Image src="/dashboard/edit_square.svg" alt="" width={24} height={24} className="size-6" />
        </button>
        <button type="button" onClick={onSchedule} aria-label={`Availability for ${drName(doctor.name)}`} className="flex size-[34px] items-center justify-center">
          <Image src="/dashboard/calendar_clock.svg" alt="" width={24} height={24} className="size-6" />
        </button>
        {deletable && (
          <button type="button" onClick={onDelete} aria-label={`Delete ${drName(doctor.name)}`} className="flex size-[34px] items-center justify-center">
            <Image src="/dashboard/delete.svg" alt="" width={24} height={24} className="size-6" />
          </button>
        )}
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

/** Numbered pagination with ellipsis + prev/next chevrons. */
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
      <PageArrow label="Previous page" disabled={current === 1} onClick={() => onChange(current - 1)} flip />
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
              p === current ? "bg-[#0077c0] font-semibold text-white" : "text-[#1e1e24] hover:bg-[#f1f5f9]"
            }`}
          >
            {p}
          </button>
        ),
      )}
      <PageArrow label="Next page" disabled={current === total} onClick={() => onChange(current + 1)} />
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
      <Image src="/dashboard/chevron_dark.svg" alt="" width={20} height={20} className={`size-5 ${flip ? "" : "rotate-180"}`} />
    </button>
  );
}
