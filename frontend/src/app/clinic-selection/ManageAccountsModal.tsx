"use client";

import { useEffect, useState } from "react";

import {
  apiFetch,
  ApiError,
  ROLE_LABELS,
  TITLE_OPTIONS,
  type ClinicAccount,
} from "@/lib/api";
import { phoneDigitsError, phoneLocalPart, phoneWithCc } from "@/lib/validation";

import AddStaffModal from "./AddStaffModal";
import {
  ConfirmDialog,
  ERROR_CLASS,
  LabeledInput,
  LabeledPhone,
  Overlay,
  PrimaryButton,
  SecondaryButton,
} from "./modal-ui";

/**
 * Super-admin "Manage Accounts" popup (opened from the manage button on a
 * clinic row). Lists every staff account under the clinic and lets the super
 * admin edit a profile, suspend/re-activate, or delete an account. All calls go
 * to the role-gated `/api/super-admin` endpoints.
 */
export default function ManageAccountsModal({
  clinicId,
  clinicName,
  branchId,
  branchName,
  onClose,
  onChanged,
  listPath,
  accountPath,
  deleteRequiresCode = true,
  addStaffPath,
}: {
  clinicId: string;
  clinicName: string;
  /** When set, show only this branch's staff (doctors + receptionists). When
   *  unset, show the clinic's admin accounts instead. */
  branchId?: string;
  branchName?: string;
  onClose: () => void;
  /** Called after any change that might affect the clinic list (e.g. PIC removed). */
  onChanged?: () => void;
  /** Accounts-list endpoint. Defaults to the super-admin path; the clinic-admin
   *  flow passes its own tenant-scoped `/accounts`. */
  listPath?: string;
  /** Builds the single-account endpoint (edit / suspend / delete) for an id. */
  accountPath?: (id: string) => string;
  /** Whether deletion prompts for the super-admin deletion code. */
  deleteRequiresCode?: boolean;
  /** When set (branch mode), shows an "Add" action that POSTs a new doctor /
   *  receptionist to this endpoint. */
  addStaffPath?: string;
}) {
  const resolvedListPath = listPath ?? `/super-admin/clinics/${clinicId}/accounts`;
  const resolvedAccountPath =
    accountPath ?? ((id: string) => `/super-admin/accounts/${id}`);
  const [accounts, setAccounts] = useState<ClinicAccount[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState<ClinicAccount | null>(null);
  const [deleting, setDeleting] = useState<ClinicAccount | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [adding, setAdding] = useState(false);
  // Ids currently mid-status-toggle, so their button can show a pending state.
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  function load() {
    return apiFetch<ClinicAccount[]>(resolvedListPath)
      .then((list) => {
        setAccounts(list);
        setLoadError("");
      })
      .catch((err: unknown) => {
        setLoadError(
          err instanceof ApiError ? err.message : "Couldn't load accounts.",
        );
        setAccounts([]);
      });
  }

  useEffect(() => {
    let active = true;
    apiFetch<ClinicAccount[]>(resolvedListPath)
      .then((list) => {
        if (active) setAccounts(list);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setLoadError(err instanceof ApiError ? err.message : "Couldn't load accounts.");
        setAccounts([]);
      });
    return () => {
      active = false;
    };
  }, [resolvedListPath]);

  async function toggleStatus(account: ClinicAccount) {
    const next = account.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    setBusyIds((s) => new Set(s).add(account.id));
    try {
      const updated = await apiFetch<ClinicAccount>(
        resolvedAccountPath(account.id),
        { method: "PATCH", body: JSON.stringify({ status: next }) },
      );
      setAccounts((list) =>
        (list ?? []).map((a) => (a.id === updated.id ? updated : a)),
      );
    } catch {
      // Non-fatal — leave the row as-is; the user can retry.
    } finally {
      setBusyIds((s) => {
        const copy = new Set(s);
        copy.delete(account.id);
        return copy;
      });
    }
  }

  async function confirmDelete(code: string) {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await apiFetch(resolvedAccountPath(deleting.id), {
        method: "DELETE",
        body: JSON.stringify({ code }),
      });
      setDeleting(null);
      await load();
      onChanged?.();
    } catch (err) {
      setDeleteError(
        err instanceof ApiError ? err.message : "Couldn't delete. Please try again.",
      );
    } finally {
      setDeleteBusy(false);
    }
  }

  // The edit sub-form takes over the modal while open.
  if (editing) {
    return (
      <EditAccountForm
        account={editing}
        accountPath={resolvedAccountPath}
        onCancel={() => setEditing(null)}
        onSaved={(updated) => {
          setAccounts((list) =>
            (list ?? []).map((a) => (a.id === updated.id ? updated : a)),
          );
          setEditing(null);
          onChanged?.();
        }}
      />
    );
  }

  // Branch mode shows that branch's staff; clinic mode shows the clinic admins.
  const visible = (accounts ?? []).filter((a) =>
    branchId ? a.branchId === branchId : a.role === "CLIENT_ADMIN",
  );

  return (
    <>
      <Overlay onClose={onClose} labelledBy="manage-accounts-title" className="max-w-[640px]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2
              id="manage-accounts-title"
              className="font-manrope text-[24px] leading-[32px] tracking-[-0.5px] text-ink"
            >
              {branchId ? "Manage Accounts" : "Clinic Admins"}
            </h2>
            <p className="font-inter text-[14px] leading-5 text-ink/60">
              {branchId ? (
                <>
                  Doctors &amp; receptionists at{" "}
                  <span className="font-semibold text-ink">{branchName ?? "this branch"}</span>.
                </>
              ) : (
                <>
                  Clinic-wide admins for{" "}
                  <span className="font-semibold text-ink">{clinicName}</span>.
                </>
              )}
            </p>
          </div>
          {addStaffPath && branchId && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="shrink-0 rounded-full bg-brand px-4 py-2 font-inter text-[13px] font-semibold text-white transition-colors hover:bg-[#0069a8]"
            >
              + Add
            </button>
          )}
        </div>

        {accounts === null ? (
          <p className="py-6 font-inter text-[15px] text-ink/60">Loading…</p>
        ) : loadError ? (
          <p role="alert" className={ERROR_CLASS}>
            {loadError}
          </p>
        ) : visible.length === 0 ? (
          <p className="py-6 font-inter text-[15px] text-ink/60">
            {branchId
              ? "No doctors or receptionists at this branch yet."
              : "No admin accounts for this clinic yet."}
          </p>
        ) : (
          <ul className="flex max-h-[52vh] flex-col gap-3 overflow-y-auto pr-1">
            {visible.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                busy={busyIds.has(account.id)}
                onEdit={() => setEditing(account)}
                onToggleStatus={() => toggleStatus(account)}
                onDelete={() => {
                  setDeleteError("");
                  setDeleting(account);
                }}
              />
            ))}
          </ul>
        )}

        <SecondaryButton type="button" onClick={onClose}>
          Close
        </SecondaryButton>
      </Overlay>

      {deleting && (
        <ConfirmDialog
          title="Delete account?"
          message={
            <>
              This permanently removes{" "}
              <span className="font-semibold">{accountName(deleting)}</span>{" "}
              <span className="text-ink/60">({deleting.email})</span>. This can&apos;t
              be undone.
            </>
          }
          confirmLabel="Delete"
          danger
          requireCode={deleteRequiresCode}
          busy={deleteBusy}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => {
            setDeleting(null);
            setDeleteError("");
          }}
        />
      )}

      {adding && addStaffPath && branchId && (
        <AddStaffModal
          branchId={branchId}
          branchName={branchName ?? "this branch"}
          postPath={addStaffPath}
          onClose={() => setAdding(false)}
          // Refresh the underlying list; the add modal stays open to reveal the
          // one-time temporary password until the admin dismisses it.
          onCreated={() => load()}
        />
      )}
    </>
  );
}

