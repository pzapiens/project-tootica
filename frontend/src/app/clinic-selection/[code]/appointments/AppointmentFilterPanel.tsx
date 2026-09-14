"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Apply Filter panel (Figma "Appts4 - Filter"): a full-content panel that
 * replaces the appointments list while open. Two sorting cards (ID + Date &
 * Time), an Attending Doctor picker (search + checkboxes), Consultation Type and
 * Source checkbox lists, and a Status chip group. Selections are STAGED — they
 * only take effect when "Apply Filters" is clicked (Reset All clears both the
 * draft and any already-applied filters).
 */

export interface AppointmentFilters {
  /** Sort by appointment ID/code. */
  idSort: "asc" | "desc" | null;
  /** Sort by date & time. */
  dateSort: "newest" | "oldest" | null;
  /** Selected attending-doctor ids. */
  doctorIds: string[];
  /** Selected consultation types (raw values, upper-case). */
  consultationTypes: string[];
  /** Selected booking channels ("WEB" / "WHATSAPP"). */
  channels: string[];
  /** Selected status chip labels (display statuses). */
  statuses: string[];
}

export const EMPTY_FILTERS: AppointmentFilters = {
  idSort: null,
  dateSort: null,
  doctorIds: [],
  consultationTypes: [],
  channels: [],
  statuses: [],
};

/** Number of active filter facets — drives the header filter badge. */
export function filterCount(f: AppointmentFilters): number {
  return (
    (f.idSort ? 1 : 0) +
    (f.dateSort ? 1 : 0) +
    f.doctorIds.length +
    f.consultationTypes.length +
    f.channels.length +
    f.statuses.length
  );
}

/** The status chips shown in the filter (display statuses, Figma order).
 *  "Pending" is intentionally omitted: pending (WhatsApp) bookings live in the
 *  "WhatsApp Appointments" popup, not the main table, so there's nothing here to
 *  filter to that status. */
export const STATUS_CHIPS = [
  "Upcoming",
  "On going",
  "Completed",
  "Cancelled",
  "No Show",
] as const;

export interface FilterOption {
  value: string;
  label: string;
}

