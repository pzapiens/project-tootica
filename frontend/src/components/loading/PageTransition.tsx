"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { LoadingActivityContext } from "./LoadingActivity";

export const MINIMUM_PRELOADER_MS = 800;
export const PRELOADER_FADE_MS = 240;

/** Mount the page immediately so its requests run during the wireframe preview. */
export default function PageTransition({ children, fallback, loading = false }: { children: ReactNode; fallback: ReactNode; loading?: boolean }) {
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const [loadingSections, setLoadingSections] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [overlayMounted, setOverlayMounted] = useState(true);

  const register = useCallback(() => {
    setLoadingSections((count) => count + 1);
    return () => setLoadingSections((count) => count - 1);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setMinimumElapsed(true), MINIMUM_PRELOADER_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!minimumElapsed || loading || loadingSections > 0 || revealed) return;
    // Let descendant loading effects settle before revealing the page. Once
    // revealed, background refreshes never replay the navigation transition.
    const timer = window.setTimeout(() => setRevealed(true), 0);
    return () => window.clearTimeout(timer);
  }, [minimumElapsed, loading, loadingSections, revealed]);

  useEffect(() => {
    if (!revealed) return;
    const timer = window.setTimeout(() => setOverlayMounted(false), PRELOADER_FADE_MS);
    return () => window.clearTimeout(timer);
  }, [revealed]);

  return (
    <div aria-busy={!revealed} className="grid min-w-0 flex-1">
      <LoadingActivityContext.Provider value={register}>
        <div
          aria-hidden={!revealed || undefined}
          inert={!revealed}
          className={`flex min-w-0 flex-col [grid-area:1/1] transition-opacity duration-[240ms] ease-in-out motion-reduce:transition-none ${revealed ? "opacity-100" : "opacity-0"}`}
        >
          {children}
        </div>
      </LoadingActivityContext.Provider>
      {overlayMounted && (
        <div
          aria-hidden={revealed || undefined}
          className={`pointer-events-none min-w-0 self-start [grid-area:1/1] transition-opacity duration-[240ms] ease-in-out motion-reduce:transition-none ${revealed ? "opacity-0" : "opacity-100"}`}
        >
          {fallback}
        </div>
      )}
    </div>
  );
}
