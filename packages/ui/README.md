# `@mirror/ui` — the Mirror design system

React Native components for every Mirror screen. Nothing here holds state, calls
the network, or reads storage: it is presentation over a theme object, and the
theme object is generated from the reference image (`/packages/ui/tokens`, never
hand-edited).

```bash
npm run mockups      # render the gallery → packages/ui/mockups/gallery/index.html
npm run typecheck    # tsc --noEmit, strict (src, screens and the DOM binding)
npm run test:ui      # 29 component tests
npm run test:mockups # 15 tests over the rendered HTML
```

## Layout

```
packages/ui
├── tokens/            generated: image-tokens.json, index.ts, tokens.css   (do not edit)
├── src/
│   ├── host.ts        every react-native import in the package, in one place
│   ├── tokens.ts      typed token surface + colour maths (rgba/composite/mix/contrastRatio)
│   ├── theme.tsx      createTheme(), ThemeProvider, useTheme()
│   ├── flags.ts       typed feature flags (social off by default) + posture audit
│   ├── tiers.ts       what each data tier A/B/C/D means, and what needs what
│   ├── a11y.ts        accessibility names, roles, live regions, focus ring, target sizing
│   ├── format.ts      duration/percent/byte/date formatting (Intl, no dependency)
│   ├── primitives/    text.tsx · controls.tsx · containers.tsx
│   └── patterns.tsx   PermissionPrimer, WhySheet, CapabilityMatrix, PrivacyReceipt, …
├── screens/
│   ├── index.tsx      all 28 Section J items + SECTION_J + SCREENS (the inventory)
│   ├── personas.ts    the three demo personas and the data every screen renders
│   ├── kit.tsx        shared pieces: NothingYet, ScoreBlock, Definition
│   └── render.tsx     render helpers (item → tree, sheet over parent)
├── mockups/           rn-dom.tsx (react-native → DOM), entry.tsx, render.mjs, out/
└── tests/             ui.test.mjs (components), mockups.test.mjs (rendered HTML)
```

## Using it

```tsx
import { createTheme, ThemeProvider, Screen, Card, Text, Meter } from '@mirror/ui';

const theme = createTheme('dark');       // 'dark' is the default and ships first

<ThemeProvider theme={theme}>
  <Screen>
    <Card>
      <Text role="title">Focus</Text>
      <Meter value={0.6} caption="36 min of 60" />
    </Card>
  </Screen>
</ThemeProvider>;
```

`createTheme(name, preferences)` takes `{ reducedTransparency, reducedMotion,
textScale }` — normally fed from the OS settings. It always returns a frozen
object, and it is the only sanctioned way to build a theme in app code.

### Rules the components enforce for you

| rule | how |
| --- | --- |
| no hard-coded visual values | every colour, radius, space, type size and duration comes from `theme`; a test scans for literals |
| 48dp targets | `Pill`, `IconButton`, `Chip`, `TabBar`, `LinkButton`, `SegmentedControl` all size to `theme.size.touchTarget`; for anything custom, `touchTarget()` / `hitSlopFor()` in `a11y.ts` pad it to `MIN_TOUCH_DP` and `assertTargetSize()` reports violations |
| at most 3 live-blurred layers | `useLiveBlur(id, enabled)` grants slots and returns `false` once the budget is spent; a denied layer uses a pre-composited fill instead |
| reduced motion / transparency | values arrive already collapsed — components never branch on the OS setting themselves |
| honest degradation | screens render `DegradedNotice` naming the tiers they lack, with one action and no nudge |
| text scaling to 200% | `theme.type(role)` clamps the system scale via `maxSystemScale`; layout uses `flexWrap`, never fixed heights on text |

### Adding a screen

1. Add the component to `screens/index.tsx`, take `ScreenProps`
   (`{ theme, persona, state }`) and render `DegradedNotice` when the persona
   lacks a required tier.
2. Add the item to `SECTION_J` (the brief's list, in its order) and to `SCREENS`
   with its id, slug, `kind` (`screen` | `sheet` | `state` | `widget`), parent where
   it is not a full screen, phase, required tiers, available states and **the rule
   it obeys** — the rule is what reviewers check.
3. Run `npm run mockups && npm test`. The item must render in every state × theme
   with at least one 48dp target per frame, and a sheet must render over its
   parent rather than as a page of its own.

### Sheets, states and widgets

`kind` is not decoration. `renderScreen()` renders a sheet or a state *over* its
parent screen and the mockup renderer marks that parent in the frame
(`data-mock-parent`), because the Why drawer is not a page — rendering it as one
would be a drawing of the product rather than the product. Widgets are their own
surface: they render standalone and the inventory only records which screen they
belong to.

## Mockups

`mockups/rn-dom.tsx` implements the subset of `react-native` the design system
uses (`View`, `Text`, `Pressable`, `ScrollView`, `Image`, `StyleSheet`,
`useWindowDimensions`, `Platform`) by emitting DOM and inline CSS. Unknown
primitives throw rather than silently rendering nothing.

```bash
node packages/ui/mockups/render.mjs                 # 18 screens × personas × states × themes
node packages/ui/mockups/render.mjs --screen home   # one screen
```

This is a mockup renderer, not a device: it does not do text shaping, real font
metrics or flex distribution, so it can prove structure, sizing and tone but not
pixels. Device verification is P-UI-3 territory (an Expo app on a real
emulator), and is listed as a limitation of this phase.

## Limitations (see the phase report for the full list)

- Renders on the DOM here; no device or emulator has run these components yet.
- No gesture library: sheet drag, swipe and long-press are not exercised.
- Text is measured in `ch`-free logical units; long-copy wrapping is untested.
- The 48dp check measures the mockup DOM, so it verifies the sizing logic — a
  device pass is still required before release.
