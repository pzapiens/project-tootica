/**
 * Route-transition wireframe. As a `loading.tsx` at the `[code]` segment, Next
 * renders this as the Suspense fallback whenever you navigate between the
 * dashboard's pages (Dashboard, Appointments, Patients, …) — the sidebar/shell
 * stays put and this skeleton fills the content panel until the new page is
 * ready. Generic on purpose so it fits every page; the pulsing blocks read as
 * "content loading" without mimicking one specific layout.
 */
export default function DashboardLoading() {
  return (
    <div
      aria-hidden
      className="flex animate-pulse flex-col gap-[28px] motion-reduce:animate-none"
    >
      {/* Header: title + a couple of controls on the right */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Block className="h-[42px] w-[280px] rounded-[10px]" />
        <div className="flex items-center gap-[18px]">
          <Block className="h-[54px] w-[120px] rounded-full" />
          <Block className="h-[54px] w-[190px] rounded-full" />
        </div>
      </div>

      {/* Row of 4 stat cards */}
      <div className="flex flex-wrap gap-[28px] xl:flex-nowrap">
        {Array.from({ length: 4 }).map((_, i) => (
          <Block key={i} className="h-[224px] min-w-[220px] flex-1 rounded-[28px]" />
        ))}
      </div>

      {/* Lower area: a wide table panel beside a calendar block */}
      <div className="flex flex-col gap-[37px] xl:flex-row xl:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex items-center justify-between">
            <Block className="h-[33px] w-[240px] rounded-[8px]" />
            <Block className="h-[45px] w-[200px] rounded-full" />
          </div>
          <div className="flex flex-col gap-3 rounded-[18px] border border-[#eef1f6] p-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Block key={i} className="h-[46px] w-full rounded-[10px]" />
            ))}
          </div>
        </div>
        <Block className="h-[360px] w-full rounded-[18px] xl:w-[360px]" />
      </div>
    </div>
  );
}

/** A single neutral placeholder block. */
function Block({ className }: { className?: string }) {
  return <div className={`bg-[#eef1f6] ${className ?? ""}`} />;
}
