"use client";

import { useState } from "react";

import { apiFetch, ApiError, type BranchSummary } from "@/lib/api";
import { phoneDigitsError, phoneWithCc } from "@/lib/validation";

import {
  ERROR_CLASS,
  LabeledInput,
  LabeledPhone,
  Overlay,
  PrimaryButton,
  SecondaryButton,
} from "./modal-ui";

/**
 * Adds a branch to an existing clinic (super-admin, from the clinic's branches
 * view). Posts to `POST /api/super-admin/branches`, which allocates the next
 * sequential branch code.
 */
export default function AddBranchModal({
  clinicId,
  clinicName,
  onClose,
  onCreated,
}: {
  clinicId: string;
  clinicName: string;
  onClose: () => void;
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
    const nameErr = name.trim() ? "" : "Branch name is required.";
    const contactErr = phoneDigitsError(contact) ?? "";
    setNameError(nameErr);
    setContactError(contactErr);
    setFormError("");
    if (nameErr || contactErr) return;

    setSubmitting(true);
    try {
      const branch = await apiFetch<BranchSummary>("/super-admin/branches", {
        method: "POST",
        body: JSON.stringify({
          clinicId,
          name: name.trim(),
          picName: picName.trim() || undefined,
          contact: phoneWithCc(contact) || undefined,
        }),
      });
      onCreated(branch);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose} labelledBy="add-branch-title">
      <div className="flex flex-col gap-1">
        <h2 id="add-branch-title" className="font-manrope text-[24px] leading-[32px] tracking-[-0.5px] text-ink">
          Add Branch
        </h2>
        <p className="font-inter text-[14px] leading-5 text-ink/60">
          New branch under <span className="font-semibold text-ink">{clinicName}</span>.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <LabeledInput
          id="new-branch-name"
          label="Branch Name"
          value={name}
          onChange={(v) => { setName(v); setNameError(""); }}
          placeholder="e.g. Uptown"
          error={nameError}
        />
        <LabeledInput
          id="new-branch-pic"
          label="Person in Charge (PIC)"
          value={picName}
          onChange={setPicName}
          placeholder="Person in charge"
        />
        <LabeledPhone
          id="new-branch-contact"
          label="Contact Number"
          value={contact}
          onChange={(v) => { setContact(v); setContactError(""); }}
          error={contactError}
        />
        {formError && <p role="alert" className={ERROR_CLASS}>{formError}</p>}
        <div className="mt-1 flex gap-3">
          <SecondaryButton type="button" onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton type="submit" disabled={submitting}>
            {submitting ? "Adding…" : "Add Branch"}
          </PrimaryButton>
        </div>
      </form>
    </Overlay>
  );
}
