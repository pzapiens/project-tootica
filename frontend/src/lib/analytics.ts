/**
 * Shared helpers for turning a UI time-frame selection into the query string the
 * backend analytics / appointments endpoints expect (`?from=…&to=…`, ISO dates).
 *
 * Both the clinic-selection `TimeFrame` and the dashboard `Timeframe` share the
 * same shape, so this accepts either.
 */
export type RangeFrame =
  | { kind: "all" }
  | { kind: "today" }
  | { kind: "range"; from: string; to: string };

function startOfToday(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfToday(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** The inclusive `[from, to]` window for a frame, or `null` for "all time". */
export function frameRange(frame: RangeFrame): { from: Date; to: Date } | null {
  if (frame.kind === "all") return null;
  if (frame.kind === "today") return { from: startOfToday(), to: endOfToday() };
  // Custom range: `yyyy-mm-dd` local dates, inclusive of the whole end day.
  return {
    from: new Date(`${frame.from}T00:00:00`),
    to: new Date(`${frame.to}T23:59:59.999`),
  };
}

/** `?from=…&to=…` query string for a frame (empty string for "all time"). */
export function analyticsRangeQuery(frame: RangeFrame): string {
  const range = frameRange(frame);
  if (!range) return "";
  const params = new URLSearchParams({
    from: range.from.toISOString(),
    to: range.to.toISOString(),
  });
  return `?${params.toString()}`;
}
