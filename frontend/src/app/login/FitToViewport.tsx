"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Scales its content down uniformly so it always fits within the viewport,
 * eliminating page scroll. The content is measured at its natural size
 * (offsetWidth/Height ignore CSS transforms, so there's no feedback loop) and a
 * single `scale` transform is applied. Never scales above 1 (no upscaling).
 */
export default function FitToViewport({
  children,
  className = "",
  padding = 24,
  fill = 0.94,
}: {
  children: ReactNode;
  className?: string;
  /** Breathing room (px) kept between the content and the viewport edges. */
  padding?: number;
  /**
   * Fraction of the available space the content is allowed to occupy (0–1).
   * Below 1 it scales the content down further so there's clear empty space
   * around it — including above and below.
   */
  fill?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const compute = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (!w || !h) return;
      // Fit inside the viewport minus the padding, then shrink further by `fill`
      // so the content is noticeably smaller and leaves space top and bottom.
      const availW = window.innerWidth - padding * 2;
      const availH = window.innerHeight - padding * 2;
      setScale(Math.min(1, (availW / w) * fill, (availH / h) * fill));
    };

    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(el);
    window.addEventListener("resize", compute);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", compute);
    };
  }, [padding, fill]);

  return (
    <div
      style={{ padding }}
      className={`flex h-dvh w-full items-center justify-center overflow-hidden ${className}`}
    >
      <div ref={ref} style={{ transform: `scale(${scale})` }} className="origin-center">
        {children}
      </div>
    </div>
  );
}
