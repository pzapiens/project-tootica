"use client";

import { useEffect, useRef, useState } from "react";

import { Tip } from "@/components/HoverTip";

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
        className="group relative flex size-[55px] items-center justify-center rounded-full border-[1.4px] border-[#c2c6d4] transition-colors hover:border-[#0077c0]"
      >
        <BellIcon className="size-7 text-[#1e1e24]" />
        {hasNew && (
          <span className="absolute right-[13px] top-[13px] size-[10px] rounded-full border-2 border-white bg-[#0077c0]" />
        )}
        {/* Hidden while the panel is open so it doesn't overlap the dropdown. */}
        {!open && <Tip label="Notifications" below />}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+12px)] z-50 w-[420px] overflow-hidden rounded-[24px] border-[1.4px] border-[#c2c6d4] bg-white shadow-[0px_18px_40px_-12px_rgba(16,24,40,0.18)]">
          {/* Header — manrope title + brand count pill, matching the app's panels. */}
          <div className="flex items-center justify-between border-b border-field-border px-[22px] py-[18px]">
            <div className="flex items-center gap-[10px]">
              <h2 className="font-manrope text-[20px] font-semibold tracking-[-0.5px] text-[#1e1e24]">
                Notifications
              </h2>
              {items.length > 0 && (
                <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-[#0077c0] px-[7px] font-inter text-[12px] font-semibold leading-none text-white">
                  {items.length}
                </span>
              )}
            </div>
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
            <div className="flex flex-col items-center gap-[12px] px-[20px] py-[44px] text-center">
              <span className="flex size-[52px] items-center justify-center rounded-full bg-[#eaf4fb]">
                <BellIcon className="size-6 text-[#0077c0]" />
              </span>
              <p className="font-inter text-[14px] text-[#94a3b8]">
                You&apos;re all caught up.
              </p>
            </div>
          ) : (
            <ul className="max-h-[300px] overflow-y-auto py-[6px]">
              {items.map((n) => (
                <li
                  key={n.id}
                  className="flex items-center gap-[12px] border-b border-field-border px-[22px] py-[14px] transition-colors last:border-b-0 hover:bg-[#0077c0]/[0.04]"
                >
                  <span className="flex size-[40px] shrink-0 items-center justify-center rounded-full bg-[#eaf4fb]">
                    <BellIcon className="size-5 text-[#0077c0]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-inter text-[14px] leading-[20px] text-[#1e1e24]">
                      {n.text}
                    </p>
                    <p className="mt-[2px] font-inter text-[12px] text-[#94a3b8]">
                      {n.time}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setItems((prev) => prev.filter((x) => x.id !== n.id))
                    }
                    className="shrink-0 rounded-[50px] bg-[#0077c0] px-[18px] py-[8px] font-inter text-[13px] font-semibold text-white transition-colors hover:bg-[#0069a8]"
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

/**
 * Filled "notifications" bell — a clean single-bell glyph (Material Symbols
 * "notifications"), matching the app's filled-icon style. Uses `currentColor`
 * so callers set the tint via `text-*`.
 */
function BellIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M4 19V17H6V10C6 8.61667 6.41667 7.3875 7.25 6.3125C8.08333 5.2375 9.16667 4.53333 10.5 4.2V3.5C10.5 3.08333 10.6458 2.72917 10.9375 2.4375C11.2292 2.14583 11.5833 2 12 2C12.4167 2 12.7708 2.14583 13.0625 2.4375C13.3542 2.72917 13.5 3.08333 13.5 3.5V4.2C14.8333 4.53333 15.9167 5.2375 16.75 6.3125C17.5833 7.3875 18 8.61667 18 10V17H20V19H4ZM12 22C11.45 22 10.9792 21.8042 10.5875 21.4125C10.1958 21.0208 10 20.55 10 20H14C14 20.55 13.8042 21.0208 13.4125 21.4125C13.0208 21.8042 12.55 22 12 22ZM8 17H16V10C16 8.9 15.6083 7.95833 14.825 7.175C14.0417 6.39167 13.1 6 12 6C10.9 6 9.95833 6.39167 9.175 7.175C8.39167 7.95833 8 8.9 8 10V17Z" />
    </svg>
  );
}
