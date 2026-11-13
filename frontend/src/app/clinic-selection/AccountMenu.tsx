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
import { DashboardSessionProvider } from "./[code]/session";

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

  // Profile updates replace the shared session, including its persisted photo URL.
  const avatarUrl = me.user.avatarUrl;

  const label = me.user.firstName?.trim() || displayName(me.user).split(" ")[0];
  const accountRole = me.user.role === "CLIENT_ADMIN"
    ? "Clinic Admin"
    : me.user.role.toLowerCase().replaceAll("_", " ");

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
          className="flex h-[40px] min-w-[160px] max-w-full text-left items-center gap-2 rounded-full border-[1.167px] border-black bg-white p-[3px] transition-colors hover:bg-black/[.02]"
        >
          <span className="flex size-[32px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#0077c0]">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="size-full object-cover" />
            ) : (
              <Image src={roleAvatar(me.user.role)} alt="" width={24} height={24} className="size-5" />
            )}
          </span>
          <span className="min-w-0 flex-1 truncate text-left font-inter text-[14px] font-semibold text-[#1e1e24]">
            {label}
          </span>
          <ChevronDown className={`ml-2 mr-2 size-4 shrink-0 text-black transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+8px)] z-40 flex w-[216px] flex-col gap-2 rounded-[13px] border-[1.167px] border-black bg-white p-[14px] drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)]"
          >
            {/* Account identity stays distinct from the menu actions. */}
            <div className="-mx-[14px] mb-1 flex min-w-0 items-center gap-3 px-[14px] pb-3.5">
              <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand ring-2 ring-[#e3f1ff]">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" className="size-full object-cover" />
                ) : (
                  <Image src={roleAvatar(me.user.role)} alt="" width={22} height={22} className="size-[22px]" />
                )}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1 text-left">
                <p className="break-words font-manrope text-[15px] font-bold leading-5 tracking-[-0.2px] text-black">
                  {displayName(me.user)}
                </p>
                <p className="font-inter text-[11px] font-medium capitalize leading-4 text-black/70">
                  {accountRole}
                </p>
              </div>
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
          <DashboardSessionProvider me={me} setMe={setMe}>
            <ProfileClient onBack={() => setShowProfile(false)} />
          </DashboardSessionProvider>
        </ProfilePage>
      )}

      {popup && (
        <PagePopup onClose={() => setPopup(null)}>
          <DashboardSessionProvider me={me} setMe={setMe}>
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
      <div className="app-page mx-auto flex w-full max-w-[1402px] flex-col p-5 md:p-6">{children}</div>
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
      className="clinic-field-border w-full rounded-lg border-[1.167px] border-black bg-transparent px-3.5 py-2.5 text-left font-manrope text-[14px] font-semibold leading-5 text-black transition-colors duration-150 app-option-hover focus-visible:bg-[#e3f1ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
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
      className="app-dialog-backdrop fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/40 p-3.5 md:p-7"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="app-dialog relative my-auto w-full max-w-[1120px] rounded-[24px] bg-white p-[24px] shadow-[0px_30px_60px_-15px_rgba(0,0,0,0.25)] md:p-[35px]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-[20px] top-[20px] z-10 flex size-[40px] items-center justify-center rounded-full text-[#1e1e24] transition-colors hover:bg-[#f1f5f9]"
        >
          <CloseIcon className="size-5" />
        </button>
        {children}
      </div>
    </div>
  );
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
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
