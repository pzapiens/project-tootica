"use client";

import { useSyncExternalStore } from "react";
import { getAppViewport } from "./viewport";

function subscribe(onChange: () => void) {
  window.addEventListener("appviewportchange", onChange);
  window.addEventListener("resize", onChange);
  return () => {
    window.removeEventListener("appviewportchange", onChange);
    window.removeEventListener("resize", onChange);
  };
}

/** Navigation follows the normalized layout, not the browser zoom percentage. */
export function useCompactNavigation() {
  return useSyncExternalStore(subscribe, () => getAppViewport().width < 1280, () => false);
}
