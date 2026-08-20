"use client";

import Image from "next/image";
import { useState } from "react";

export type Branch = {
  id: string;
  branch: string;
  pic: string;
  contact: string;
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
export default function BranchList({ branches }: { branches: Branch[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function handleSelect(id: string) {
    setSelectedId(id);
    // TODO: continue into the app with the selected clinic, e.g.
    //   router.push(`/dashboard?clinic=${id}`);
  }

  return (
    <div role="radiogroup" aria-label="Select a branch" className="flex flex-col gap-5">
      {branches.map((b) => {
        const selected = b.id === selectedId;
        const muted = selected ? "text-white/80 lg:text-white" : "text-ink/60 lg:text-ink";
        return (
          <button
            key={b.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => handleSelect(b.id)}
            className={[
              "grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-[28px] border-[1.5px] px-6 py-5 text-left transition-colors",
              "lg:min-h-[125px] lg:grid-cols-[451fr_326fr_283fr_208fr] lg:items-center lg:gap-0 lg:px-7 lg:py-0",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
              selected
                ? "border-brand bg-brand text-white"
                : "border-field-border bg-white text-ink hover:bg-black/[.02]",
            ].join(" ")}
          >
            {/* Branch */}
            <span className="col-start-1 row-start-1 font-inter text-[16px] font-medium capitalize leading-[23px] lg:px-3.5 lg:text-[16.333px] lg:leading-[23.333px]">
              {b.branch}
            </span>
            {/* Person in charge */}
            <span
              className={`col-start-1 row-start-2 font-inter text-[14px] font-medium capitalize leading-5 lg:col-start-2 lg:row-start-1 lg:px-3.5 lg:text-[16.333px] lg:leading-[23.333px] ${muted}`}
            >
              {b.pic}
            </span>
            {/* Contact */}
            <span
              className={`col-start-1 row-start-3 font-inter text-[14px] font-medium leading-5 lg:col-start-3 lg:row-start-1 lg:px-3.5 lg:text-[16.333px] lg:leading-[23.333px] ${muted}`}
            >
              {b.contact}
            </span>
            {/* Chevron */}
            <span className="col-start-2 row-start-1 row-span-3 flex items-center justify-end self-center lg:col-start-4 lg:row-span-1 lg:pr-7">
              <Image
                src={selected ? "/auth/chevron.svg" : "/clinic/chevron-row.svg"}
                alt=""
                width={24}
                height={24}
                className="size-6 rotate-180"
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}
