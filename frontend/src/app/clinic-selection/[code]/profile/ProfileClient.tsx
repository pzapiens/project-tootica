"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { apiFetch, ApiError, displayName, greetingLabel, roleAvatar, ROLE_LABELS, type MeResponse } from "@/lib/api";
import BackButton from "@/components/BackButton";

import { useAvatar, useMe, useUpdateMe } from "../session";
import { SPECIALIZATIONS } from "../doctors/constants";
import ConfirmDeleteDialog from "../appointments/ConfirmDeleteDialog";

const LABEL = "font-inter text-[12px] font-semibold uppercase tracking-[0.6px] text-[#727783]";
const CARD = "rounded-[16px] border border-[#c2c6d4] bg-white p-[26px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]";
const FIELD =
  "h-[48px] w-full rounded-[8px] border border-[#c2c6d4] px-[16px] font-inter text-[15px] text-[#1e1e24] outline-none placeholder:text-[#c2c6d4] focus:border-[#0077c0]";

export default function ProfileClient({ onBack }: { onBack?: () => void } = {}) {
  const router = useRouter();
  const me = useMe();
  const updateMe = useUpdateMe();
  const isDoctor = me.user.role === "DOCTOR" || me.user.role === "GUEST_DOCTOR";

  // Personal information (seeded from the session).
  const [fullName, setFullName] = useState(displayName(me.user));
  const [specialization, setSpecialization] = useState(me.specialization ?? "");
  const [phone, setPhone] = useState(me.user.phone ?? "");
  const [email, setEmail] = useState(me.user.email);
  const [savedName, setSavedName] = useState(greetingLabel(me.user));

  // Avatar is shared with the sidebar chip via the shell, so an upload/remove
  // reflects in the left panel instantly.
  const { url: avatar, setUrl: setAvatar } = useAvatar();
  const fileRef = useRef<HTMLInputElement>(null);

  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Reset password.
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // The Reset Password button stays inactive until all three fields are filled.
  const canResetPassword =
    oldPassword.length > 0 && newPassword.length > 0 && confirmPassword.length > 0;

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState<"logout" | "delete" | null>(null);
  const [dangerMsg, setDangerMsg] = useState("");

  async function saveProfile() {
    setSavingProfile(true);
    setProfileMsg(null);
    const parts = fullName.trim().split(/\s+/);
    const firstName = parts[0] ?? "";
    const lastName = parts.slice(1).join(" ");
    try {
      const updated = await apiFetch<MeResponse>("/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({ firstName, lastName, phone, email, specialization }),
      });
      setSavedName(greetingLabel(updated.user));
      // Push the new session to the shell so the sidebar name/role update instantly.
      updateMe(updated);
      setProfileMsg({ ok: true, text: "Profile updated." });
    } catch (err) {
      setProfileMsg({ ok: false, text: errText(err, "Couldn't update your profile.") });
    } finally {
      setSavingProfile(false);
    }
  }

  async function resetPassword() {
    setPasswordMsg(null);
    if (!oldPassword || !newPassword || !confirmPassword) {
      setPasswordMsg({ ok: false, text: "Fill in all password fields." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ ok: false, text: "New passwords don't match." });
      return;
    }
    setSavingPassword(true);
    try {
      await apiFetch("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: oldPassword, newPassword }),
      });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMsg({ ok: true, text: "Password changed." });
    } catch (err) {
      setPasswordMsg({ ok: false, text: errText(err, "Couldn't change your password.") });
    } finally {
      setSavingPassword(false);
    }
  }

  async function logout() {
    setBusy("logout");
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // Ignore — clear client state regardless.
    }
    router.replace("/login");
  }

  async function deleteAccount() {
    setBusy("delete");
    setDangerMsg("");
    try {
      await apiFetch("/auth/account", { method: "DELETE" });
      router.replace("/login");
    } catch (err) {
      setDangerMsg(errText(err, "Couldn't delete your account."));
      setBusy(null);
      setConfirmingDelete(false);
    }
  }

  function pickImage(file: File | undefined) {
    if (!file) return;
    // Read as a data URL so it can be shared with the sidebar and survive a
    // refresh via sessionStorage (a blob: URL wouldn't).
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setAvatar(reader.result);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="flex flex-1 flex-col gap-[32px]">
      <div className="flex items-center gap-[14px]">
        {onBack && <BackButton onClick={onBack} ariaLabel="Go back" />}
        <h1 className="font-manrope text-[35px] font-bold leading-[44px] tracking-[-0.7px] text-[#1e1e24]">
          Profile Settings
        </h1>
      </div>

      {/* Avatar + Personal Information */}
      <div className="grid grid-cols-1 items-stretch gap-[28px] lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* Avatar card */}
        <div className={`${CARD} flex h-full flex-col items-center justify-center gap-[22px]`}>
          <span className="flex size-[128px] items-center justify-center overflow-hidden rounded-full bg-[#0077c0]">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="size-full object-cover" />
            ) : (
              <Image src={roleAvatar(me.user.role)} alt="" width={84} height={84} className="size-[84px]" />
            )}
          </span>
          <div className="flex w-full max-w-[240px] flex-col gap-[12px]">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center justify-center gap-[8px] whitespace-nowrap rounded-[10px] border border-[#0077c0] px-[16px] py-[11px] font-inter text-[13px] font-semibold uppercase tracking-[0.5px] text-[#0077c0] transition-colors hover:bg-[#e6f2fb]"
            >
              <UploadIcon className="size-5" /> Upload Image
            </button>
            <button
              type="button"
              onClick={() => setAvatar(null)}
              className="flex items-center justify-center gap-[8px] whitespace-nowrap rounded-[10px] border border-[#ab2222] px-[16px] py-[11px] font-inter text-[13px] font-semibold uppercase tracking-[0.5px] text-[#ab2222] transition-colors hover:bg-[#f9f1f1]"
            >
              <TrashIcon className="size-5" /> Remove Image
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                pickImage(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
          <div className="flex flex-col items-center gap-[4px] pt-[4px]">
            <div className="flex items-center gap-[8px]">
              <span className="flex size-[22px] items-center justify-center rounded-full bg-[#0077c0]">
                <Image src={roleAvatar(me.user.role)} alt="" width={14} height={14} className="size-[14px]" />
              </span>
              <span className="font-manrope text-[19px] font-semibold leading-[26px] text-[#1e1e24]">
                {savedName}
              </span>
            </div>
            <span className="font-inter text-[14px] font-medium text-[#727783]">
              {ROLE_LABELS[me.user.role]}
            </span>
          </div>
        </div>

        {/* Personal Information card */}
        <div className={`${CARD} flex flex-col justify-center`}>
          <h2 className="border-b border-[#c2c6d4] pb-[14px] font-manrope text-[21px] font-semibold leading-[30px] text-[#1e1e24]">
            Personal Information
          </h2>
          <div className="grid grid-cols-1 gap-x-[24px] gap-y-[18px] pt-[20px] sm:grid-cols-2">
            <Labeled label="Full Name">
              <input className={FIELD} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
            </Labeled>
            <Labeled label="Specialized Field">
              <div className="relative">
                <select
                  value={specialization}
                  onChange={(e) => setSpecialization(e.target.value)}
                  disabled={!isDoctor}
                  className={`${FIELD} appearance-none pr-[40px] ${!isDoctor ? "cursor-not-allowed bg-[#f6f7f9] text-[#94a3b8]" : ""}`}
                >
                  <option value="">{isDoctor ? "Select" : "Not applicable"}</option>
                  {SPECIALIZATIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-[16px] top-1/2 size-4 -translate-y-1/2 text-[#727783]" />
              </div>
            </Labeled>
            <Labeled label="Phone Number">
              <div className="relative">
                <PhoneIcon className="pointer-events-none absolute left-[16px] top-1/2 size-5 -translate-y-1/2 text-[#727783]" />
                <input className={`${FIELD} pl-[46px]`} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" />
              </div>
            </Labeled>
            <Labeled label="Email Address">
              <div className="relative">
                <MailIcon className="pointer-events-none absolute left-[16px] top-1/2 size-5 -translate-y-1/2 text-[#727783]" />
                <input className={`${FIELD} pl-[46px]`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" />
              </div>
            </Labeled>
          </div>
          <div className="flex items-center justify-end gap-[14px] pt-[18px]">
            {profileMsg && (
              <span className={`flex-1 text-left font-inter text-[13px] leading-[18px] ${profileMsg.ok ? "text-[#15803d]" : "text-[#ba1a1a]"}`}>
                {profileMsg.text}
              </span>
            )}
            <button
              type="button"
              onClick={saveProfile}
              disabled={savingProfile}
              className="shrink-0 rounded-[10px] bg-[#0077c0] px-[24px] py-[11px] font-inter text-[14px] font-semibold text-white transition-colors hover:bg-[#0069a8] disabled:opacity-50"
            >
              {savingProfile ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>

      {/* Reset Your Password */}
      <div className={CARD}>
        <h2 className="border-b border-[#c2c6d4] pb-[14px] font-manrope text-[21px] font-semibold leading-[30px] text-[#1e1e24]">
          Reset Your Password
        </h2>
        <div className="grid grid-cols-1 gap-x-[24px] gap-y-[18px] pt-[20px] sm:grid-cols-2">
          <Labeled label="Old Password" required>
            <input className={FIELD} type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} placeholder="Enter old password" />
          </Labeled>
          <Labeled label="New Password" required>
            <input className={FIELD} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password" />
          </Labeled>
          <Labeled label="Confirm New Password" required>
            <input className={FIELD} type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter new password" />
          </Labeled>
          <div className="flex items-end justify-end gap-[14px]">
            {passwordMsg && (
              <span className={`font-inter text-[13px] ${passwordMsg.ok ? "text-[#15803d]" : "text-[#ba1a1a]"}`}>
                {passwordMsg.text}
              </span>
            )}
            <button
              type="button"
              onClick={resetPassword}
              disabled={savingPassword || !canResetPassword}
              className="h-[48px] shrink-0 rounded-[10px] bg-[#0077c0] px-[24px] font-inter text-[14px] font-semibold text-white transition-colors hover:bg-[#0069a8] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingPassword ? "Saving…" : "Reset Password"}
            </button>
          </div>
        </div>
      </div>

      {/* Delete + Log Out */}
      <div className="grid grid-cols-1 gap-[28px] lg:grid-cols-2">
        <div className={CARD}>
          <h2 className="border-b border-[#c2c6d4] pb-[14px] font-manrope text-[21px] font-semibold leading-[30px] text-[#ab2222]">
            Delete
          </h2>
          <div className="pt-[18px]">
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              disabled={busy === "delete"}
              className="flex items-center gap-[8px] rounded-[8px] bg-[#c0202b] px-[18px] py-[11px] font-inter text-[14px] font-semibold text-white transition-colors hover:bg-[#a81b25] disabled:opacity-50"
            >
              <TrashIcon className="size-5" /> Delete Account
            </button>
            <p className="pt-[14px] font-inter text-[14px] leading-[20px] text-[#727783]">
              This action cannot be undone. Your account and all associated data will be permanently
              deleted.
            </p>
            {dangerMsg && <p className="pt-[8px] font-inter text-[13px] text-[#ba1a1a]">{dangerMsg}</p>}
          </div>
        </div>

        <div className={CARD}>
          <h2 className="border-b border-[#c2c6d4] pb-[14px] font-manrope text-[21px] font-semibold leading-[30px] text-[#0077c0]">
            Log Out
          </h2>
          <div className="pt-[18px]">
            <button
              type="button"
              onClick={logout}
              disabled={busy === "logout"}
              className="flex items-center gap-[8px] rounded-[8px] bg-[#0077c0] px-[18px] py-[11px] font-inter text-[14px] font-semibold text-white transition-colors hover:bg-[#0069a8] disabled:opacity-50"
            >
              <LogoutIcon className="size-5" /> Log Out Account
            </button>
            <p className="pt-[14px] font-inter text-[14px] leading-[20px] text-[#727783]">
              Are you sure you want to log out? Your session will be securely ended, and you&apos;ll need
              to sign in again.
            </p>
          </div>
        </div>
      </div>

      {confirmingDelete && (
        <ConfirmDeleteDialog
          title="Delete Account?"
          message={
            <>
              This permanently deletes your account and purges your personal data. This action{" "}
              <span className="font-semibold text-[#0077c0]">cannot be undone</span>.
            </>
          }
          confirmLabel="Delete Account"
          onClose={() => setConfirmingDelete(false)}
          onConfirm={deleteAccount}
        />
      )}
    </div>
  );
}

/** Friendly message from an ApiError (falls back to a default). */
function errText(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.message ? err.message : fallback;
}

function Labeled({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-[8px]">
      <span className={LABEL}>
        {label}
        {required && <span className="text-[#ba1a1a]"> *</span>}
      </span>
      {children}
    </label>
  );
}

// Filled Material "delete" glyph — the exact path used by the app-wide
// /dashboard/delete.svg, drawn with currentColor so buttons control the tint.
function TrashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M7 21C6.45 21 5.97917 20.8042 5.5875 20.4125C5.19583 20.0208 5 19.55 5 19V6H4V4H9V3H15V4H20V6H19V19C19 19.55 18.8042 20.0208 18.4125 20.4125C18.0208 20.8042 17.55 21 17 21H7ZM17 6H7V19H17V6ZM9 17H11V8H9V17ZM13 17H15V8H13V17Z" />
    </svg>
  );
}

// Filled Material "file_upload" glyph (currentColor).
function UploadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M11 16V7.85l-2.6 2.6L7 9l5-5 5 5-1.4 1.45-2.6-2.6V16h-2Zm-5 4q-.825 0-1.412-.587Q4 18.825 4 18v-3h2v3h12v-3h2v3q0 .825-.587 1.413Q18.825 20 18 20H6Z" />
    </svg>
  );
}

