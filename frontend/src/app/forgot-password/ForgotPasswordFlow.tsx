"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  apiFetch,
  ApiError,
  type MessageResponse,
  type VerifyOtpResponse,
} from "@/lib/api";
import { checkPassword, passwordPolicyError } from "@/lib/password";
import PasswordToggle from "@/components/PasswordToggle";

/**
 * Forgot Password flow — the four connected screens from the Figma prototype
 * ("Login2 - FP" → "Verification" → "RP" → "LA"):
 *   1. email  — request reset instructions for an email address
 *   2. verify — enter the 6-digit OTP (with resend countdown)
 *   3. reset  — set and confirm a new password
 *   4. done   — "Login Again" confirmation, back to /login
 *
 * Modelled as one route with internal step state so the email + reset token
 * carry across screens. Wired to the backend auth endpoints:
 *   email  → POST /api/auth/forgot-password
 *   verify → POST /api/auth/verify-otp   (returns a short-lived resetToken)
 *   reset  → POST /api/auth/reset-password
 */
type Step = "email" | "verify" | "reset" | "done";

const OTP_LENGTH = 6;
const RESEND_SECONDS = 59;

export default function ForgotPasswordFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  // Short-lived token returned by verify-otp; consumed by the reset step.
  const [resetToken, setResetToken] = useState("");

  return (
    <>
      {step === "email" && (
        <EmailStep
          email={email}
          onEmailChange={setEmail}
          onSubmit={() => setStep("verify")}
        />
      )}
      {step === "verify" && (
        <VerifyStep
          email={email}
          onVerified={(token) => {
            setResetToken(token);
            setStep("reset");
          }}
        />
      )}
      {step === "reset" && (
        <ResetStep token={resetToken} onReset={() => setStep("done")} />
      )}
      {step === "done" && <DoneStep onLogin={() => router.push("/login")} />}
    </>
  );
}

/* ------------------------------------------------------------------ Step 1 */

function EmailStep({
  email,
  onEmailChange,
  onSubmit,
}: {
  email: string;
  onEmailChange: (v: string) => void;
  onSubmit: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const canSubmit = email.trim() !== "" && !submitting;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      // Always 200 unless rate-limited (backend hides whether the account exists).
      await apiFetch<MessageResponse>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      onSubmit();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <Card as="form" onSubmit={handleSubmit}>
      <Header
        title="Forgot Password?"
        subtitle="No worries, we'll send you reset instructions."
      />
      <div className="flex flex-col gap-[23.5px] pt-2">
        <Field
          id="email"
          label="Email Address"
          icon="/auth/mail.svg"
          type="email"
          placeholder="e.g. dr.smith@clinique.com"
          value={email}
          onChange={onEmailChange}
          autoComplete="email"
        />
        {error && <ErrorText>{error}</ErrorText>}
        <PrimaryButton
          type="submit"
          disabled={!canSubmit}
          label={submitting ? "Sending…" : "Reset Password"}
          withChevron
        />
      </div>
      <BackToLogin />
    </Card>
  );
}

/* ------------------------------------------------------------------ Step 2 */

