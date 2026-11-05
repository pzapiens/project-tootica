"use client";

import type { ReactNode } from "react";
import { useLoadingActivity } from "./LoadingActivity";

/** Shared drawing primitives; each screen below composes its own page layout. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`rounded-md bg-[#e9edf2] ${className}`} />;
}

export function LoadingFrame({ name, children, className = "" }: { name: string; children: ReactNode; className?: string }) {
  useLoadingActivity();
  return (
    <div role="status" aria-busy="true" aria-label={`Loading ${name}`} className={`w-full ${className}`}>
      <span className="sr-only">Loading {name}…</span>
      <div aria-hidden="true" className="flex w-full animate-pulse flex-col motion-reduce:animate-none">
        {children}
      </div>
    </div>
  );
}

function Header({ actions = 2, back = false, title = "w-64" }: { actions?: number; back?: boolean; title?: string }) {
  return (
    <div className="flex min-h-[54px] flex-wrap items-center justify-between gap-4">
      <div className="flex max-w-full items-center gap-4">
        {back && <Skeleton className="size-10 shrink-0 rounded-full" />}
        <Skeleton className={`h-10 max-w-full ${title}`} />
      </div>
      <div className="flex flex-wrap gap-3">
        {Array.from({ length: actions }, (_, i) => <Skeleton key={i} className={i === actions - 1 ? "h-[54px] w-44 rounded-full" : "size-[54px] rounded-full"} />)}
      </div>
    </div>
  );
}

export function StatsSkeleton() {
  return (
    <LoadingFrame name="appointment totals">
      <div className="flex flex-wrap gap-[28px] xl:flex-nowrap">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex h-[200px] min-w-[220px] flex-1 flex-col justify-between rounded-[28px] border border-[#e3e8ee] p-6">
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
    <div className="overflow-x-auto rounded-[28px] border border-[#dfe4eb]">
      <div className="min-w-[680px]">
        <div className="grid h-[60px] items-center gap-5 border-b border-[#e3e8ee] px-6" style={{ gridTemplateColumns: columns }}>
          {Array.from({ length: count }, (_, i) => <Skeleton key={i} className="h-3 w-4/5" />)}
        </div>
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="grid items-center gap-5 border-b border-[#edf0f4] px-6 last:border-0" style={{ gridTemplateColumns: columns, minHeight: rowHeight }}>
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
  return <div className="flex items-center gap-4"><Skeleton className="h-[54px] flex-1 rounded-full" /><Skeleton className="h-6 w-28" /></div>;
}

function Pagination() {
  return <div className="mt-6 flex flex-wrap items-center justify-between gap-4"><Skeleton className="h-5 w-48" /><Skeleton className="h-10 w-56 rounded-full" /></div>;
}

export function AppointmentsSkeleton() {
  return <LoadingFrame name="appointments"><div className="flex flex-col gap-6"><Header actions={5} title="w-64" /><SearchRow /><TableSkeleton columns={APPOINTMENTS_COLUMNS} rowHeight={88} /><Pagination /></div></LoadingFrame>;
}

export function PatientsSkeleton() {
  return <LoadingFrame name="patients"><div className="flex flex-col gap-6"><Header actions={3} title="w-40" /><SearchRow /><TableSkeleton columns={PATIENTS_COLUMNS} /><Pagination /></div></LoadingFrame>;
}

export function DoctorsSkeleton() {
  return <LoadingFrame name="doctors"><div className="flex flex-col gap-6"><Header actions={3} title="w-40" /><SearchRow /><TableSkeleton columns={DOCTORS_COLUMNS} /><Pagination /></div></LoadingFrame>;
}

export function AccountsSkeleton() {
  return <LoadingFrame name="accounts"><div className="flex flex-col gap-10"><Header actions={0} title="w-96" /><TableSkeleton columns={ACCOUNTS_COLUMNS} rowHeight={82} /></div></LoadingFrame>;
}

export function CalendarGridSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className="overflow-hidden rounded-[20px] border border-[#dfe4eb]">
      <div className="flex items-center justify-between gap-4 p-5"><Skeleton className="h-6 w-40" /><Skeleton className="h-8 w-20 rounded-full" /></div>
      <div className="grid grid-cols-7 border-y border-[#e3e8ee] p-3">
        {Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="mx-auto h-3 w-5" />)}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: 35 }, (_, i) => (
          <div key={i} className={`border-b border-r border-[#edf0f4] p-2 ${compact ? "h-12" : "h-[104px] sm:h-[132px]"}`}>
            <Skeleton className="h-3 w-4" />
            {!compact && i % 4 === 0 && <Skeleton className="mt-4 h-5 w-full rounded" />}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardTableSkeleton() {
  return <LoadingFrame name="today’s appointments"><div className="flex min-w-0 flex-col gap-5"><div className="flex flex-wrap justify-between gap-3"><Skeleton className="h-8 w-60" /><Skeleton className="h-11 w-36 rounded-full" /></div><Skeleton className="h-12 w-full rounded-full" /><TableSkeleton columns="1.4fr 1.2fr 1.2fr 1fr 1fr" rows={4} rowHeight={62} /></div></LoadingFrame>;
}

export function DashboardSkeleton() {
  return <LoadingFrame name="dashboard"><div className="flex flex-col gap-[28px]"><Header title="w-80" /><StatsSkeleton /><div className="flex flex-col items-stretch gap-[37px] xl:flex-row xl:items-start"><div className="min-w-0 flex-1"><DashboardTableSkeleton /></div><div className="w-full shrink-0 xl:w-[360px]"><CalendarGridSkeleton compact /></div></div></div></LoadingFrame>;
}

export function CalendarSkeleton() {
  return <LoadingFrame name="calendar"><div className="flex flex-col gap-[19px]"><Header back actions={1} title="w-44" /><div className="flex flex-wrap justify-between gap-4"><Skeleton className="h-5 w-48" /><Skeleton className="h-5 w-64" /></div><CalendarGridSkeleton /></div></LoadingFrame>;
}

export function DonutSkeleton() {
  return <div className="flex flex-col items-center gap-5 py-3"><div className="size-[220px] max-w-full rounded-full border-[34px] border-[#e9edf2] sm:size-[260px]" /><div className="flex justify-center gap-5"><Skeleton className="h-4 w-20" /><Skeleton className="h-4 w-20" /></div></div>;
}

function ChartCard() {
  return (
    <div className="flex h-[420px] min-w-0 flex-col gap-5 rounded-[24px] border border-[#dfe4eb] p-5 sm:p-6">
      <div className="flex justify-between gap-3"><div className="flex-1 space-y-3"><Skeleton className="h-5 w-3/5" /><Skeleton className="h-3 w-4/5" /></div><Skeleton className="h-10 w-24 rounded-full" /></div>
      <DonutSkeleton />
    </div>
  );
}

export function RevenueBarChartSkeleton() {
  return (
    <div className="flex h-[420px] min-w-0 flex-col rounded-[24px] border border-[#dfe4eb] p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>
      <Skeleton className="mt-3 h-9 w-full rounded-lg" />
      <Skeleton className="mt-3 h-3 w-32" />
      <div className="mt-2 flex items-end justify-between gap-4">
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-7 w-28" />
      </div>
      <div className="mt-5 min-h-0 flex-1">
        <svg aria-hidden="true" viewBox="0 0 560 176" preserveAspectRatio="none" className="h-full w-full">
          {[8, 45, 82, 119, 156].map((y) => (
            <g key={y}>
              <line x1="48" x2="548" y1={y} y2={y} stroke="#e3e8ee" strokeDasharray={y === 156 ? undefined : "3 4"} />
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
  return <LoadingFrame name="insights"><div className="flex flex-col gap-[48px]"><Header title="w-80" /><StatsSkeleton /><div className="flex flex-col gap-7"><Skeleton className="h-[54px] w-[530px] max-w-full rounded-full" /><div className="flex gap-3"><Skeleton className="h-12 w-48 rounded-full" /><Skeleton className="h-12 w-32 rounded-full" /></div><div className="grid grid-cols-1 gap-7 xl:grid-cols-2"><ChartCard /></div></div></div></LoadingFrame>;
}

export function RevenueSkeleton() {
  return <LoadingFrame name="revenue"><div className="flex flex-col gap-10"><Header actions={1} title="w-80" /><div className="grid grid-cols-1 gap-6 xl:grid-cols-2"><RevenueBarChartSkeleton /><ChartCard /></div><div className="flex flex-col gap-6"><Header title="w-72" /><Skeleton className="h-[54px] w-full max-w-[540px] rounded-full" /><TableSkeleton columns={REVENUE_COLUMNS} rows={4} /></div></div></LoadingFrame>;
}

function FormFields({ count }: { count: number }) {
  return <div className="grid grid-cols-1 gap-x-6 gap-y-[18px] sm:grid-cols-2">{Array.from({ length: count }, (_, i) => <div key={i} className="space-y-3"><Skeleton className="h-3 w-28" /><Skeleton className="h-12 w-full rounded-lg" /></div>)}</div>;
}

function FormCard({ children }: { children: ReactNode }) {
  return <div className="space-y-6 rounded-2xl border border-[#dfe4eb] p-[26px]"><Skeleton className="h-7 w-48" /><div className="border-b border-[#e3e8ee]" />{children}</div>;
}

export function ProfileSkeleton() {
  return <LoadingFrame name="profile settings"><div className="flex flex-col gap-8"><Header actions={0} title="w-72" /><div className="grid grid-cols-1 gap-7 lg:grid-cols-[340px_minmax(0,1fr)]"><div className="flex flex-col items-center justify-center gap-5 rounded-2xl border border-[#dfe4eb] p-[26px]"><Skeleton className="size-28 rounded-full" /><Skeleton className="h-6 w-40" /><Skeleton className="h-4 w-24" /><Skeleton className="h-10 w-48 rounded-full" /></div><FormCard><FormFields count={4} /><Skeleton className="h-12 w-44 rounded-full" /></FormCard></div><FormCard><FormFields count={3} /><Skeleton className="h-12 w-44 rounded-full" /></FormCard><div className="grid grid-cols-1 gap-7 lg:grid-cols-2"><FormCard><Skeleton className="h-12 w-40 rounded-full" /></FormCard><FormCard><Skeleton className="h-12 w-40 rounded-full" /></FormCard></div></div></LoadingFrame>;
}

export function ShiftSkeleton() {
  return <LoadingFrame name="doctor shifts"><div className="flex flex-col gap-8"><Header back actions={0} title="w-80" /><FormFields count={4} /><Skeleton className="h-8 w-44" /><div className="grid grid-cols-1 gap-8 lg:grid-cols-[360px_minmax(0,1fr)]"><CalendarGridSkeleton compact /><div className="space-y-6"><FormFields count={3} /><Skeleton className="h-12 w-40 rounded-full" /></div></div><TableSkeleton columns="1fr 2fr 2fr 1fr" rows={3} /></div></LoadingFrame>;
}

export function PatientHistorySkeleton() {
  return <LoadingFrame name="patient history"><div className="flex flex-col gap-10"><Header back actions={1} title="w-96" /><Skeleton className="h-4 w-[520px] max-w-full" />{[0, 1].map(i => <div key={i} className="space-y-6 rounded-[20px] border border-[#dfe4eb] p-6"><div className="flex justify-between gap-4"><Skeleton className="h-7 w-44" /><Skeleton className="h-5 w-40" /></div><Skeleton className="h-12 w-[560px] max-w-full rounded-full" /><div className="space-y-4"><Skeleton className="h-4 w-4/5" /><Skeleton className="h-4 w-3/5" /></div></div>)}</div></LoadingFrame>;
}

export function BranchListSkeleton() {
  return <div className="flex flex-col gap-5"><div className="flex flex-wrap justify-between gap-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-[54px] w-full rounded-full sm:w-[340px]" /></div>{[0, 1, 2].map(i => <div key={i} className="grid grid-cols-1 items-center gap-5 rounded-[20px] border border-[#dfe4eb] p-7 lg:grid-cols-[451fr_326fr_283fr_208fr]"><div className="space-y-3"><Skeleton className="h-6 w-4/5" /><Skeleton className="h-4 w-20" /></div><Skeleton className="h-5 w-3/5" /><Skeleton className="h-5 w-4/5" /><Skeleton className="h-11 w-28 rounded-full" /></div>)}</div>;
}

export function OverallAnalyticsSkeleton() {
  return <LoadingFrame name="overall analytics"><div className="mt-8 flex flex-col gap-6"><Skeleton className="h-8 w-60" /><Skeleton className="h-12 w-64 rounded-full" /><div className="flex gap-3"><Skeleton className="h-12 w-40 rounded-full" /><Skeleton className="h-12 w-32 rounded-full" /></div><div className="grid grid-cols-1 gap-7 xl:grid-cols-2"><ChartCard /></div></div></LoadingFrame>;
}

export function ClinicSelectionSkeleton({ variant = "session" }: { variant?: "session" | "clinic" | "super" }) {
  return <div className="min-h-dvh bg-white"><div className="mx-auto max-w-[1402px] p-6 md:p-7"><LoadingFrame name={variant === "super" ? "clinics" : "clinic branches"}><div className="flex flex-col gap-10"><Header actions={variant === "super" ? 2 : 1} title="w-80" /><BranchListSkeleton />{variant === "clinic" && <OverallAnalyticsSkeleton />}</div></LoadingFrame></div></div>;
}

export function AuthSkeleton({ reset = false }: { reset?: boolean }) {
  return <div className="flex min-h-dvh items-center justify-center bg-ink px-4 py-8"><div className="flex w-full max-w-[460px] flex-col items-center gap-12"><div className="w-full rounded-3xl bg-white px-10 py-8"><LoadingFrame name={reset ? "password reset" : "sign in"}><div className="flex flex-col gap-6"><Skeleton className="mx-auto size-20 rounded-2xl" /><Skeleton className="mx-auto h-11 w-48" /><Skeleton className="mx-auto h-4 w-64 max-w-full" />{!reset && <div className="flex gap-4 border-b border-[#e3e8ee] pb-4"><Skeleton className="h-4 flex-1" /><Skeleton className="h-4 flex-1" /></div>}{Array.from({ length: reset ? 1 : 2 }, (_, i) => <div key={i} className="space-y-3"><Skeleton className="h-3 w-28" /><Skeleton className="h-[58px] w-full rounded-lg" /></div>)}<Skeleton className="h-14 w-full rounded-lg" /><Skeleton className="mx-auto h-4 w-32" /></div></LoadingFrame></div><Skeleton className="h-4 w-64 opacity-30" /></div></div>;
}

/** Matches the sidebar's scaled width, logo, icon/label rows and account chip. */
export function SidebarSkeleton({ itemCount = 6, collapsed = false }: { itemCount?: number; collapsed?: boolean }) {
  const labelWidths = ["w-24", "w-28", "w-20", "w-20", "w-20", "w-20"];
  return (
    <aside className={`flex h-[calc(100dvh/0.9)] shrink-0 flex-col overflow-x-hidden overflow-y-auto px-[16px] py-[32px] transition-[width] duration-300 ease-in-out motion-reduce:transition-none [zoom:0.9] ${collapsed ? "w-[80px]" : "w-[271px]"}`}>
      <LoadingFrame name="navigation" className="h-full [&>div]:h-full">
        <div className="flex h-full flex-col">
          <div className={`flex items-center gap-2 pb-[48px] ${collapsed ? "justify-center" : "pl-[15px]"}`}>
            <Skeleton className="size-10 shrink-0 rounded-xl opacity-20" />
            {!collapsed && <Skeleton className="h-7 w-[118px] opacity-20" />}
          </div>
          <div className="flex flex-1 flex-col gap-[24px]">
            {Array.from({ length: itemCount }, (_, i) => (
              <div key={i} className={`flex items-center gap-4 py-3 ${collapsed ? "justify-center px-3" : "px-4"}`}>
                <Skeleton className="size-6 shrink-0 opacity-20" />
                {!collapsed && <Skeleton className={`h-4 opacity-20 ${labelWidths[i] ?? "w-20"}`} />}
              </div>
            ))}
          </div>
          <div className={`flex items-center gap-[10px] rounded-full bg-white/5 py-3 ${collapsed ? "justify-center px-1" : "px-4"}`}>
            <Skeleton className="size-[37px] shrink-0 rounded-full opacity-20" />
            {!collapsed && <><Skeleton className="h-4 flex-1 opacity-20" /><Skeleton className="size-4 opacity-20" /></>}
          </div>
          {!collapsed && <><Skeleton className="ml-4 mt-2 h-[14px] w-40 opacity-15" /><Skeleton className="mt-4 h-[18px] w-full opacity-15" /></>}
        </div>
      </LoadingFrame>
    </aside>
  );
}

/** The sidebar frame is only needed while the session/shared layout loads. */
export function DashboardShellSkeleton({ children }: { children: ReactNode }) {
  return <div className="flex h-dvh overflow-hidden bg-[#1e1e24]"><SidebarSkeleton /><main className="min-w-0 flex-1 p-[19px]"><div className="h-full overflow-y-auto rounded-[28px] bg-white p-6 md:p-[42px]"><div className="[zoom:0.9]">{children}</div></div></main></div>;
}
