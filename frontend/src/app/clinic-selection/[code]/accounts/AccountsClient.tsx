"use client";

import FloatingPanel from "@/components/FloatingPanel";
import TableViewport from "@/components/TableViewport";
import TablePagination from "@/components/TablePagination";
import { useExclusiveDropdown } from "@/lib/useExclusiveDropdown";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import {
  apiFetch,
  ApiError,
  displayName,
  roleAvatar,
  ROLE_LABELS,
  type ClinicAccount,
  type Role,
} from "@/lib/api";
import { passwordPolicyError } from "@/lib/password";
import { AccountsSkeleton } from "@/components/loading/PageSkeletons";

import { useMe } from "../session";

// Table grid template — shared by the header and every row. Column proportions
// follow the Figma "Accounts Table" (Full Name / Email / Role / Status / Created
// / Actions).
const COLS =
  "grid-cols-[minmax(0,185fr)_minmax(0,332fr)_minmax(0,169fr)_minmax(0,138fr)_minmax(0,122fr)_minmax(0,125fr)]";

const p2 = (n: number) => String(n).padStart(2, "0");

/** ISO → "DD/MM/YYYY" (Figma "01/09/2023"). */
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export default function AccountsClient() {
  const me = useMe();
  const isAdmin = me.user.role === "CLIENT_ADMIN" || me.user.role === "SUPER_ADMIN";

  // The list returns the clinic's admins + doctors + receptionists (Figma; super
  // admins are never clinic members). The signed-in account is hidden from the
  // table — you manage your own account from Profile settings.
  const [accounts, setAccounts] = useState<ClinicAccount[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [role, setRole] = useState<Role | "all">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ClinicAccount | null>(null);
  const [resetting, setResetting] = useState<ClinicAccount | null>(null);
  const [confirming, setConfirming] = useState<{
    account: ClinicAccount;
    action: "disable" | "enable" | "delete";
  } | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    apiFetch<ClinicAccount[]>("/accounts")
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
  }, [isAdmin]);

  // Hide the signed-in account from the table (both admin and super admin).
  const rows = accounts ? accounts.filter((account) =>
    account.id !== me.user.id && (role === "all" || account.role === role)
  ) : null;
  const total = rows?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = rows?.slice((currentPage - 1) * pageSize, currentPage * pageSize) ?? [];

  function upsertAccount(updated: ClinicAccount) {
    setAccounts((list) => (list ?? []).map((a) => (a.id === updated.id ? updated : a)));
  }

  if (isAdmin && accounts === null) return <AccountsSkeleton />;

  if (!isAdmin) {
    return (
      <div className="flex flex-1 flex-col gap-[20px]">
        <h1 className="app-page-title font-manrope text-[31px] font-bold leading-[39px] tracking-[-0.7px] text-[#1e1e24]">
          Accounts Management
        </h1>
        <p className="font-inter text-[14px] text-[#727783]">
          You don&apos;t have access to account management.
        </p>
      </div>
    );
  }

  return (
    <div className="app-page flex flex-1 flex-col gap-[34px]">
      <div className="app-toolbar flex flex-wrap items-center justify-between gap-[14px]">
        <h1 className="app-page-title font-manrope text-[31px] font-bold leading-[39px] tracking-[-0.7px] text-[#1e1e24]">
          Accounts Management
        </h1>
        <RoleFilter value={role} onChange={(next) => { setRole(next); setPage(1); setOpenMenuId(null); }} />
      </div>

      {/* Accounts table */}
      <TableViewport label="Accounts" minWidth="1100px" className="flex flex-col rounded-[24px] border border-black bg-white shadow-[0px_4px_13px_rgba(0,0,0,0.02)]">
        {/* Header row */}
        <div className={`app-table-header grid ${COLS} items-center border-b border-black`}>
          {["Full Name", "Email", "Role", "Status", "Created"].map((h) => (
            <span
              key={h}
              className="px-[22px] py-[15px] font-inter text-[13px] font-semibold uppercase leading-[18px] tracking-[0.6px] text-[#727783]"
            >
              {h}
            </span>
          ))}
          <span className="px-[22px] py-[15px] text-right font-inter text-[13px] font-semibold uppercase leading-[18px] tracking-[0.6px] text-[#727783]">
            Actions
          </span>
        </div>

        {rows === null ? (
          <p className="px-[22px] py-8 font-inter text-[14px] text-[#94a3b8]">Loading accounts…</p>
        ) : loadError ? (
          <p role="alert" className="px-[22px] py-8 font-inter text-[14px] text-[#ba1a1a]">
            {loadError}
          </p>
        ) : (
          total === 0 ? (
            <p role="status" className="px-[22px] py-8 font-inter text-[14px] text-[#727783]">
              {role === "all" ? "No accounts yet." : "No accounts match this role."}
            </p>
          ) : pageRows.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              menuOpen={openMenuId === account.id}
              onToggleMenu={() =>
                setOpenMenuId((id) => (id === account.id ? null : account.id))
              }
              onCloseMenu={() => setOpenMenuId(null)}
              onEditProfile={() => {
                setOpenMenuId(null);
                setEditing(account);
              }}
              onResetPassword={() => {
                setOpenMenuId(null);
                setResetting(account);
              }}
              onToggleStatus={() => {
                setOpenMenuId(null);
                setConfirming({
                  account,
                  action: account.status === "ACTIVE" ? "disable" : "enable",
                });
              }}
              onDelete={() => {
                setOpenMenuId(null);
                setConfirming({ account, action: "delete" });
              }}
            />
          ))
        )}
      </TableViewport>

      {!loadError && total > 0 && (
        <div className="mt-auto">
          <TablePagination
            totalRecords={total}
            currentPage={currentPage}
            pageSize={pageSize}
            paginationLabel="Account pages"
            onPageChange={(next) => { setPage(next); setOpenMenuId(null); }}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1); setOpenMenuId(null); }}
          />
        </div>
      )}

      {editing && (
        <EditAccountProfileDialog
          account={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            upsertAccount(updated);
            setEditing(null);
          }}
        />
      )}

      {resetting && (
        <ResetPasswordDialog account={resetting} onClose={() => setResetting(null)} />
      )}

      {confirming && (
        <ConfirmAccountActionDialog
          key={confirming.account.id + confirming.action}
          account={confirming.account}
          action={confirming.action}
          onClose={() => setConfirming(null)}
          onDone={(updated) => {
            if (updated) upsertAccount(updated);
            else setAccounts((list) => (list ?? []).filter((a) => a.id !== confirming.account.id));
            setConfirming(null);
          }}
        />
      )}
    </div>
  );
}

