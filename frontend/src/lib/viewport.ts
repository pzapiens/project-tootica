/** Coordinates in the app's normalized 90% layout, including body portals. */
export function getAppScale() {
  if (typeof document === "undefined") return 1;
  const value = Number(document.documentElement.dataset.appScale);
  return value > 0 && Number.isFinite(value) ? value : 1;
}

export function getAppViewport() {
  const scale = getAppScale();
  return { width: window.innerWidth / scale, height: window.innerHeight / scale };
}

export type AppRect = {
  x: number; y: number; left: number; top: number;
  right: number; bottom: number; width: number; height: number;
};

export function getAppRect(element: Element): AppRect;
export function getAppRect(element: Element | null | undefined): AppRect | null;
export function getAppRect(element: Element | null | undefined): AppRect | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const scale = getAppScale();
  return {
    x: rect.x / scale, y: rect.y / scale,
    left: rect.left / scale, top: rect.top / scale,
    right: rect.right / scale, bottom: rect.bottom / scale,
    width: rect.width / scale, height: rect.height / scale,
  };
}
