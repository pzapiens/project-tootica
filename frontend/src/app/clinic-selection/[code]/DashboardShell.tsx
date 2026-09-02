"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";

import {
  apiFetch,
  ApiError,
  displayName,
  type MeResponse,
  type Role,
} from "@/lib/api";
import { useExclusiveDropdown } from "@/lib/useExclusiveDropdown";

import ResetPasswordPopup from "../ResetPasswordPopup";

/**
 * The app shell for the per-clinic dashboard (Figma "Sidebar" + white content
 * panel). Renders the dark sidebar with role-gated navigation and wraps every
 * nested route (`/clinic-selection/[code]/dashboard`, `/appointments`, …) in the
 * white rounded content card.
 *
 * The white panel is a fixed-height frame: only the content INSIDE it scrolls,
 * the panel and sidebar stay put. The content is scaled to 90% so the dense
 * 1440-wide Figma layout fits comfortably.
 *
 * The session (role) is loaded once here from `GET /auth/me`; nested pages don't
 * refetch it. A 401 bounces back to /login.
 */

type NavItem = {
  key: string;
  label: string;
  /** Path segment appended to `/clinic-selection/[code]/`. */
  segment: string;
  icon: string;
  /** Roles allowed to see this item; `"all"` means every signed-in role. */
  roles: "all" | Role[];
};

// Prototype shows one shared nav. Doctors & receptionists get the day-to-day
// items up to Doctors; the management-only areas (Analytics, Revenue) stay
// restricted to admins.
const NAV: NavItem[] = [
  { key: "dashboard", label: "Dashboard", segment: "dashboard", icon: "/dashboard/dashboard.svg", roles: "all" },
  { key: "appointments", label: "Appointments", segment: "appointments", icon: "/dashboard/productivity.svg", roles: "all" },
  { key: "patients", label: "Patients", segment: "patients", icon: "/dashboard/personal_injury.svg", roles: "all" },
  { key: "doctors", label: "Doctors", segment: "doctors", icon: "/dashboard/oral_disease.svg", roles: "all" },
  { key: "analytics", label: "Analytics", segment: "analytics", icon: "/dashboard/leaderboard.svg", roles: ["SUPER_ADMIN", "CLIENT_ADMIN"] },
  { key: "revenue", label: "Revenue", segment: "revenue", icon: "/dashboard/account_balance_wallet.svg", roles: ["SUPER_ADMIN", "CLIENT_ADMIN"] },
];

function canSee(item: NavItem, role: Role): boolean {
  return item.roles === "all" || item.roles.includes(role);
}

/** Session (from `/auth/me`) shared with nested dashboard pages. */
const MeContext = createContext<MeResponse | null>(null);

/** Read the signed-in session inside any dashboard page. */
export function useMe(): MeResponse {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe must be used within the dashboard shell");
  return me;
}

export default function DashboardShell({
  code,
  children,
}: {
  code: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showReset, setShowReset] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch<MeResponse>("/auth/me")
      .then((data) => {
        if (!active) return;
        setMe(data);
        setLoading(false);
        // Doctors & receptionists skip clinic selection, so their forced
        // first-login "Reset Password" + Terms card shows here on the
        // dashboard instead, driven by the persisted mustResetPassword flag.
        const role = data.user.role;
        if (
          data.user.mustResetPassword &&
          (role === "DOCTOR" || role === "GUEST_DOCTOR" || role === "RECEPTIONIST")
        ) {
          setShowReset(true);
        }
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
          return;
        }
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [router]);

  if (loading || !me) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#1e1e24]">
        <p className="font-inter text-[16px] text-white/60">Loading…</p>
      </div>
    );
  }

  const role = me.user.role;
  const items = NAV.filter((item) => canSee(item, role));

  return (
    <div className="flex h-dvh overflow-hidden bg-[#1e1e24]">
      <Sidebar code={code} items={items} pathname={pathname} me={me} />
      <main className="min-w-0 flex-1 p-[19px]">
        {/* Fixed white panel; only the inner region scrolls. */}
        <div className="h-full overflow-hidden rounded-[28px] bg-white">
          <div className="h-full overflow-y-auto px-[24px] py-[24px] md:px-[42px] md:py-[42px]">
            <div className="origin-top [zoom:0.9]">
              <MeContext.Provider value={me}>{children}</MeContext.Provider>
            </div>
          </div>
        </div>
      </main>
      {showReset && <ResetPasswordPopup onClose={() => setShowReset(false)} />}
    </div>
  );
}

