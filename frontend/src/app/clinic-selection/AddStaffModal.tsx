"use client";

import { useState } from "react";

import { apiFetch, ApiError, TITLE_OPTIONS, type CreatedAccount } from "@/lib/api";
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

// A clinic admin can only create branch staff — doctors and receptionists.
const STAFF_TYPES = [
  { value: "DOCTOR", label: "Doctor" },
  { value: "RECEPTIONIST", label: "Receptionist" },
] as const;

type StaffType = (typeof STAFF_TYPES)[number]["value"];

/**
 * Clinic-admin "Add doctor / receptionist" popup, opened from a branch's Manage
 * Accounts popup. The clinic + branch are fixed (the branch being managed), so
 * this only collects the account type + profile. On success it shows the
 * one-time temporary password to share with the new user.
 */
export default function AddStaffModal({
  branchName,
  branchId,
  postPath = "/accounts",
  onClose,
  onCreated,
}: {
  branchName: string;
  branchId: string;
  /** Create endpoint. Defaults to the clinic-admin `/accounts`. */
  postPath?: string;
  onClose: () => void;
  /** Called after a successful create so the parent list can refresh. */
  onCreated: () => void;
}) {
  const [accountType, setAccountType] = useState<StaffType | "">("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // The one-time temporary password + whether the backend emailed it.
  const [created, setCreated] = useState<{ password: string; emailSent: boolean } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!accountType) next.accountType = "Select an account type.";
    if (!firstName.trim()) next.firstName = "First name is required.";
    if (!lastName.trim()) next.lastName = "Last name is required.";
    const emailErr = emailError(email, true);
    if (emailErr) next.email = emailErr;
    const phoneErr = phoneDigitsError(phone);
    if (phoneErr) next.phone = phoneErr;
    setErrors(next);
    setFormError("");
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      const res = await apiFetch<CreatedAccount>(postPath, {
        method: "POST",
        body: JSON.stringify({
          branchId,
          accountType,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          title: title || undefined,
          email: email.trim(),
          phone: phoneWithCc(phone) || undefined,
        }),
      });
      setCreated({ password: res.temporaryPassword, emailSent: res.emailSent });
      // Let the parent refresh its list now that a new account exists.
      onCreated();
    } catch (err) {
      setSubmitting(false);
      setFormError(
        err instanceof ApiError ? err.message : "Something went wrong. Please try again.",
      );
    }
  }

  if (created) {
    return (
      <Overlay onClose={onClose} labelledBy="add-staff-done-title">
        <h2
          id="add-staff-done-title"
          className="font-manrope text-[24px] leading-[32px] tracking-[-0.5px] text-ink"
        >
          Account created
        </h2>
        <p className="font-inter text-[15px] leading-[24px] text-ink">
          The account for <span className="font-semibold">{email}</span> was created at{" "}
          <span className="font-semibold">{branchName}</span>.
        </p>
        <div
          className={`flex items-start gap-2 rounded-lg px-4 py-3 font-inter text-[13px] leading-5 ${
            created.emailSent ? "bg-[#f0fdf4] text-green-700" : "bg-amber-50 text-amber-700"
          }`}
        >
          <span aria-hidden>{created.emailSent ? "✓" : "!"}</span>
          <span>
            {created.emailSent
              ? `We emailed the temporary password to ${email}.`
              : "We couldn't send the email — please share the temporary password below manually."}
          </span>
        </div>
        <TemporaryPasswordBox password={created.password} />
        <PrimaryButton type="button" onClick={onClose}>
          Done
        </PrimaryButton>
      </Overlay>
    );
  }

  return (
    <Overlay onClose={onClose} labelledBy="add-staff-title" className="[zoom:0.95]">
      <div className="flex flex-col gap-1">
        <h2
          id="add-staff-title"
          className="font-manrope text-[24px] leading-[32px] tracking-[-0.5px] text-ink"
        >
          Add Account
        </h2>
        <p className="font-inter text-[14px] leading-5 text-ink/60">
          New doctor or receptionist at{" "}
          <span className="font-semibold text-ink">{branchName}</span>.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Account type */}
        <div className="flex flex-col gap-1.5">
          <span className={LABEL_CLASS}>Account Type</span>
          <div className="flex flex-wrap gap-2">
            {STAFF_TYPES.map((t) => (
              <Chip
                key={t.value}
                label={t.label}
                active={accountType === t.value}
                onClick={() => {
                  setAccountType(t.value);
                  setErrors((e) => ({ ...e, accountType: "" }));
                }}
              />
            ))}
          </div>
          {errors.accountType && (
            <p role="alert" className={ERROR_CLASS}>
              {errors.accountType}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-5 sm:flex-row">
          <div className="flex-1">
            <LabeledInput
              id="staff-first-name"
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
              id="staff-last-name"
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

        {/* Title */}
        <div className="flex flex-col gap-1.5">
          <span className={LABEL_CLASS}>Title</span>
          <div className="flex flex-wrap gap-2">
            <Chip label="None" active={title === ""} onClick={() => setTitle("")} />
            {TITLE_OPTIONS.map((t) => (
              <Chip key={t} label={t} active={title === t} onClick={() => setTitle(t)} />
            ))}
          </div>
        </div>

        <LabeledInput
          id="staff-email"
          label="Email ID"
          type="email"
          value={email}
          onChange={(v) => {
            setEmail(v);
            setErrors((e) => ({ ...e, email: "" }));
          }}
          placeholder="Email address"
          error={errors.email}
          autoComplete="off"
        />
        <LabeledPhone
          id="staff-contact"
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
          <SecondaryButton type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create Account"}
          </PrimaryButton>
        </div>
      </form>
    </Overlay>
  );
}

function Chip({
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

/**
 * Shows the one-time temporary password with a copy button. The user signs in
 * with this and is forced to reset it on first login — it can't be looked up
 * again, so the admin must share it now.
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
        Share this with the user — they’ll be asked to set a new password and accept the
        Terms &amp; Conditions on first login. It won’t be shown again.
      </p>
    </div>
  );
}
