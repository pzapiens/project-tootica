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
import SelectBranchSection from "./SelectBranchSection";

/**
 * The per-clinic view (CLIENT_ADMIN / DOCTOR / etc.): greeting + stat cards +
 * the branch list for the signed-in user's own clinic. Rendered by
 * ClinicSelectionClient once the session/role is known.
 *
 * Appointment stat cards are still seed data — the backend has no per-status /
 * per-branch analytics endpoint yet.
 */
export default function ClinicAdminView({ me }: { me: MeResponse }) {
  const router = useRouter();
  const [branchList, setBranchList] = useState<BranchSummary[]>([]);
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
      });
    return () => {
      active = false;
    };
  }, []);

  // Greeting uses the first name ("Hi, Sanjay"), with "Dr" only for doctors;
  // the branch PIC uses the plain full name.
  const greetingName = greetingLabel(me.user);

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

  return (
    <div className="flex min-h-dvh flex-col bg-white lg:h-dvh lg:overflow-hidden">
      <div className="mx-auto flex w-full max-w-[1402px] flex-1 flex-col gap-6 p-6 md:gap-7 md:p-7 lg:min-h-0">
        <DashboardTop greetingName={greetingName} branches={branches} />
        <SelectBranchSection
          branches={branches}
          onManage={me.clinic ? setManaging : undefined}
          onSelect={(branch) =>
            router.push(`/clinic-selection/${branch.code ?? branch.id}/dashboard`)
          }
        />
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
