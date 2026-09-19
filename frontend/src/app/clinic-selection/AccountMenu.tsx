"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  apiFetch,
  clearActiveClinicId,
  displayName,
  roleAvatar,
  type MeResponse,
} from "@/lib/api";

import AccountsClient from "./[code]/accounts/AccountsClient";
import ProfileClient from "./[code]/profile/ProfileClient";
import { DashboardSessionProvider, useLocalAvatar } from "./[code]/session";

/**
 * Account chip + dropdown for the clinic-selection ("Switch Branch") page —
 * mirrors the dashboard sidebar's user chip (avatar + name), but light-themed for
 * the white page. Clicking it opens Profile (all roles), Accounts (admins only),
 * or Log Out. Profile and Accounts open as popups here (there's no dashboard
 * shell / per-clinic route) by rendering the same page components inside a
 * DashboardSessionProvider, so they behave exactly as on the dashboard.
 */
export default function AccountMenu({
  me,
  setMe,
  showAccounts,
}: {
  me: MeResponse;
  /** Push a session change (Profile save) so the chip name/avatar refresh. */
  setMe: (me: MeResponse) => void;
  /** Whether the Accounts option is offered (admins only; super admins manage
   *  accounts per-clinic from the row Manage button). */
  showAccounts: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Accounts still opens as a popup; Profile takes over the whole page instead.
  const [popup, setPopup] = useState<"accounts" | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // One avatar state shared by the chip and the Profile popup (via the provider),
  // so an upload reflects in the chip immediately and in the sidebar later.
  const avatar = useLocalAvatar(me.user.id);

  const label = me.user.firstName?.trim() || displayName(me.user).split(" ")[0];

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function logout() {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // Ignore — head to login regardless.
    }
    clearActiveClinicId();
    router.push("/login");
  }

  return (
    <>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex h-[55px] items-center gap-[10px] rounded-full border-[1.5px] border-[#c2c6d4] bg-white pl-[8px] pr-[18px] transition-colors hover:border-[#0077c0]"
        >
          <span className="flex size-[39px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#0077c0]">
            {avatar.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar.url} alt="" className="size-full object-cover" />
            ) : (
              <Image src={roleAvatar(me.user.role)} alt="" width={24} height={24} className="size-6" />
            )}
          </span>
          <span className="max-w-[160px] truncate font-inter text-[16px] font-semibold text-[#1e1e24]">
            {label}
          </span>
          <ChevronDown className={`size-5 text-[#727783] transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+8px)] z-40 flex w-[216px] flex-col gap-[5px] rounded-[15px] border border-[#c2c6d4] bg-white p-[17px] drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)]"
          >
            {/* Identity header — avatar + name with a divider underneath */}
            <div className="flex items-center gap-[10px] border-b border-[rgba(0,0,0,0.2)] px-[16px] py-[10px]">
              <span className="flex size-[30px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#0077c0]">
                {avatar.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar.url} alt="" className="size-full object-cover" />
                ) : (
                  <Image src={roleAvatar(me.user.role)} alt="" width={18} height={18} className="size-[18px]" />
                )}
              </span>
              <span className="truncate font-manrope text-[14px] font-medium leading-[20px] text-[#1e1e24]">
                {displayName(me.user)}
              </span>
            </div>

            <MenuItem
              label="Profile"
              onClick={() => {
                setOpen(false);
                setShowProfile(true);
              }}
            />
            {showAccounts && (
              <MenuItem
                label="Accounts"
                onClick={() => {
                  setOpen(false);
                  setPopup("accounts");
                }}
              />
            )}
            <MenuItem label="Log Out" onClick={logout} />
          </div>
        )}
      </div>

      {showProfile && (
        <ProfilePage onBack={() => setShowProfile(false)}>
          <DashboardSessionProvider me={me} setMe={setMe} avatar={avatar}>
            <ProfileClient onBack={() => setShowProfile(false)} />
          </DashboardSessionProvider>
        </ProfilePage>
      )}

      {popup && (
        <PagePopup onClose={() => setPopup(null)}>
          <DashboardSessionProvider me={me} setMe={setMe} avatar={avatar}>
            <AccountsClient />
          </DashboardSessionProvider>
        </PagePopup>
      )}
    </>
  );
}

/**
 * Full-page (not modal) host for Profile Settings on the clinic-selection
 * screen: an opaque white surface that fills the viewport and scrolls on its own,
 * so Profile reads as its own page rather than a popup. The back arrow lives next
 * to the "Profile Settings" title (rendered by ProfileClient via its onBack prop).
 */
function ProfilePage({ onBack, children }: { onBack: () => void; children: React.ReactNode }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onBack();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onBack]);

  return (
    <div className="fixed inset-0 z-[120] overflow-y-auto bg-white">
      <div className="mx-auto flex w-full max-w-[1402px] flex-col p-6 md:p-7">{children}</div>
    </div>
  );
}

/** One row in the account dropdown. */
function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="w-full rounded-[8px] bg-[#f1f5f9] px-[16px] py-[10px] text-left font-manrope text-[14px] font-semibold leading-[20px] text-[#1e1e24] transition-colors hover:bg-[#e6ebf1]"
    >
      {label}
    </button>
  );
}

/**
 * Full-screen modal that hosts a reused dashboard page (Profile / Accounts) on
 * the clinic-selection screen: a scrollable white card with a close button.
 */
function PagePopup({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/40 p-4 md:p-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative my-auto w-full max-w-[1120px] rounded-[28px] bg-white p-[28px] shadow-[0px_30px_60px_-15px_rgba(0,0,0,0.25)] md:p-[42px]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-[20px] top-[20px] z-10 flex size-[40px] items-center justify-center rounded-full text-[#1e1e24] transition-colors hover:bg-[#f1f5f9]"
        >
          <CloseIcon className="size-6" />
        </button>
        {children}
      </div>
    </div>
  );
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className={className} aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
