"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiFetch, ApiError, type MeResponse } from "@/lib/api";

import ClinicAdminView from "./ClinicAdminView";
import { type StatsByBranch } from "./DashboardTop";
import SuperAdminView from "./SuperAdminView";

/**
 * Post-login landing for every role. Loads the session (`GET /api/auth/me`) and
 * renders the right view WITHOUT changing the URL — a super admin sees the
 * cross-tenant view here too, so the admin area isn't exposed by a separate
 * `/super-admin` path. Redirects to /login when there's no valid session.
 */
export default function ClinicSelectionClient({
  statsByBranch,
  todayStatsByBranch,
}: {
  statsByBranch: StatsByBranch;
  todayStatsByBranch: StatsByBranch;
}) {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiFetch<MeResponse>("/auth/me")
      .then((data) => {
        if (active) {
          setMe(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
          return;
        }
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [router]);

  if (loading || !me) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white">
        <p className="font-inter text-[16px] text-ink/60">Loading…</p>
      </div>
    );
  }

  return me.user.role === "SUPER_ADMIN" ? (
    <SuperAdminView me={me} />
  ) : (
    <ClinicAdminView
      me={me}
      statsByBranch={statsByBranch}
      todayStatsByBranch={todayStatsByBranch}
    />
  );
}
