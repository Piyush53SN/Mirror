# Tests

Two suites, no dependencies, no network:

| Command | What it proves |
| --- | --- |
| `npm run test:tokens` | The generated token set is internally consistent, meets its contrast floors, and is not stale relative to a fresh build. |
| `npm run test:prototype` | The single-file prototype boots, its flows run, and every tap target inside the phone measures ≥ 48 × 48. |
| `npm run check:prototype` | The same prototype checks in a real browser (Puppeteer or Playwright). **Authoritative when a browser is available.** |
| `npm test` | `test:tokens` + `test:prototype`. |

`npm run verify` chains `tokens → test → check:prototype`. It exits `2` when no
browser library is installed: that means *nothing was measured*, never that
everything passed.

## Why there is a DOM stub

`tests/dom-stub.mjs` is a small hand-written DOM + CSS-cascade + layout
approximation. It exists so the 48dp rule and the prototype's behaviour can be
enforced in CI with **no browser download and no network**, which is also the
only way this repository's checks can run in a locked-down build box.

It is not a browser. What it deliberately does **not** model:

- real flex/grid distribution (`flex: 1` children are not given the free space);
- text shaping and real font metrics (text width ≈ characters × font-size × 0.52);
- `calc()` arithmetic, `min()`/`max()`, `clamp()`, container queries;
- stacking, overflow, scroll positions, `position: fixed` behaviour;
- pseudo-classes other than `:root`/`:not()` (so `:hover`/`:focus-visible` rules
  are treated as not matching, which is the default rendering path);
- `@supports` bodies (stripped — the point is the default path);
- SVG geometry, images, `backdrop-filter` compositing.

Two consequences you should keep in mind when reading a pass from the stub:

1. A **width** of exactly the minimum usually means the stub under-estimated the
   text, not that the real element is that narrow. That is why the prototype also
   sets explicit `min-width`/`min-height` on every control it cares about: the
   minimum is a design decision, not a measured accident.
2. Elements the stub cannot size at all are flagged, not silently ignored: the
   tap-target test has no "skip" branch.

When a real browser is present, `scripts/check-prototype.mjs` re-runs the
tap-target, accessible-name and glass-budget assertions against real layout, and
additionally checks:

- zero external requests (the prototype must work with the network off);
- no text clipping at 150 % and 200 % system font scale;
- both themes × both transparency modes;
- reduce-motion leaving nothing animating > 50 ms;
- the live-blur layer budget (≤ 3) measured from computed styles;
- console/page errors, plus dark and light screenshots in `docs/design/screens/`.

## The tests that matter most

- `every tap target inside the phone measures at least 48x48` — the acceptance
  criterion, measured on the rendered tree, not asserted from the stylesheet.
- `the page's own checker reports zero violations across every persona and tab` —
  drives the prototype's *own* `runChecks()` and requires its report to agree,
  so the shipped verifier and the test cannot drift apart.
- `generated files are in sync with a fresh build` — a stale `tokens.css` or
  `index.ts` fails the build instead of shipping a palette nobody regenerated.
- `the prototype is self-contained: no network, no storage, no analytics` — the
  privacy posture is enforced mechanically, not by review.
