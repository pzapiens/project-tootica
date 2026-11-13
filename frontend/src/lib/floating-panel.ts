type AnchorRect = { left: number; right: number; top: number; bottom: number };

/** Matches the CSS content inset plus its 8px popup clearance. */
export function popupVerticalInset(viewportWidth: number) {
  return Math.min(20, Math.max(8, viewportWidth * 0.013)) + 8;
}

/** Keep anchored popovers inside the white content frame at any browser zoom. */
export function floatingPanelPosition(
  anchor: AnchorRect,
  viewport: { width: number; height: number },
  requestedWidth: number,
  requestedHeight: number,
  gap = 8,
  align: "start" | "end" = "end",
) {
  const margin = 12;
  const verticalMargin = popupVerticalInset(viewport.width);
  const width = Math.min(
    requestedWidth,
    Math.max(0, viewport.width - margin * 2),
  );
  const maxHeight = Math.min(480, Math.max(0, viewport.height - verticalMargin * 2));
  const height = Math.min(requestedHeight, maxHeight);
  const below = viewport.height - anchor.bottom - gap - verticalMargin;
  const above = anchor.top - gap - verticalMargin;
  const top =
    below >= height || below >= above
      ? anchor.bottom + gap
      : anchor.top - gap - height;
  const preferredLeft = align === "start" ? anchor.left : anchor.right - width;
  return {
    width,
    maxHeight,
    left: Math.max(
      margin,
      Math.min(preferredLeft, viewport.width - width - margin),
    ),
    top: Math.max(verticalMargin, Math.min(top, viewport.height - height - verticalMargin)),
  };
}
