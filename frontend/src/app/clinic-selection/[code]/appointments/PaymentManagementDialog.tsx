"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { getPaymentRecord, setPaymentRecord, type Payment } from "@/lib/paymentsStore";
import { Tip } from "@/components/HoverTip";

import ConfirmDeleteDialog from "./ConfirmDeleteDialog";

/**
 * Payment flow for an appointment (Figma "Appts15/16 - Payments"):
 *
 *   Payments (row menu) → "Payment Management" modal → "ADD NEW" → "New Payment"
 *   form → back to the list with the row added.
 *
 * The management modal lists the appointment's payments (SI No / Description /
 * Date / Amount / delete), a "Mark as complete" toggle and a running total; the
 * New Payment form captures a description + amount. There is no payments backend
 * yet, so the record is cached in `localStorage` (see {@link @/lib/paymentsStore})
 * so it survives closing the dialog and reloads, and drives the row status glyph.
 */

/** dd/mm/yyyy for today, used to stamp a newly-added payment. */
function todayDmy(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** ₹ with Indian grouping and two decimals (e.g. "₹1,50,000.00"). */
function formatAmount(n: number): string {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PaymentManagementDialog({
  appointmentId,
  patientName,
  onClose,
}: {
  /** Appointment the payments belong to — the cache key. */
  appointmentId: string;
  /** Patient the payments belong to (used for the New Payment sub-heading). */
  patientName: string;
  onClose: () => void;
}) {
  // Seed from the cached record so payments persist across opens / reloads.
  const [payments, setPayments] = useState<Payment[]>(() => getPaymentRecord(appointmentId).payments);
  const [complete, setComplete] = useState(() => getPaymentRecord(appointmentId).complete);
  const [adding, setAdding] = useState(false);
  // The payment row awaiting delete confirmation (null = no prompt open).
  const [pendingDelete, setPendingDelete] = useState<Payment | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Escape closes the New Payment form first, then the manager.
      if (e.key !== "Escape") return;
      if (adding) setAdding(false);
      else onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [adding, onClose]);

  // Persist every change back to the cache (also refreshes the row glyph).
  useEffect(() => {
    setPaymentRecord(appointmentId, { payments, complete });
  }, [appointmentId, payments, complete]);

  const total = payments.reduce((sum, p) => sum + p.amount, 0);

  function addPayment(description: string, amount: number) {
    setPayments((prev) => [
      ...prev,
      { id: crypto.randomUUID(), description, amount, date: todayDmy() },
    ]);
    setAdding(false);
  }

  function removePayment(id: string) {
    setPayments((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-mgmt-title"
        className="my-auto flex w-full max-w-[830px] flex-col overflow-hidden rounded-[20px] bg-white shadow-[0px_24px_48px_-12px_rgba(0,0,0,0.18)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[rgba(194,198,212,0.4)] px-[30px] pb-[16px] pt-[30px]">
          <h2 id="payment-mgmt-title" className="font-manrope text-[28px] font-semibold tracking-[-0.7px] text-[#1e1e24]">
            Payment Management
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-[38px] items-center justify-center rounded-[11px] text-[#1e1e24] transition-colors hover:bg-[#f1f5f9]"
          >
            <CloseIcon className="size-6" />
          </button>
        </div>

        {/* Toolbar: mark-as-complete + add new */}
        <div className="flex items-center justify-between px-[30px] py-[20px]">
          <label className="flex cursor-pointer items-center gap-[10px] select-none">
            <CheckBox checked={complete} onChange={() => setComplete((v) => !v)} />
            <span className="font-inter text-[15px] text-[#1e1e24]">Mark as complete</span>
          </label>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex h-[39px] items-center justify-center rounded-[8px] bg-[#0077c0] px-[26px] font-inter text-[15px] font-semibold uppercase tracking-[0.5px] text-white shadow-[0px_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#0069a8]"
          >
            Add New
          </button>
        </div>

        {/* Table */}
        <div className="mx-[30px] mb-[30px] overflow-hidden rounded-[12px] border border-[#c2c6d4]">
          {/* Header row */}
          <div className={`${COLS} border-b border-[#c2c6d4] px-[16px] py-[16px]`}>
            <span className={HEAD}>SI No.</span>
            <span className={HEAD}>Description</span>
            <span className={HEAD}>Date</span>
            <span className={`${HEAD} text-right`}>Amount</span>
            <span className={`${HEAD} text-right`}>Actions</span>
          </div>

          {/* Payment rows */}
          {payments.map((p, i) => (
            <div key={p.id} className={`${COLS} px-[16px] py-[19px]`}>
              <span className="font-inter text-[14px] text-[#1e1e24]">#{i + 1}</span>
              <span className="truncate font-inter text-[14px] text-[#1e1e24]">{p.description}</span>
              <span className="font-inter text-[14px] text-[#1e1e24]">{p.date}</span>
              <span className="text-right font-inter text-[14px] text-[#1e1e24]">{formatAmount(p.amount)}</span>
              <span className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setPendingDelete(p)}
                  aria-label={`Delete ${p.description}`}
                  className="group relative flex size-[32px] items-center justify-center rounded-[4px] transition-colors hover:bg-[#f9f1f1]"
                >
                  <Image src="/dashboard/delete.svg" alt="" width={20} height={20} className="size-5" />
                  <Tip label="Delete" />
                </button>
              </span>
            </div>
          ))}

          {/* Total */}
          <div className="flex items-center justify-between border-t border-[#c2c6d4] px-[24px] py-[16px]">
            <span className="font-manrope text-[20px] font-semibold leading-[28px] text-[#1e1e24]">
              Total Amount
            </span>
            <span className="font-manrope text-[20px] font-semibold leading-[28px] text-[#0077c0]">
              {total === 0 ? "₹0" : formatAmount(total)}
            </span>
          </div>
        </div>
      </div>

      {adding && (
        <NewPaymentDialog
          patientName={patientName}
          onCancel={() => setAdding(false)}
          onSubmit={addPayment}
        />
      )}

      {pendingDelete && (
        <ConfirmDeleteDialog
          title="Delete Payment?"
          message={
            <>
              Are you sure you want to delete the payment{" "}
              <span className="font-semibold text-[#0077c0]">{pendingDelete.description}</span> (
              {formatAmount(pendingDelete.amount)})? This action cannot be undone.
            </>
          }
          confirmLabel="Delete Payment"
          onClose={() => setPendingDelete(null)}
          onConfirm={() => {
            removePayment(pendingDelete.id);
            setPendingDelete(null);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------ New Payment */

/** New Payment form (Figma "New Payment"): description + amount, then Submit. */
function NewPaymentDialog({
  patientName,
  onCancel,
  onSubmit,
}: {
  patientName: string;
  onCancel: () => void;
  onSubmit: (description: string, amount: number) => void;
}) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");

  const amountValue = Number(amount);
  const canSubmit = description.trim().length > 0 && amount.trim() !== "" && amountValue > 0;

  function submit() {
    if (!canSubmit) return;
    onSubmit(description.trim(), amountValue);
  }

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-payment-title"
        className="my-auto flex w-full max-w-[640px] flex-col overflow-hidden rounded-[20px] bg-white shadow-[0px_24px_48px_-12px_rgba(0,0,0,0.18)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-[30px] pb-[15px] pt-[30px]">
          <h2 id="new-payment-title" className="font-manrope text-[28px] font-semibold tracking-[-0.7px] text-[#1e1e24]">
            New Payment
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="flex size-[38px] items-center justify-center rounded-[11px] text-[#1e1e24] transition-colors hover:bg-[#f1f5f9]"
          >
            <CloseIcon className="size-6" />
          </button>
        </div>

        {/* Form */}
        <div className="flex flex-col gap-[26px] px-[30px] pb-[24px] pt-[15px]">
          <div className="flex flex-col gap-[4px]">
            <label htmlFor="payment-description" className="font-inter text-[11px] uppercase tracking-[0.5px] text-[#1e1e24]">
              Description <span className="text-[#ff0000]">*</span>
            </label>
            <input
              id="payment-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter payment description here"
              aria-label={`Payment description for ${patientName}`}
              className="w-full border-b border-[rgba(194,198,212,0.6)] pb-[10px] pt-[9px] font-inter text-[15px] text-[#1e1e24] outline-none placeholder:text-[#c2c6d4] focus:border-[#0077c0]"
            />
          </div>

          <div className="flex w-[280px] max-w-full flex-col gap-[4px]">
            <label htmlFor="payment-amount" className="font-inter text-[11px] uppercase tracking-[0.5px] text-[#1e1e24]">
              Amount <span className="text-[#ff0000]">*</span>
            </label>
            <div className="flex items-end gap-[15px]">
              <span className="pb-[10px] font-inter text-[15px] font-medium text-[#1e1e24]">₹</span>
              <input
                id="payment-amount"
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="000.00"
                className="min-w-0 flex-1 border-b border-[rgba(194,198,212,0.6)] pb-[10px] pt-[9px] font-inter text-[15px] text-[#1e1e24] outline-none placeholder:text-[#c2c6d4] focus:border-[#0077c0]"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-[11px] px-[30px] py-[22px]">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[11px] px-[30px] py-[11px] font-inter text-[12px] font-semibold uppercase tracking-[0.57px] text-[#1e1e24] transition-colors hover:text-[#0077c0]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="rounded-[11px] bg-[#0077c0] px-[30px] py-[11px] font-inter text-[12px] font-semibold uppercase tracking-[0.57px] text-white shadow-[0px_4px_6px_rgba(0,71,141,0.2)] transition-colors hover:bg-[#0069a8] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[#0077c0]"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- primitives */

/** Shared 5-column grid for the payments table header + rows. */
const COLS = "grid grid-cols-[56px_minmax(0,1fr)_120px_110px_64px] items-center gap-[8px]";
/** Column-header cell styling. */
const HEAD = "font-inter text-[12px] font-semibold uppercase tracking-[0.6px] text-[#1e1e24]";

function CheckBox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <span
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      onClick={onChange}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onChange();
        }
      }}
      className={`flex size-[20px] shrink-0 items-center justify-center rounded-[4px] border ${
        checked ? "border-[#0077c0] bg-[#0077c0]" : "border-[#1e1e24] bg-white"
      }`}
    >
      {checked && (
        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="size-[12px]" aria-hidden>
          <path d="M5 12l5 5L20 7" />
        </svg>
      )}
    </span>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className} aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
