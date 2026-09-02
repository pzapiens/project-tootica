"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  apiFetch,
  ApiError,
  clearActiveClinicId,
  greetingLabel,
  setActiveClinicId,
  type BranchSummary,
  type MeResponse,
  type SuperAdminClinic,
} from "@/lib/api";

import AddBranchModal from "./AddBranchModal";
import AddClinicAccountModal from "./AddClinicAccountModal";
import { type Branch } from "./BranchList";
import EditBranchModal from "./EditBranchModal";
import EditClinicModal from "./EditClinicModal";
import ManageAccountsModal from "./ManageAccountsModal";
import { ConfirmDialog } from "./modal-ui";
import SelectBranchSection from "./SelectBranchSection";

/** Which accounts a Manage Accounts modal should show. */
type ManageTarget = {
  clinicId: string;
  clinicName: string;
  branchId?: string;
  branchName?: string;
};

/**
 * Super-admin view: a two-level browse — a list of clinics, and drilling into a
 * clinic reveals its branches. Rendered under the same /clinic-selection URL as
 * regular users (so the admin area isn't exposed by a distinct path) by
 * ClinicSelectionClient when the signed-in user is a SUPER_ADMIN.
 *
 * Doctors + receptionists are branch-scoped, so their accounts are managed from
 * a branch row; the clinic admin is managed from the clinic row.
 */
