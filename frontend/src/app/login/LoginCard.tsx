"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Login card — the interactive form from the Figma "Login" frame.
 * Per the prototype, a successful Sign In navigates to the Clinic Selection
 * screen. Real authentication (apiFetch("/auth/login")) can be wired in where
 * marked below.
 */
export default function LoginCard() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [keepLoggedIn, setKeepLoggedIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = email.trim() !== "" && password !== "" && !submitting;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    // TODO: authenticate against the backend, e.g.
    //   await apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    // The prototype navigates to Clinic Selection on success.
    router.push("/clinic-selection");
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
          onChange={setEmail}
          autoComplete="email"
        />
        <Field
          id="password"
          label="Password"
          icon="/auth/key.svg"
          type="password"
          placeholder="••••••••••••"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
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
          <button
            type="button"
            className="flex items-center gap-1 font-inter text-[14px] font-medium leading-5 text-brand"
          >
            <Image
              src="/auth/key-outline.svg"
              alt=""
              width={24}
              height={24}
              className="size-6"
            />
            Save password
          </button>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-4 font-inter text-[15px] font-semibold text-white transition-opacity disabled:opacity-50"
        >
          Sign In
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
}: FieldProps) {
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
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="min-w-0 flex-1 bg-transparent font-inter text-[14px] text-ink outline-none placeholder:text-field-placeholder"
        />
      </div>
    </div>
  );
}
