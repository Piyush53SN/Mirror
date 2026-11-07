# Visual redesign, Stage 1: live Home vs mockups and reference (gap list)

Written before building. Sources: `packages/ui/mockups/gallery/dashboard.html` (J3 dashboard,
dark and light), the iDraft reference images (`/tmp/arena-coding-uploads/`), and the live
`apps/mobile/src/tabs/HomeTab.tsx` at `5e76e07`.

| # | Area | Mockup / reference | Live Home (before) | Stage 1 action |
|---|------|--------------------|--------------------|----------------|
| 1 | Hero | Dark "Overall information" tile with big numerals | Attention signal in a flat `Surface`, gauge of ticks | Dark hero tile (anchor fill), ring + big number, confidence chip |
| 2 | Weekly line | "Weekly progress" line chart, day labels, highlighted day | No chart; only per-day strip and totals | 7-day line chart of day-clipped foreground time, selected day highlighted, partial days marked |
| 3 | Share | "Month progress" donut with legend | Per-app list with bars | "Where time went" donut: top 5 apps plus other |
| 4 | Budgets | "Month goals" card with ring, checklist | Budget strip, plain text | Budget tiles with rings, dashed "Add budget" tile |
| 5 | Weekly summary | Summary card | Card with text | Restyled tile, same numbers |
| 6 | Intent Check | (not in mockup) | Card | Restyled tile, same behaviour |
| 7 | Header | Greeting, round icon buttons, pill "Create" | Title, subtitle, icon row | Larger greeting, round icon buttons, pill actions |
| 8 | Tab bar | Floating rounded dock with labels | Standard bar | Rounded dock, active pill |
| 9 | Motion | Not specified | None | Ring/line draw-in, hero settles once, tab fade <= 200 ms; all off under reduce-motion |
| 10 | Theme | Light and dark mockups | Dark only (`initialTheme="dark"`, `userInterfaceStyle: dark`) | Auto (system) / Light / Dark, chosen in Settings |
| 11 | Icon | Not in mockup | Default Expo icon | Adaptive icon and monochrome notification icon |

## Not carried over (honesty rules)

- No "Learning arcs" tiles: topic data is not measured on device (the mockup itself says so).
- No "Private/Public" share toggle, no "Create", "Search", "Bell" actions: no such feature exists yet.
- No charts of anything unmeasured. The line chart is day-clipped foreground time only.
- No confetti, streaks, red, or guilt copy. Partial days are shown as partial, never extrapolated.
- Long explanations (confidence math, unmeasured lists, OS-source notes) move into the Why
  sheet, not deleted.

## Known differences after Stage 1

- Charts: donut and line use react-native-svg (Stage 2). Line is straight segments, not smoothed. Gauge and rings are tick marks built from Views.
- Glass is pre-composited (no live blur beyond the existing budget of three layers).

## Status after Stage 1 (v0.4.0, versionCode 9)

| # | Status | Notes |
|---|--------|-------|
| 1 | Done (partly) | Hero is a dark tile with an inverted palette (AA contrast tested). Ring is the existing 18-tick gauge, not a smooth arc. |
| 2 | Done | `LineChart` over the existing weekly report `perDay`. Gaps are not zero, today is hollow. Hidden under 3 recorded days. |
| 3 | Done | `Donut` "Where time went": top five plus Other, from `dailyTotals`. |
| 4 | Done | Budget rings and a dashed "Add budget" tile. Budgets are still never created automatically. |
| 5 | Not changed | Weekly summary card kept as-is (same numbers, existing card). |
| 6 | Not changed | Intent Check card kept as-is. |
| 7 | Not changed | Header kept for Stage 1. |
| 8 | Not changed | Tab bar was already a rounded solid dock with an active pill. |
| 9 | Partly | Tab fade (160 ms), hero numeral settles once, ring draw-in. Line draw-in is a left-to-right reveal. All off under reduce-motion. Press feedback not added. |
| 10 | Done | Auto (system) / Light / Dark in Settings, stored in expo-secure-store. |
| 11 | Done | Adaptive icon, monochrome icon, and notification small icon wired through app.json and a config plugin. Needs `expo prebuild` to take effect. |

Deferred to Stage 2/3 review: header restyle, weekly summary and Intent Check restyle, press feedback.

## Stage 2 (v0.4.0, versionCode 10): new visual language on Home

Presentation only. No change to analytics, scoring, storage, permissions, or displayed numbers.

Home order is now: hero (Attention signal), 7-day chart, "Where time went" donut, 24-hour sitting
strip, budgets, weekly summary, Intent Check. Detail moved into the "Why this score" sheet:
how screen time and sittings are counted, the source notes, the full per-app list, and the session
boundary status. The donut card keeps a source label (Stored / Approximate / Day-clipped) and a
"Why these numbers" link.

| Area | Before (Stage 1) | After (Stage 2) |
|------|------------------|-----------------|
| Palette | Greyscale tokens | `palette.ts` hue layer: indigo-teal gradient, glass fills, hairline, shadow, chart categories |
| Backdrop | Flat canvas | Gradient with two glows and a grain tile (`grain.ts`) |
| Hero | Anchor-coloured tile | Solid palette hero tile (`heroTheme` in tokens.ts); no blur |
| Gauge | Ticks in greys | Same 18 ticks, filled teal to indigo, never red or green |
| Donut | Ticks, greys | SVG arcs in palette categories, each at least 3:1 on its tile |
| Line | Views | SVG path with points; partial days hollow |
| 24 hours | none | Sitting time per clock hour (new card, no new metric; derived from sittings) |
| Intent Check | Primary answer pre-styled | All three answers equal; quiet-hours window shown; one tap |
| Haptics | none | One selection tick on an Intent Check answer (expo-haptics) |

Accessibility checks (automated):
- `packages/ui/tests/wcag-rendered-ui.test.mjs` renders Home, the Why sheet, Insights, and You +
  Settings in both appearances and checks each text node against the rendered backdrop (4.5:1, or
  3:1 for large text). Donut strokes must reach 3:1 on their tile.

Dependencies added in Stage 2: `react-native-svg` ~15.16.0, `expo-linear-gradient` ~58.0.3,
`expo-haptics` ~58.0.7. None adds a permission (expo-haptics' VIBRATE is already in the manifest).

Not verified on device: 200% font scale, TalkBack reading of the charts, reduce-motion and
reduce-transparency on a phone, the glass look on real hardware, and `expo prebuild` with the
notification icon plugin.
