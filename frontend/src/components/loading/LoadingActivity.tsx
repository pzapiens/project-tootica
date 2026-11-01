"use client";

import { createContext, useContext, useEffect } from "react";

// Only placeholders inside the real page report activity. The transition's
// visible overlay sits outside this provider so it cannot wait on itself.
export const LoadingActivityContext = createContext<(() => () => void) | null>(null);

export function useLoadingActivity() {
  const register = useContext(LoadingActivityContext);
  useEffect(() => register?.(), [register]);
}
