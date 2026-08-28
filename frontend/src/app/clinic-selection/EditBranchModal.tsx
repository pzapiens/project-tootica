"use client";

import { useState } from "react";

import { apiFetch, ApiError, type BranchSummary } from "@/lib/api";
import { phoneDigitsError, phoneLocalPart, phoneWithCc } from "@/lib/validation";

import { ERROR_CLASS, LabeledInput, LabeledPhone, Overlay, PrimaryButton, SecondaryButton } from "./modal-ui";

/** Edit an existing branch's name, PIC and contact (super admin). */
export default function EditBranchModal({
  branch,
  onClose,
  onSaved,
}: {
  branch: BranchSummary;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(branch.name);
  const [picName, setPicName] = useState(branch.picName ?? "");
  const [contact, setContact] = useState(phoneLocalPart(branch.contact));
  const [error, setError] = useState("");
  const [nameError, setNameError] = useState("");
  const [contactError, setContactError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nameErr = name.trim() ? "" : "Clinic name is required.";
    const contactErr = phoneDigitsError(contact) ?? "";
    setNameError(nameErr);
    setContactError(contactErr);
    if (nameErr || contactErr) return;

    setSubmitting(true);
    setError("");
    try {
      await apiFetch(`/super-admin/branches/${branch.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          picName: picName.trim(),
          contact: phoneWithCc(contact),
        }),
      });
      onSaved();
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <Overlay onClose={onClose} labelledBy="edit-branch-title">
      <h2 id="edit-branch-title" className="font-manrope text-[24px] leading-[32px] tracking-[-0.5px] text-ink">
        Edit Clinic
      </h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <LabeledInput
          id="edit-branch-name"
          label="Clinic Name"
          value={name}
          onChange={(v) => {
            setName(v);
            setNameError("");
          }}
          placeholder="Clinic name"
          error={nameError}
        />
        <LabeledInput id="edit-branch-pic" label="Person in Contact (PIC)" value={picName} onChange={setPicName} placeholder="Person in contact" />
        <LabeledPhone id="edit-branch-contact" label="Contact Number" value={contact} onChange={(v) => { setContact(v); setContactError(""); }} error={contactError} />
        {error && <p role="alert" className={ERROR_CLASS}>{error}</p>}
        <div className="mt-1 flex gap-3">
          <SecondaryButton type="button" onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Save Changes"}
          </PrimaryButton>
        </div>
      </form>
    </Overlay>
  );
}