function Sidebar({
  code,
  items,
  pathname,
  me,
}: {
  code: string;
  items: NavItem[];
  pathname: string;
  me: MeResponse;
}) {
  // zoom 0.9 shrinks the sidebar width + all contents by 10%; the height is
  // pre-divided by 0.9 so it still fills the viewport after the zoom.
  return (
    <aside className="flex h-[calc(100dvh/0.9)] w-[271px] shrink-0 flex-col justify-between overflow-y-auto px-[16px] py-[32px] [zoom:0.9]">
      {/* Logo (mark + wordmark) */}
      <div className="flex items-center gap-[8px] pb-[48px] pl-[15px]">
        <Image
          src="/auth/logo.png"
          alt="Tootica"
          width={40}
          height={40}
          priority
          className="size-[40px]"
        />
        <span className="font-inter text-[28px] font-bold leading-none tracking-[-0.5px] text-[#0077c0]">
          Tootica
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-[24px]">
        {items.map((item) => {
          const href = `/clinic-selection/${code}/${item.segment}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={item.key}
              href={href}
              aria-current={active ? "page" : undefined}
              className={[
                "flex items-center px-[16px] py-[12px] transition-colors",
                active
                  ? "rounded-[50px] bg-white/5"
                  : "rounded-[12px] hover:bg-white/5",
              ].join(" ")}
            >
              <Image
                src={item.icon}
                alt=""
                width={24}
                height={24}
                className={`size-6 ${active ? "opacity-100" : "opacity-70"}`}
              />
              <span
                className={`pl-[16px] font-inter text-[16px] font-medium leading-[24px] ${
                  active ? "text-white" : "text-[#94a3b8]"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* User chip + footer */}
      <UserChip me={me} />
      <div className="pt-[16px]">
        <p className="font-inter text-[16px] font-medium leading-[24px] text-[#94a3b8]">
          © 2026 Tootica.
          <br />
          All Rights Reserved.
        </p>
      </div>
    </aside>
  );
}

function UserChip({ me }: { me: MeResponse }) {
  const router = useRouter();
  const [open, setOpen] = useExclusiveDropdown();
  const [active, setActive] = useState<"profile" | "accounts" | "switch" | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [setOpen]);

  // Show the signed-in account's name — the first/last name given at account
  // creation. Doctors are prefixed with "Dr."; falls back to the email local
  // part only if a profile has no name yet.
  const name = displayName(me.user);
  const isDoctor = me.user.role === "DOCTOR" || me.user.role === "GUEST_DOCTOR";
  const label = isDoctor ? `Dr. ${name}` : name;

  async function logout() {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // Ignore — clear client state regardless.
    }
    router.replace("/login");
  }

  // Branch-locked staff (a doctor/receptionist has a branchId) can't switch
  // branches — only clinic-wide admins see "Switch Branch".
  const branchLocked = me.user.branchId !== null;
  const menuItems: { key: "profile" | "accounts" | "switch"; label: string }[] = [
    { key: "profile", label: "Profile" },
    { key: "accounts", label: "Accounts" },
    ...(branchLocked ? [] : [{ key: "switch" as const, label: "Switch Branch" }]),
  ];

  function onMenu(key: "profile" | "accounts" | "switch") {
    setActive(key);
    if (key === "switch") {
      setOpen(false);
      router.push("/clinic-selection");
    }
  }

  return (
    <div ref={ref} className="relative">
      {open && (
        <div className="absolute bottom-[calc(100%+8px)] left-0 flex w-full flex-col gap-[10px] rounded-[15px] border border-[rgba(194,198,212,0.5)] bg-white/10 p-[17px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] backdrop-blur-md">
          <div className="flex flex-col gap-[4px]">
            {menuItems.map((item) => {
              const selected = active === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onMenu(item.key)}
                  className={`flex h-[41px] items-center justify-between rounded-[8px] px-[10px] transition-colors ${
                    selected ? "bg-[#d4ebfb]" : "bg-white/[0.06] hover:bg-white/[0.14]"
                  }`}
                >
                  <span
                    className={`font-manrope text-[14px] font-semibold leading-[20px] ${
                      selected ? "text-[#0077c0]" : "text-white"
                    }`}
                  >
                    {item.label}
                  </span>
                  {selected && <CheckCircle className="size-[18px]" />}
                </button>
              );
            })}
          </div>
          <div className="h-px w-full bg-[rgba(194,198,212,0.5)]" />
          <button
            type="button"
            onClick={logout}
            className="flex items-center justify-center gap-[7px] rounded-[8px] py-[8px] transition-colors hover:bg-white/[0.14]"
          >
            <Image src="/clinic/logout.svg" alt="" width={24} height={24} className="size-6" />
            <span className="font-manrope text-[14px] font-medium leading-[20px] text-white">Log Out</span>
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center rounded-[50px] bg-white/10 px-[16px] py-[12px] text-left transition-colors hover:bg-white/[0.14]"
      >
        <span className="flex size-[37px] shrink-0 items-center justify-center rounded-full bg-[#0077c0]">
          <Image src="/dashboard/person_shield.svg" alt="" width={24} height={24} className="size-6" />
        </span>
        <span className="ml-[10px] flex-1 truncate font-inter text-[16px] font-medium leading-[16px] text-white">
          {label}
        </span>
        <Image
          src="/dashboard/chevron_left.svg"
          alt=""
          width={24}
          height={24}
          className={`size-6 transition-transform ${open ? "rotate-90" : "-rotate-90"}`}
        />
      </button>
    </div>
  );
}

/** Blue check-circle shown on the selected settings-dropup row. */
function CheckCircle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#0077c0" strokeWidth="2" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
