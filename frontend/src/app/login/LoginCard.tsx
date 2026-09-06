"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiFetch, ApiError, type AuthResponse, type MessageResponse } from "@/lib/api";
import PasswordToggle from "@/components/PasswordToggle";

/**
 * Login card — the interactive form from the Figma "Login" frame.
 *
 * Two ways to sign in, shown one at a time and swapped by a link at the bottom:
 *  - "Password": identifier (email OR phone) + password → `POST /auth/login`.
 *  - "Code (OTP)": identifier → `POST /auth/login/request-otp` sends a 6-digit
 *    SMS code to the phone on the account, then `POST /auth/login/verify-otp`
 *    establishes the session.
 *
 * Both paths set the httpOnly session cookies server-side and then navigate to
 * the Clinic Selection screen (which renders the right view per role).
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// A loose "looks like a contact" check: an email, or something with enough
// digits to be a phone. The server does the authoritative lookup.
const PHONE_RE = /^\+?[\d\s()-]{6,}$/;
// Mirror the backend resend cooldown (OTP_RESEND_COOLDOWN_SECONDS default).
const RESEND_COOLDOWN_SECONDS = 60;

// Indian numbers are the common case, so a bare local number is assumed to be
// +91. Users outside India type the full "+<code>…" international number.
const DEFAULT_COUNTRY_CODE = "+91";

/**
 * Build the identifier to send to the backend. Emails go through untouched; a
 * bare phone number gets the default (+91) country code, unless the user
 * already typed a full "+…" international number.
 */
function buildIdentifier(raw: string): string {
  const value = raw.trim();
  if (value.includes("@")) return value; // email
  if (value.startsWith("+")) return value; // already international
  const digits = value.replace(/\D/g, "");
  return digits ? `${DEFAULT_COUNTRY_CODE}${digits}` : value;
}

type Mode = "password" | "otp";