function VerifyStep({
  email,
  onVerified,
}: {
  email: string;
  onVerified: (resetToken: string) => void;
}) {
  const [digits, setDigits] = useState<string[]>(() => Array(OTP_LENGTH).fill(""));
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  const masked = useMemo(() => maskEmail(email), [email]);
  const code = digits.join("");
  const canSubmit = code.length === OTP_LENGTH && !submitting;

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setInterval(() => setSeconds((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [seconds]);

  function setDigit(index: number, value: string) {
    const char = value.replace(/\D/g, "").slice(-1);
    setError("");
    setDigits((prev) => {
      const next = [...prev];
      next[index] = char;
      return next;
    });
    if (char && index < OTP_LENGTH - 1) inputsRef.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && digits[index] === "" && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    const next = Array(OTP_LENGTH).fill("");
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setDigits(next);
    inputsRef.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      const { resetToken } = await apiFetch<VerifyOtpResponse>(
        "/auth/verify-otp",
        {
          method: "POST",
          body: JSON.stringify({ email, code }),
        },
      );
      onVerified(resetToken);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again.",
      );
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setSeconds(RESEND_SECONDS);
    setError("");
    try {
      await apiFetch<MessageResponse>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't resend the code. Please try again.",
      );
    }
  }

  return (
    <Card as="form" onSubmit={handleSubmit}>
      <Header
        title="Verification"
        subtitle={
          <>
            Enter the OTP we sent to
            <br />
            {masked}
          </>
        }
      />

      <div className="flex w-full max-w-[380px] items-center justify-between self-center">
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => {
              inputsRef.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            aria-label={`Digit ${i + 1}`}
            onChange={(e) => setDigit(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            className="size-[54px] rounded-[5px] border-[1.134px] border-field-border bg-white text-center font-manrope text-[28px] text-ink shadow-[0px_1px_2px_rgba(0,0,0,0.05)] outline-none focus:border-[#00478d] focus:shadow-[0px_0px_0px_2px_rgba(0,71,141,0.2)]"
          />
        ))}
      </div>

      {error && <ErrorText className="text-center">{error}</ErrorText>}

      <PrimaryButton
        type="submit"
        disabled={!canSubmit}
        label={submitting ? "Verifying…" : "Verify & Proceed"}
      />

      <p className="flex items-center justify-center gap-1 text-center font-inter text-[14px] leading-5 text-ink">
        Didn&apos;t receive the code?{" "}
        {seconds > 0 ? (
          <span className="font-medium text-brand">
            Resend in <span className="font-mono">{formatCountdown(seconds)}</span>
          </span>
        ) : (
          <button type="button" onClick={handleResend} className="font-medium text-brand">
            Resend
          </button>
        )}
      </p>

      <BackToLogin />
    </Card>
  );
}

/* ------------------------------------------------------------------ Step 3 */

