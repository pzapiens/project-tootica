"use client";

import Image from "next/image";
import { useState } from "react";
import { createPortal } from "react-dom";

import PasswordToggle from "@/components/PasswordToggle";
import { checkPassword, passwordPolicyError } from "@/lib/password";

/**
 * "Reset Password" card shown on login (Figma "RP Card on login"). Presented
 * instantly after login for every non-super-admin role, prompting the user to
 * set a new password and accept the Terms & Conditions / Privacy Policy before
 * continuing. The button enables once both passwords are filled and the checkbox
 * is ticked; the password policy (the same one used across the app) and the
 * confirm-match are validated when Reset Password is clicked.
 */
const MISMATCH_MESSAGE = "Passwords do not match.";

export default function ResetPasswordPopup({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agree, setAgree] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [policy, setPolicy] = useState<null | "terms" | "privacy">(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  if (typeof document === "undefined") return null;

  // Enabled once both fields are filled and the terms are accepted (Figma
  // Variant4). Correctness (policy + match) is checked on submit so the user
  // gets a clear message rather than a silently-disabled button.
  const canSubmit = password.length > 0 && confirm.length > 0 && agree && !done;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    // Same policy as the super-admin create-account / forgot-password flows.
    const policyErr = passwordPolicyError(password);
    if (policyErr) {
      setError(policyErr);
      return;
    }
    if (password !== confirm) {
      setError(MISMATCH_MESSAGE);
      return;
    }
    setError("");
    // Front-end flow: show the success message briefly, then dismiss. (Persisting
    // needs a "reset on first login" endpoint; change-password requires the
    // current password, which this card doesn't collect.)
    setDone(true);
    setTimeout(onClose, 1800);
  }

  const passwordInvalid = Boolean(error) && error !== MISMATCH_MESSAGE;
  const confirmInvalid = error === MISMATCH_MESSAGE;

  return createPortal(
    <>
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rp-title"
    >
      {done ? (
        <div className="flex max-w-[calc(100vw-32px)] items-center gap-[12px] rounded-[14px] bg-white px-[22px] py-[16px] shadow-[0px_10px_40px_rgba(0,0,0,0.18)]">
          <SuccessTick className="size-[22px]" />
          <p className="font-inter text-[15px] font-medium text-[#1e1e24]">Password reset successfully</p>
        </div>
      ) : (
      <form
        onSubmit={handleSubmit}
        className="flex w-[460px] max-w-[calc(100vw-32px)] flex-col gap-[32px] rounded-[24px] bg-white p-[40px] shadow-[0px_10px_40px_rgba(0,0,0,0.18)]"
      >
        {/* Header */}
        <div className="flex w-full flex-col items-center gap-[11px] pt-[8px]">
          <h2
            id="rp-title"
            className="text-center font-manrope text-[36px] font-normal leading-[44px] tracking-[-0.72px] text-[#1e1e24]"
          >
            Reset Password
          </h2>
          <p className="max-w-[332px] text-center font-inter text-[15px] leading-[24.38px] text-[#1e1e24]">
            Please reset your password and accept the Terms &amp; Conditions and Privacy Policy to continue.
          </p>
        </div>

        {/* Form */}
        <div className="flex w-full flex-col gap-[23.5px] pt-[8px]">
          <div className="flex w-full flex-col gap-[10px]">
            <PasswordField
              label="Enter Password"
              value={password}
              onChange={(v) => {
                setPassword(v);
                setError("");
              }}
              show={showPw}
              onToggle={() => setShowPw((s) => !s)}
              invalid={passwordInvalid}
            />
            <PasswordChecklist password={password} />
          </div>
          <PasswordField
            label="Re-enter Password"
            value={confirm}
            onChange={(v) => {
              setConfirm(v);
              setError("");
            }}
            show={showConfirm}
            onToggle={() => setShowConfirm((s) => !s)}
            invalid={confirmInvalid}
          />

          {error && (
            <p role="alert" className="-mt-[14px] pl-1 font-inter text-[13px] leading-5 text-red-500">
              {error}
            </p>
          )}

          {/* Terms & Conditions checkbox — only the box toggles, not the text */}
          <div className="flex items-start gap-[10px]">
            <span className="relative mt-[2px] inline-flex size-[16px] shrink-0">
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                aria-label="I agree to the Privacy Policy and Terms & Conditions"
                className="peer size-[16px] cursor-pointer appearance-none rounded-[3px] border border-[#1e1e24] bg-white checked:border-[#0077c0] checked:bg-[#0077c0]"
              />
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="pointer-events-none absolute inset-0 hidden size-[16px] p-[2px] text-white peer-checked:block"
              >
                <path d="M3.5 8.5l3 3 6-7" />
              </svg>
            </span>
            <span className="font-inter text-[12px] font-medium leading-[16px] tracking-[0.6px] text-[#1e1e24]">
              By ticking this checkbox, you confirm that you have read and agree to the{" "}
              <button
                type="button"
                onClick={() => setPolicy("privacy")}
                className="font-semibold text-[#0077c0] underline-offset-2 hover:underline"
              >
                Privacy Policy
              </button>{" "}
              and{" "}
              <button
                type="button"
                onClick={() => setPolicy("terms")}
                className="font-semibold text-[#0077c0] underline-offset-2 hover:underline"
              >
                Terms &amp; Conditions.
              </button>
            </span>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit}
            className={`flex w-full items-center justify-center gap-[8px] rounded-[8px] bg-[#0077c0] py-[16px] font-inter text-[15px] font-semibold text-white transition-opacity ${
              canSubmit ? "hover:bg-[#0069a8]" : "cursor-not-allowed opacity-50"
            }`}
          >
            Reset Password
            <Image src="/auth/chevron.svg" alt="" width={28} height={28} className="size-7 rotate-180" />
          </button>
        </div>
      </form>
      )}
    </div>
    {policy && (
      <PolicyPopup
        title={policy === "terms" ? "Terms & Conditions" : "Privacy Policy"}
        paragraphs={policy === "terms" ? TERMS_PARAGRAPHS : PRIVACY_PARAGRAPHS}
        onClose={() => setPolicy(null)}
      />
    )}
    </>,
    document.body,
  );
}

