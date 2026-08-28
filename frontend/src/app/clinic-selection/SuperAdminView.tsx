"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  apiFetch,
  ApiError,
  greetingLabel,
  type BranchSummary,
  type MeResponse,
} from "@/lib/api";

import AddClinicAccountModal from "./AddClinicAccountModal";
import { type Branch } from "./BranchList";
import EditBranchModal from "./EditBranchModal";
import { ConfirmDialog } from "./modal-ui";
import SelectBranchSection from "./SelectBranchSection";

/**
 * Super-admin view: a cross-tenant list of every branch (all clinics), rendered
 * under the same /clinic-selection URL as regular users so the super-admin area
 * isn't exposed by a distinct path. Rendered by ClinicSelectionClient when the
 * signed-in user is a SUPER_ADMIN.
 */
export default function SuperAdminView({ me }: { me: MeResponse }) {
  const router = useRouter();
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<BranchSummary | null>(null);
  const [deleting, setDeleting] = useState<BranchSummary | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  function loadBranches() {
    return apiFetch<BranchSummary[]>("/super-admin/branches")
      .then((list) => setBranches(list))
      .catch(() => {
        // Leave existing rows on error.
      });
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await apiFetch(`/super-admin/branches/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      await loadBranches();
    } catch (err) {
      setDeleteError(
        err instanceof ApiError ? err.message : "Couldn't delete. Please try again.",
      );
    } finally {
      setDeleteBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    apiFetch<BranchSummary[]>("/super-admin/branches")
      .then((list) => {
        if (active) setBranches(list);
      })
      .catch(() => {
        // Leave empty on error; the list simply renders no rows.
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleLogout() {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // Ignore — head to login regardless.
    }
    router.push("/login");
  }

  const branchRows: Branch[] = useMemo(
    () =>
      branches.map((b) => ({
        id: b.id,
        code: b.code,
        branch: b.name,
        pic: b.picName ?? "—",
        contact: b.contact ?? "—",
      })),
    [branches],
  );

  // Super admins have no personal name by default → greet with the brand.
  const greetingName = me.user.firstName ? greetingLabel(me.user) : "Tootica";

  return (
    <div className="flex min-h-dvh flex-col bg-white lg:h-dvh lg:overflow-hidden">
      <div className="mx-auto flex w-full max-w-[1402px] flex-1 flex-col gap-6 p-6 md:gap-7 md:p-7 lg:min-h-0">
        <header className="flex shrink-0 flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="font-inter text-[26px] font-semibold leading-tight text-ink md:text-[35px] md:leading-[42px]">
            Hi, {greetingName}
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="flex h-[55px] items-center gap-[9.333px] self-start rounded-full border-[1.5px] border-brand px-[25px] font-inter text-[16.333px] font-semibold leading-[23.333px] tracking-[0.408px] text-brand transition-colors hover:bg-brand/[.06] sm:self-auto"
            >
              <span className="text-[22px] leading-none">+</span>
              Add Clinic &amp; Account
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="flex h-[55px] items-center gap-[9.333px] self-start rounded-full bg-brand px-[25px] font-inter text-[16.333px] font-semibold leading-[23.333px] tracking-[0.408px] text-white transition-opacity hover:opacity-90 sm:self-auto"
            >
              <Image src="/clinic/logout.svg" alt="" width={24} height={24} className="size-6" />
              LOGOUT
            </button>
          </div>
        </header>

        <SelectBranchSection
          branches={branchRows}
          heading="Select Clinic"
          firstColumnLabel="Clinic"
          searchPlaceholder="Search clinic by name, PIC or contact number"
          itemNoun="branches"
          onSelect={(row) =>
            router.push(`/clinic-selection/${row.code ?? row.id}/dashboard`)
          }
          onEdit={(row) => setEditing(branches.find((b) => b.id === row.id) ?? null)}
          onDelete={(row) => {
            setDeleteError("");
            setDeleting(branches.find((b) => b.id === row.id) ?? null);
          }}
        />
      </div>

      {addOpen && (
        <AddClinicAccountModal
          onClose={() => setAddOpen(false)}
          onCreated={loadBranches}
        />
      )}

      {editing && (
        <EditBranchModal
          branch={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            loadBranches();
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete clinic?"
          message={
            <>
              This permanently removes{" "}
              <span className="font-semibold">{deleting.name}</span>{" "}
              <span className="font-mono text-ink/60">({deleting.code})</span>. This
              can&apos;t be undone.
            </>
          }
          confirmLabel="Delete"
          danger
          busy={deleteBusy}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => {
            setDeleting(null);
            setDeleteError("");
          }}
        />
      )}
    </div>
  );
}