// Filled Material "logout" glyph (currentColor).
function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M5 21q-.825 0-1.412-.587Q3 19.825 3 19V5q0-.825.588-1.413Q4.175 3 5 3h7v2H5v14h7v2H5Zm11-4-1.375-1.45 2.55-2.55H9v-2h8.175l-2.55-2.55L16 7l5 5-5 5Z" />
    </svg>
  );
}

// Filled Material "phone_in_talk" glyph (currentColor).
function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M19.95 21C17.8667 21 15.8083 20.5458 13.775 19.6375C11.7417 18.7292 9.89167 17.4417 8.225 15.775C6.55833 14.1083 5.27083 12.2583 4.3625 10.225C3.45417 8.19167 3 6.13333 3 4.05C3 3.75 3.1 3.5 3.3 3.3C3.5 3.1 3.75 3 4.05 3H8.1C8.33333 3 8.54167 3.07917 8.725 3.2375C8.90833 3.39583 9.01667 3.58333 9.05 3.8L9.7 7.3C9.73333 7.56667 9.725 7.79167 9.675 7.975C9.625 8.15833 9.53333 8.31667 9.4 8.45L6.975 10.9C7.30833 11.5167 7.70417 12.1125 8.1625 12.6875C8.62083 13.2625 9.125 13.8167 9.675 14.35C10.1917 14.8667 10.7333 15.3458 11.3 15.7875C11.8667 16.2292 12.4667 16.6333 13.1 17L15.45 14.65C15.6 14.5 15.7958 14.3875 16.0375 14.3125C16.2792 14.2375 16.5167 14.2167 16.75 14.25L20.2 14.95C20.4333 15.0167 20.625 15.1375 20.775 15.3125C20.925 15.4875 21 15.6833 21 15.9V19.95C21 20.25 20.9 20.5 20.7 20.7C20.5 20.9 20.25 21 19.95 21ZM19 12C19 10.05 18.3208 8.39583 16.9625 7.0375C15.6042 5.67917 13.95 5 12 5V3C13.25 3 14.4208 3.2375 15.5125 3.7125C16.6042 4.1875 17.5542 4.82917 18.3625 5.6375C19.1708 6.44583 19.8125 7.39583 20.2875 8.4875C20.7625 9.57917 21 10.75 21 12H19ZM15 12C15 11.1667 14.7083 10.4583 14.125 9.875C13.5417 9.29167 12.8333 9 12 9V7C13.3833 7 14.5625 7.4875 15.5375 8.4625C16.5125 9.4375 17 10.6167 17 12H15Z" />
    </svg>
  );
}

// Filled Material "mail" glyph (currentColor).
function MailIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M4 20q-.825 0-1.412-.587Q2 18.825 2 18V6q0-.825.588-1.413Q3.175 4 4 4h16q.825 0 1.413.587Q22 5.175 22 6v12q0 .825-.587 1.413Q20.825 20 20 20H4Zm8-7 8-5V6l-8 5-8-5v2l8 5Z" />
    </svg>
  );
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
