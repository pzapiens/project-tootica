"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Notification bell for the dashboard header. A circular outlined icon button
 * (same design language as the Patients page Filter/Export buttons) that opens a
 * popup listing notifications, each with a "Review" action. A red dot sits above
 * the bell whenever there are notifications left, and "Clear all" empties them.
 *
 * The list is seeded with dummy data for now — swap `initialNotifications` for a
 * real feed once the backend endpoint exists.
 */

interface NotificationItem {
  id: string;
  /** The message shown to the user. */
  text: string;
  /** Relative time label (dummy). */
  time: string;
}

const initialNotifications: NotificationItem[] = [
  { id: "n1", text: "Rahul K appointment booking is awaiting", time: "2 min ago" },
  { id: "n2", text: "Priya S appointment booking is awaiting", time: "15 min ago" },
  { id: "n3", text: "Arjun M appointment booking is awaiting", time: "1 hr ago" },
  { id: "n4", text: "Sneha R appointment booking is awaiting", time: "2 hr ago" },
];

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>(initialNotifications);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const hasNew = items.length > 0;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={hasNew ? `Notifications (${items.length} new)` : "Notifications"}
        onClick={() => setOpen((v) => !v)}
        className="relative flex size-[55px] items-center justify-center rounded-full border-[1.4px] border-[#c2c6d4] transition-colors hover:border-[#0077c0]"
      >
        <BellIcon className="size-7 text-[#1e1e24]" />
        {hasNew && (
          <span className="absolute right-[13px] top-[13px] size-[10px] rounded-full border-2 border-white bg-[#e5484d]" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+12px)] z-50 w-[460px] overflow-hidden rounded-[20px] border border-[#e5e7eb] bg-white shadow-[0px_12px_32px_-8px_rgba(0,0,0,0.18)]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#eef0f4] px-[20px] py-[16px]">
            <h2 className="font-manrope text-[18px] font-semibold text-[#1e1e24]">
              Notifications
            </h2>
            {items.length > 0 && (
              <button
                type="button"
                onClick={() => setItems([])}
                className="font-inter text-[13px] font-semibold text-[#0077c0] transition-opacity hover:opacity-80"
              >
                Clear all
              </button>
            )}
          </div>

          {/* List */}
          {items.length === 0 ? (
            <div className="px-[20px] py-[40px] text-center">
              <p className="font-inter text-[14px] text-[#94a3b8]">
                You&apos;re all caught up.
              </p>
            </div>
          ) : (
            <ul className="max-h-[264px] overflow-y-auto">
              {items.map((n) => (
                <li
                  key={n.id}
                  className="flex items-center gap-[12px] border-b border-[#f2f4f7] px-[20px] py-[16px] last:border-b-0"
                >
                  <span className="flex size-[36px] shrink-0 items-center justify-center rounded-full bg-[#eaf4fb]">
                    <BellIcon className="size-[18px] text-[#0077c0]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-inter text-[14px] leading-[20px] text-[#1e1e24]">
                      {n.text}
                    </p>
                    <p className="mt-[4px] font-inter text-[12px] text-[#94a3b8]">
                      {n.time}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setItems((prev) => prev.filter((x) => x.id !== n.id))
                    }
                    className="shrink-0 rounded-full bg-[#0077c0] px-[18px] py-[7px] font-inter text-[13px] font-semibold text-white transition-colors hover:bg-[#0069a8]"
                  >
                    Review
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Outline bell glyph, matching the app's inline-SVG icon style. */
function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
