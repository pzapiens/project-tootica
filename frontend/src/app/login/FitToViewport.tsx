import type { ReactNode } from "react";

/** Keep authentication readable; short screens scroll instead of shrinking text. */
export default function FitToViewport({ children, className = "", padding = 24 }: {
  children: ReactNode;
  className?: string;
  padding?: number;
}) {
  return (
    <div style={{ padding: `min(${padding}px, 4vw)` }} className={`flex min-h-dvh w-full flex-col overflow-x-clip ${className}`}>
      <div className="my-auto w-full max-w-[492px] self-center py-2.5">{children}</div>
    </div>
  );
}
