"use client";

import type { ReactNode } from "react";
import FitToViewport from "@/app/login/FitToViewport";
import { AUTH_CARD_CLASS_NAME } from "@/app/login/auth-card";
import { useLoadingActivity } from "./LoadingActivity";
import dashboardStyles from "@/app/clinic-selection/[code]/dashboard/dashboard.module.css";
import shellStyles from "@/app/clinic-selection/[code]/shell.module.css";

/** Shared drawing primitives; each screen below composes its own page layout. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`rounded-md bg-[#e9edf2] ${className}`} />;
}

export function LoadingFrame({ name, children, className = "" }: { name: string; children: ReactNode; className?: string }) {
  useLoadingActivity();
  return (
    <div role="status" aria-busy="true" aria-label={`Loading ${name}`} className={`app-loading-frame w-full ${className}`}>
      <span className="sr-only">Loading {name}…</span>
      <div aria-hidden="true" className="flex w-full animate-pulse flex-col motion-reduce:animate-none">
        {children}
      </div>
    </div>
  );
}

function Header({ actions = 2, back = false, title = "w-64" }: { actions?: number; back?: boolean; title?: string }) {
  return (
    <div className="flex min-h-[40px] flex-wrap items-center justify-between gap-3.5">
      <div className="flex max-w-full items-center gap-3.5">
        {back && <Skeleton className="size-10 shrink-0 rounded-full" />}
        <Skeleton className={`h-10 max-w-full ${title}`} />
      </div>
      <div className="flex flex-wrap gap-3">
        {Array.from({ length: actions }, (_, i) => <Skeleton key={i} className={i === actions - 1 ? "h-[40px] w-44 rounded-full" : "size-[40px] rounded-full"} />)}
      </div>
    </div>
  );
}

export function StatsSkeleton() {
  return (
    <LoadingFrame name="appointment totals" className={dashboardStyles.statsFrame}>
      <div className={dashboardStyles.stats}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={`${dashboardStyles.statCard} flex flex-col justify-between rounded-[17px] border-[1.167px] border-transparent`}>
            <div className="space-y-3"><Skeleton className="h-11 w-20" /><Skeleton className="h-5 w-4/5" /></div>
            <div className="flex items-center justify-between"><Skeleton className="size-10 rounded-lg" /><Skeleton className="h-4 w-16" /></div>
          </div>
        ))}
      </div>
    </LoadingFrame>
  );
}

/** The column proportions and row heights match the destination's real table. */
export function TableSkeleton({ columns, rows = 6, rowHeight = 76 }: { columns: string; rows?: number; rowHeight?: number }) {
  const count = columns.split(" ").length;
  return (
    <div className="overflow-x-auto rounded-[24px] border-[1.167px] border-transparent">
      <div className="min-w-[680px]">
        <div className="app-table-header grid h-[44px] items-center gap-4 border-b-[1.167px] border-transparent px-5" style={{ gridTemplateColumns: columns }}>
          {Array.from({ length: count }, (_, i) => <Skeleton key={i} className="h-3 w-4/5" />)}
        </div>
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="grid items-center gap-4 border-b-[1.167px] border-transparent px-5 last:border-0" style={{ gridTemplateColumns: columns, minHeight: rowHeight }}>
            {Array.from({ length: count }, (_, col) => (
              <div key={col} className="space-y-2">
                <Skeleton className={`h-4 ${col === count - 1 ? "w-14 rounded-full" : row % 2 ? "w-3/5" : "w-4/5"}`} />
                {col === 1 && <Skeleton className="h-3 w-1/2" />}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const APPOINTMENTS_COLUMNS = "130fr 185fr 175fr 150fr 155fr 150fr 105fr 110fr";
const PATIENTS_COLUMNS = "104fr 198fr 150fr 212fr 94fr 204fr 164fr";
const DOCTORS_COLUMNS = "130fr 250fr 190fr 240fr 150fr";
const ACCOUNTS_COLUMNS = "185fr 300fr 169fr 138fr 154fr 125fr";
const REVENUE_COLUMNS = "150fr 150fr 165fr 110fr 120fr 130fr";

function SearchRow() {
  return <div className="flex items-center gap-3.5"><Skeleton className="h-[40px] flex-1 rounded-full" /><Skeleton className="h-6 w-28" /></div>;
}

function Pagination() {
  return <div className="mt-6 flex flex-wrap items-center justify-between gap-3.5"><Skeleton className="h-5 w-48" /><Skeleton className="h-10 w-56 rounded-full" /></div>;
}

export function AppointmentsSkeleton() {
  return <LoadingFrame name="appointments"><div className="flex flex-col gap-5"><Header actions={5} title="w-64" /><SearchRow /><TableSkeleton columns={APPOINTMENTS_COLUMNS} rowHeight={88} /><Pagination /></div></LoadingFrame>;
}

export function PatientsSkeleton() {
  return <LoadingFrame name="patients"><div className="flex flex-col gap-5"><Header actions={3} title="w-40" /><SearchRow /><TableSkeleton columns={PATIENTS_COLUMNS} /><Pagination /></div></LoadingFrame>;
}

export function DoctorsSkeleton() {
  return <LoadingFrame name="doctors"><div className="flex flex-col gap-5"><Header actions={3} title="w-40" /><SearchRow /><TableSkeleton columns={DOCTORS_COLUMNS} /><Pagination /></div></LoadingFrame>;
}

export function AccountsSkeleton() {
  return <LoadingFrame name="accounts"><div className="flex flex-col gap-8"><Header actions={0} title="w-96" /><TableSkeleton columns={ACCOUNTS_COLUMNS} rowHeight={82} /></div></LoadingFrame>;
}

export function CalendarGridSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className="overflow-hidden rounded-[17px] border-[1.167px] border-transparent">
      <div className="flex items-center justify-between gap-3.5 p-4"><Skeleton className="h-6 w-40" /><Skeleton className="h-8 w-20 rounded-full" /></div>
      <div className="app-table-header grid grid-cols-7 border-y-[1.167px] border-transparent p-3">
        {Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="mx-auto h-3 w-5" />)}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: 35 }, (_, i) => (
          <div key={i} className={`border-b-[1.167px] border-r-[1.167px] border-transparent p-2 ${compact ? "h-10" : "h-[104px] sm:h-[132px]"}`}>
            <Skeleton className="h-3 w-4" />
            {!compact && i % 4 === 0 && <Skeleton className="mt-4 h-5 w-full rounded" />}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardTableSkeleton() {
  return <LoadingFrame name="today’s appointments"><div className="flex min-w-0 flex-col gap-4"><div className="flex flex-wrap justify-between gap-3"><Skeleton className="h-8 w-60" /><Skeleton className="h-11 w-36 rounded-full" /></div><Skeleton className="h-10 w-full rounded-full" /><TableSkeleton columns="1.4fr 1.2fr 1.2fr 1fr 1fr" rows={4} rowHeight={62} /></div></LoadingFrame>;
}

export function DashboardSkeleton() {
  return <LoadingFrame name="dashboard"><div className={dashboardStyles.dashboard}><Header title="w-80" /><StatsSkeleton /><div className={dashboardStyles.lower}><div className={`${dashboardStyles.tableSection} ${dashboardStyles.tableLoading}`}><DashboardTableSkeleton /></div><div className={dashboardStyles.calendarSlot}><CalendarGridSkeleton compact /></div></div></div></LoadingFrame>;
}

export function CalendarSkeleton() {
  return <LoadingFrame name="calendar"><div className="flex flex-col gap-[16px]"><Header back actions={1} title="w-44" /><div className="flex flex-wrap justify-between gap-3.5"><Skeleton className="h-5 w-48" /><Skeleton className="h-5 w-64" /></div><CalendarGridSkeleton /></div></LoadingFrame>;
}

export function DonutSkeleton() {
  return <div className="flex flex-col items-center gap-4 py-3"><div className="size-[220px] max-w-full rounded-full bg-[#e9edf2] p-[34px] sm:size-[260px]"><div className="h-full w-full rounded-full bg-white" /></div><div className="flex justify-center gap-4"><Skeleton className="h-4 w-20" /><Skeleton className="h-4 w-20" /></div></div>;
}

function ChartCard() {
  return (
    <div className="flex h-[420px] min-w-0 flex-col gap-4 rounded-[20px] border-[1.167px] border-transparent p-4 sm:p-5">
      <div className="flex justify-between gap-3"><div className="flex-1 space-y-3"><Skeleton className="h-5 w-3/5" /><Skeleton className="h-3 w-4/5" /></div><Skeleton className="h-10 w-24 rounded-full" /></div>
      <DonutSkeleton />
    </div>
  );
}

export function RevenueBarChartSkeleton() {
  return (
    <div className="flex h-[420px] min-w-0 flex-col rounded-[20px] border-[1.167px] border-transparent p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>
      <Skeleton className="mt-3 h-9 w-full rounded-lg" />
      <Skeleton className="mt-3 h-3 w-32" />
      <div className="mt-2 flex items-end justify-between gap-3.5">
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-7 w-28" />
      </div>
      <div className="mt-5 min-h-0 flex-1">
        <svg aria-hidden="true" viewBox="0 0 560 176" preserveAspectRatio="none" className="h-full w-full">
          {[8, 45, 82, 119, 156].map((y) => (
            <g key={y}>
              <rect x="4" y={y - 3} width="30" height="6" rx="2" fill="#e9edf2" />
            </g>
          ))}
          {[54, 94, 72, 126, 88, 141, 106].map((height, index) => {
            const x = 48 + (500 / 7) * (index + 0.5);
            return (
              <g key={index}>
                <rect x={x - 4.5} y={156 - height} width="9" height={height} rx="4.5" fill="#dfe4eb" />
                <rect x={x - 11} y="166" width="22" height="6" rx="2" fill="#e9edf2" />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export function AnalyticsSkeleton() {
  return <LoadingFrame name="insights"><div className="flex flex-col gap-[40px]"><Header title="w-80" /><StatsSkeleton /><div className="flex flex-col gap-6"><Skeleton className="h-[40px] w-[530px] max-w-full rounded-full" /><div className="app-toolbar flex gap-3"><Skeleton className="h-10 w-48 rounded-full" /><Skeleton className="h-10 w-32 rounded-full" /></div><div className="app-chart-grid gap-6"><ChartCard /></div></div></div></LoadingFrame>;
}

export function RevenueSkeleton() {
  return <LoadingFrame name="revenue"><div className="flex flex-col gap-8"><Header actions={1} title="w-80" /><div className="app-chart-grid gap-5"><RevenueBarChartSkeleton /><ChartCard /></div><div className="flex flex-col gap-5"><Header title="w-72" /><Skeleton className="h-[40px] w-full max-w-[540px] rounded-full" /><TableSkeleton columns={REVENUE_COLUMNS} rows={4} /></div></div></LoadingFrame>;
}

function FormFields({ count }: { count: number }) {
  return <div className="app-form-grid gap-x-5 gap-y-[15px]">{Array.from({ length: count }, (_, i) => <div key={i} className="space-y-3"><Skeleton className="h-3 w-28" /><Skeleton className="h-10 w-full rounded-lg" /></div>)}</div>;
}

function FormCard({ children }: { children: ReactNode }) {
  return <div className="app-form-surface app-record-card space-y-5 rounded-[14px] border-[1.167px] border-transparent"><Skeleton className="h-7 w-48" /><div className="border-b-[1.167px] border-transparent" />{children}</div>;
}

export function ProfileSkeleton() {
  return <LoadingFrame name="profile settings"><div className="flex flex-col gap-7"><Header actions={0} title="w-72" /><div className="app-profile-grid gap-6"><div className="flex flex-col items-center justify-center gap-4 rounded-[14px] border-[1.167px] border-transparent p-[22px]"><Skeleton className="size-28 rounded-full" /><Skeleton className="h-6 w-40" /><Skeleton className="h-4 w-24" /><Skeleton className="h-10 w-48 rounded-full" /></div><FormCard><FormFields count={4} /><Skeleton className="h-10 w-44 rounded-full" /></FormCard></div><FormCard><FormFields count={3} /><Skeleton className="h-10 w-44 rounded-full" /></FormCard><div className="app-details-grid gap-6"><FormCard><Skeleton className="h-10 w-40 rounded-full" /></FormCard><FormCard><Skeleton className="h-10 w-40 rounded-full" /></FormCard></div></div></LoadingFrame>;
}

export function ShiftSkeleton() {
  return <LoadingFrame name="doctor shifts"><div className="flex flex-col gap-7"><Header back actions={0} title="w-80" /><FormFields count={4} /><Skeleton className="h-8 w-44" /><div className="app-details-grid gap-7"><CalendarGridSkeleton compact /><div className="space-y-5"><FormFields count={3} /><Skeleton className="h-10 w-40 rounded-full" /></div></div><TableSkeleton columns="1fr 2fr 2fr 1fr" rows={3} /></div></LoadingFrame>;
}

export function PatientHistorySkeleton() {
  return <LoadingFrame name="patient history"><div className="flex flex-col gap-8"><Header back actions={1} title="w-96" /><Skeleton className="h-4 w-[520px] max-w-full" />{[0, 1].map(i => <div key={i} className="space-y-5 rounded-[17px] border-[1.167px] border-transparent p-5"><div className="flex justify-between gap-3.5"><Skeleton className="h-7 w-44" /><Skeleton className="h-5 w-40" /></div><Skeleton className="h-10 w-[560px] max-w-full rounded-full" /><div className="space-y-3.5"><Skeleton className="h-4 w-4/5" /><Skeleton className="h-4 w-3/5" /></div></div>)}</div></LoadingFrame>;
}

export function BranchListSkeleton() {
  return <div className="flex flex-col gap-4"><div className="flex flex-wrap justify-between gap-3.5"><Skeleton className="h-8 w-48" /><Skeleton className="h-[40px] w-full rounded-full sm:w-[340px]" /></div>{[0, 1, 2].map(i => <div key={i} className="grid grid-cols-1 items-center gap-4 rounded-[17px] border-[1.167px] border-transparent p-6 lg:grid-cols-[451fr_326fr_283fr_208fr]"><div className="space-y-3"><Skeleton className="h-6 w-4/5" /><Skeleton className="h-4 w-20" /></div><Skeleton className="h-5 w-3/5" /><Skeleton className="h-5 w-4/5" /><Skeleton className="h-11 w-28 rounded-full" /></div>)}</div>;
}

export function OverallAnalyticsSkeleton() {
  return <LoadingFrame name="overall analytics"><div className="mt-8 flex flex-col gap-5"><Skeleton className="h-8 w-60" /><Skeleton className="h-10 w-64 rounded-full" /><div className="app-toolbar flex gap-3"><Skeleton className="h-10 w-40 rounded-full" /><Skeleton className="h-10 w-32 rounded-full" /></div><div className="app-chart-grid gap-6"><ChartCard /></div></div></LoadingFrame>;
}

export function ClinicSelectionSkeleton({ variant = "session" }: { variant?: "session" | "clinic" | "super" }) {
  return <div className="min-h-dvh bg-white"><div className="mx-auto max-w-[1402px] p-5 md:p-6"><LoadingFrame name={variant === "super" ? "clinics" : "clinic branches"}><div className="flex flex-col gap-8"><Header actions={variant === "super" ? 2 : 1} title="w-80" /><BranchListSkeleton />{variant === "clinic" && <OverallAnalyticsSkeleton />}</div></LoadingFrame></div></div>;
}

export function AuthSkeleton({ reset = false }: { reset?: boolean }) {
  return <FitToViewport className="bg-ink"><div className="flex w-full flex-col items-center gap-7 px-2 sm:gap-10 sm:px-3.5"><div className={AUTH_CARD_CLASS_NAME} style={{ borderColor: "transparent", boxShadow: "none" }}><LoadingFrame name={reset ? "password reset" : "sign in"}><div className="flex flex-col gap-5">{!reset && <Skeleton className="mx-auto size-16 rounded-[14px]" />}<Skeleton className="mx-auto h-11 w-48" /><Skeleton className="mx-auto h-4 w-64 max-w-full" />{!reset && <div className="flex gap-3.5 border-b-[1.167px] border-transparent pb-3.5"><Skeleton className="h-4 flex-1" /><Skeleton className="h-4 flex-1" /></div>}{Array.from({ length: reset ? 1 : 2 }, (_, i) => <div key={i} className="space-y-3"><Skeleton className="h-3 w-28" /><Skeleton className="h-[44px] w-full rounded-lg" /></div>)}<Skeleton className="h-10 w-full rounded-lg" /><Skeleton className="mx-auto h-4 w-32" /></div></LoadingFrame></div><Skeleton className="h-4 w-64 opacity-30" /></div></FitToViewport>;
}

/** Matches the sidebar's responsive width, logo, icon/label rows and account chip. */
export function SidebarSkeleton({ itemCount = 6, collapsed = false }: { itemCount?: number; collapsed?: boolean }) {
  const labelWidths = ["w-24", "w-28", "w-20", "w-20", "w-20", "w-20"];
  return (
    <aside className={`${shellStyles.sidebar} flex shrink-0 flex-col overflow-x-hidden overflow-y-auto motion-reduce:transition-none`}>
      <LoadingFrame name="navigation" className="h-full [&>div]:h-full">
        <div className="flex h-full flex-col">
          <div className={`${shellStyles.logo} flex items-center gap-2 ${collapsed ? "justify-center" : "pl-[12px]"}`}>
            <Skeleton className="size-8 shrink-0 rounded-xl opacity-20" />
            {!collapsed && <Skeleton className={`${shellStyles.placeholderLabel} h-6 w-[100px] opacity-20`} />}
          </div>
          <div className={`${shellStyles.nav} flex flex-1 flex-col`}>
            {Array.from({ length: itemCount }, (_, i) => (
              <div key={i} className={`flex items-center gap-3 py-[10px] ${collapsed ? "justify-center px-2" : "px-3"}`}>
                <Skeleton className="size-5 shrink-0 opacity-20" />
                {!collapsed && <Skeleton className={`${shellStyles.placeholderLabel} h-4 opacity-20 ${labelWidths[i] ?? "w-20"}`} />}
              </div>
            ))}
          </div>
          <div className={`flex items-center rounded-full bg-white/5 ${collapsed ? "size-[40px] justify-center p-0" : "gap-[8px] p-2"}`}>
            <Skeleton className="size-[32px] shrink-0 rounded-full opacity-20" />
            {!collapsed && <><Skeleton className={`${shellStyles.placeholderLabel} h-4 flex-1 opacity-20`} /><Skeleton className={`${shellStyles.placeholderLabel} size-4 opacity-20`} /></>}
          </div>
          {!collapsed && <><Skeleton className={`${shellStyles.placeholderLabel} ml-1 mt-1.5 h-[10px] w-40 max-w-full opacity-15`} /><Skeleton className={`${shellStyles.placeholderLabel} mt-3 h-[10px] w-full opacity-15`} /></>}
        </div>
      </LoadingFrame>
    </aside>
  );
}

/** The sidebar frame is only needed while the session/shared layout loads. */
export function DashboardShellSkeleton({ children }: { children: ReactNode }) {
  return <div className={shellStyles.shell}><div className={`${shellStyles.sidebarSlot} ${shellStyles.placeholderSlot}`}><SidebarSkeleton /></div><main className={shellStyles.main}><div className="flex h-full flex-col overflow-hidden rounded-[28px] bg-white"><div className={shellStyles.scrollPanel}><div className={shellStyles.content}>{children}</div></div></div></main></div>;
}