function AccountRow({
  account,
  busy,
  onEdit,
  onToggleStatus,
  onDelete,
}: {
  account: ClinicAccount;
  busy: boolean;
  onEdit: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
}) {
  const suspended = account.status === "SUSPENDED";
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-field-border p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-inter text-[15px] font-semibold text-ink">
            {accountName(account)}
          </span>
          <span className="rounded-md bg-[#f1f5f9] px-2 py-0.5 font-inter text-[11px] font-semibold uppercase tracking-wide text-brand">
            {ROLE_LABELS[account.role]}
          </span>
          {suspended && (
            <span className="rounded-md bg-red-50 px-2 py-0.5 font-inter text-[11px] font-semibold uppercase tracking-wide text-red-600">
              Suspended
            </span>
          )}
        </div>
        <p className="truncate font-inter text-[13px] leading-5 text-ink/60">
          {account.email}
          {account.phone ? ` · ${account.phone}` : ""}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <IconButton label={`Edit ${accountName(account)}`} onClick={onEdit} tone="brand">
          <EditIcon />
        </IconButton>
        <IconButton
          label={suspended ? `Activate ${accountName(account)}` : `Suspend ${accountName(account)}`}
          onClick={onToggleStatus}
          tone={suspended ? "green" : "amber"}
          disabled={busy}
        >
          {suspended ? <PlayIcon /> : <PauseIcon />}
        </IconButton>
        <IconButton label={`Delete ${accountName(account)}`} onClick={onDelete} tone="red">
          <DeleteIcon />
        </IconButton>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------- edit form */

function EditAccountForm({
  account,
  accountPath,
  onCancel,
  onSaved,
}: {
  account: ClinicAccount;
  accountPath: (id: string) => string;
  onCancel: () => void;
  onSaved: (updated: ClinicAccount) => void;
}) {
  const [firstName, setFirstName] = useState(account.firstName ?? "");
  const [lastName, setLastName] = useState(account.lastName ?? "");
  const [title, setTitle] = useState(account.title ?? "");
  // Stored value carries the +91 country code; the input holds the 10 digits.
  const [phone, setPhone] = useState(phoneLocalPart(account.phone));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!firstName.trim()) next.firstName = "First name is required.";
    if (!lastName.trim()) next.lastName = "Last name is required.";
    const phoneErr = phoneDigitsError(phone);
    if (phoneErr) next.phone = phoneErr;
    setErrors(next);
    setFormError("");
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      const updated = await apiFetch<ClinicAccount>(
        accountPath(account.id),
        {
          method: "PATCH",
          body: JSON.stringify({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            title: title || null,
            // Send the composed value (empty string clears it server-side).
            phone: phoneWithCc(phone),
          }),
        },
      );
      onSaved(updated);
    } catch (err) {
      setSaving(false);
      setFormError(
        err instanceof ApiError ? err.message : "Something went wrong. Please try again.",
      );
    }
  }

  return (
    <Overlay onClose={onCancel} labelledBy="edit-account-title">
      <h2
        id="edit-account-title"
        className="font-manrope text-[24px] leading-[32px] tracking-[-0.5px] text-ink"
      >
        Edit Account
      </h2>
      <p className="-mt-2 font-inter text-[13px] leading-5 text-ink/60">
        {account.email} · {ROLE_LABELS[account.role]}
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-5 sm:flex-row">
          <div className="flex-1">
            <LabeledInput
              id="edit-first-name"
              label="First Name"
              value={firstName}
              onChange={(v) => {
                setFirstName(v);
                setErrors((e) => ({ ...e, firstName: "" }));
              }}
              placeholder="First name"
              error={errors.firstName}
            />
          </div>
          <div className="flex-1">
            <LabeledInput
              id="edit-last-name"
              label="Last Name"
              value={lastName}
              onChange={(v) => {
                setLastName(v);
                setErrors((e) => ({ ...e, lastName: "" }));
              }}
              placeholder="Last name"
              error={errors.lastName}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="pl-1 font-inter text-[12px] font-semibold uppercase leading-4 tracking-[1.2px] text-ink">
            Title
          </span>
          <div className="flex flex-wrap gap-2">
            <TitleChip label="None" active={title === ""} onClick={() => setTitle("")} />
            {TITLE_OPTIONS.map((t) => (
              <TitleChip key={t} label={t} active={title === t} onClick={() => setTitle(t)} />
            ))}
          </div>
        </div>

        <LabeledPhone
          id="edit-phone"
          label="Contact Number"
          value={phone}
          onChange={(v) => {
            setPhone(v);
            setErrors((e) => ({ ...e, phone: "" }));
          }}
          error={errors.phone}
        />

        {formError && (
          <p role="alert" className={ERROR_CLASS}>
            {formError}
          </p>
        )}

        <div className="flex gap-3">
          <SecondaryButton type="button" onClick={onCancel} disabled={saving}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </PrimaryButton>
        </div>
      </form>
    </Overlay>
  );
}

function TitleChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-4 py-2 font-inter text-[14px] font-semibold transition-colors ${
        active
          ? "border-brand bg-brand text-white"
          : "border-field-border text-ink hover:border-brand hover:text-brand"
      }`}
    >
      {label}
    </button>
  );
}

/* --------------------------------------------------------------- helpers */

function accountName(account: ClinicAccount): string {
  const full = [account.firstName, account.lastName].filter(Boolean).join(" ").trim();
  return full || account.email.split("@")[0];
}

function IconButton({
  label,
  onClick,
  disabled,
  tone,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone: "brand" | "amber" | "green" | "red";
  children: React.ReactNode;
}) {
  const hover =
    tone === "red"
      ? "hover:border-red-500 hover:text-red-500"
      : tone === "amber"
        ? "hover:border-amber-500 hover:text-amber-600"
        : tone === "green"
          ? "hover:border-green-600 hover:text-green-600"
          : "hover:border-brand hover:text-brand";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`flex size-9 items-center justify-center rounded-full border border-field-border text-ink/70 transition-colors disabled:opacity-40 ${hover}`}
    >
      {children}
    </button>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-[17px]" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-[17px]" aria-hidden>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-[17px]" aria-hidden>
      <line x1="9" y1="5" x2="9" y2="19" />
      <line x1="15" y1="5" x2="15" y2="19" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-[17px]" aria-hidden>
      <polygon points="6 4 20 12 6 20 6 4" />
    </svg>
  );
}
