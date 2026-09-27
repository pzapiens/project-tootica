"use client";

/**
 * App-standard back button — the single source of truth for back navigation,
 * matching the Patient Records page. A round button with a hover fill and a
 * chevron-left in the app's icon style (strokeWidth 2.5, round caps).
 *
 * Use this for every page-level back control so they stay identical.
 */
export default function BackButton({
  onClick,
  ariaLabel = "Go back",
  className = "",
}: {
  onClick: () => void;
  /** Accessible label (e.g. "Back to appointments"). */
  ariaLabel?: string;
  /** Extra classes merged onto the button (layout only). */
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`flex size-[44px] shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[#f1f5f9] ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="#1e1e24"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-10"
        aria-hidden
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>
  );
}
