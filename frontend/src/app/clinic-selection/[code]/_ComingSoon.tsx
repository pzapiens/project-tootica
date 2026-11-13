/**
 * Temporary placeholder for dashboard nav destinations that haven't been built
 * frame-by-frame yet. Keeps the sidebar links valid while the screens land.
 */
export default function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-inter text-[31px] font-semibold leading-[37px] text-[#1e1e24]">
        {title}
      </h1>
      <p className="font-inter text-[14px] text-[#94a3b8]">Coming soon.</p>
    </div>
  );
}
