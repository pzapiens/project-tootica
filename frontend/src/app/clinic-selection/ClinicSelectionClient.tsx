"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiFetch, ApiError, type BranchSummary, type MeResponse } from "@/lib/api";

import ClinicAdminView from "./ClinicAdminView";
import { type StatsByBranch } from "./DashboardTop";
import ResetPasswordPopup from "./ResetPasswordPopup";
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
  const [showReset, setShowReset] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch<MeResponse>("/auth/me")
      .then(async (data) => {
        if (!active) return;
        const role = data.user.role;

        // Doctors & receptionists don't get the clinic-selection screen — send
        // them straight to their clinic's dashboard. The "just logged in" flag
        // is left in place so the dashboard can show the reset popup there.
        if (role === "DOCTOR" || role === "GUEST_DOCTOR" || role === "RECEPTIONIST") {
          let code = data.clinic?.id ?? "";
          try {
            const branches = await apiFetch<BranchSummary[]>("/branches");
            if (branches[0]?.code) code = branches[0].code;
          } catch {
            // No branch access → fall back to the clinic id as the URL segment.
          }
          if (active) router.replace(`/clinic-selection/${code}/dashboard`);
          return;
        }

        setMe(data);
        setLoading(false);
        // Show the "Reset Password" popup once, right after a fresh login, for
        // the client admin here (super admin excluded; doctor/receptionist see
        // it on the dashboard instead).
        if (role !== "SUPER_ADMIN") {
          try {
            if (sessionStorage.getItem("tootica:justLoggedIn") === "1") {
              sessionStorage.removeItem("tootica:justLoggedIn");
              setShowReset(true);
            }
          } catch {
            // Ignore storage failures (private mode).
          }
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

  if (me.user.role === "SUPER_ADMIN") {
    return <SuperAdminView me={me} />;
  }

  return (
    <>
      <ClinicAdminView
        me={me}
        statsByBranch={statsByBranch}
        todayStatsByBranch={todayStatsByBranch}
      />
      {showReset && <ResetPasswordPopup onClose={() => setShowReset(false)} />}
    </>
  );
}
