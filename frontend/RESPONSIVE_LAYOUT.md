# Responsive application layouts

The app uses natural CSS sizing and container queries. Browser zoom remains under the user's control. Short screens scroll instead of reducing text and controls.

## Coverage

- Authentication: sign in, password recovery, OTP entry and onboarding.
- Clinic and branch selection, account management and clinic analytics.
- Dashboard, appointments, patients, doctors and accounts.
- Insights, revenue, monthly calendar, profile and WhatsApp settings.
- Patient history, tooth charts, clinical records, documents and audit logs.
- Doctor shift scheduling and availability.
- Creation, edit, payment, confirmation and filter dialogs.

Shared rules live in src/app/responsive.css. Add app-page to a new page's content root; use app-toolbar, app-form-grid and the other shared layout classes for its sections. A form card can use app-form-surface so its fields respond to the card's own width.

## Behavior

| Area | Narrow panels | Wider panels |
| --- | --- | --- |
| Forms | One field per row | Two fields when their container has room |
| Page actions and filters | Wrap into additional rows | Stay alongside the heading |
| Charts and tooth records | Stack vertically | Two columns from 1100px of content width |
| Profile | Stacked cards | Sidebar card and form from 960px |
| Clinic/branch rows | Stacked facts and controls | Columns from 960px |
| Navigation | Compact below 1280px; expandable | Full sidebar by default |
| Tables and monthly calendar | Scroll locally with readable columns | Fill the available panel |
| Dialogs | Fit viewport width; scroll vertically | Retain their existing maximum width |

TableViewport provides labelled, keyboard-focusable scroll regions. FloatingPanel renders menus, notifications and treatment/timeframe pickers outside scrolling ancestors. Its placement clamps to the viewport and flips above the anchor when needed. Date calendars share the same geometry.

## Verification

From frontend:

    npm.cmd run build
    node --test tests/responsive-layout.test.cjs tests/page-loading.test.cjs tests/revenue-trend.test.cjs tests/doctor-creation.test.cjs

The responsive suite checks placement at CSS viewport widths corresponding to 320, 375, 768, 1024, 1366, 1536 and 1920px, at 80%, 100%, 125%, 150% and 200% zoom. It also covers outside clicks, nested date pickers, Escape, resizing, table keyboard access and natural authentication sizing. These are automated geometry/component checks, not screenshots.

Five existing doctor preset tests expect unavailable Sun and 2PM to 6PM shortcut buttons. The same five failures were reproduced against the committed ShiftBuilder; layout changes do not alter its preset behavior.

Live browser visual verification is pending. Check representative pages at 1366x768, 1536x864, 1920x1080, 1024x768 and 375x812, including expanded/compact navigation, populated tables, open dialogs, filters and browser zoom.

## Application sizing

All routes and overlays use the dashboard's smaller proportions: page headings scale from 22px to 26px, ordinary field and table text is about 14px, main controls are about 40px tall, stat cards start at 160px, and tables use 16px corners. Component-specific typography, spacing, icons and popup padding are reduced in place. Existing grids, column definitions, table minimum widths, popup maximum widths, section order, colors, content and responsive breakpoints are retained. The sidebar and already compact dashboard keep their current sizing. Portaled menus and date pickers receive the same sizing treatment, with their existing viewport placement behavior preserved.
