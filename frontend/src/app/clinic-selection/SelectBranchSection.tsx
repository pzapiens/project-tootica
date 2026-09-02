"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

import BranchList, { type Branch } from "./BranchList";

/**
 * "Select Branch" section: a fixed toolbar (heading + search) and column
 * headers, above a scrollable list of the matching branches. Search filters by
 * branch name, person-in-charge, or contact number. The heading, search box and
 * headers stay pinned; only the list scrolls (see the layout in page.tsx).
 */
export default function SelectBranchSection({
  branches,
  heading = "Select Branch",
  firstColumnLabel = "Branch",
  searchPlaceholder = "Search branch, PIC or contact number",
  itemNoun = "branches",
  onManage,
  onEdit,
  onDelete,
  onSelect,
}: {
  branches: Branch[];
  heading?: string;
  firstColumnLabel?: string;
  searchPlaceholder?: string;
  /** Plural noun used in the search label + empty state (e.g. "clinics"). */
  itemNoun?: string;
  /** When provided, render a "manage accounts" action (super-admin only). */
  onManage?: (branch: Branch) => void;
  onEdit?: (branch: Branch) => void;
  onDelete?: (branch: Branch) => void;
  /** Fired when a row is chosen — used to continue into the clinic dashboard. */
  onSelect?: (branch: Branch) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter((b) =>
      [b.branch, b.pic, b.contact, b.code ?? ""].some((field) => field.toLowerCase().includes(q)),
    );
  }, [branches, query]);

  return (
    <section className="flex flex-col gap-5 lg:min-h-0 lg:flex-1">
      {/* Toolbar: heading + search */}
      <div className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-inter text-[23.333px] font-semibold leading-[32.667px] text-ink">
          {heading}
        </h2>
        <div className="relative w-full sm:w-[340px]">
          <Image
            src="/clinic/search.svg"
            alt=""
            width={24}
            height={24}
            className="pointer-events-none absolute left-4 top-1/2 size-6 -translate-y-1/2"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={`Search ${itemNoun}`}
            className="h-[54px] w-full rounded-full border-[1.167px] border-field-border bg-white pl-[52px] pr-4 font-inter text-[16px] text-ink outline-none placeholder:text-field-placeholder focus:border-brand"
          />
        </div>
      </div>

      {/* Column headers — desktop table only */}
      <div className="hidden shrink-0 px-7 lg:grid lg:grid-cols-[451fr_326fr_283fr_208fr]">
        <HeaderCell>{firstColumnLabel}</HeaderCell>
        <HeaderCell>Person in charge(PIC)</HeaderCell>
        <HeaderCell>Contact number</HeaderCell>
        <span />
      </div>

      {/* Scroll region: only this scrolls when branches overflow */}
      <div className="lg:-mr-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2">
        {filtered.length === 0 ? (
          <p className="px-2 py-6 font-inter text-[16px] text-ink/60">
            No {itemNoun} match “{query}”.
          </p>
        ) : (
          <BranchList
            branches={filtered}
            onManage={onManage}
            onEdit={onEdit}
            onDelete={onDelete}
            onSelect={onSelect}
          />
        )}
      </div>
    </section>
  );
}

function HeaderCell({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-3.5 font-inter text-[14.453px] font-semibold uppercase leading-[19.271px] tracking-[0.723px] text-ink">
      {children}
    </span>
  );
}
