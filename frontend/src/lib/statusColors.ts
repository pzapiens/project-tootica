/**
 * Single source of truth for appointment-status colours, used everywhere a
 * status is shown (dashboard table + status dropdown, appointments page table,
 * calendar chips/cards/legend). Colours are chosen so the status reads by its
 * MEANING / next action at a glance rather than as arbitrary tints:
 *
 *   - Pending     → amber   (awaiting the clinic's accept/reject — needs action)
 *   - Upcoming    → blue    (confirmed & scheduled ahead — informational)
 *   - On going    → solid blue (happening right now — active)
 *   - Completed   → green   (finished successfully — done)
 *   - Cancelled   → red     (called off)
 *   - No Show     → slate    (patient didn't attend — inactive/absent)
 *
 * Tuning any colour here updates every surface at once. Consumers pull the
 * light-badge classes (`bg` + `text`) and/or the `accent` hex (dots, borders,
 * legend swatches). "On going" is the one solid-fill status (white text).
 */
export interface StatusColor {
  /** Light badge background (Tailwind arbitrary class). */
  bg: string;
  /** Badge / label text colour (Tailwind arbitrary class). */
  text: string;
  /** Accent hex for dots, borders and legend swatches. */
  accent: string;
  /** True when the status is a bold solid fill instead of a light badge. */
  solid?: boolean;
}

export const STATUS_COLORS: Record<string, StatusColor> = {
  Pending: { bg: "bg-[#fef3c7]", text: "text-[#b45309]", accent: "#f59e0b" },
  Upcoming: { bg: "bg-[#e6f2fb]", text: "text-[#0077c0]", accent: "#0077c0" },
  "On going": { bg: "bg-[#0077c0]", text: "text-white", accent: "#0077c0", solid: true },
  Completed: { bg: "bg-[#f0fdf4]", text: "text-[#15803d]", accent: "#16a34a" },
  Cancelled: { bg: "bg-[#f9f1f1]", text: "text-[#ab2222]", accent: "#ab2222" },
  "No Show": { bg: "bg-[#f1f5f9]", text: "text-[#475569]", accent: "#64748b" },
};

// The calendar spells "On going" as "Ongoing" — alias so both resolve the same.
STATUS_COLORS.Ongoing = STATUS_COLORS["On going"];

const FALLBACK: StatusColor = { bg: "bg-[#f1f5f9]", text: "text-[#1e1e24]", accent: "#1e1e24" };

/** Resolve a display-status label to its colours (tolerant of unknown labels). */
export function statusColor(label: string): StatusColor {
  return STATUS_COLORS[label] ?? FALLBACK;
}

/** Badge className ("bg + text") for a display-status label. */
export function statusBadgeClass(label: string): string {
  const c = statusColor(label);
  return `${c.bg} ${c.text}`;
}

// The status dropdowns (create/edit form + dashboard "Today's Appointments"
// filter) and the appointments-table status badges follow the Figma "Appts
// Status Dropdown", which colours "No Show" amber rather than the shared
// palette's slate. Scoped here so the dropdowns and those badges stay in sync;
// the calendar (which reads `statusColor` directly) keeps the slate No Show.
const STATUS_DROPDOWN_OVERRIDE: Record<string, Pick<StatusColor, "bg" | "text">> = {
  "No Show": { bg: "bg-[#fdf9f0]", text: "text-[#a36d16]" },
};

/** Dropdown/badge colours ("bg" + "text") for a display-status label, applying
 *  the Figma dropdown's per-status overrides (e.g. No Show → amber). */
export function statusDropdownColor(label: string): { bg: string; text: string } {
  const c = statusColor(label);
  return STATUS_DROPDOWN_OVERRIDE[label] ?? { bg: c.bg, text: c.text };
}

/** Badge/option className ("bg + text") matching the status dropdown's palette. */
export function statusDropdownBadgeClass(label: string): string {
  const { bg, text } = statusDropdownColor(label);
  return `${bg} ${text}`;
}
