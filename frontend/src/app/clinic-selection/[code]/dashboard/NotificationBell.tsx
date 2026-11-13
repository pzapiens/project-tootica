"use client";

import { useRef, useState } from "react";
import FloatingPanel from "@/components/FloatingPanel";
import { Tip } from "@/components/HoverTip";
import {
  createInitialNotifications,
  type NotificationItem,
} from "./notification-items";
import styles from "./notifications.module.css";

/** Compact notification feed with a single bulk clear action. */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>(
    createInitialNotifications,
  );
  const ref = useRef<HTMLButtonElement>(null);
  const hasItems = items.length > 0;

  return (
    <div className="relative">
      <button
        type="button"
        ref={ref}
        aria-label={
          hasItems ? `Notifications (${items.length})` : "Notifications"
        }
        aria-expanded={open}
        aria-controls={open ? "dashboard-notifications" : undefined}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        className="group relative flex size-[40px] items-center justify-center rounded-full border-[1.167px] border-black transition-colors"
      >
        <BellIcon className="size-5 text-[#1e1e24]" />
        {hasItems && (
          <span className="absolute right-[10px] top-[9px] size-[8px] rounded-full border-2 border-white bg-[#0077c0]" />
        )}
        {!open && <Tip label="Notifications" below />}
      </button>

      {open && (
        <FloatingPanel
          anchor={ref}
          width={360}
          onClose={() => setOpen(false)}
          role="dialog"
          label="Notification Center"
          id="dashboard-notifications"
          className={styles.panel}
        >
          <div className={styles.table}>
            <div className={styles.header}>
              <h2 className={styles.title}>Notification Center</h2>
              <div className={styles.actions}>
                <button
                  type="button"
                  aria-label="Clear all notifications"
                  title="Clear all notifications"
                  onClick={() => setItems([])}
                  disabled={!hasItems}
                  className={styles.headerAction}
                >
                  <DeleteAllIcon />
                </button>
              </div>
            </div>
            <div
              role="region"
              aria-label="Notifications"
              tabIndex={0}
              className={styles.feed}
            >
              {!hasItems ? (
                <div role="status" className={styles.empty}>
                  <span className={styles.emptyIcon}>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="8.5" />
                      <path
                        d="m8 12 2.5 2.5L16 9"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <p>You&apos;re all caught up.</p>
                </div>
              ) : (
                <ul className={styles.list}>
                  {items.map((notification) => (
                    <li key={notification.id} className={styles.entry}>
                      <span className={styles.icon}>
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          aria-hidden="true"
                        >
                          <rect x="4" y="5.5" width="16" height="15" rx="3" />
                          <path
                            d="M8 3.5v4m8-4v4M4 10h16m-12 4h3m-3 3h5"
                            strokeLinecap="round"
                          />
                        </svg>
                      </span>
                      <div className={styles.details}>
                        <p className={styles.message} title={notification.text}>
                          {notification.text}
                        </p>
                        <p className={styles.time}>{notification.time}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </FloatingPanel>
      )}
    </div>
  );
}

function DeleteAllIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 21a2 2 0 0 1-2-2V6H4V4h5V3h6v1h5v2h-1v13a2 2 0 0 1-2 2H7ZM7 6v13h10V6H7Zm2 2v9h2V8H9Zm4 0v9h2V8h-2Z" />
    </svg>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M4 19V17H6V10C6 8.61667 6.41667 7.3875 7.25 6.3125C8.08333 5.2375 9.16667 4.53333 10.5 4.2V3.5C10.5 3.08333 10.6458 2.72917 10.9375 2.4375C11.2292 2.14583 11.5833 2 12 2C12.4167 2 12.7708 2.14583 13.0625 2.4375C13.3542 2.72917 13.5 3.08333 13.5 3.5V4.2C14.8333 4.53333 15.9167 5.2375 16.75 6.3125C17.5833 7.3875 18 8.61667 18 10V17H20V19H4ZM12 22C11.45 22 10.9792 21.8042 10.5875 21.4125C10.1958 21.0208 10 20.55 10 20H14C14 20.55 13.8042 21.0208 13.4125 21.4125C13.0208 21.8042 12.55 22 12 22ZM8 17H16V10C16 8.9 15.6083 7.95833 14.825 7.175C14.0417 6.39167 13.1 6 12 6C10.9 6 9.95833 6.39167 9.175 7.175C8.39167 7.95833 8 8.9 8 10V17Z" />
    </svg>
  );
}
