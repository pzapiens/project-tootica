"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useExclusiveDropdown } from "@/lib/useExclusiveDropdown";
import { searchTreatments, treatmentLabel, TREATMENT_CATEGORIES, UNDECIDED_TREATMENT } from "@/lib/treatments";

type Preferences = { favourites: string[]; canManage: boolean; clinicCode: string };

/** Shared by new bookings and appointment edits. Favourites belong to the clinic. */
export default function TreatmentPicker({ values, onChange }: {
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const clinicCode = usePathname().split("/")[2] ?? "";
  const [open, setOpen] = useExclusiveDropdown();
  const [query, setQuery] = useState("");
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const current = preferences?.clinicCode === clinicCode ? preferences : null;
  const favourites = current?.favourites ?? [];
  const results = query.trim() ? searchTreatments(query) : [];

  useEffect(() => {
    let active = true;
    apiFetch<Omit<Preferences, "clinicCode">>("/treatments/preferences")
      .then(data => { if (active) { setPreferences({ ...data, clinicCode }); setError(""); } })
      .catch(() => { if (active) setError("Couldn't load clinic favourites. You can still search and select treatments."); });
    return () => { active = false; };
  }, [clinicCode, retry]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    function onOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); }
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);

  function toggle(value: string) {
    onChange(values.includes(value) ? values.filter(item => item !== value) : [...values, value]);
  }

  async function toggleFavourite(value: string) {
    if (!current?.canManage || saving) return;
    const next = favourites.includes(value) ? favourites.filter(item => item !== value) : [...favourites, value];
    if (next.length > 5) { setError("You can pin up to 5 clinic favourites. Unpin one to add another."); return; }
    setSaving(true);
    setError("");
    try {
      const data = await apiFetch<{favourites: string[]}>("/treatments/preferences", {
        method: "PATCH", body: JSON.stringify({ favourites: next }),
      });
      setPreferences({ ...current, favourites: data.favourites });
    } catch {
      setError("Couldn't save clinic favourites. Please try again.");
    } finally { setSaving(false); }
  }

  function row(value: string, category?: string) {
    const selected = values.includes(value);
    const pinned = favourites.includes(value);
    const label = treatmentLabel(value);
    return (
      <div key={value} className="flex items-center gap-1 rounded-lg hover:bg-[#f0f7fc]">
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-2 py-1.5 text-[12px] text-[#1e1e24]">
          <input type="checkbox" checked={selected} onChange={() => toggle(value)} className="size-3.5 shrink-0 accent-[#0077c0]" />
          <span className="min-w-0">
            <span className="block">{label}</span>
            {category && <span className="mt-0.5 block text-[11px] text-[#64748b]">{category}</span>}
          </span>
        </label>
        {current?.canManage && (
          <button type="button" disabled={saving} onClick={() => void toggleFavourite(value)}
            aria-label={(pinned ? "Unpin " : "Pin ") + label + " as a clinic favourite"}
            aria-pressed={pinned} title={pinned ? "Unpin clinic favourite" : "Pin clinic favourite"}
            className="shrink-0 rounded-md px-2 py-1.5 text-[16px] text-[#0077c0] hover:bg-[#e0edf8] focus-visible:outline-2 focus-visible:outline-[#0077c0] disabled:opacity-40">
            {pinned ? <span aria-hidden>&#9733;</span> : <span aria-hidden>&#9734;</span>}
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative flex min-w-0 flex-col gap-2 self-start font-inter">
      <label htmlFor={panelId + "-trigger"} className="text-[11px] uppercase tracking-[0.5px] text-[#1e1e24]">
        Reason for visit / Treatment <span className="text-red-500">*</span>
      </label>
      <button ref={triggerRef} id={panelId + "-trigger"} type="button" aria-expanded={open} aria-controls={panelId}
        onClick={() => setOpen(value => !value)}
        className="flex w-full items-center justify-between gap-2 border-b border-[#c2c6d4] pb-2 pt-1 text-left text-[15px] text-[#1e1e24] focus-visible:outline-2 focus-visible:outline-[#0077c0]">
        <span>{values.length ? values.length + (values.length === 1 ? " treatment selected" : " treatments selected") : "Choose treatments"}</span>
        <span aria-hidden className="text-[#0077c0]">{open ? "Hide" : "Choose"}</span>
      </button>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Selected treatments">
          {values.map(value => (
            <button key={value} type="button" onClick={() => toggle(value)} aria-label={"Remove " + treatmentLabel(value)}
              className="flex max-w-full items-center gap-2 rounded-lg bg-[#eaf4fb] px-2.5 py-1.5 text-left text-[12px] text-[#075985] hover:bg-[#dceef9]">
              <span className="min-w-0 break-words">{treatmentLabel(value)}</span> <span aria-hidden className="shrink-0">&times;</span>
            </button>
          ))}
        </div>
      )}
      {open && (
        <section id={panelId} aria-label="Choose treatments" className="absolute right-0 top-[calc(100%+8px)] z-40 w-[min(360px,calc(100vw_-_112px))] rounded-lg border border-[#c2c6d4] bg-white shadow-lg">
          <div className="border-b border-[#e2e8f0] p-2.5">
            <label htmlFor={panelId + "-search"} className="sr-only">Search all treatments</label>
            <div className="flex items-center gap-2">
              <input ref={searchRef} id={panelId + "-search"} type="search" value={query} onChange={event => setQuery(event.target.value)}
                placeholder="Search treatments, e.g. RCT..." autoComplete="off"
                className="min-w-0 flex-1 rounded-lg border border-[#c2c6d4] bg-white px-2.5 py-1.5 text-[12px] font-medium text-[#1e1e24] caret-[#0077c0] placeholder:font-normal placeholder:text-[#64748b] focus:border-[#0077c0] focus:outline-none" />
              <button type="button" onClick={() => { setOpen(false); triggerRef.current?.focus(); }} className="rounded-md bg-[#0077c0] px-2.5 py-1.5 text-[12px] text-white">Done</button>
            </div>
            <p className="mt-2 text-[11px] text-[#64748b]">Select one or more. Unsure? Choose treatment to be decided.</p>
          </div>
          {error && <div role="alert" className="border-b border-[#e2e8f0] px-3 py-2 text-[12px] text-[#ba1a1a]">
            {error} {!current && <button type="button" onClick={() => setRetry(value => value + 1)} className="ml-2 underline">Retry</button>}
          </div>}
          <div className="max-h-[260px] overflow-y-auto overscroll-contain p-1.5">
            {query.trim() ? (
              <>
                <p role="status" className="px-2 py-1 text-[11px] text-[#64748b]">{results.length} matching treatments</p>
                {results.map(item => row(item.value, item.category))}
                {results.length === 0 && <div className="p-2 text-[12px] text-[#64748b]">No treatments found. Try a broader term or clear the search to browse categories.
                  <button type="button" onClick={() => setQuery("")} className="mt-2 block text-[#0077c0] underline">Browse all categories</button>
                  {row(UNDECIDED_TREATMENT)}
                </div>}
              </>
            ) : (
              <>
                <div className="mb-2 rounded-lg bg-[#f6fafe] p-1">
                  <h3 className="px-2 pt-2 text-[12px] font-semibold text-[#075985]">Clinic favourites</h3>
                  <p className="px-2 py-1 text-[11px] text-[#64748b]">{current?.canManage ? "Star up to 5 treatments for your clinic." : "Quick picks shared by your clinic."}</p>
                  {!current && !error && <p role="status" className="px-2 py-2 text-[12px] text-[#64748b]">Loading favourites...</p>}
                  {favourites.map(value => row(value))}
                  {current && favourites.length === 0 && <p className="px-2 py-2 text-[12px] text-[#64748b]">No favourites pinned yet.</p>}
                </div>
                {!favourites.includes(UNDECIDED_TREATMENT) && row(UNDECIDED_TREATMENT)}
                <h3 className="px-2 py-2 text-[12px] font-semibold text-[#1e1e24]">Browse all categories</h3>
                {TREATMENT_CATEGORIES.map(category => (
                  <details key={category.id} className="border-t border-[#e2e8f0]">
                    <summary className="cursor-pointer rounded-lg px-2 py-2 text-[12px] font-medium text-[#1e1e24] hover:bg-[#f0f7fc]">
                      {category.name} <span className="ml-1 text-[11px] font-normal text-[#64748b]">({category.treatments.length})</span>
                    </summary>
                    <div className="pb-2 pl-2">{category.treatments.map(item => row(item.value))}</div>
                  </details>
                ))}
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