export default function AppointmentFilterPanel({
  applied,
  doctorOptions,
  consultationOptions,
  channelOptions,
  onApply,
  onClose,
}: {
  applied: AppointmentFilters;
  doctorOptions: FilterOption[];
  consultationOptions: FilterOption[];
  channelOptions: FilterOption[];
  onApply: (filters: AppointmentFilters) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<AppointmentFilters>(applied);
  const [doctorQuery, setDoctorQuery] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const visibleDoctors = useMemo(() => {
    const q = doctorQuery.trim().toLowerCase();
    return q ? doctorOptions.filter((d) => d.label.toLowerCase().includes(q)) : doctorOptions;
  }, [doctorOptions, doctorQuery]);

  /** Toggle a value inside one of the multi-select arrays. */
  function toggleIn(key: "doctorIds" | "consultationTypes" | "channels" | "statuses", value: string) {
    setDraft((d) => {
      const set = new Set(d[key]);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return { ...d, [key]: [...set] };
    });
  }

  /** Select a sort direction, or clear it if the same option is re-clicked. */
  function setIdSort(dir: "asc" | "desc") {
    setDraft((d) => ({ ...d, idSort: d.idSort === dir ? null : dir }));
  }
  function setDateSort(dir: "newest" | "oldest") {
    setDraft((d) => ({ ...d, dateSort: d.dateSort === dir ? null : dir }));
  }

  const count = filterCount(draft);
  const canApply = count > 0;

  return (
    <div className="flex h-[calc((100dvh-76px)/0.9)] flex-col md:h-[calc((100dvh-112px)/0.9)]">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-[14px] border-b border-[rgba(30,30,36,0.5)] pb-[18px]">
        <button type="button" aria-label="Close filter" onClick={onClose}>
          <CloseIcon className="size-9 text-[#1e1e24]" />
        </button>
        <h1 className="font-manrope text-[27px] font-semibold tracking-[-0.5px] text-[#1e1e24]">
          Apply Filter
        </h1>
      </div>

      {/* Options (scrolls). Two independently-packed columns (not a grid) so a
          short card sits flush against the next card in its column — a grid
          would stretch each row to its tallest card, leaving a gap under the
          shorter one (e.g. Attending Doctor → Source). */}
      <div className="min-h-0 flex-1 overflow-y-auto py-[32px]">
        <div className="flex items-start gap-[24px]">
          {/* Left column */}
          <div className="flex flex-1 flex-col gap-[24px]">
            {/* ID Sorting */}
            <Card title="ID Sorting" icon={<SortIcon className="size-6 text-[#1e1e24]" />}>
              <div className="grid grid-cols-2 gap-[16px] pt-[6px]">
                <CheckOption
                  label="Ascending"
                  arrow="up"
                  selected={draft.idSort === "asc"}
                  onClick={() => setIdSort("asc")}
                />
                <CheckOption
                  label="Descending"
                  arrow="down"
                  selected={draft.idSort === "desc"}
                  onClick={() => setIdSort("desc")}
                />
              </div>
            </Card>

            {/* Attending Doctor */}
            <Card title="Attending Doctor" icon={<DoctorIcon className="size-6 text-[#1e1e24]" />}>
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-[16px] top-1/2 size-5 -translate-y-1/2 text-[#94a3b8]" />
                <input
                  type="search"
                  value={doctorQuery}
                  onChange={(e) => setDoctorQuery(e.target.value)}
                  placeholder="Search doctors..."
                  aria-label="Search doctors"
                  className="h-[44px] w-full rounded-[10px] border border-[#c2c6d4] pl-[44px] pr-[14px] font-inter text-[14px] text-[#1e1e24] outline-none placeholder:text-[#94a3b8] focus:border-[#0077c0]"
                />
              </div>
              <div className="flex max-h-[160px] flex-col gap-[12px] overflow-y-auto pt-[6px]">
                {visibleDoctors.length === 0 ? (
                  <span className="font-inter text-[13px] text-[#94a3b8]">No doctors found.</span>
                ) : (
                  visibleDoctors.map((d) => (
                    <CheckboxRow
                      key={d.value}
                      label={d.label}
                      selected={draft.doctorIds.includes(d.value)}
                      onClick={() => toggleIn("doctorIds", d.value)}
                    />
                  ))
                )}
              </div>
            </Card>

            {/* Booking Channel */}
            <Card title="Booking Channel" icon={<SourceIcon className="size-6 text-[#1e1e24]" />}>
              <div className="flex flex-col gap-[12px] pt-[6px]">
                {channelOptions.length === 0 ? (
                  <span className="font-inter text-[13px] text-[#94a3b8]">No channels.</span>
                ) : (
                  channelOptions.map((c) => (
                    <BoxedCheckboxRow
                      key={c.value}
                      label={c.label}
                      selected={draft.channels.includes(c.value)}
                      onClick={() => toggleIn("channels", c.value)}
                    />
                  ))
                )}
              </div>
            </Card>
          </div>

          {/* Right column */}
          <div className="flex flex-1 flex-col gap-[24px]">
            {/* Date & Time Sorting */}
            <Card title="Date & Time Sorting" icon={<SortIcon className="size-6 text-[#1e1e24]" />}>
              <div className="grid grid-cols-2 gap-[16px] pt-[6px]">
                <CheckOption
                  label="Newest to Oldest"
                  arrow="up"
                  selected={draft.dateSort === "newest"}
                  onClick={() => setDateSort("newest")}
                />
                <CheckOption
                  label="Oldest to Newest"
                  arrow="down"
                  selected={draft.dateSort === "oldest"}
                  onClick={() => setDateSort("oldest")}
                />
              </div>
            </Card>

            {/* Consultation Type */}
            <Card title="Consultation Type" icon={<ToothIcon className="size-6 text-[#1e1e24]" />}>
              <div className="flex max-h-[220px] flex-col gap-[12px] overflow-y-auto pt-[6px]">
                {consultationOptions.length === 0 ? (
                  <span className="font-inter text-[13px] text-[#94a3b8]">No consultation types.</span>
                ) : (
                  consultationOptions.map((c) => (
                    <BoxedCheckboxRow
                      key={c.value}
                      label={c.label}
                      selected={draft.consultationTypes.includes(c.value)}
                      onClick={() => toggleIn("consultationTypes", c.value)}
                    />
                  ))
                )}
              </div>
            </Card>

            {/* Status */}
            <Card title="Status" icon={<StatusIcon className="size-6 text-[#1e1e24]" />}>
              <div className="flex flex-wrap gap-[12px] pt-[6px]">
                {STATUS_CHIPS.map((s) => {
                  const selected = draft.statuses.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleIn("statuses", s)}
                      className={`rounded-[10px] border px-[18px] py-[10px] font-inter text-[14px] transition-colors ${
                        selected
                          ? "border-[#0077c0] bg-[#0077c0] text-white"
                          : "border-[#c2c6d4] text-[#1e1e24] hover:border-[#0077c0]"
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-end gap-[12px] border-t border-[rgba(30,30,36,0.5)] pt-[18px]">
        <button
          type="button"
          onClick={() => {
            setDraft(EMPTY_FILTERS);
            if (filterCount(applied) > 0) onApply(EMPTY_FILTERS);
          }}
          disabled={count === 0 && filterCount(applied) === 0}
          className="px-[14px] py-[8px] font-inter text-[11px] font-semibold uppercase tracking-[1px] text-[#1e1e24] opacity-70 transition-opacity hover:opacity-100 disabled:opacity-30"
        >
          Reset All
        </button>
        <button
          type="button"
          disabled={!canApply}
          onClick={() => {
            onApply(draft);
            onClose();
          }}
          className={`rounded-[50px] px-[22px] py-[10px] font-inter text-[14px] text-white transition-colors ${
            canApply ? "bg-[#0077c0] hover:bg-[#0069a8]" : "cursor-not-allowed bg-[#0077c0] opacity-50"
          }`}
        >
          Apply Filters{count > 0 ? ` (${count})` : ""}
        </button>
      </div>
    </div>
  );
}

/** A bordered filter card with an icon + title header. */
function Card({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-[16px] rounded-[28px] border border-[#1e1e24] p-[24px] shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
      <div className="flex items-center gap-[8px]">
        {icon}
        <h2 className="font-manrope text-[18px] font-semibold text-[#1e1e24]">{title}</h2>
      </div>
      {children}
    </div>
  );
}

/** Sort option: a checkbox + label + up/down arrow (ID + Date cards). */
function CheckOption({
  label,
  arrow,
  selected,
  onClick,
}: {
  label: string;
  arrow: "up" | "down";
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-[8px] rounded-[8px] border p-[15px] transition-colors ${
        selected ? "border-[#0077c0] bg-[#0077c0]/5" : "border-[#1e1e24] hover:border-[#0077c0]"
      }`}
    >
      <CheckBox selected={selected} />
      <span className="font-inter text-[13px] text-[#1e1e24]">{label}</span>
      <Arrow dir={arrow} className="size-3 text-[#1e1e24]" />
    </button>
  );
}

/** A left checkbox + label row (Attending Doctor list). */
function CheckboxRow({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-[12px] text-left">
      <CheckBox selected={selected} />
      <span className="font-inter text-[14px] text-[#1e1e24]">{label}</span>
    </button>
  );
}

/** A full-width bordered row with the checkbox on the right (Consultation/Source). */
function BoxedCheckboxRow({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between gap-[12px] rounded-[10px] border px-[16px] py-[13px] text-left transition-colors ${
        selected ? "border-[#0077c0] bg-[#0077c0]/5" : "border-[#c2c6d4] hover:border-[#0077c0]"
      }`}
    >
      <span className="font-inter text-[14px] text-[#1e1e24]">{label}</span>
      <CheckBox selected={selected} />
    </button>
  );
}

function CheckBox({ selected }: { selected: boolean }) {
  return (
    <span
      className={`flex size-[16px] shrink-0 items-center justify-center rounded-[3px] border ${
        selected ? "border-[#0077c0] bg-[#0077c0]" : "border-[#1e1e24] bg-white"
      }`}
    >
      {selected && (
        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="size-[10px]" aria-hidden>
          <path d="M5 12l5 5L20 7" />
        </svg>
      )}
    </span>
  );
}


function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}

function SortIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className} aria-hidden>
      <path d="M4 6h16M4 12h10M4 18h6" />
    </svg>
  );
}

// Same glyph as the sidebar "Doctors" nav item (public/dashboard/oral_disease.svg),
// drawn with currentColor so it matches the other filter-card icons' colour.
function DoctorIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M5 22V13H7V8.4L3.6 5L7.6 1L9 2.4L6.4 5L9 7.6V13H11V22H5ZM13 22V13H15V9.875C14.1333 9.64167 13.4167 9.175 12.85 8.475C12.2833 7.775 12 6.95 12 6C12 4.9 12.3917 3.95833 13.175 3.175C13.9583 2.39167 14.9 2 16 2C17.1 2 18.0417 2.39167 18.825 3.175C19.6083 3.95833 20 4.9 20 6C20 6.95 19.7167 7.775 19.15 8.475C18.5833 9.175 17.8667 9.64167 17 9.875V13H19V22H13ZM16 8C16.55 8 17.0208 7.80417 17.4125 7.4125C17.8042 7.02083 18 6.55 18 6C18 5.45 17.8042 4.97917 17.4125 4.5875C17.0208 4.19583 16.55 4 16 4C15.45 4 14.9792 4.19583 14.5875 4.5875C14.1958 4.97917 14 5.45 14 6C14 6.55 14.1958 7.02083 14.5875 7.4125C14.9792 7.80417 15.45 8 16 8ZM7 20H9V15H7V20ZM15 20H17V15H15V20Z" />
    </svg>
  );
}

function ToothIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M7 3c-2 0-3 1.5-3 4 0 3 1 5 1.5 8 .3 2 .5 4 1.5 4s1.2-2 1.5-4c.2-1.3.5-2 1.5-2s1.3.7 1.5 2c.3 2 .5 4 1.5 4s1.2-2 1.5-4c.5-3 1.5-5 1.5-8 0-2.5-1-4-3-4-1.5 0-2 1-3 1s-1.5-1-3-1z" />
    </svg>
  );
}

function SourceIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </svg>
  );
}

function StatusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function Arrow({ dir, className }: { dir: "up" | "down"; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {dir === "up" ? <path d="M12 19V5M6 11l6-6 6 6" /> : <path d="M12 5v14M6 13l6 6 6-6" />}
    </svg>
  );
}