export default function SuperAdminView({ me }: { me: MeResponse }) {
  const router = useRouter();
  const [clinics, setClinics] = useState<SuperAdminClinic[]>([]);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  // null → the clinic list; otherwise the branches of the drilled-in clinic.
  const [selectedClinicId, setSelectedClinicId] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addBranchOpen, setAddBranchOpen] = useState(false);
  const [editing, setEditing] = useState<BranchSummary | null>(null);
  const [editingClinic, setEditingClinic] = useState<SuperAdminClinic | null>(null);
  const [managing, setManaging] = useState<ManageTarget | null>(null);
  const [deleting, setDeleting] = useState<BranchSummary | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deletingClinic, setDeletingClinic] = useState<SuperAdminClinic | null>(null);
  const [clinicDeleteBusy, setClinicDeleteBusy] = useState(false);
  const [clinicDeleteError, setClinicDeleteError] = useState("");

  function loadData() {
    return Promise.all([
      apiFetch<SuperAdminClinic[]>("/super-admin/clinics")
        .then(setClinics)
        .catch(() => {}),
      apiFetch<BranchSummary[]>("/super-admin/branches")
        .then(setBranches)
        .catch(() => {}),
    ]);
  }

  useEffect(() => {
    let active = true;
    apiFetch<SuperAdminClinic[]>("/super-admin/clinics")
      .then((l) => active && setClinics(l))
      .catch(() => {});
    apiFetch<BranchSummary[]>("/super-admin/branches")
      .then((l) => active && setBranches(l))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function confirmDelete(code: string) {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await apiFetch(`/super-admin/branches/${deleting.id}`, {
        method: "DELETE",
        body: JSON.stringify({ code }),
      });
      setDeleting(null);
      await loadData();
    } catch (err) {
      setDeleteError(
        err instanceof ApiError ? err.message : "Couldn't delete. Please try again.",
      );
    } finally {
      setDeleteBusy(false);
    }
  }

  async function confirmDeleteClinic(code: string) {
    if (!deletingClinic) return;
    setClinicDeleteBusy(true);
    setClinicDeleteError("");
    try {
      await apiFetch(`/super-admin/clinics/${deletingClinic.id}`, {
        method: "DELETE",
        body: JSON.stringify({ code }),
      });
      setDeletingClinic(null);
      await loadData();
    } catch (err) {
      setClinicDeleteError(
        err instanceof ApiError ? err.message : "Couldn't delete. Please try again.",
      );
    } finally {
      setClinicDeleteBusy(false);
    }
  }

  async function handleLogout() {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // Ignore — head to login regardless.
    }
    clearActiveClinicId();
    router.push("/login");
  }

  const selectedClinic = clinics.find((c) => c.id === selectedClinicId) ?? null;

  // Clinic rows: badge = clinic code (CL-…); PIC = the clinic admin.
  const clinicRows: Branch[] = useMemo(
    () =>
      clinics.map((c) => ({
        id: c.id,
        code: c.code ?? undefined,
        branch: c.name,
        pic: c.picName ?? "—",
        contact: c.contact ?? "—",
        clinicId: c.id,
        clinicName: c.name,
      })),
    [clinics],
  );

  // Branch rows: only the drilled-in clinic's branches.
  const branchRows: Branch[] = useMemo(
    () =>
      branches
        .filter((b) => b.clinicId === selectedClinicId)
        .map((b) => ({
          id: b.id,
          code: b.code,
          // Branch names are location-only; show them as "Clinic Name - Branch".
          branch: selectedClinic ? `${selectedClinic.name} - ${b.name}` : b.name,
          pic: b.picName ?? "—",
          contact: b.contact ?? "—",
          clinicId: b.clinicId,
          clinicName: selectedClinic?.name ?? b.name,
        })),
    [branches, selectedClinicId, selectedClinic],
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

        {selectedClinicId === null ? (
          <SelectBranchSection
            branches={clinicRows}
            heading="Clinics"
            firstColumnLabel="Clinic"
            searchPlaceholder="Search clinic by name, admin or contact number"
            itemNoun="clinics"
            // Click a clinic → drill into its branches. Remember the clinic so
            // tenant-scoped requests (X-Clinic-Id) resolve to it.
            onSelect={(row) => {
              setActiveClinicId(row.id);
              setSelectedClinicId(row.id);
            }}
            // Manage the clinic-wide admin(s).
            onManage={(row) => setManaging({ clinicId: row.id, clinicName: row.branch })}
            // Edit the clinic name + its PIC (the clinic admin).
            onEdit={(row) => setEditingClinic(clinics.find((c) => c.id === row.id) ?? null)}
            // Delete the whole clinic (guarded by a delete code).
            onDelete={(row) => {
              setClinicDeleteError("");
              setDeletingClinic(clinics.find((c) => c.id === row.id) ?? null);
            }}
          />
        ) : (
          <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1">
            <div className="flex shrink-0 items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  clearActiveClinicId();
                  setSelectedClinicId(null);
                }}
                className="flex items-center gap-2 self-start font-inter text-[15px] font-medium text-brand transition-colors hover:text-brand/80"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5" aria-hidden>
                  <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                All Clinics
              </button>
              <button
                type="button"
                onClick={() => setAddBranchOpen(true)}
                className="flex items-center gap-1.5 rounded-full border-[1.5px] border-brand px-[18px] py-[9px] font-inter text-[14px] font-semibold text-brand transition-colors hover:bg-brand/[.06]"
              >
                <span className="text-[18px] leading-none">+</span>
                Add Branch
              </button>
            </div>
            <SelectBranchSection
              branches={branchRows}
              heading={`${selectedClinic?.name ?? "Clinic"} · Branches`}
              firstColumnLabel="Branch"
              searchPlaceholder="Search branch by name, PIC or contact number"
              itemNoun="branches"
              onSelect={(row) => {
                // Ensure the clinic context is set before entering the tenant
                // dashboard (the URL only carries the branch code, not clinic).
                if (selectedClinicId) setActiveClinicId(selectedClinicId);
                router.push(`/clinic-selection/${row.code ?? row.id}/dashboard`);
              }}
              // Manage this branch's doctors + receptionist.
              onManage={(row) =>
                setManaging({
                  clinicId: selectedClinicId,
                  clinicName: selectedClinic?.name ?? "",
                  branchId: row.id,
                  branchName: row.branch,
                })
              }
              onEdit={(row) => setEditing(branches.find((b) => b.id === row.id) ?? null)}
              onDelete={(row) => {
                setDeleteError("");
                setDeleting(branches.find((b) => b.id === row.id) ?? null);
              }}
            />
          </div>
        )}
      </div>

      {addOpen && (
        <AddClinicAccountModal onClose={() => setAddOpen(false)} onCreated={loadData} />
      )}

      {addBranchOpen && selectedClinic && (
        <AddBranchModal
          clinicId={selectedClinic.id}
          clinicName={selectedClinic.name}
          onClose={() => setAddBranchOpen(false)}
          onCreated={() => {
            setAddBranchOpen(false);
            loadData();
          }}
        />
      )}

      {editing && (
        <EditBranchModal
          branch={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            loadData();
          }}
        />
      )}

      {editingClinic && (
        <EditClinicModal
          clinic={editingClinic}
          onClose={() => setEditingClinic(null)}
          onSaved={() => {
            setEditingClinic(null);
            loadData();
          }}
        />
      )}

      {managing && (
        <ManageAccountsModal
          clinicId={managing.clinicId}
          clinicName={managing.clinicName}
          branchId={managing.branchId}
          branchName={managing.branchName}
          onClose={() => setManaging(null)}
          // Deleting a PIC unlinks them from the branch → refresh the lists.
          onChanged={loadData}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete branch?"
          message={
            <>
              This permanently removes the branch{" "}
              <span className="font-semibold">{deleting.name}</span>{" "}
              <span className="font-mono text-ink/60">({deleting.code})</span>. This
              can&apos;t be undone.
            </>
          }
          confirmLabel="Delete"
          danger
          requireCode
          busy={deleteBusy}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => {
            setDeleting(null);
            setDeleteError("");
          }}
        />
      )}

      {deletingClinic && (
        <ConfirmDialog
          title="Delete clinic?"
          message={
            <>
              This permanently removes the clinic{" "}
              <span className="font-semibold">{deletingClinic.name}</span>
              {deletingClinic.code && (
                <>
                  {" "}
                  <span className="font-mono text-ink/60">({deletingClinic.code})</span>
                </>
              )}{" "}
              and all of its branches, accounts and data. This can&apos;t be undone.
            </>
          }
          confirmLabel="Delete"
          danger
          requireCode
          busy={clinicDeleteBusy}
          error={clinicDeleteError}
          onConfirm={confirmDeleteClinic}
          onCancel={() => {
            setDeletingClinic(null);
            setClinicDeleteError("");
          }}
        />
      )}
    </div>
  );
}
