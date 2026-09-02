"use client";

import { useEffect, useState } from "react";

import {
  apiFetch,
  ApiError,
  type ClinicAccount,
  type SuperAdminClinic,
} from "@/lib/api";
import { phoneDigitsError, phoneLocalPart, phoneWithCc } from "@/lib/validation";

import {
  ERROR_CLASS,
  LabeledInput,
  LabeledPhone,
  Overlay,
  PrimaryButton,
  SecondaryButton,
} from "./modal-ui";

/**
 * Edit a clinic's name and its PIC. The clinic list's PIC is the clinic's client
 * admin, whose name + contact live on the admin account — so this PATCHes the
 * clinic (name) and/or the admin account (PIC name + phone) as needed.
 */
export default function EditClinicModal({
  clinic,
  onClose,
  onSaved,
}: {
  clinic: SuperAdminClinic;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(clinic.name);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [contact, setContact] = useState("");
  const [adminId, setAdminId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Load the clinic's admin (the PIC) to prefill its name + contact. Match the
  // clinic-list ordering (first name, then oldest) so we edit the shown PIC.
  useEffect(() => {
    let active = true;
    apiFetch<ClinicAccount[]>(`/super-admin/clinics/${clinic.id}/accounts`)
      .then((list) => {
        if (!active) return;
        const pic = list
          .filter((a) => a.role === "CLIENT_ADMIN")
          .sort(
            (a, b) =>
              (a.firstName ?? "").localeCompare(b.firstName ?? "") ||
              a.createdAt.localeCompare(b.createdAt),
          )[0];
        if (pic) {
          setAdminId(pic.id);
          setFirstName(pic.firstName ?? "");
          setLastName(pic.lastName ?? "");
          setContact(phoneLocalPart(pic.phone));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [clinic.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Clinic name is required.";
    if (adminId) {
      if (!firstName.trim()) next.firstName = "First name is required.";
      if (!lastName.trim()) next.lastName = "Last name is required.";
      const phoneErr = phoneDigitsError(contact);
      if (phoneErr) next.contact = phoneErr;
    }
    setErrors(next);
    setError("");
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      if (name.trim() !== clinic.name) {
        await apiFetch(`/super-admin/clinics/${clinic.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: name.trim() }),
        });
      }
      if (adminId) {
        await apiFetch(`/super-admin/accounts/${adminId}`, {
          method: "PATCH",
          body: JSON.stringify({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            phone: phoneWithCc(contact),
          }),
        });
      }
      onSaved();
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <Overlay onClose={onClose} labelledBy="edit-clinic-title">
      <h2 id="edit-clinic-title" className="font-manrope text-[24px] leading-[32px] tracking-[-0.5px] text-ink">
        Edit Clinic
      </h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <LabeledInput
          id="edit-clinic-name"
          label="Clinic Name"
          value={name}
          onChange={(v) => {
            setName(v);
            setErrors((e) => ({ ...e, name: "" }));
          }}
          placeholder="Clinic name"
          error={errors.name}
        />

        <div className="flex flex-col gap-5 border-t border-field-border pt-5">
          <p className="font-manrope text-[15px] font-semibold text-ink">Person in Charge (PIC)</p>
          {loading ? (
            <p className="font-inter text-[14px] text-ink/60">Loading…</p>
          ) : adminId ? (
            <>
              <div className="flex flex-col gap-5 sm:flex-row">
                <div className="flex-1">
                  <LabeledInput
                    id="edit-clinic-pic-first"
                    label="First Name"
                    value={firstName}
                    onChange={(v) => {
                      setFirstName(v);
                      setErrors((e) => ({ ...e, firstName: "" }));
                    }}
                    placeholder="First name"
                    error={errors.firstName}
                  />
                </div>
                <div className="flex-1">
                  <LabeledInput
                    id="edit-clinic-pic-last"
                    label="Last Name"
                    value={lastName}
                    onChange={(v) => {
                      setLastName(v);
                      setErrors((e) => ({ ...e, lastName: "" }));
                    }}
                    placeholder="Last name"
                    error={errors.lastName}
                  />
                </div>
              </div>
              <LabeledPhone
                id="edit-clinic-pic-contact"
                label="Contact Number"
                value={contact}
                onChange={(v) => {
                  setContact(v);
                  setErrors((e) => ({ ...e, contact: "" }));
                }}
                error={errors.contact}
              />
            </>
          ) : (
            <p className="font-inter text-[13px] leading-5 text-ink/60">
              This clinic has no admin yet — add one from “Manage” to set a PIC.
            </p>
          )}
        </div>

        {error && (
          <p role="alert" className={ERROR_CLASS}>
            {error}
          </p>
        )}
        <div className="mt-1 flex gap-3">
          <SecondaryButton type="button" onClick={onClose}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={submitting || loading}>
            {submitting ? "Saving…" : "Save Changes"}
          </PrimaryButton>
        </div>
      </form>
    </Overlay>
  );
}
