"use client";

import { usePathname } from "next/navigation";
import { AccountsSkeleton, AnalyticsSkeleton, AppointmentsSkeleton, AuthSkeleton, CalendarSkeleton, ClinicSelectionSkeleton, DashboardShellSkeleton, DashboardSkeleton, DoctorsSkeleton, PatientHistorySkeleton, PatientsSkeleton, ProfileSkeleton, ShiftSkeleton, RevenueSkeleton } from "./PageSkeletons";

/** Used only by ancestor boundaries where the leaf route isn't known in props. */
export default function RouteSkeleton({ withShell = false }: { withShell?: boolean }) {
  const pathname = usePathname();
  if (pathname === "/login" || pathname === "/") return <AuthSkeleton />;
  if (pathname === "/forgot-password") return <AuthSkeleton reset />;
  if (pathname === "/clinic-selection") return <ClinicSelectionSkeleton />;

  let content;
  if (/\/patients\/[^/]+\/history\/?$/.test(pathname)) content = <PatientHistorySkeleton />;
  else if (/\/doctors\/[^/]+\/shift\/?$/.test(pathname)) content = <ShiftSkeleton />;
  else {
    const page = pathname.split("/").filter(Boolean).at(-1);
    const pages = {
      dashboard: DashboardSkeleton,
      appointments: AppointmentsSkeleton,
      patients: PatientsSkeleton,
      doctors: DoctorsSkeleton,
      analytics: AnalyticsSkeleton,
      revenue: RevenueSkeleton,
      calendar: CalendarSkeleton,
      profile: ProfileSkeleton,
      accounts: AccountsSkeleton,
      whatsapp: ProfileSkeleton,
    };
    const Page = pages[page as keyof typeof pages];
    // Unknown destinations must not display another page's wireframe.
    if (!Page) return null;
    content = <Page />;
  }
  return withShell ? <DashboardShellSkeleton>{content}</DashboardShellSkeleton> : content;
}