/** One account row + its per-row actions (⋮) dropdown. Every listed row (the
 *  signed-in account is filtered out upstream) gets the full menu. */
function AccountRow({
  account,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onEditProfile,
  onResetPassword,
  onToggleStatus,
  onDelete,
}: {
  account: ClinicAccount;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onEditProfile: () => void;
  onResetPassword: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const active = account.status === "ACTIVE";

  return (
    <div className={`grid ${COLS} items-center border-b border-black last:border-b-0`}>
      <span className="px-[22px] py-[18px] font-inter text-[14px] font-medium leading-[20px] text-[#1e1e24]">
        {displayName(account)}
      </span>
      <span title={account.email} className="min-w-0 truncate px-[22px] py-[18px] font-inter text-[14px] font-medium leading-[20px] text-[#1e1e24]">
        {account.email}
      </span>
      <div className="px-[22px] py-[18px]">
        <span className="inline-flex items-center gap-[5px] rounded-full bg-[#0077c0] px-[12px] py-[3px] font-inter text-[13px] font-semibold leading-[18px] text-white">
          <Image src={roleAvatar(account.role)} alt="" width={18} height={18} className="size-[18px]" />
          {ROLE_LABELS[account.role]}
        </span>
      </div>
      <div className="px-[22px] py-[18px]">
        <span
          className={`inline-flex rounded-full px-[12px] py-[3px] font-inter text-[13px] font-semibold leading-[18px] text-white ${
            active ? "bg-[#16a34a]" : "bg-[#94a3b8]"
          }`}
        >
          {active ? "Active" : "Disabled"}
        </span>
      </div>
      <span className="px-[22px] py-[18px] font-inter text-[14px] font-medium leading-[20px] text-[#1e1e24]">
        {fmtDate(account.createdAt)}
      </span>
      <div className="relative flex justify-end px-[22px] py-[18px]">
        <button
          type="button"
          ref={ref}
          onClick={onToggleMenu}
          aria-label={`Actions for ${displayName(account)}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex size-[28px] items-center justify-center rounded-full text-[#94a3b8] transition-colors hover:bg-[#f1f5f9] hover:text-[#1e1e24]"
        >
          <KebabIcon className="size-[22px]" />
        </button>

        {menuOpen && (
          <FloatingPanel anchor={ref} width={216} onClose={onCloseMenu} role="menu"
            className="flex flex-col gap-[5px] rounded-[13px] border-[1.167px] border-black bg-white p-[14px] shadow-[0px_10px_24px_rgba(0,0,0,0.10)]"
          >
            <MenuItem label="Edit" onClick={onEditProfile} />
            <MenuItem label="Reset Password" onClick={onResetPassword} />
            <MenuItem label={active ? "Disable" : "Enable"} onClick={onToggleStatus} />
            <MenuItem label="Delete" danger onClick={onDelete} />
          </FloatingPanel>
        )}
      </div>
    </div>
  );
}

/** One filled-pill row in the actions dropdown (Figma "Settings Dropdown"):
 *  light-slate for normal actions, light-red for the destructive Delete. */
function MenuItem({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`w-full rounded-[8px] px-[13px] py-[10px] text-left font-manrope text-[14px] font-semibold leading-[20px] transition-colors ${
        danger
          ? "bg-[#f9f1f1] text-[#ab2222] app-option-hover"
          : "bg-[#f1f5f9] text-[#1e1e24] app-option-hover"
      }`}
    >
      {label}
    </button>
  );
}

/* ---------------------------------------------------------- Edit Profile */

/** "Edit Account Profile" popup (Figma "EAP"): Full Name + Email → Update Profile.
 *  Only the name is persisted for now; email edits aren't wired to the backend. */
function EditAccountProfileDialog({
  account,
  onClose,
  onSaved,
}: {
  account: ClinicAccount;
  onClose: () => void;
  onSaved: (updated: ClinicAccount) => void;
}) {
  const [fullName, setFullName] = useState(displayName(account));
  const [email, setEmail] = useState(account.email);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = fullName.trim();
    if (!trimmed) {
      setError("Full name is required.");
      return;
    }
    const parts = trimmed.split(/\s+/);
    const firstName = parts[0];
    const lastName = parts.slice(1).join(" ");
    setSaving(true);
    setError("");
    try {
      const updated = await apiFetch<ClinicAccount>(`/accounts/${account.id}`, {
        method: "PATCH",
        body: JSON.stringify({ firstName, lastName }),
      });
      onSaved(updated);
    } catch (err) {
      setSaving(false);
      setError(err instanceof ApiError ? err.message : "Couldn't update the profile.");
    }
  }

  return (
    <DialogShell title="Edit Account Profile" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col">
        <div className="app-form-grid grid grid-cols-1 gap-x-[32px] gap-y-[20px] px-[25px] pb-[20px] pt-[13px] sm:grid-cols-2">
          <Field label="Full Name" required>
            <UnderlineInput value={fullName} onChange={setFullName} placeholder="Full name" autoFocus />
          </Field>
          <Field label="Email" required>
            <UnderlineInput value={email} onChange={setEmail} placeholder="Email address" type="email" />
          </Field>
        </div>
        {error && (
          <p role="alert" className="px-[25px] pb-[8px] font-inter text-[13px] text-[#ba1a1a]">
            {error}
          </p>
        )}
        <div className="flex items-center justify-end gap-[12px] px-[25px] py-[18px]">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-[12px] px-[25px] py-[11px] font-inter text-[12px] font-semibold uppercase tracking-[0.6px] text-[#1e1e24] transition-colors hover:bg-[#f1f5f9] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-[12px] bg-[#0077c0] px-[25px] py-[11px] font-inter text-[12px] font-semibold uppercase tracking-[0.6px] text-white shadow-[0px_4px_6px_rgba(0,71,141,0.2)] transition-colors hover:bg-[#0069a8] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Update Profile"}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}

/* -------------------------------------------------------- Reset Password */

/** "Reset Password" popup (Figma "Accounts RP"). An admin / super admin sets a
 *  new password for the account via `POST /accounts/:id/reset-password`. */
function ResetPasswordDialog({
  account,
  onClose,
}: {
  account: ClinicAccount;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const canSubmit = password.length > 0 && confirm.length > 0 && !saving && !done;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const policyErr = passwordPolicyError(password);
    if (policyErr) {
      setError(policyErr);
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/accounts/${account.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setDone(true);
      // Briefly show the confirmation, then dismiss.
      setTimeout(onClose, 1400);
    } catch (err) {
      setSaving(false);
      setError(err instanceof ApiError ? err.message : "Couldn't reset the password.");
    }
  }

  return (
    <DialogShell title="Reset Password" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col">
        <div className="app-form-grid grid grid-cols-1 gap-x-[32px] gap-y-[20px] px-[25px] pb-[20px] pt-[13px] sm:grid-cols-2">
          <Field label="Password" required>
            <UnderlineInput
              value={password}
              onChange={(v) => {
                setPassword(v);
                setError("");
              }}
              placeholder="Enter new password"
              type="password"
              autoFocus
            />
          </Field>
          <Field label="Confirm Password" required>
            <UnderlineInput
              value={confirm}
              onChange={(v) => {
                setConfirm(v);
                setError("");
              }}
              placeholder="Re-enter password"
              type="password"
            />
          </Field>
        </div>
        {(error || done) && (
          <p
            role="alert"
            className={`px-[25px] pb-[8px] font-inter text-[13px] ${done ? "text-[#15803d]" : "text-[#ba1a1a]"}`}
          >
            {done ? `Password updated for ${displayName(account)}.` : error}
          </p>
        )}
        <div className="flex items-center justify-end px-[25px] py-[18px]">
          <button
            type="submit"
            disabled={!canSubmit}
            className={`rounded-[12px] px-[25px] py-[11px] font-inter text-[12px] font-semibold uppercase tracking-[0.6px] text-white shadow-[0px_4px_11px_rgba(0,71,141,0.2)] transition-colors ${
              canSubmit ? "bg-[#0077c0] hover:bg-[#0069a8]" : "cursor-not-allowed bg-[rgba(0,119,192,0.5)]"
            }`}
          >
            {saving ? "Resetting…" : done ? "Done" : "Reset Password"}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}

/* ------------------------------------------------- Disable / Delete confirm */

/** Small confirm card for disable / enable / delete (Figma "Accounts Disable" /
 *  "Accounts delete"). Wired to PATCH status / DELETE on the account. */
function ConfirmAccountActionDialog({
  account,
  action,
  onClose,
  onDone,
}: {
  account: ClinicAccount;
  action: "disable" | "enable" | "delete";
  onClose: () => void;
  /** `updated` for status changes; `null` after a delete removes the row. */
  onDone: (updated: ClinicAccount | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isDelete = action === "delete";
  const verb = action === "delete" ? "delete" : action === "disable" ? "disable" : "enable";
  const title = `${verb.charAt(0).toUpperCase() + verb.slice(1)} Account?`;
  const confirmLabel = `${verb.charAt(0).toUpperCase() + verb.slice(1)} Account`;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleConfirm() {
    setBusy(true);
    setError("");
    try {
      if (isDelete) {
        await apiFetch(`/accounts/${account.id}`, { method: "DELETE" });
        onDone(null);
      } else {
        const updated = await apiFetch<ClinicAccount>(`/accounts/${account.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: action === "disable" ? "SUSPENDED" : "ACTIVE" }),
        });
        onDone(updated);
      }
    } catch (err) {
      setBusy(false);
      setError(err instanceof ApiError ? err.message : `Couldn't ${verb} the account.`);
    }
  }

  return (
    <div
      className="app-dialog-backdrop fixed inset-0 z-[130] flex items-center justify-center bg-black/40 p-3.5"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-account-title"
        className="app-dialog flex w-full max-w-[448px] flex-col gap-[13px] rounded-[13px] border-[1.167px] border-black bg-white p-[clamp(13px,3vw,20px)] shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)]"
      >
        <div className="flex items-center gap-[12px]">
          {isDelete ? (
            <TrashIcon className="size-[22px] text-[#ba1a1a]" />
          ) : (
            <BlockIcon className="size-[22px] text-[#1e1e24]" />
          )}
          <h2
            id="confirm-account-title"
            className="font-manrope text-[18px] font-semibold leading-[25px] text-[#1e1e24]"
          >
            {title}
          </h2>
        </div>
        <p className="font-inter text-[14px] leading-[20px] text-[#1e1e24]">
          Are you sure you want to {verb} the account of{" "}
          <span className="font-bold text-[#0077c0]">{displayName(account)}</span>?{" "}
          {isDelete ? "This action cannot be undone." : action === "disable" ? "They won't be able to sign in." : "They'll be able to sign in again."}
        </p>
        {error && (
          <p role="alert" className="font-inter text-[13px] text-[#ba1a1a]">
            {error}
          </p>
        )}
        <div className="app-toolbar flex items-center justify-end gap-[12px] pt-[13px]">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full border-[1.167px] border-black px-[18px] py-[10px] font-inter text-[12px] font-semibold uppercase tracking-[0.6px] text-[#1e1e24] transition-colors hover:bg-[#f1f5f9] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className={`rounded-full px-[17px] py-[10px] font-inter text-[12px] font-semibold uppercase tracking-[0.6px] text-white shadow-[0px_1px_1px_rgba(0,0,0,0.05)] transition-opacity hover:opacity-90 disabled:opacity-50 ${
              isDelete ? "bg-[#c0202b]" : "bg-[#0077c0]"
            }`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- shared UI */

/** The wide white popup shell (header with title + close, then children). Used
 *  by the Edit Profile and Reset Password dialogs (Figma "EAP" / "Accounts RP"). */
function DialogShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="app-dialog-backdrop fixed inset-0 z-[130] flex items-center justify-center bg-black/40 p-3.5"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-dialog-title"
        className="app-dialog flex w-full max-w-[640px] flex-col overflow-hidden rounded-[25px] bg-white shadow-[0px_30px_60px_-15px_rgba(0,0,0,0.1)]"
      >
        <div className="app-toolbar flex items-center justify-between border-b-[1.167px] border-black px-[clamp(13px,3vw,25px)] pb-[15px] pt-[25px]">
          <h2
            id="account-dialog-title"
            className="font-manrope text-[25px] font-semibold leading-[32px] tracking-[-0.7px] text-[#1e1e24]"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-[36px] items-center justify-center rounded-[10px] text-[#1e1e24] transition-colors hover:bg-[#f1f5f9]"
          >
            <CloseIcon className="size-[24px]" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-[4px]">
      <span className="font-inter text-[11px] uppercase tracking-[0.5px] text-[#1e1e24]">
        {label}
        {required && <span className="text-[#ba1a1a]"> *</span>}
      </span>
      {children}
    </label>
  );
}

function UnderlineInput({
  value,
  onChange,
  placeholder,
  type = "text",
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className="border-b-[1.167px] border-black pb-[10px] pt-[9px] font-inter text-[14px] text-[#1e1e24] outline-none transition-colors placeholder:text-field-placeholder focus:border-black"
    />
  );
}

/* ----------------------------------------------------------------- icons */

function KebabIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className={className} aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

// Filled Material "delete" glyph (matches the app-wide /dashboard/delete.svg).
function TrashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M7 21C6.45 21 5.97917 20.8042 5.5875 20.4125C5.19583 20.0208 5 19.55 5 19V6H4V4H9V3H15V4H20V6H19V19C19 19.55 18.8042 20.0208 18.4125 20.4125C18.0208 20.8042 17.55 21 17 21H7ZM17 6H7V19H17V6ZM9 17H11V8H9V17ZM13 17H15V8H13V17Z" />
    </svg>
  );
}

// Material "block" (no-entry) glyph for the disable/enable confirm.
function BlockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6l12.8 12.8" strokeLinecap="round" />
    </svg>
  );
}


/** Role filter uses the same floating option menu as the app's other filters. */
function RoleFilter({ value, onChange }: {
  value: Role | "all";
  onChange: (role: Role | "all") => void;
}) {
  const [open, setOpen] = useExclusiveDropdown();
  const trigger = useRef<HTMLButtonElement>(null);
  const options: Array<{ value: Role | "all"; label: string }> = [
    { value: "all", label: "All Role" },
    ...(["CLIENT_ADMIN", "DOCTOR", "RECEPTIONIST", "GUEST_DOCTOR"] as const).map(role => ({ value: role, label: ROLE_LABELS[role] })),
  ];

  return (
    <div>
      <button
        ref={trigger}
        type="button"
        aria-label="Filter accounts by role"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
        className="flex h-[44px] items-center gap-[10px] rounded-[10px] border-[1.167px] border-black bg-white px-[13px] font-inter text-[14px] text-[#1e1e24]"
      >
        {value === "all" ? "All Role" : ROLE_LABELS[value]}
        <Image src="/dashboard/chevron_dark.svg" alt="" width={20} height={20} className={"size-5 transition-transform " + (open ? "rotate-90" : "-rotate-90")} />
      </button>
      {open && (
        <FloatingPanel anchor={trigger} width={216} role="menu" label="Account roles" onClose={() => setOpen(false)} className="flex flex-col gap-[5px] rounded-[13px] border-[1.167px] border-black bg-white p-[14px] shadow-lg">
          {options.map(option => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={value === option.value}
              onClick={() => { onChange(option.value); setOpen(false); }}
              className={"flex w-full items-center justify-between gap-3 rounded-[8px] px-[13px] py-[10px] text-left font-manrope text-[14px] font-semibold transition-colors " + (value === option.value ? "bg-[#0077c0] text-white" : "app-option-hover text-[#1e1e24]")}
            >
              {option.label}
            </button>
          ))}
        </FloatingPanel>
      )}
    </div>
  );
}
