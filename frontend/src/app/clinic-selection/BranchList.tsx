"use client";

import Image from "next/image";
import { useState } from "react";

import { Tip } from "@/components/HoverTip";

export type Branch = {
  id: string;
  branch: string;
  pic: string;
  contact: string;
  /** Optional short code (e.g. c001) shown as a badge on the super-admin list. */
  code?: string;
  /** Owning clinic — needed by the super-admin "Manage Accounts" action. */
  clinicId?: string;
  /** Owning clinic's display name (for the Manage Accounts popup heading). */
  clinicName?: string;
};

/**
 * Interactive branch selector. Single-select: clicking a row selects that
 * clinic (solid-blue "selected" state from the Figma reference — white text and
 * white chevron). Selecting a row continues into the app — wire the destination
 * in `handleSelect` once the post-selection screen exists.
 *
 * Responsive (not scaled): a 4-column table on desktop (≥lg, columns aligned
 * with the headers via the shared `451fr 326fr 283fr 208fr` template) that
 * reflows into a stacked card on tablet/mobile through grid placement — single
 * markup, no duplicated content.
 */
export default function BranchList({
  branches,
  onManage,
  onEdit,
  onDelete,
  onSelect,
}: {
  branches: Branch[];
  /** When provided, render a "manage accounts" action (super-admin only). */
  onManage?: (branch: Branch) => void;
  /** When provided, render an edit action on each row (super-admin list). */
  onEdit?: (branch: Branch) => void;
  /** When provided, render a delete action on each row (super-admin list). */
  onDelete?: (branch: Branch) => void;
  /** Fired when a row is chosen — used to continue into the clinic dashboard. */
  onSelect?: (branch: Branch) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const hasActions = Boolean(onManage || onEdit || onDelete);

  function handleSelect(branch: Branch) {
    setSelectedId(branch.id);
    onSelect?.(branch);
  }

  return (
    <div role="radiogroup" aria-label="Select a branch" className="flex flex-col gap-5">
      {branches.map((b) => {
        const selected = b.id === selectedId;
        const muted = selected ? "text-white/80 lg:text-white" : "text-ink/60 lg:text-ink";
        return (
          <div
            key={b.id}
            role="radio"
            aria-checked={selected}
            aria-label={b.branch}
            tabIndex={0}
            onClick={() => handleSelect(b)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleSelect(b);
              }
            }}
            className={[
              "grid cursor-pointer grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-[22px] border-[2px] px-6 py-4 text-left transition-colors",
              "lg:min-h-[90px] lg:grid-cols-[minmax(0,451fr)_minmax(0,326fr)_minmax(0,283fr)_minmax(0,208fr)] lg:items-center lg:gap-x-6 lg:px-7 lg:py-0",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
              selected
                ? "border-brand bg-brand text-white"
                : "border-[#C2C6D4] bg-[#F8F8FD] text-ink hover:bg-[#E3F1FF]",
            ].join(" ")}
          >
            {/* Branch — id badge shown before the name */}
            <span className="col-start-1 row-start-1 flex flex-wrap items-center gap-x-2.5 font-inter text-[15px] font-medium leading-[23px] lg:col-start-1 lg:row-start-1 lg:text-[15.5px] lg:leading-[23.333px]">
              {b.code && (
                <span
                  className={`inline-flex shrink-0 items-center rounded-md border px-2 py-1 font-mono text-[11px] font-semibold uppercase leading-none tracking-[0.6px] tabular-nums shadow-[0_1px_1px_rgba(0,0,0,0.04)] ${
                    selected
                      ? "border-white/50 bg-white/15 text-white"
                      : "border-[#C2C6D4] bg-[#E3F1FF] text-[#3A3F4B]"
                  }`}
                >
                  {b.code}
                </span>
              )}
              {b.branch}
            </span>
            {/* Person in charge */}
            <span
              className={`col-start-1 row-start-2 font-inter text-[14px] font-normal leading-5 lg:col-start-2 lg:row-start-1 lg:text-[15.5px] lg:leading-[23.333px] ${muted}`}
            >
              {b.pic}
            </span>
            {/* Contact */}
            <span
              className={`col-start-1 row-start-3 font-inter text-[14px] font-normal leading-5 lg:col-start-3 lg:row-start-1 lg:text-[15.5px] lg:leading-[23.333px] ${muted}`}
            >
              {b.contact}
            </span>
            {/* Actions + chevron */}
            <span className="col-start-2 row-start-1 row-span-3 flex items-center justify-end gap-3 self-center lg:col-start-4 lg:row-span-1 lg:pr-7">
              {hasActions && (
                <span className="flex items-center gap-1.5">
                  {onManage && (
                    <button
                      type="button"
                      aria-label={`Manage accounts for ${b.branch}`}
                      title="Manage accounts"
                      onClick={(e) => {
                        e.stopPropagation();
                        onManage(b);
                      }}
                      className={`flex size-9 items-center justify-center rounded-full border transition-colors ${
                        selected
                          ? "border-white/40 text-white hover:bg-white/10"
                          : "border-field-border text-[#1E1E24] hover:border-brand hover:text-brand"
                      }`}
                    >
                      <ManageIcon />
                    </button>
                  )}
                  {onEdit && (
                    <button
                      type="button"
                      aria-label={`Edit ${b.branch}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(b);
                      }}
                      className={`group relative flex size-9 items-center justify-center rounded-full border transition-colors ${
                        selected
                          ? "border-white/40 text-white hover:bg-white/10"
                          : "border-field-border text-[#1E1E24] hover:border-brand hover:text-brand"
                      }`}
                    >
                      <EditIcon />
                      <Tip label="Edit" />
                    </button>
                  )}
                  {onDelete && (
                    <button
                      type="button"
                      aria-label={`Delete ${b.branch}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(b);
                      }}
                      className={`group relative flex size-9 items-center justify-center rounded-full border transition-colors ${
                        selected
                          ? "border-white/40 text-white hover:bg-white/10"
                          : "border-field-border text-[#1E1E24] hover:border-red-500 hover:text-red-500"
                      }`}
                    >
                      <DeleteIcon />
                      <Tip label="Delete" />
                    </button>
                  )}
                </span>
              )}
              <Image
                src={selected ? "/auth/chevron.svg" : "/clinic/chevron-row.svg"}
                alt=""
                width={24}
                height={24}
                className="size-6 rotate-180"
              />
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ManageIcon() {
  // "Manage accounts" — a person + cog (manage-account glyph), clearer than a
  // generic "users" icon for editing a branch/clinic's staff accounts.
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-[18px]" aria-hidden>
      <circle cx="9" cy="7" r="4" />
      <path d="M10.3 15H6a4 4 0 0 0-4 4v2" />
      <circle cx="18" cy="15" r="2.5" />
      <path d="M18 10.75v1.25M18 18v1.25M13.75 15H15M21 15h1.25M15 12l.9.9M20.1 17.1l.9.9M15 18l.9-.9M20.1 12.9l.9-.9" />
    </svg>
  );
}

function EditIcon() {
  // Pencil-in-square — mirrors the app's canonical `edit_square` action glyph.
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-[18px]" aria-hidden>
      <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
    </svg>
  );
}

function DeleteIcon() {
  // Trash — the app-wide "delete" action shape (matches /dashboard/delete.svg).
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-[18px]" aria-hidden>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}
