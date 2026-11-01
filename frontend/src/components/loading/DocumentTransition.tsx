"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import PageTransition from "./PageTransition";
import RouteSkeleton from "./RouteSkeleton";

export default function DocumentTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Clinic pages transition inside DashboardShell, leaving its sidebar usable.
  const clinicPage = /^\/clinic-selection\/[^/]+\//.test(pathname);
  const standalonePage = ["/", "/login", "/forgot-password", "/clinic-selection"].includes(pathname);
  if (clinicPage || !standalonePage) return children;

  return (
    <PageTransition key={pathname} fallback={<RouteSkeleton />}>
      {children}
    </PageTransition>
  );
}
