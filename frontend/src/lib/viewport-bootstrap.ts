/**
 * Runs in <head> before the first paint. Keep this function self-contained:
 * its JavaScript source is embedded in the server-rendered document.
 */
function installViewport() {
  const root = document.documentElement;
  if (root.dataset.appViewportReady === "true") return;
  root.dataset.appViewportReady = "true";

  const baseline = 0.9;
  const zoomSteps = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.2, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
  const displayScales = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.5, 4];
  const nearest = (values: number[], value: number) =>
    values.reduce((best, next) => Math.abs(next - value) < Math.abs(best - value) ? next : best);
  const geometryZoom = () => window.outerWidth > 0 && window.innerWidth > 0
    ? window.outerWidth / window.innerWidth : 1;
  const screenKey = () => [screen.width, screen.height, screen.availWidth, screen.availHeight].join(":");
  const calibrate = () => {
    // DPR contains BOTH Windows display scaling and browser zoom. Use window
    // geometry once to separate them; subsequent zoom changes track DPR.
    const inferred = window.devicePixelRatio / nearest(zoomSteps, geometryZoom());
    const common = nearest(displayScales, inferred);
    return Math.abs(common / inferred - 1) < 0.025 ? common : inferred;
  };
  let displayScale = calibrate();
  let previousScreen = screenKey();
  let previousGeometry = geometryZoom();
  let previousDpr = window.devicePixelRatio;
  let resolution: MediaQueryList | undefined;
  let frame = 0;

  const schedule = () => {
    if (!frame) frame = window.requestAnimationFrame(() => { frame = 0; update(); });
  };
  function update() {
    const dpr = window.devicePixelRatio || 1;
    const geometry = geometryZoom();
    const currentScreen = screenKey();
    // Moving between displays can change DPR without changing page zoom.
    if (currentScreen !== previousScreen ||
      (Math.abs(dpr - previousDpr) > 0.01 && Math.abs(geometry / previousGeometry - 1) < 0.02)) {
      displayScale = calibrate();
    }
    const browserZoom = dpr / displayScale;
    const touch = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    const scale = !touch && browserZoom >= 0.795 && browserZoom <= 1.205
      ? baseline / browserZoom : 1;
    const width = window.innerWidth / scale;
    const height = window.innerHeight / scale;
    const variables: Record<string, string> = {
      "--app-scale": String(scale),
      "--app-viewport-width": width + "px",
      "--app-viewport-height": height + "px",
      "--app-vw": width / 100 + "px",
      "--app-vh": height / 100 + "px",
    };
    for (const [name, value] of Object.entries(variables)) {
      if (root.style.getPropertyValue(name) !== value) root.style.setProperty(name, value);
    }
    root.dataset.appScale = String(scale);
    root.dataset.browserZoom = String(browserZoom);
    previousScreen = currentScreen;
    previousGeometry = geometry;
    if (!resolution || dpr !== previousDpr) {
      resolution?.removeEventListener("change", schedule);
      resolution = window.matchMedia("(resolution: " + dpr + "dppx)");
      resolution.addEventListener("change", schedule);
    }
    previousDpr = dpr;
    window.dispatchEvent(new CustomEvent("appviewportchange"));
  }
  update();
  window.addEventListener("resize", schedule);
  window.addEventListener("pageshow", schedule);
  window.visualViewport?.addEventListener("resize", schedule);
}

export const VIEWPORT_BOOTSTRAP = "(" + installViewport.toString() + ")();";
