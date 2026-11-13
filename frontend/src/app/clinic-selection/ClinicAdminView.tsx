"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  apiFetch,
  displayName,
  greetingLabel,
  type BranchSummary,
  type MeResponse,
} from "@/lib/api";

import { type Branch } from "./BranchList";
import DashboardTop from "./DashboardTop";
import ManageAccountsModal from "./ManageAccountsModal";
import OverallAnalytics from "./OverallAnalytics";
import SelectBranchSection from "./SelectBranchSection";
import { ClinicSelectionSkeleton } from "@/components/loading/PageSkeletons";

/**
 * The per-clinic view (CLIENT_ADMIN / DOCTOR / etc.): greeting + stat cards +
 * the branch list for the signed-in user's own clinic. Rendered by
 * ClinicSelectionClient once the session/role is known.
 *
 * Appointment stat cards are still seed data — the backend has no per-status /
 * per-branch analytics endpoint yet.
 */
export default function ClinicAdminView({
  me,
  setMe,
}: {
  me: MeResponse;
  setMe: (me: MeResponse) => void;
}) {
  const router = useRouter();
  const [branchList, setBranchList] = useState<BranchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  // The branch whose doctors + receptionists the admin is managing (modal open).
  const [managing, setManaging] = useState<Branch | null>(null);

  useEffect(() => {
    let active = true;
    apiFetch<BranchSummary[]>("/branches")
      .then((branches) => {
        if (active) setBranchList(branches);
      })
      .catch(() => {
        // Leave empty → fall back to a single clinic-derived row below.
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Greeting uses the salutation + first name ("Dr. Sanjay", "Mr. Sanjay");
  // the branch PIC uses the plain full name.
  const greetingName = greetingLabel(me.user);

  // The "Overall Analytics" pie section is a clinic-admin overview (not shown to
  // super admins — they use SuperAdminView — nor to any other role).
  const isAdmin = me.user.role === "CLIENT_ADMIN";

  // Prefer the clinic's real branches (with their PIC + contact). Fall back to a
  // single row derived from the clinic itself when no branches are defined.
  const branches: Branch[] =
    branchList.length > 0
      ? branchList.map((b) => ({
          id: b.id,
          // Branch names are location-only; show them as "Clinic Name - Branch".
          branch: me.clinic ? `${me.clinic.name} - ${b.name}` : b.name,
          pic: b.picName ?? "—",
          contact: b.contact ?? "—",
          code: b.code,
        }))
      : me.clinic
        ? [
            {
              id: me.clinic.id,
              branch: me.clinic.name,
              pic: displayName(me.user),
              contact: me.user.phone ?? "—",
            },
          ]
        : [];

  if (loading) return <ClinicSelectionSkeleton variant="clinic" />;

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <div className="app-page mx-auto flex w-full max-w-[1402px] flex-1 flex-col gap-5 p-5 md:gap-6 md:p-6">
        <DashboardTop greetingName={greetingName} me={me} setMe={setMe} />
        <div className="mt-2 md:mt-4">
          <SelectBranchSection
            branches={branches}
            heading="Clinic Branches"
            fill={false}
            showHeader={false}
            onManage={me.clinic ? setManaging : undefined}
            onSelect={(branch) =>
              router.push(`/clinic-selection/${branch.code ?? branch.id}/dashboard`)
            }
          />
        </div>
        {isAdmin && <OverallAnalytics branches={branches} />}
      </div>

      {managing && me.clinic && (
        <ManageAccountsModal
          clinicId={me.clinic.id}
          clinicName={me.clinic.name}
          branchId={managing.id}
          branchName={managing.branch}
          listPath="/accounts"
          accountPath={(id) => `/accounts/${id}`}
          addStaffPath="/accounts"
          deleteRequiresCode={false}
          onClose={() => setManaging(null)}
        />
      )}
    </div>
  );
}
