"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Entry = { close: () => void };

// App-wide registry of every mounted exclusive dropdown. Opening one closes all
// the others, so at most one dropdown is ever open across the whole app.
const registry = new Set<Entry>();

/**
 * Drop-in replacement for `useState(false)` for a dropdown's open/closed state
 * that enforces a single open dropdown across the entire app: opening any
 * dropdown first closes every other one. Returns the same `[open, setOpen]`
 * tuple shape as `useState`, so call sites (including `setOpen((v) => !v)`
 * toggles and `setOpen(false)`) work unchanged.
 *
 * Only use this for a top-level option panel. Do NOT use it for a dropdown that
 * lives *inside* another dropdown's panel (e.g. the calendar rendered inside the
 * timeframe filter) — opening the child would close its own parent.
 */
export function useExclusiveDropdown(): [
  boolean,
  (next: boolean | ((prev: boolean) => boolean)) => void,
] {
  const [open, setOpenState] = useState(false);
  // Mirror of `open` readable synchronously inside `setOpen` (avoids a stale
  // closure when resolving a functional toggle).
  const openRef = useRef(false);
  const entryRef = useRef<Entry | null>(null);

  useEffect(() => {
    const entry: Entry = {
      close: () => {
        openRef.current = false;
        setOpenState(false);
      },
    };
    entryRef.current = entry;
    registry.add(entry);
    return () => {
      registry.delete(entry);
      entryRef.current = null;
    };
  }, []);

  const setOpen = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    const value = typeof next === "function" ? next(openRef.current) : next;
    if (value) {
      // Close every other open dropdown before opening this one.
      registry.forEach((entry) => {
        if (entry !== entryRef.current) entry.close();
      });
    }
    openRef.current = value;
    setOpenState(value);
  }, []);

  return [open, setOpen];
}
