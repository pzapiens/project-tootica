"use client";

import { useEffect, useState } from "react";

import { apiFetch, type HealthResponse } from "@/lib/api";

type State =
  | { kind: "loading" }
  | { kind: "ok"; data: HealthResponse }
  | { kind: "error"; message: string };

export default function BackendStatus() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    apiFetch<HealthResponse>("/health")
      .then((data) => setState({ kind: "ok", data }))
      .catch((err: unknown) =>
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Unknown error",
        }),
      );
  }, []);

  return (
    <div className="w-full max-w-md rounded-lg border border-black/[.08] p-4 text-sm dark:border-white/[.145]">
      <div className="mb-2 font-medium">Backend connection</div>
      {state.kind === "loading" && (
        <span className="text-zinc-500">Checking…</span>
      )}
      {state.kind === "ok" && (
        <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
          <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
          Connected — {state.data.service} ({state.data.status})
        </div>
      )}
      {state.kind === "error" && (
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
          Not reachable. Is the backend running on :4000? ({state.message})
        </div>
      )}
    </div>
  );
}