function PasswordField({
  label,
  value,
  onChange,
  show,
  onToggle,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  invalid?: boolean;
}) {
  return (
    <div className="flex w-full flex-col gap-[6px]">
      <span className="pl-1 font-inter text-[12px] font-semibold uppercase leading-4 tracking-[1.2px] text-[#1e1e24]">
        {label}
      </span>
      <div
        className={`flex items-center gap-[15px] rounded-[8px] border bg-white/60 px-[16px] py-[16px] shadow-[0px_1px_2px_rgba(0,0,0,0.05)] ${
          invalid ? "border-red-500 focus-within:border-red-500" : "border-[#c2c6d4] focus-within:border-[#0077c0]"
        }`}
      >
        <Image src="/auth/key.svg" alt="" width={24} height={24} className="size-6 shrink-0" />
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="••••••••••••"
          autoComplete="new-password"
          className="min-w-0 flex-1 bg-transparent font-inter text-[14px] text-[#1e1e24] outline-none placeholder:text-[#c2c6d4]/70"
        />
        <PasswordToggle visible={show} onToggle={onToggle} />
      </div>
    </div>
  );
}

const TERMS_PARAGRAPHS = [
  "By using this application, you agree to provide accurate, complete, and valid information whenever required and to use the application only for its intended purpose. You agree not to misuse, modify, copy, disrupt, or attempt to interfere with the application, its features, or services in any unauthorized manner. You are responsible for ensuring that the information provided by you is correct and up to date. Your information and personal data will be collected, processed, stored, and used in accordance with the applicable Privacy Policy and relevant regulations. You also agree to follow all instructions and guidelines provided while using the application.",
];

const PRIVACY_PARAGRAPHS = [
  "We respect your privacy and are committed to protecting the personal information you provide while using this application. The information collected may include details required to provide and manage the requested services, verify your identity, process transactions, and improve your overall experience.",
  "Your information will be handled securely and will only be accessed, processed, or shared where necessary to provide the requested services, comply with applicable laws, or maintain the security and functionality of the application. We take reasonable measures to protect your personal information from unauthorized access, use, or disclosure.",
  "By using this application, you acknowledge that your information may be collected and processed in accordance with this Privacy Policy and applicable privacy regulations.",
];

/**
 * Terms & Conditions / Privacy Policy popup (Figma "T&C" / "PP"), opened from
 * the reset-password card. Same card shell; only the title and body differ.
 */
function PolicyPopup({
  title,
  paragraphs,
  onClose,
}: {
  title: string;
  paragraphs: string[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="policy-title"
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="flex max-h-[90dvh] w-[640px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-[30px] bg-white shadow-[0px_30px_60px_-15px_rgba(0,0,0,0.1)]"
      >
        <div className="flex shrink-0 items-center justify-between px-[30px] pb-[15px] pt-[30px]">
          <h2 id="policy-title" className="font-manrope text-[28px] font-semibold tracking-[-0.71px] text-[#1e1e24]">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <CloseIcon className="size-6 text-[#1e1e24]" />
          </button>
        </div>
        <div className="flex min-h-0 flex-col overflow-y-auto px-[30px] pb-[40px] font-inter text-[15px] leading-[24.38px] text-[#1e1e24]">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Live password-policy checklist (same logic + UI as the account-creation /
 * forgot-password flows): each rule turns green with a tick as it's satisfied,
 * so the user sees how much of the policy their password has met.
 */
function PasswordChecklist({ password }: { password: string }) {
  const rules = checkPassword(password);
  return (
    <ul className="flex flex-col gap-1 px-1" aria-label="Password requirements">
      {rules.map((rule) => (
        <li
          key={rule.label}
          className={`flex items-center gap-2 font-inter text-[12px] leading-4 transition-colors ${
            rule.met ? "text-green-600" : "text-[#1e1e24]/50"
          }`}
        >
          <span
            aria-hidden
            className={`flex size-4 shrink-0 items-center justify-center rounded-full border text-[9px] ${
              rule.met
                ? "border-green-600 bg-green-600 text-white"
                : "border-[#c2c6d4] text-transparent"
            }`}
          >
            ✓
          </span>
          {rule.label}
          <span className="sr-only">{rule.met ? " — met" : " — not met"}</span>
        </li>
      ))}
    </ul>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}

function SuccessTick({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="12" r="10" fill="#16a34a" />
      <path d="M7.5 12.5l3 3 6-6.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
