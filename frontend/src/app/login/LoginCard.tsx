"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { apiFetch, ApiError, type AuthResponse } from "@/lib/api";
import PasswordToggle from "@/components/PasswordToggle";

/**
 * Login card — the interactive form from the Figma "Login" frame.
 * Authenticates against `POST /api/auth/login` (which sets the httpOnly session
 * cookies); a successful Sign In navigates to the Clinic Selection screen.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginCard() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [keepLoggedIn, setKeepLoggedIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Per-field messages, plus a general one for unexpected (e.g. network) errors.
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [formError, setFormError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    // Validate each field on its own so the message points at the right input.
    const trimmedEmail = email.trim();
    const nextEmailError = !trimmedEmail
      ? "Please enter your email address."
      : !EMAIL_RE.test(trimmedEmail)
        ? "Please enter a valid email address."
        : "";
    const nextPasswordError = !password ? "Please enter your password." : "";
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setFormError("");
    if (nextEmailError || nextPasswordError) return;

    setSubmitting(true);
    try {
      await apiFetch<AuthResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: trimmedEmail, password }),
      });
      // Flag this navigation as a fresh login so the landing page can show the
      // "Reset Your Password" popup once (non-super-admin roles only).
      try {
        sessionStorage.setItem("tootica:justLoggedIn", "1");
      } catch {
        // Ignore storage failures (private mode) — the popup just won't show.
      }
      // Everyone lands on the same URL; the page renders the right view by role
      // (so the super-admin area isn't exposed by a distinct path).
      router.push("/clinic-selection");
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError) {
        // Route the backend reason to the field it's about.
        if (/password/i.test(err.message)) setPasswordError(err.message);
        else setEmailError(err.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    }
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
          Please enter your credentials to access the app.
        </p>
      </div>

      {/* Fields */}
      <div className="flex flex-col gap-[23.5px] pt-2">
        <Field
          id="email"
          label="Email Address"
          icon="/auth/mail.svg"
          type="email"
          placeholder="e.g. dr.smith@clinique.com"
          value={email}
          onChange={(v) => {
            setEmail(v);
            setEmailError("");
            setFormError("");
          }}
          autoComplete="email"
          error={emailError}
        />
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

        {/* Options row */}
        <div className="flex items-center justify-between px-1 pb-[16.5px]">
          <label className="flex cursor-pointer items-center gap-2">
            <span className="relative inline-flex size-5 shrink-0">
              <input
                type="checkbox"
                checked={keepLoggedIn}
                onChange={(e) => setKeepLoggedIn(e.target.checked)}
                className="peer size-5 cursor-pointer appearance-none rounded-[4px] border border-field-border bg-white/60 checked:border-brand checked:bg-brand"
              />
              <svg
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="pointer-events-none absolute inset-0 hidden size-5 p-[3px] text-white peer-checked:block"
              >
                <path d="M4.5 10.5l3.5 3.5 7.5-8" />
              </svg>
            </span>
            <span className="font-inter text-[14px] leading-5 text-ink">
              Keep me logged in
            </span>
          </label>
        </div>

        {formError && (
          <p
            role="alert"
            className="-mt-2 font-inter text-[13px] leading-5 text-red-500"
          >
            {formError}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-4 font-inter text-[15px] font-semibold text-white transition-opacity disabled:opacity-50"
        >
          {submitting ? "Signing In…" : "Sign In"}
          <Image
            src="/auth/chevron.svg"
            alt=""
            width={24}
            height={24}
            className="size-6 rotate-180"
          />
        </button>
      </div>

      {/* Forgot password */}
      <div className="flex justify-center pt-[2.5px]">
        <Link
          href="/forgot-password"
          className="font-inter text-[14px] font-medium leading-5 text-brand"
        >
          Forgot Password?
        </Link>
      </div>
    </form>
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
