"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import type { MeResponse } from "@/lib/api";

/**
 * Shared dashboard-session contexts: the signed-in user, an updater so pages can
 * push session changes (e.g. Profile save → sidebar name refresh), and the
 * locally-uploaded avatar. Extracted from the dashboard shell so they can also be
 * provided around the same Profile / Accounts components when they're reused as
 * popups on the clinic-selection page (which has no shell).
 */

/** Session (from `/auth/me`) shared with nested dashboard pages. */
const MeContext = createContext<MeResponse | null>(null);

/** Updater so pages (e.g. Profile) can push session changes — the sidebar / chip
 *  name/role then re-render instantly, no re-login needed. */
const UpdateMeContext = createContext<((me: MeResponse) => void) | null>(null);

/** Read the signed-in session inside any dashboard page. */
export function useMe(): MeResponse {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe must be used within a dashboard session");
  return me;
}

/** Update the shared session (re-renders every `useMe()` reader). */
export function useUpdateMe(): (me: MeResponse) => void {
  const update = useContext(UpdateMeContext);
  if (!update) throw new Error("useUpdateMe must be used within a dashboard session");
  return update;
}

/** The user's uploaded avatar (a data URL, or null for the role glyph) shared
 *  between the Profile page and the sidebar / account chip so an upload reflects
 *  in both. */
export interface AvatarState {
  url: string | null;
  setUrl: (url: string | null) => void;
}
const AvatarContext = createContext<AvatarState | null>(null);

/** Read/update the shared avatar image inside any dashboard page. */
export function useAvatar(): AvatarState {
  const avatar = useContext(AvatarContext);
  if (!avatar) throw new Error("useAvatar must be used within a dashboard session");
  return avatar;
}

// Per-user key for the locally-stored avatar (not persisted to the backend; kept
// in sessionStorage so it survives navigation / refresh within the tab).
const AVATAR_KEY = "tootica.avatar.";

/**
 * Local avatar state for a user, seeded from sessionStorage and persisted back on
 * change. Seeding is done during render (syncing to the `userId` prop) so it works
 * both when the id is known immediately (clinic-selection) and once it loads
 * (dashboard shell), without a setState-in-effect.
 */
export function useLocalAvatar(userId: string | undefined): AvatarState {
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const [url, setUrlState] = useState<string | null>(null);

  if (userId && seededFor !== userId) {
    setSeededFor(userId);
    setUrlState(
      typeof window !== "undefined" ? window.sessionStorage.getItem(AVATAR_KEY + userId) : null,
    );
  }

  const setUrl = useCallback(
    (next: string | null) => {
      setUrlState(next);
      if (!userId || typeof window === "undefined") return;
      try {
        if (next) window.sessionStorage.setItem(AVATAR_KEY + userId, next);
        else window.sessionStorage.removeItem(AVATAR_KEY + userId);
      } catch {
        // Quota exceeded (a very large image) — keep it for this session only.
      }
    },
    [userId],
  );

  return useMemo(() => ({ url, setUrl }), [url, setUrl]);
}

/** Provides the three session contexts to a subtree (the shell wraps its pages;
 *  the clinic-selection popups wrap the reused Profile / Accounts views). */
export function DashboardSessionProvider({
  me,
  setMe,
  avatar,
  children,
}: {
  me: MeResponse;
  setMe: (me: MeResponse) => void;
  avatar: AvatarState;
  children: React.ReactNode;
}) {
  return (
    <MeContext.Provider value={me}>
      <UpdateMeContext.Provider value={setMe}>
        <AvatarContext.Provider value={avatar}>{children}</AvatarContext.Provider>
      </UpdateMeContext.Provider>
    </MeContext.Provider>
  );
}
