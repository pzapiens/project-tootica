# Static 90% view across browser zoom

Desktop Chrome, Edge, and Brave keep the existing **90% view** throughout browser
zoom 80%, 90%, 100%, 110%, and 120%. This replaces the earlier reflow-only behavior.

A script in the root document head applies one CSS zoom factor to every route,
including body portals, before the first paint. It separates display scaling from
page zoom, then applies:

```text
app scale = 0.9 / browser zoom
layout width = browser viewport width / app scale
layout height = browser viewport height / app scale
```

| Browser zoom | App scale | Combined scale |
| --- | --- | --- |
| 80% | 1.125 | 90% |
| 90% | 1 | 90% |
| 100% | 0.9 | 90% |
| 110% | 0.81818... | 90% |
| 120% | 0.75 | 90% |

Viewport units and responsive breakpoints use the normalized dimensions. Navigation
and charts therefore retain the same arrangement when only browser zoom changes.
Real window resizing still changes the available layout. Long lists and dense
tables retain their scroll regions; filter panels fill their parent instead of
using the old `100dvh / 0.9` height.

Menus, tooltips, and date pickers convert viewport coordinates to app coordinates
through `src/lib/viewport.ts`. New fixed-position body portals should use these
helpers too.

Browser zoom has no standard direct web API. Initial desktop calibration uses
window geometry and device pixel ratio; later changes track DPR. Display scaling
is recalibrated on monitor changes. A side panel or docked developer tools already
open at initial load can distort that geometry and needs live browser checking.
Touch devices and zoom outside 80-120% keep normal browser zoom.

## Verification

From `frontend`:

```text
node --test tests/viewport-scaling.test.cjs tests/page-loading.test.cjs tests/revenue-trend.test.cjs
npm.cmd run build
```

The viewport suite covers all five initial zoom values at display scaling
100%, 125%, 150%, 175%, and 200%, repeated zoom changes, resizing, monitor
changes, DPR-only events, and popup coordinate conversion.

For visual QA, use the same browser window size in Chrome, Edge, and Brave.
Compare each zoom setting with the 90% reference on login, clinic selection,
dashboard, lists, records, profile, filters, and dialogs. Confirm the frame
fills the viewport and popup controls remain aligned.

Browser access was unavailable during implementation, so live visual checks
remain pending. The unrelated five doctor preset failures were already reproduced
against the original committed code during the preceding layout update.
