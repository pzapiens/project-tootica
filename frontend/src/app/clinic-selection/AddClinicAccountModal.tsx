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
} from "@/lib/api";

import { phoneError } from "@/lib/validation";

import {
  ERROR_CLASS,
  LABEL_CLASS,
  LabeledInput,
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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

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

function BranchCombobox({
  branches,
  selected,
  onSelect,
  onAddNew,
}: {
  branches: BranchSummary[];
  selected: BranchSummary | null;
  onSelect: (b: BranchSummary) => void;
  onAddNew: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.picName ?? "").toLowerCase().includes(q),
    );
  }, [branches, query]);

  return (
    <div className="flex flex-col gap-1.5">
      <span className={LABEL_CLASS}>Clinic</span>
      <div ref={ref} className="relative">
        <div className="flex items-center gap-2 rounded-lg border border-field-border bg-white/60 px-4 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)] focus-within:border-brand">
          <Image src="/clinic/search.svg" alt="" width={20} height={20} className="size-5 shrink-0" />
          <input
            type="text"
            value={open ? query : selected?.name ?? query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search or select a clinic"
            aria-label="Search clinics"
            className="min-w-0 flex-1 bg-transparent font-inter text-[14px] text-ink outline-none placeholder:text-field-placeholder"
          />
        </div>

        {open && (
          <div className="absolute left-0 top-full z-20 mt-2 flex max-h-[260px] w-full flex-col gap-[5px] overflow-y-auto rounded-[15px] border border-field-border bg-white p-[10px] drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
            {filtered.length === 0 ? (
              <p className="px-2 py-3 font-inter text-[13px] text-ink/60">
                No clinic matches “{query}”.
              </p>
            ) : (
              filtered.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    onSelect(b);
                    setQuery("");
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between rounded-[8px] bg-[#f1f5f9] px-4 py-[10px] text-left transition-colors hover:bg-[#e7edf4]"
                >
                  <span className="font-manrope text-[14px] font-semibold leading-5 text-ink">
                    {b.name}
                  </span>
                  {selected?.id === b.id && (
                    <span className="flex size-3 shrink-0 items-center justify-center rounded-full border border-ink">
                      <span className="size-1.5 rounded-full bg-ink" />
                    </span>
                  )}
                </button>
              ))
            )}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onAddNew();
              }}
              className="mt-1 flex w-full items-center justify-center gap-1 rounded-[8px] border border-dashed border-brand px-4 py-[10px] font-inter text-[14px] font-semibold text-brand transition-colors hover:bg-brand/[.06]"
            >
              + Add New Clinic
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------- add-new-clinic form */

function AddClinicForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (branch: BranchSummary) => void;
}) {
  const [name, setName] = useState("");
  const [picName, setPicName] = useState("");
  const [contact, setContact] = useState("");
  const [nameError, setNameError] = useState("");
  const [contactError, setContactError] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nameErr = name.trim() ? "" : "Clinic name is required.";
    const contactErr = phoneError(contact) ?? "";
    setNameError(nameErr);
    setContactError(contactErr);
    setFormError("");
    if (nameErr || contactErr) return;

    setSubmitting(true);
    try {
      // One name is used for both the clinic and its branch (the list shows
      // branches), so the clinic/branch split never surfaces in the UI.
      const res = await apiFetch<{ branch: BranchSummary | null }>("/super-admin/clinics", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          branch: {
            name: name.trim(),
            picName: picName.trim() || undefined,
            contact: contact.trim() || undefined,
          },
        }),
      });
      if (res.branch) {
        onCreated(res.branch);
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
    <Overlay onClose={onCancel} labelledBy="add-clinic-title">
      <h2 id="add-clinic-title" className="font-manrope text-[24px] leading-[32px] tracking-[-0.5px] text-ink">
        Add New Clinic
      </h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <LabeledInput id="clinic-name" label="Clinic Name" value={name} onChange={(v) => { setName(v); setNameError(""); }} placeholder="Clinic name" error={nameError} />
        <LabeledInput id="clinic-pic" label="Person in Contact (PIC)" value={picName} onChange={setPicName} placeholder="Person in contact" />
        <LabeledInput id="clinic-contact" label="Contact Number" value={contact} onChange={(v) => { setContact(v); setContactError(""); }} placeholder="+91 followed by 10 digits" error={contactError} />
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

/* --------------------------------------------------------------- modal */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AddClinicAccountModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [selected, setSelected] = useState<BranchSummary | null>(null);
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

  useEffect(() => {
    let active = true;
    apiFetch<BranchSummary[]>("/super-admin/branches")
      .then((list) => {
        if (active) setBranches(list);
      })
      .catch(() => {
        /* leave empty; user can still add a new clinic */
      });
    return () => {
      active = false;
    };
  }, []);

  const canSubmit = selected !== null && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) {
      setFormError("Select or create a clinic first.");
      return;
    }
    const next: Record<string, string> = {};
    if (!firstName.trim()) next.firstName = "First name is required.";
    if (!lastName.trim()) next.lastName = "Last name is required.";
    if (!accountType) next.accountType = "Select an account type.";
    if (!email.trim()) next.email = "Email is required.";
    else if (!EMAIL_RE.test(email.trim())) next.email = "Enter a valid email address.";
    const phoneErr = phoneError(phone);
    if (phoneErr) next.phone = phoneErr;
    setErrors(next);
    setFormError("");
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      await apiFetch("/super-admin/accounts", {
        method: "POST",
        body: JSON.stringify({
          clinicId: selected.clinicId,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          title: title || undefined,
          accountType,
          email: email.trim(),
          phone: phone.trim() || undefined,
        }),
      });
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
          <span className="font-semibold">{selected?.name}</span>.
        </p>
        <PrimaryButton type="button" onClick={onClose}>Done</PrimaryButton>
      </Overlay>
    );
  }

  return (
    <>
      <Overlay onClose={onClose} labelledBy="add-title">
        <div className="flex items-center justify-between">
          <h2 id="add-title" className="font-manrope text-[24px] leading-[32px] tracking-[-0.5px] text-ink">
            Add Clinic &amp; Account
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Step 1 — branch */}
          <BranchCombobox
            branches={branches}
            selected={selected}
            onSelect={(b) => {
              setSelected(b);
              setFormError("");
            }}
            onAddNew={() => setShowAddClinic(true)}
          />

          {/* Step 2 — account details (enabled once a branch is chosen) */}
          <fieldset
            disabled={!selected}
            className={`flex flex-col gap-5 border-t border-field-border pt-6 ${selected ? "" : "opacity-50"}`}
          >
            <legend className="px-1 font-manrope text-[16px] font-semibold text-ink">
              Account Details
            </legend>
            {!selected && (
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
            <LabeledInput id="account-contact" label="Contact Number" value={phone} onChange={(v) => { setPhone(v); setErrors((e) => ({ ...e, phone: "" })); }} placeholder="+91 followed by 10 digits" error={errors.phone} />
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
          onCreated={(branch) => {
            // Make the new branch available in the selector and select it.
            setBranches((prev) => [branch, ...prev.filter((b) => b.id !== branch.id)]);
            setSelected(branch);
            setShowAddClinic(false);
            onCreated();
          }}
        />
      )}
    </>
  );
}
