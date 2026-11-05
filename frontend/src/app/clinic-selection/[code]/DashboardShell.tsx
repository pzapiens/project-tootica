"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  apiFetch,
  ApiError,
  displayName,
  roleAvatar,
  type BranchSummary,
  type MeResponse,
  type Role,
} from "@/lib/api";
import { useExclusiveDropdown } from "@/lib/useExclusiveDropdown";
import { Tip } from "@/components/HoverTip";
import RouteSkeleton from "@/components/loading/RouteSkeleton";
import PageTransition from "@/components/loading/PageTransition";
import { SidebarSkeleton } from "@/components/loading/PageSkeletons";

import ResetPasswordPopup from "../ResetPasswordPopup";
import { DashboardSessionProvider, useLocalAvatar } from "./session";

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
  { key: "analytics", label: "Insights", segment: "analytics", icon: "/dashboard/leaderboard.svg", roles: ["SUPER_ADMIN", "CLIENT_ADMIN"] },
  { key: "revenue", label: "Revenue", segment: "revenue", icon: "/dashboard/account_balance_wallet.svg", roles: ["SUPER_ADMIN", "CLIENT_ADMIN"] },
];

function canSee(item: NavItem, role: Role): boolean {
  return item.roles === "all" || item.roles.includes(role);
}

/** Friendly account-type label shown when hovering the sidebar avatar. */
function roleLabel(role: Role): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "Super Admin";
    case "CLIENT_ADMIN":
      return "Admin";
    case "RECEPTIONIST":
      return "Receptionist";
    case "DOCTOR":
      return "Doctor";
    case "GUEST_DOCTOR":
      return "Guest Doctor";
    default:
      return "Account";
  }
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
  const [branchName, setBranchName] = useState<string | null>(null);
  const [clinicName, setClinicName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [branchLoading, setBranchLoading] = useState(true);
  const [showReset, setShowReset] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Locally-uploaded avatar, shared with the Profile page via context and shown
  // in the sidebar chip. Seeded from sessionStorage once the user is known.
  const avatarValue = useLocalAvatar(me?.user.id);

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

  // Resolve the current branch's display name from the URL `[code]` segment so
  // the sidebar can show "Clinic · Branch" under the account name.
  useEffect(() => {
    let active = true;
    apiFetch<BranchSummary[]>("/branches")
      .then((branches) => {
        if (!active) return;
        // `[code]` is a branch code for clinic staff/admins, or a clinic code for
        // a super admin viewing clinic-wide (no branch match). Either way the
        // clinic name is on the branch rows (all share the tenant's clinic).
        const match = branches.find((b) => b.code === code);
        setBranchName(match?.name ?? null);
        setClinicName(match?.clinicName ?? branches[0]?.clinicName ?? null);
      })
      .catch(() => {
        // No branch access → just omit the identifier line.
      })
      .finally(() => {
        if (active) setBranchLoading(false);
      });
    return () => {
      active = false;
    };
  }, [code]);

  if (!loading && !me) return <SessionError />;

  const items = me ? NAV.filter((item) => canSee(item, me.user.role)) : [];

  return (
    <div className="flex h-dvh overflow-hidden bg-[#1e1e24]">
      {/* This transition mounts with the shell and stays mounted across page
          changes, so navigation gets a smooth wireframe only on its first load. */}
      <div
        className="shrink-0 transition-[width] duration-300 ease-in-out motion-reduce:transition-none"
        style={{ width: sidebarCollapsed ? 72 : 243.9 }}
      >
        <PageTransition
          loading={loading || branchLoading}
          fallback={<SidebarSkeleton itemCount={me ? items.length : 6} collapsed={sidebarCollapsed} />}
        >
          {me && <Sidebar code={code} items={items} pathname={pathname} me={me} avatarUrl={avatarValue.url} branchName={branchName} clinicName={clinicName} collapsed={sidebarCollapsed} />}
        </PageTransition>
      </div>
      <main className="relative min-w-0 flex-1 p-[19px]">
        {/* Float in the existing gutter, outside navigation and content flow. */}
        <button
          type="button"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!sidebarCollapsed}
          aria-controls="clinic-sidebar"
          onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          className="absolute left-[3px] top-[38px] z-20 flex size-8 items-center justify-center rounded-full border border-[#0077c0] bg-[#0077c0] text-white shadow-[0_2px_8px_rgba(16,24,40,0.12)] transition-[color,background-color,border-color,box-shadow,transform] duration-200 hover:border-[#0069a8] hover:bg-[#0069a8] hover:shadow-[0_3px_12px_rgba(16,24,40,0.16)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0077c0] active:scale-95 motion-reduce:transition-none"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M9 4v16" />
            <path d={sidebarCollapsed ? "m13 9 3 3-3 3" : "m16 9-3 3 3 3"} />
          </svg>
        </button>
        {/* Fixed white panel; only the inner region scrolls. */}
        <div className="flex h-full flex-col overflow-hidden rounded-[28px] bg-white">
          <div className="min-h-0 flex-1 overflow-y-auto px-[24px] py-[24px] md:px-[42px] md:py-[32px]">
            {/* min-h-full fills the scroll viewport so pages can push a footer
                to the page bottom via mt-auto (flex-col lets a page's root
                stretch to this height). It's capped at 100% — never taller than
                the visible area — so it can't introduce a scrollbar when the
                content fits; the page only scrolls when the rows genuinely
                overflow. */}
            <div className="flex min-h-full origin-top flex-col [zoom:0.9]">
              {me ? (
                <DashboardSessionProvider me={me} setMe={setMe} avatar={avatarValue}>
                  <PageTransition key={pathname} fallback={<RouteSkeleton />}>
                    {children}
                  </PageTransition>
                </DashboardSessionProvider>
              ) : <RouteSkeleton />}
            </div>
          </div>
        </div>
      </main>
      {showReset && <ResetPasswordPopup onClose={() => setShowReset(false)} />}
    </div>
  );
}

