"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiFetch, ApiError, type AuthResponse, type MessageResponse } from "@/lib/api";
import { AUTH_CARD_CLASS_NAME } from "./auth-card";
import PasswordToggle from "@/components/PasswordToggle";
import PhoneNumberInput from "@/components/PhoneNumberInput";
import { phoneDigitsError, phoneWithCc } from "@/lib/validation";

/**
 * Login card — the interactive form from the Figma "Login" frame.
 *
 * Two ways to sign in, selected by the tabs above the fields:
 *  - "Password": email + password → `POST /auth/login`.
 *  - "Code (OTP)": phone → `POST /auth/login/request-otp` sends a 6-digit
 *    SMS code to the phone on the account, then `POST /auth/login/verify-otp`
 *    establishes the session.
 *
 * Both paths set the httpOnly session cookies server-side and then navigate to
 * the Clinic Selection screen (which renders the right view per role).
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Mirror the backend resend cooldown (OTP_RESEND_COOLDOWN_SECONDS default).
const RESEND_COOLDOWN_SECONDS = 60;

/** Keep emails unchanged and compose Indian phone identifiers from local digits. */
function buildIdentifier(raw: string): string {
  const value = raw.trim();
  return value.includes("@") ? value : phoneWithCc(value);
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

  useEffect(() => {
    router.prefetch("/clinic-selection");
  }, [router]);

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
    return phoneDigitsError(value, true) ?? "";
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
  function switchMode(nextMode: Mode) {
    if (nextMode === mode || submitting) return;
    setMode(nextMode);
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
      const response = await apiFetch<MessageResponse>("/auth/login/request-otp", {
        method: "POST",
        body: JSON.stringify({ identifier: buildIdentifier(identifier) }),
      });
      setCodeSent(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setNotice(
        isResend
          ? "A new code has been sent. Please check your messages."
          : response.message,
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
      className={AUTH_CARD_CLASS_NAME}
    >
      {/* Brand logo */}
      <div className="flex flex-col items-center">
        <Image
          src="/auth/logo.png"
          alt="Tootica"
          width={64}
          height={64}
          priority
          className="size-16 object-contain"
        />
      </div>

      {/* Header */}
      <div className="-mt-2 flex flex-col items-center gap-2">
        <h1 className="font-manrope text-[32px] leading-[39px] tracking-[-0.72px] text-ink">
          Welcome
        </h1>
        <p className="max-w-[280px] text-center font-inter text-[14px] leading-[21px] text-ink/60">
          Sign in to continue to your account
        </p>
      </div>

      {/* Sign-in method */}
      <div role="tablist" aria-label="Sign-in method" className="-mt-2 flex border-b-[1.167px] border-black/35">
        {([
          { value: "password", label: "Email address" },
          { value: "otp", label: "Phone number" },
        ] as const).map(({ value, label }) => (
          <button
            key={value}
            id={`login-${value}-tab`}
            type="button"
            role="tab"
            aria-selected={mode === value}
            aria-controls={`login-${value}-panel`}
            tabIndex={mode === value ? 0 : -1}
            disabled={submitting}
            onClick={() => switchMode(value)}
            onKeyDown={(event) => {
              let nextMode: Mode;
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                nextMode = value === "password" ? "otp" : "password";
              } else if (event.key === "Home") {
                nextMode = "password";
              } else if (event.key === "End") {
                nextMode = "otp";
              } else {
                return;
              }
              event.preventDefault();
              switchMode(nextMode);
              document.getElementById(`login-${nextMode}-tab`)?.focus();
            }}
            className={`-mb-px flex h-11 flex-1 items-center justify-center whitespace-nowrap border-b-2 font-inter text-[12px] font-semibold uppercase leading-4 tracking-[1.2px] focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50 ${
              mode === value
                ? "border-brand text-brand"
                : "border-transparent text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Fields */}
      <div
        id={`login-${mode}-panel`}
        role="tabpanel"
        aria-labelledby={`login-${mode}-tab`}
        className="flex flex-col gap-4"
      >
        {mode === "password" ? (
          <Field
            id="identifier"
            label="Email address"
            icon="/auth/mail.svg"
            type="email"
            placeholder="Enter your email"
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
            placeholder="10-digit mobile number"
            value={identifier}
            onChange={onIdentifierChange}
            autoComplete="tel-national"
            description="Enter your registered mobile number and click Send Code to receive a six-digit verification code via SMS."
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
          <p role="status" className="-mt-2 px-1 font-inter text-[13px] leading-5 text-black">
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
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand py-2.5 font-inter text-[14px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitLabel(mode, codeSent, submitting)}
          <Image
            src="/auth/chevron.svg"
            alt=""
            width={24}
            height={24}
            className="size-5 rotate-180"
          />
        </button>
      </div>

      {/* Secondary actions */}
      {(mode === "password" || codeSent) && (
        <div className="-mt-2 flex flex-col items-center gap-3">
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
          {mode === "password" && (
            <Link
              href="/forgot-password"
              className="font-inter text-[14px] font-medium leading-5 text-brand"
            >
              Forgot password?
            </Link>
          )}
        </div>
      )}
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
  description?: string;
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
  description,
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
        className={`flex items-center gap-[15px] rounded-lg border-[1.167px] bg-white/60 px-3.5 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] ${
          error ? "border-red-500 focus-within:border-red-500" : "border-black focus-within:border-brand"
        }`}
      >
        <Image src={icon} alt="" width={24} height={24} className="size-5 shrink-0" />
        {type === "tel" ? (
          <PhoneNumberInput
            id={id}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            autoComplete={autoComplete}
            aria-invalid={error ? true : undefined}
            aria-describedby={[error ? `${id}-error` : "", description ? `${id}-description` : ""].filter(Boolean).join(" ") || undefined}
          />
        ) : (
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
        )}
        {isPassword && <PasswordToggle visible={show} hasValue={value.length > 0} onToggle={() => setShow((s) => !s)} />}
      </div>
      {description && (
        <p id={`${id}-description`} className="pl-1 pt-1 font-inter text-[12px] leading-5 text-ink/60">
          {description}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="pl-1 font-inter text-[13px] leading-5 text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
