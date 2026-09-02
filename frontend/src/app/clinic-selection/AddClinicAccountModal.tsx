"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  ACCOUNT_TYPES,
  apiFetch,
  ApiError,
  TITLE_OPTIONS,
  type AccountType,
  type BranchSummary,
  type CreatedAccount,
} from "@/lib/api";

/** Minimal clinic shape the clinic picker needs (id + display name + code). */
type ClinicOption = { id: string; name: string; code: string | null };

import { useExclusiveDropdown } from "@/lib/useExclusiveDropdown";
import { emailError, phoneDigitsError, phoneWithCc } from "@/lib/validation";

import {
  ERROR_CLASS,
  LABEL_CLASS,
  LabeledInput,
  LabeledPhone,
  Overlay,
  PrimaryButton,
  SecondaryButton,
} from "./modal-ui";

/* ------------------------------------------------------------- primitives */

/** Field-styled dropdown (Title, Account Type). */
function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
  placeholder: string;
  error?: string;
}) {
  const [open, setOpen] = useExclusiveDropdown();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, setOpen]);

  const current = options.find((o) => o.value === value);

  return (
    <div className="flex flex-col gap-1.5">
      <span className={LABEL_CLASS} id={`${id}-label`}>
        {label}
      </span>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-labelledby={`${id}-label`}
          className={`flex w-full items-center justify-between rounded-lg border bg-white/60 px-4 py-4 text-left shadow-[0_1px_2px_rgba(0,0,0,0.05)] ${
            error ? "border-red-500" : "border-field-border"
          }`}
        >
          <span className={`font-inter text-[14px] ${current ? "text-ink" : "text-field-placeholder"}`}>
            {current ? current.label : placeholder}
          </span>
          <Image
            src="/clinic/chevron-filter.svg"
            alt=""
            width={20}
            height={20}
            className={`size-5 shrink-0 transition-transform ${open ? "rotate-90" : "-rotate-90"}`}
          />
        </button>
        {open && (
          <div
            role="listbox"
            className="absolute left-0 top-full z-20 mt-2 flex w-full flex-col gap-[5px] rounded-[15px] border border-field-border bg-white p-[10px] drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)]"
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={opt.value === value}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-[8px] bg-[#f1f5f9] px-4 py-[10px] text-left transition-colors hover:bg-[#e7edf4]"
              >
                <span className="font-manrope text-[14px] font-semibold leading-5 text-ink">
                  {opt.label}
                </span>
                {opt.value === value && (
                  <span className="flex size-3 shrink-0 items-center justify-center rounded-full border border-ink">
                    <span className="size-1.5 rounded-full bg-ink" />
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className={ERROR_CLASS}>
          {error}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------- branch combobox */

/** Searchable single-select combobox used for both the clinic and branch pickers. */
function Combobox<T extends { id: string }>({
  label,
  items,
  selected,
  getName,
  getSub,
  onSelect,
  placeholder,
  emptyText,
  disabled,
  footer,
}: {
  label: string;
  items: T[];
  selected: T | null;
  getName: (item: T) => string;
  getSub?: (item: T) => string;
  onSelect: (item: T) => void;
  placeholder: string;
  emptyText: string;
  disabled?: boolean;
  /** Optional action rendered under the list (e.g. "+ Add New Clinic"). */
  footer?: React.ReactNode;
}) {
  const [open, setOpen] = useExclusiveDropdown();
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, setOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        getName(it).toLowerCase().includes(q) ||
        (getSub?.(it) ?? "").toLowerCase().includes(q),
    );
  }, [items, query, getName, getSub]);

  return (
    <div className="flex flex-col gap-1.5">
      <span className={LABEL_CLASS}>{label}</span>
      <div ref={ref} className="relative">
        <div
          className={`flex items-center gap-2 rounded-lg border border-field-border bg-white/60 px-4 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)] focus-within:border-brand ${
            disabled ? "opacity-50" : ""
          }`}
        >
          <Image src="/clinic/search.svg" alt="" width={20} height={20} className="size-5 shrink-0" />
          <input
            type="text"
            value={open ? query : selected ? getName(selected) : query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => !disabled && setOpen(true)}
            disabled={disabled}
            placeholder={placeholder}
            aria-label={label}
            className="min-w-0 flex-1 bg-transparent font-inter text-[14px] text-ink outline-none placeholder:text-field-placeholder disabled:cursor-not-allowed"
          />
        </div>

        {open && !disabled && (
          <div className="absolute left-0 top-full z-20 mt-2 flex max-h-[260px] w-full flex-col gap-[5px] overflow-y-auto rounded-[15px] border border-field-border bg-white p-[10px] drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
            {filtered.length === 0 ? (
              <p className="px-2 py-3 font-inter text-[13px] text-ink/60">{emptyText}</p>
            ) : (
              filtered.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => {
                    onSelect(it);
                    setQuery("");
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between rounded-[8px] bg-[#f1f5f9] px-4 py-[10px] text-left transition-colors hover:bg-[#e7edf4]"
                >
                  <span className="font-manrope text-[14px] font-semibold leading-5 text-ink">
                    {getName(it)}
                  </span>
                  {selected?.id === it.id && (
                    <span className="flex size-3 shrink-0 items-center justify-center rounded-full border border-ink">
                      <span className="size-1.5 rounded-full bg-ink" />
                    </span>
                  )}
                </button>
              ))
            )}
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------- add-new-clinic form */

interface BranchDraft {
  name: string;
  picName: string;
  contact: string;
}

const emptyBranch = (): BranchDraft => ({ name: "", picName: "", contact: "" });

function AddClinicForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  /** Receives the created clinic + all its branches (at least one). */
  onCreated: (clinic: ClinicOption, branches: BranchSummary[]) => void;
}) {
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  // A clinic is created with one or more branches, each with its own name.
  const [branches, setBranches] = useState<BranchDraft[]>([emptyBranch()]);
  const [branchErrors, setBranchErrors] = useState<Record<number, { name?: string; contact?: string }>>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function updateBranch(i: number, patch: Partial<BranchDraft>) {
    setBranches((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
    setBranchErrors((prev) => ({ ...prev, [i]: {} }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nameErr = name.trim() ? "" : "Clinic name is required.";
    const bErrors: Record<number, { name?: string; contact?: string }> = {};
    branches.forEach((b, i) => {
      const err: { name?: string; contact?: string } = {};
      if (!b.name.trim()) err.name = "Branch name is required.";
      const contactErr = phoneDigitsError(b.contact);
      if (contactErr) err.contact = contactErr;
      if (err.name || err.contact) bErrors[i] = err;
    });
    setNameError(nameErr);
    setBranchErrors(bErrors);
    setFormError("");
    if (nameErr || Object.keys(bErrors).length > 0) return;

    setSubmitting(true);
    try {
      const res = await apiFetch<{
        id: string;
        name: string;
        code: string | null;
        branches: BranchSummary[];
      }>("/super-admin/clinics", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          branches: branches.map((b) => ({
            name: b.name.trim(),
            picName: b.picName.trim() || undefined,
            contact: phoneWithCc(b.contact) || undefined,
          })),
        }),
      });
      if (res.branches.length > 0) {
        onCreated({ id: res.id, name: res.name, code: res.code }, res.branches);
      } else {
        setFormError("Clinic created, but no branch was returned.");
        setSubmitting(false);
      }
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onCancel} labelledBy="add-clinic-title" className="[zoom:0.95]">
      <h2 id="add-clinic-title" className="font-manrope text-[24px] leading-[32px] tracking-[-0.5px] text-ink">
        Add New Clinic
      </h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <LabeledInput
          id="clinic-name"
          label="Clinic Name"
          value={name}
          onChange={(v) => { setName(v); setNameError(""); }}
          placeholder="e.g. Bright Smile Dental"
          error={nameError}
        />

        <div className="flex flex-col gap-4 border-t border-field-border pt-5">
          <div className="flex items-center justify-between">
            <span className="font-manrope text-[16px] font-semibold text-ink">Branches</span>
            <span className="font-inter text-[13px] text-ink/50">
              A clinic can have one or more branches.
            </span>
          </div>

          {branches.map((b, i) => (
            <div key={i} className="flex flex-col gap-4 rounded-2xl border border-field-border p-4">
              <div className="flex items-center justify-between">
                <span className="font-inter text-[13px] font-semibold uppercase tracking-[1px] text-ink/60">
                  Branch {i + 1}
                </span>
                {branches.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setBranches((prev) => prev.filter((_, idx) => idx !== i))}
                    className="font-inter text-[13px] font-medium text-red-500 hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
              <LabeledInput
                id={`branch-name-${i}`}
                label="Branch Name"
                value={b.name}
                onChange={(v) => updateBranch(i, { name: v })}
                placeholder="e.g. Downtown"
                error={branchErrors[i]?.name}
              />
              <LabeledInput
                id={`branch-pic-${i}`}
                label="Person in Charge (PIC)"
                value={b.picName}
                onChange={(v) => updateBranch(i, { picName: v })}
                placeholder="Person in charge"
              />
              <LabeledPhone
                id={`branch-contact-${i}`}
                label="Contact Number"
                value={b.contact}
                onChange={(v) => updateBranch(i, { contact: v })}
                error={branchErrors[i]?.contact}
              />
            </div>
          ))}

          <button
            type="button"
            onClick={() => setBranches((prev) => [...prev, emptyBranch()])}
            className="flex items-center justify-center gap-1 rounded-lg border border-dashed border-brand px-4 py-[10px] font-inter text-[14px] font-semibold text-brand transition-colors hover:bg-brand/[.06]"
          >
            + Add another branch
          </button>
        </div>

        {formError && <p role="alert" className={ERROR_CLASS}>{formError}</p>}
        <div className="mt-1 flex gap-3">
          <SecondaryButton type="button" onClick={onCancel}>Cancel</SecondaryButton>
          <PrimaryButton type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create Clinic"}
          </PrimaryButton>
        </div>
      </form>
    </Overlay>
  );
}

/* ------------------------------------------------ temporary password box */

/**
 * Shows the one-time temporary password on the "Account created" screen with a
 * copy button. The new user signs in with this and is forced to reset it on
 * first login — it can't be looked up again, so the admin must share it now.
 */
function TemporaryPasswordBox({ password }: { password: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked — the value is visible for manual copy.
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-field-border bg-[#f1f5f9] p-4">
      <span className={LABEL_CLASS}>Temporary Password</span>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate font-mono text-[16px] font-semibold tracking-wide text-ink">
          {password}
        </code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-[8px] border border-brand px-3 py-1.5 font-inter text-[13px] font-semibold text-brand transition-colors hover:bg-brand/[.06]"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="font-inter text-[12px] leading-4 text-ink/60">
        Share this with the user — they’ll be asked to set a new password and accept
        the Terms &amp; Conditions on first login. It won’t be shown again.
      </p>
    </div>
  );
}

/* --------------------------------------------------------------- modal */

export default function AddClinicAccountModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [clinics, setClinics] = useState<ClinicOption[]>([]);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [selectedClinic, setSelectedClinic] = useState<ClinicOption | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<BranchSummary | null>(null);
  const [showAddClinic, setShowAddClinic] = useState(false);

  // Account fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [title, setTitle] = useState("");
  const [accountType, setAccountType] = useState<AccountType | "">("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  // The one-time temporary password returned on creation, shown so the super
  // admin can pass it to the new user (never retrievable again).
  const [tempPassword, setTempPassword] = useState("");
  // Whether the backend also emailed the password to the new user.
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<ClinicOption[]>("/super-admin/clinics").catch(() => [] as ClinicOption[]),
      apiFetch<BranchSummary[]>("/super-admin/branches").catch(() => [] as BranchSummary[]),
    ]).then(([cs, bs]) => {
      if (!active) return;
      setClinics(cs.map((c) => ({ id: c.id, name: c.name, code: c.code })));
      setBranches(bs);
    });
    return () => {
      active = false;
    };
  }, []);

  // Only the selected clinic's branches are pickable.
  const branchesForClinic = useMemo(
    () => (selectedClinic ? branches.filter((b) => b.clinicId === selectedClinic.id) : []),
    [branches, selectedClinic],
  );

  // Admins are clinic-wide (no branch); doctors + receptionists need a branch.
  const branchRequired = accountType !== "" && accountType !== "ADMIN";
  const canSubmit =
    selectedClinic !== null && (!branchRequired || selectedBranch !== null) && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClinic) {
      setFormError("Select or create a clinic first.");
      return;
    }
    const next: Record<string, string> = {};
    if (!firstName.trim()) next.firstName = "First name is required.";
    if (!lastName.trim()) next.lastName = "Last name is required.";
    if (!accountType) next.accountType = "Select an account type.";
    if (branchRequired && !selectedBranch) next.branch = "Select a branch for this account.";
    const emailErr = emailError(email, true);
    if (emailErr) next.email = emailErr;
    const phoneErr = phoneDigitsError(phone);
    if (phoneErr) next.phone = phoneErr;
    setErrors(next);
    setFormError("");
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      const created = await apiFetch<CreatedAccount>("/super-admin/accounts", {
        method: "POST",
        body: JSON.stringify({
          clinicId: selectedClinic.id,
          // Doctors + receptionists are pinned to the chosen branch; the backend
          // ignores this for admins (they're clinic-wide).
          branchId: selectedBranch?.id,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          title: title || undefined,
          accountType,
          email: email.trim(),
          phone: phoneWithCc(phone) || undefined,
        }),
      });
      setTempPassword(created.temporaryPassword);
      setEmailSent(created.emailSent);
      setDone(true);
      onCreated();
    } catch (err) {
      setSubmitting(false);
      setFormError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  }

  if (done) {
    return (
      <Overlay onClose={onClose} labelledBy="done-title">
        <h2 id="done-title" className="font-manrope text-[24px] leading-[32px] tracking-[-0.5px] text-ink">
          Account created
        </h2>
        <p className="font-inter text-[15px] leading-[24px] text-ink">
          The account for <span className="font-semibold">{email}</span> was created under{" "}
          <span className="font-semibold">
            {selectedClinic?.name}
            {selectedBranch ? ` · ${selectedBranch.name}` : ""}
          </span>
          .
        </p>
        <div
          className={`flex items-start gap-2 rounded-lg px-4 py-3 font-inter text-[13px] leading-5 ${
            emailSent ? "bg-[#f0fdf4] text-green-700" : "bg-amber-50 text-amber-700"
          }`}
        >
          <span aria-hidden>{emailSent ? "✓" : "!"}</span>
          <span>
            {emailSent
              ? `We emailed the temporary password to ${email}.`
              : "We couldn't send the email — please share the temporary password below manually."}
          </span>
        </div>
        <TemporaryPasswordBox password={tempPassword} />
        <PrimaryButton type="button" onClick={onClose}>Done</PrimaryButton>
      </Overlay>
    );
  }

  return (
    <>
      <Overlay onClose={onClose} labelledBy="add-title" className="[zoom:0.95]">
        <div className="flex items-center justify-between">
          <h2 id="add-title" className="font-manrope text-[24px] leading-[32px] tracking-[-0.5px] text-ink">
            Add Clinic &amp; Account
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Step 1 — clinic + branch (stacked so each gets the full width) */}
          <div className="flex flex-col gap-5">
            <div>
              <Combobox
                label="Clinic"
                items={clinics}
                selected={selectedClinic}
                getName={(c) => c.name}
                getSub={(c) => c.code ?? ""}
                onSelect={(c) => {
                  setSelectedClinic(c);
                  // Branches belong to a clinic — a new clinic clears the branch.
                  setSelectedBranch(null);
                  setFormError("");
                }}
                placeholder="Search or select a clinic"
                emptyText="No matching clinic."
                footer={
                  <button
                    type="button"
                    onClick={() => setShowAddClinic(true)}
                    className="mt-1 flex w-full items-center justify-center gap-1 rounded-[8px] border border-dashed border-brand px-4 py-[10px] font-inter text-[14px] font-semibold text-brand transition-colors hover:bg-brand/[.06]"
                  >
                    + Add New Clinic
                  </button>
                }
              />
            </div>
            <div>
              <Combobox
                label="Branch"
                items={branchesForClinic}
                selected={selectedBranch}
                getName={(b) => b.name}
                getSub={(b) => b.picName ?? ""}
                onSelect={(b) => {
                  setSelectedBranch(b);
                  setErrors((e) => ({ ...e, branch: "" }));
                  setFormError("");
                }}
                placeholder={selectedClinic ? "Select a branch" : "Select a clinic first"}
                emptyText="This clinic has no branches yet."
                disabled={!selectedClinic}
              />
              {errors.branch && (
                <p role="alert" className={`mt-1.5 ${ERROR_CLASS}`}>
                  {errors.branch}
                </p>
              )}
            </div>
          </div>

          {/* Step 2 — account details (enabled once a clinic is chosen) */}
          <fieldset
            disabled={!selectedClinic}
            className={`flex flex-col gap-5 border-t border-field-border pt-6 ${selectedClinic ? "" : "opacity-50"}`}
          >
            <legend className="px-1 font-manrope text-[16px] font-semibold text-ink">
              Account Details
            </legend>
            {!selectedClinic && (
              <p className="px-1 font-inter text-[13px] leading-5 text-ink/60">
                Select or create a clinic to add an account.
              </p>
            )}
            <div className="flex flex-col gap-5 sm:flex-row">
              <div className="flex-1">
                <LabeledInput id="first-name" label="First Name" value={firstName} onChange={(v) => { setFirstName(v); setErrors((e) => ({ ...e, firstName: "" })); }} placeholder="First name" error={errors.firstName} />
              </div>
              <div className="flex-1">
                <LabeledInput id="last-name" label="Last Name" value={lastName} onChange={(v) => { setLastName(v); setErrors((e) => ({ ...e, lastName: "" })); }} placeholder="Last name" error={errors.lastName} />
              </div>
            </div>
            <div className="flex flex-col gap-5 sm:flex-row">
              <div className="flex-1">
                <SelectField id="title" label="Title" value={title} onChange={setTitle} options={TITLE_OPTIONS.map((t) => ({ value: t, label: t }))} placeholder="Select title" />
              </div>
              <div className="flex-1">
                <SelectField id="account-type" label="Account Type" value={accountType} onChange={(v) => { setAccountType(v as AccountType); setErrors((e) => ({ ...e, accountType: "" })); }} options={ACCOUNT_TYPES} placeholder="Select type" error={errors.accountType} />
              </div>
            </div>
            <LabeledInput id="email" label="Email ID" type="email" value={email} onChange={(v) => { setEmail(v); setErrors((e) => ({ ...e, email: "" })); }} placeholder="Email address" error={errors.email} autoComplete="off" />
            <LabeledPhone id="account-contact" label="Contact Number" value={phone} onChange={(v) => { setPhone(v); setErrors((e) => ({ ...e, phone: "" })); }} error={errors.phone} />
          </fieldset>

          {formError && <p role="alert" className={ERROR_CLASS}>{formError}</p>}

          <div className="flex gap-3">
            <SecondaryButton type="button" onClick={onClose}>Cancel</SecondaryButton>
            <PrimaryButton type="submit" disabled={!canSubmit}>
              {submitting ? "Creating…" : "Create Account"}
            </PrimaryButton>
          </div>
        </form>
      </Overlay>

      {showAddClinic && (
        <AddClinicForm
          onCancel={() => setShowAddClinic(false)}
          onCreated={(clinic, created) => {
            // Add the new clinic + its branches to the pickers and select them
            // so the account step can continue immediately.
            setClinics((prev) => [clinic, ...prev.filter((c) => c.id !== clinic.id)]);
            const ids = new Set(created.map((b) => b.id));
            setBranches((prev) => [...created, ...prev.filter((b) => !ids.has(b.id))]);
            setSelectedClinic(clinic);
            setSelectedBranch(created[0] ?? null);
            setShowAddClinic(false);
            onCreated();
          }}
        />
      )}
    </>
  );
}