function ResetStep({
  token,
  onReset,
}: {
  token: string;
  onReset: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Button stays active once both fields are filled; the match is validated on
  // submit so we can surface a clear error rather than silently disabling it.
  const canSubmit = password !== "" && confirm !== "" && !submitting;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    if (password !== confirm) {
      setError("Passwords do not match. Please re-enter them.");
      return;
    }
    // Enforce the password policy up front for a clear message (the backend
    // validates the same rules on submit).
    const policyError = passwordPolicyError(password);
    if (policyError) {
      setError(policyError);
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await apiFetch<MessageResponse>("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      onReset();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <Card as="form" onSubmit={handleSubmit}>
      <Header
        title="Reset Password"
        titleClassName="text-[36px] leading-[44px] tracking-[-0.72px]"
        subtitle={
          <>
            Enter your new password to update
            <br />
            your account securely.
          </>
        }
      />
      <div className="flex flex-col gap-[23.5px] pt-2">
        <Field
          id="new-password"
          label="Enter Password"
          icon="/auth/key.svg"
          type="password"
          placeholder="••••••••••••"
          value={password}
          onChange={(v) => {
            setPassword(v);
            setError("");
          }}
          autoComplete="new-password"
        />
        <Field
          id="confirm-password"
          label="Re-enter Password"
          icon="/auth/key.svg"
          type="password"
          placeholder="••••••••••••"
          value={confirm}
          onChange={(v) => {
            setConfirm(v);
            setError("");
          }}
          autoComplete="new-password"
        />
        {password !== "" && <PasswordChecklist password={password} />}
        {error && <ErrorText>{error}</ErrorText>}
        <PrimaryButton
          type="submit"
          disabled={!canSubmit}
          label={submitting ? "Resetting…" : "Reset Password"}
          withChevron
        />
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ Step 4 */

function DoneStep({ onLogin }: { onLogin: () => void }) {
  return (
    <Card>
      <Header
        title="You're All Set!"
        titleClassName="text-[36px] leading-[44px] tracking-[-0.72px]"
        subtitle="Your password has been successfully reset. Log in with your new credentials to continue."
      />
      <div className="pt-2">
        <PrimaryButton type="button" onClick={onLogin} label="Login" withChevron />
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------- shared bits */

function Card({
  as = "div",
  onSubmit,
  children,
}: {
  as?: "div" | "form";
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  children: React.ReactNode;
}) {
  const className =
    "flex w-[460px] max-w-[460px] flex-col gap-8 overflow-hidden rounded-3xl bg-white p-10 shadow-[0_10px_40px_rgba(0,0,0,0.12)]";
  if (as === "form") {
    return (
      <form onSubmit={onSubmit} className={className}>
        {children}
      </form>
    );
  }
  return <div className={className}>{children}</div>;
}

function Header({
  title,
  subtitle,
  titleClassName = "text-[28px] leading-[42px] tracking-[-0.7px]",
}: {
  title: string;
  subtitle: React.ReactNode;
  titleClassName?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-[11px] pt-2">
      <h1 className={`font-manrope text-ink ${titleClassName}`}>{title}</h1>
      <p className="max-w-[280px] text-center font-inter text-[15px] leading-[24px] text-ink">
        {subtitle}
      </p>
    </div>
  );
}

function PrimaryButton({
  label,
  withChevron = false,
  ...props
}: {
  label: string;
  withChevron?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-4 font-inter text-[15px] font-semibold text-white transition-opacity disabled:opacity-50"
    >
      {label}
      {withChevron && (
        <Image src="/auth/chevron.svg" alt="" width={28} height={28} className="size-7 rotate-180" />
      )}
    </button>
  );
}

function PasswordChecklist({ password }: { password: string }) {
  const rules = checkPassword(password);
  return (
    <ul className="-mt-1 flex flex-col gap-1 px-1" aria-label="Password requirements">
      {rules.map((rule) => (
        <li
          key={rule.label}
          className={`flex items-center gap-2 font-inter text-[12px] leading-4 transition-colors ${
            rule.met ? "text-green-600" : "text-ink/50"
          }`}
        >
          <span
            aria-hidden
            className={`flex size-4 shrink-0 items-center justify-center rounded-full border text-[9px] ${
              rule.met
                ? "border-green-600 bg-green-600 text-white"
                : "border-field-border text-transparent"
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

function ErrorText({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      role="alert"
      className={`-mt-2 font-inter text-[13px] leading-5 text-red-500 ${className}`}
    >
      {children}
    </p>
  );
}

function BackToLogin() {
  return (
    <div className="flex justify-center pt-2">
      <Link
        href="/login"
        className="flex items-center gap-2 font-inter text-[14px] leading-5 text-ink"
      >
        <Image src="/auth/chevron-back.svg" alt="" width={28} height={28} className="size-7" />
        Back to Login
      </Link>
    </div>
  );
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
};

function Field({ id, label, icon, type, placeholder, value, onChange, autoComplete }: FieldProps) {
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
      <div className="flex items-center gap-[15px] rounded-lg border border-field-border bg-white/60 px-4 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)] focus-within:border-brand">
        <Image src={icon} alt="" width={24} height={24} className="size-6 shrink-0" />
        <input
          id={id}
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="min-w-0 flex-1 bg-transparent font-inter text-[14px] text-ink outline-none placeholder:text-field-placeholder"
        />
        {isPassword && <PasswordToggle visible={show} onToggle={() => setShow((s) => !s)} />}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- utilities */

/** Mask an email for display, e.g. `infodent@gmail.com` → `i••••••t@gmail.com`. */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain || local.length <= 2) return email || "your email";
  return `${local[0]}${"•".repeat(local.length - 2)}${local[local.length - 1]}@${domain}`;
}

function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
