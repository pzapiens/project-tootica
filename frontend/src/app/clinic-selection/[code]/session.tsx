"use client";

import { createContext, useContext } from "react";
import type { MeResponse } from "@/lib/api";

/** The server session includes the persisted photo URL, shared by profile and sidebar. */
const MeContext = createContext<MeResponse | null>(null);
const UpdateMeContext = createContext<((me: MeResponse) => void) | null>(null);

export function useMe(): MeResponse {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe must be used within a dashboard session");
  return me;
}
export function useUpdateMe(): (me: MeResponse) => void {
  const update = useContext(UpdateMeContext);
  if (!update) throw new Error("useUpdateMe must be used within a dashboard session");
  return update;
}
export function DashboardSessionProvider({ me, setMe, children }: {
  me: MeResponse;
  setMe: (me: MeResponse) => void;
  children: React.ReactNode;
}) {
  return (
    <MeContext.Provider value={me}>
      <UpdateMeContext.Provider value={setMe}>{children}</UpdateMeContext.Provider>
    </MeContext.Provider>
  );
}