export default function LoginCard() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  // OTP flow: whether we've sent a code and are now collecting it.
  const [codeSent, setCodeSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  // Per-field messages, plus a general one for unexpected (e.g. network) errors.
  const [identifierError, setIdentifierError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [codeError, setCodeError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  // Tick the resend cooldown down to zero.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Password sign-in identifies by email; code sign-in identifies by phone.
  function validateIdentifier(): string {
    const value = identifier.trim();
    if (mode === "password") {
      if (!value) return "Please enter your email address.";
      if (!EMAIL_RE.test(value)) return "Please enter a valid email address.";
      return "";
    }
    if (!value) return "Please enter your phone number.";
    if (!PHONE_RE.test(value)) return "Please enter a valid phone number.";
    return "";
  }

  function onIdentifierChange(v: string) {
    setIdentifier(v);
    setIdentifierError("");
    setFormError("");
    // Changing who we're signing in as invalidates any sent code.
    if (codeSent) {
      setCodeSent(false);
      setCode("");
      setNotice("");
    }
  }

  // Switch between password / OTP sign-in. The identifier means different
  // things in each (email vs phone), so clear it along with the OTP state.
  function switchMode() {
    setMode((m) => (m === "password" ? "otp" : "password"));
    setIdentifier("");
    setPassword("");
    setCode("");
    setCodeSent(false);
    setCooldown(0);
    setIdentifierError("");
    setPasswordError("");
    setCodeError("");
    setFormError("");
    setNotice("");
  }

  async function handlePasswordLogin() {
    const nextIdentifierError = validateIdentifier();
    const nextPasswordError = !password ? "Please enter your password." : "";
    setIdentifierError(nextIdentifierError);
    setPasswordError(nextPasswordError);
    setFormError("");
    if (nextIdentifierError || nextPasswordError) return;

    setSubmitting(true);
    try {
      await apiFetch<AuthResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier: buildIdentifier(identifier), password }),
      });
      router.push("/clinic-selection");
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError) {
        if (/password/i.test(err.message)) setPasswordError(err.message);
        else setIdentifierError(err.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    }
  }

  async function handleSendCode() {
    const nextIdentifierError = validateIdentifier();
    setIdentifierError(nextIdentifierError);
    setFormError("");
    setNotice("");
    if (nextIdentifierError) return;

    // A code was already sent → this is a resend; confirm it distinctly so the
    // click gives visible feedback (re-setting the same message would not).
    const isResend = codeSent;
    setSubmitting(true);
    try {
      await apiFetch<MessageResponse>("/auth/login/request-otp", {
        method: "POST",
        body: JSON.stringify({ identifier: buildIdentifier(identifier) }),
      });
      setCodeSent(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setNotice(
        isResend
          ? "A new code has been sent. Please check your messages."
          : "If an account matches, we've sent a 6-digit code by SMS.",
      );
    } catch (err) {
      if (err instanceof ApiError) setIdentifierError(err.message);
      else setFormError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyCode() {
    const nextCodeError = /^\d{6}$/.test(code) ? "" : "Enter the 6-digit code.";
    setCodeError(nextCodeError);
    setFormError("");
    if (nextCodeError) return;

    setSubmitting(true);
    try {
      await apiFetch<AuthResponse>("/auth/login/verify-otp", {
        method: "POST",
        body: JSON.stringify({ identifier: buildIdentifier(identifier), code }),
      });
      router.push("/clinic-selection");
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError) setCodeError(err.message);
      else setFormError("Something went wrong. Please try again.");
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    if (mode === "password") void handlePasswordLogin();
    else if (!codeSent) void handleSendCode();
    else void handleVerifyCode();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-[460px] max-w-[460px] flex-col gap-8 overflow-hidden rounded-3xl bg-white p-10 shadow-[0_10px_40px_rgba(0,0,0,0.12)]"
    >
      {/* Brand logo */}
      <div className="flex flex-col items-center">
        <Image
          src="/auth/logo.png"
          alt="Tootica"
          width={56}
          height={56}
          priority
          className="size-14 object-contain"
        />
      </div>

      {/* Header */}
      <div className="flex flex-col items-center gap-[11px] pt-2">
        <h1 className="font-manrope text-[36px] leading-[44px] tracking-[-0.72px] text-ink">
          Welcome Back
        </h1>
        <p className="max-w-[280px] text-center font-inter text-[15px] leading-[24px] text-ink">
          {mode === "password"
            ? "Please enter your credentials to access the app."
            : "Sign in with a one-time code sent to your phone."}
        </p>
      </div>

      {/* Fields */}
      <div className="flex flex-col gap-6 pt-2">
        {mode === "password" ? (
          <Field
            id="identifier"
            label="Email Address"
            icon="/auth/mail.svg"
            type="email"
            placeholder="e.g. dr.smith@clinique.com"
            value={identifier}
            onChange={onIdentifierChange}
            autoComplete="email"
            error={identifierError}
          />
        ) : (
          <Field
            id="identifier"
            label="Phone Number"
            icon="/auth/phone.svg"
            type="tel"
            placeholder="e.g. 98765 43210 (no +91 needed)"
            value={identifier}
            onChange={onIdentifierChange}
            autoComplete="tel"
            inputMode="tel"
            error={identifierError}
          />
        )}

        {mode === "password" && (
          <Field
            id="password"
            label="Password"
            icon="/auth/key.svg"
            type="password"
            placeholder="••••••••••••"
            value={password}
            onChange={(v) => {
              setPassword(v);
              setPasswordError("");
              setFormError("");
            }}
            autoComplete="current-password"
            error={passwordError}
          />
        )}

        {mode === "otp" && codeSent && (
          <Field
            id="code"
            label="Verification Code"
            icon="/auth/key.svg"
            type="text"
            placeholder="6-digit code"
            value={code}
            onChange={(v) => {
              setCode(v.replace(/\D/g, "").slice(0, 6));
              setCodeError("");
              setFormError("");
            }}
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
            error={codeError}
          />
        )}

        {notice && (
          <p role="status" className="-mt-2 px-1 font-inter text-[13px] leading-5 text-brand">
            {notice}
          </p>
        )}

        {formError && (
          <p role="alert" className="-mt-2 font-inter text-[13px] leading-5 text-red-500">
            {formError}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand py-4 font-inter text-[15px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitLabel(mode, codeSent, submitting)}
          <Image
            src="/auth/chevron.svg"
            alt=""
            width={24}
            height={24}
            className="size-6 rotate-180"
          />
        </button>
      </div>

      {/* Secondary actions */}
      <div className="flex flex-col items-center gap-3">
        {mode === "otp" && codeSent && (
          <button
            type="button"
            onClick={() => cooldown === 0 && void handleSendCode()}
            disabled={cooldown > 0 || submitting}
            className="cursor-pointer font-inter text-[14px] font-medium leading-5 text-brand disabled:cursor-not-allowed disabled:text-field-placeholder"
          >
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
          </button>
        )}
        <button
          type="button"
          onClick={switchMode}
          className="cursor-pointer font-inter text-[14px] font-medium leading-5 text-brand"
        >
          {mode === "password" ? "Sign in with a code instead" : "Sign in with a password instead"}
        </button>
        {mode === "password" && (
          <Link
            href="/forgot-password"
            className="font-inter text-[14px] font-medium leading-5 text-field-placeholder"
          >
            Forgot Password?
          </Link>
        )}
      </div>
    </form>
  );
}

function submitLabel(mode: Mode, codeSent: boolean, submitting: boolean): string {
  if (mode === "password") return submitting ? "Signing In…" : "Sign In";
  if (!codeSent) return submitting ? "Sending Code…" : "Send Code";
  return submitting ? "Signing In…" : "Verify & Sign In";
}

type FieldProps = {
  id: string;
  label: string;
  icon: string;
  type: React.HTMLInputTypeAttribute;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength?: number;
  error?: string;
};

function Field({
  id,
  label,
  icon,
  type,
  placeholder,
  value,
  onChange,
  autoComplete,
  inputMode,
  maxLength,
  error,
}: FieldProps) {
  const isPassword = type === "password";
  const [show, setShow] = useState(false);
  const inputType = isPassword && show ? "text" : type;
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="pl-1 font-inter text-[12px] font-semibold uppercase leading-4 tracking-[1.2px] text-ink"
      >
        {label}
      </label>
      <div
        className={`flex items-center gap-[15px] rounded-lg border bg-white/60 px-4 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)] ${
          error ? "border-red-500 focus-within:border-red-500" : "border-field-border focus-within:border-brand"
        }`}
      >
        <Image src={icon} alt="" width={24} height={24} className="size-6 shrink-0" />
        <input
          id={id}
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          maxLength={maxLength}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="min-w-0 flex-1 bg-transparent font-inter text-[14px] text-ink outline-none placeholder:text-field-placeholder"
        />
        {isPassword && <PasswordToggle visible={show} onToggle={() => setShow((s) => !s)} />}
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="pl-1 font-inter text-[13px] leading-5 text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