function SessionError() {
  return (
    <div role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-white px-6 text-center text-ink">
      <p>Couldn’t load your account. Please try again.</p>
      <button type="button" onClick={() => window.location.reload()} className="rounded-full bg-brand px-6 py-3 text-white">Try again</button>
    </div>
  );
}

function Sidebar({
  code,
  items,
  pathname,
  me,
  avatarUrl,
  branchName,
  clinicName,
  collapsed,
}: {
  code: string;
  items: NavItem[];
  pathname: string;
  me: MeResponse;
  avatarUrl: string | null;
  branchName: string | null;
  clinicName: string | null;
  collapsed: boolean;
}) {
  // zoom 0.9 shrinks the sidebar width + all contents by 10%; the height is
  // pre-divided by 0.9 so it still fills the viewport after the zoom.
  return (
    <aside id="clinic-sidebar" aria-label="Clinic navigation" className={`flex h-[calc(100dvh/0.9)] shrink-0 flex-col justify-between overflow-x-hidden overflow-y-auto px-[16px] py-[32px] transition-[width] duration-300 ease-in-out motion-reduce:transition-none [zoom:0.9] ${collapsed ? "w-[80px]" : "w-[271px]"}`}>
      {/* Logo links back to the dashboard from anywhere. */}
      <Link
        href={`/clinic-selection/${code}/dashboard`}
        aria-label="Go to dashboard"
        className={`flex shrink-0 items-center gap-[8px] pb-[48px] transition-opacity hover:opacity-80 ${collapsed ? "justify-center" : "pl-[15px]"}`}
      >
        <Image
          src="/auth/logo.png"
          alt="Tootica"
          width={40}
          height={40}
          priority
          className="size-[40px] shrink-0"
        />
        <span className={`${collapsed ? "sr-only" : ""} font-inter text-[28px] font-bold leading-none tracking-[-0.5px] text-[#0077c0]`}>
          Tootica
        </span>
      </Link>

      {/* Navigation */}
      <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-[24px]">
        {items.map((item) => {
          const href = `/clinic-selection/${code}/${item.segment}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={item.key}
              href={href}
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              title={collapsed ? item.label : undefined}
              className={[
                `flex items-center py-[12px] transition-colors focus-visible:outline-2 focus-visible:outline-white ${collapsed ? "justify-center px-3" : "px-[16px]"}`,
                active
                  ? "rounded-[50px] bg-white/5"
                  : "rounded-[12px] hover:bg-white/5",
              ].join(" ")}
            >
              {/* The nav SVGs have baked-in fills (some white, some grey), so we
                  mask them and drive the color here — selected → white, otherwise
                  the muted grey — keeping every icon consistent with its label. */}
              <span
                aria-hidden
                className={`size-6 shrink-0 ${active ? "bg-white" : "bg-[#94a3b8]"}`}
                style={{
                  maskImage: `url(${item.icon})`,
                  WebkitMaskImage: `url(${item.icon})`,
                  maskRepeat: "no-repeat",
                  WebkitMaskRepeat: "no-repeat",
                  maskPosition: "center",
                  WebkitMaskPosition: "center",
                  maskSize: "contain",
                  WebkitMaskSize: "contain",
                }}
              />
              <span
                className={`${collapsed ? "sr-only" : "pl-[16px]"} font-inter text-[16px] font-medium leading-[24px] ${
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
      <UserChip code={code} me={me} avatarUrl={avatarUrl} branchName={branchName} clinicName={clinicName} collapsed={collapsed} />
      <div className={collapsed ? "sr-only" : "pt-[16px]"}>
        <p className="font-inter whitespace-nowrap text-[12px] font-medium leading-[18px] text-[#94a3b8]">
          © 2026 Tootica. All Rights Reserved.
        </p>
      </div>
    </aside>
  );
}

function UserChip({
  code,
  me,
  avatarUrl,
  branchName,
  clinicName,
  collapsed,
}: {
  code: string;
  me: MeResponse;
  avatarUrl: string | null;
  branchName: string | null;
  clinicName: string | null;
  collapsed: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useExclusiveDropdown();
  const [active, setActive] = useState<"profile" | "accounts" | "switch" | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 0, bottom: 0, width: 236 });

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [setOpen]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const close = () => setOpen(false);
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onScroll(event: Event) {
      if (!menuRef.current?.contains(event.target as Node)) close();
    }
    window.addEventListener("resize", close);
    window.addEventListener("scroll", onScroll, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, setOpen]);

  function toggleMenu() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const width = Math.min(236, window.innerWidth - 24);
      setMenuPosition({
        left: Math.max(12, Math.min(collapsed ? rect.right + 8 : rect.left, window.innerWidth - width - 12)),
        bottom: Math.max(12, window.innerHeight - (collapsed ? rect.bottom : rect.top) + (collapsed ? 0 : 8)),
        width,
      });
    }
    setOpen((value) => !value);
  }

  // Side-panel account name shows the FIRST name only — no salutation (that's
  // reserved for the title-area greeting on the dashboard / clinic-selection
  // pages). Falls back to the display name / email local part when no first
  // name is set.
  const label = me.user.firstName?.trim() || displayName(me.user).split(" ")[0];

  // Clinic + branch shown small beneath the name (e.g. "Bright Smiles · Downtown").
  // Prefer the currently-viewed clinic (resolved from the branch list) so a super
  // admin — who has no clinic of their own (me.clinic is null) — still sees the
  // clinic they've drilled into.
  const subLabel = [clinicName ?? me.clinic?.name, branchName].filter(Boolean).join(" · ");

  async function logout() {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // Ignore — clear client state regardless.
    }
    router.replace("/login");
  }

  // Branch-locked staff (a doctor/receptionist has a branchId) can't switch
  // branches — only clinic-wide admins see "Switch Branch". Accounts Management
  // is admin-only.
  const branchLocked = me.user.branchId !== null;
  const isAdmin = me.user.role === "CLIENT_ADMIN" || me.user.role === "SUPER_ADMIN";
  const menuItems: { key: "profile" | "accounts" | "switch"; label: string }[] = [
    { key: "profile", label: "Profile" },
    ...(isAdmin ? [{ key: "accounts" as const, label: "Accounts" }] : []),
    ...(branchLocked ? [] : [{ key: "switch" as const, label: "Switch Branch" }]),
  ];

  function onMenu(key: "profile" | "accounts" | "switch") {
    setActive(key);
    setOpen(false);
    if (key === "switch") {
      router.push("/clinic-selection");
    } else if (key === "profile") {
      router.push(`/clinic-selection/${code}/profile`);
    } else if (key === "accounts") {
      router.push(`/clinic-selection/${code}/accounts`);
    }
  }

  return (
    <div ref={ref} className={`relative shrink-0 ${collapsed ? "flex justify-center" : ""}`}>
      {open && createPortal(
        <div ref={menuRef} id="sidebar-account-menu" aria-label="Account menu" style={menuPosition} className="fixed z-50 flex max-h-[calc(100dvh-24px)] flex-col gap-[10px] overflow-y-auto rounded-[15px] border border-[rgba(194,198,212,0.5)] bg-[#2b2b31] p-[17px] shadow-lg">
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
        </div>,
        document.body,
      )}
      <button
        type="button"
        ref={buttonRef}
        aria-label={`${label}: open account menu`}
        title={collapsed ? `${label} — ${roleLabel(me.user.role)}` : undefined}
        aria-expanded={open}
        aria-controls={open ? "sidebar-account-menu" : undefined}
        onClick={toggleMenu}
        className={`flex shrink-0 items-center bg-white/10 text-left transition-colors hover:bg-white/[0.14] focus-visible:outline-2 focus-visible:outline-white ${collapsed ? "size-[56px] justify-center rounded-full p-0" : "w-full rounded-[50px] py-[12px] pl-[12px] pr-[16px]"}`}
      >
        <span className="relative flex size-[37px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#0077c0]">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="size-full object-cover" />
          ) : (
            <Image src={roleAvatar(me.user.role)} alt="" width={24} height={24} className="size-6" />
          )}
          <Tip label={roleLabel(me.user.role)} />
        </span>
        <span className={`${collapsed ? "sr-only" : "ml-[10px] min-w-0 flex-1 truncate"} font-inter text-[16px] font-medium leading-[16px] text-white`}>
          {label}
        </span>
        <Image
          src="/dashboard/chevron_left.svg"
          alt=""
          width={24}
          height={24}
          className={`${collapsed ? "hidden" : "size-6"} transition-transform ${open ? "rotate-90" : "-rotate-90"}`}
        />
      </button>
      {/* Full clinic + branch shown under the account box so long names wrap. */}
      {subLabel && (
        <p className={`${collapsed ? "sr-only" : "mt-[8px] px-[16px]"} font-inter text-[11px] font-normal leading-[14px] text-white/50`}>
          {subLabel}
        </p>
      )}
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
