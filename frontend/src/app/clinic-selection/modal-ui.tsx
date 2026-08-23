"use client";

import { useEffect } from "react";

/** Shared modal building blocks (design-system styled) used by the add/edit forms. */

export const LABEL_CLASS =
  "pl-1 font-inter text-[12px] font-semibold uppercase leading-4 tracking-[1.2px] text-ink";
export const ERROR_CLASS = "pl-1 font-inter text-[13px] leading-5 text-red-500";

/** Backdrop + centered card. Closes on Escape and backdrop click. */
export function Overlay({
  onClose,
  labelledBy,
  children,
}: {
  onClose: () => void;
  labelledBy: string;
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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onMouseDown={(e) => e.stopPropagation()}
        className="my-auto flex w-full max-w-[520px] flex-col gap-6 rounded-3xl bg-white p-8 shadow-[0_10px_40px_rgba(0,0,0,0.12)]"
      >
        {children}
      </div>
    </div>
  );
}

export function LabeledInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  error,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  error?: string;
  autoComplete?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <div
        className={`flex items-center rounded-lg border bg-white/60 px-4 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)] ${
          error ? "border-red-500 focus-within:border-red-500" : "border-field-border focus-within:border-brand"
        }`}
      >
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          className="min-w-0 flex-1 bg-transparent font-inter text-[14px] text-ink outline-none placeholder:text-field-placeholder"
        />
      </div>
      {error && (
        <p role="alert" className={ERROR_CLASS}>
          {error}
        </p>
      )}
    </div>
  );
}

export function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="flex flex-1 items-center justify-center rounded-lg bg-brand py-4 font-inter text-[15px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="flex flex-1 items-center justify-center rounded-lg border border-field-border py-4 font-inter text-[15px] font-semibold text-ink transition-colors hover:bg-black/[.02] disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function DangerButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="flex flex-1 items-center justify-center rounded-lg bg-[#BA1A1A] py-4 font-inter text-[15px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

/** Confirmation dialog (design-system styled) — a drop-in for window.confirm. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  danger = false,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ConfirmBtn = danger ? DangerButton : PrimaryButton;
  return (
    <Overlay onClose={onCancel} labelledBy="confirm-dialog-title">
      <h2
        id="confirm-dialog-title"
        className="font-manrope text-[24px] leading-[32px] tracking-[-0.5px] text-ink"
      >
        {title}
      </h2>
      <p className="font-inter text-[15px] leading-[24px] text-ink">{message}</p>
      {error && (
        <p role="alert" className={ERROR_CLASS}>
          {error}
        </p>
      )}
      <div className="mt-1 flex gap-3">
        <SecondaryButton type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </SecondaryButton>
        <ConfirmBtn type="button" onClick={onConfirm} disabled={busy}>
          {busy ? "Deleting…" : confirmLabel}
        </ConfirmBtn>
      </div>
    </Overlay>
  );
}
