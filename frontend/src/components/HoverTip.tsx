"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Small dark hover tooltip shown above (default) or below the icon button it
 * labels. Place it as a child of the trigger element (the button/element it
 * describes); that parent is used as the anchor.
 *
 * The tooltip is rendered in a portal to <body> with fixed positioning, so it
 * overlays everything and is never clipped by an ancestor's `overflow:hidden`
 * or scroll container (e.g. the dashboard appointments table, whose body
 * scrolls). Used app-wide to label icon-only actions (Edit, Delete, Filter,
 * Export, …) consistently.
 */
export function Tip({ label, below }: { label: string; below?: boolean }) {
  // A zero-size placeholder rendered in the trigger; its parent IS the trigger.
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const trigger = anchorRef.current?.parentElement;
    if (!trigger) return;

    const show = () => setRect(trigger.getBoundingClientRect());
    const hide = () => setRect(null);

    trigger.addEventListener("mouseenter", show);
    trigger.addEventListener("mouseleave", hide);
    // The tooltip is positioned to the viewport, so drop it if anything scrolls
    // (capture: also catches nested scroll containers) or the window resizes.
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      trigger.removeEventListener("mouseenter", show);
      trigger.removeEventListener("mouseleave", hide);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, []);

  // Fade in once positioned; it unmounts on hide, so no fade-out is needed.
  useEffect(() => {
    if (!rect) {
      setShown(false);
      return;
    }
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [rect]);

  return (
    <span ref={anchorRef} aria-hidden className="hidden">
      {rect &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            role="tooltip"
            style={{
              position: "fixed",
              left: rect.left + rect.width / 2,
              top: below ? rect.bottom + 6 : rect.top - 6,
              transform: below ? "translateX(-50%)" : "translate(-50%, -100%)",
            }}
            className={`pointer-events-none z-[9999] whitespace-nowrap rounded-[6px] bg-[#1e1e24] px-[8px] py-[4px] font-inter text-[12px] font-medium leading-[16px] text-white shadow-[0px_4px_12px_rgba(0,0,0,0.15)] transition-opacity duration-150 ${
              shown ? "opacity-100" : "opacity-0"
            }`}
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  );
}
