# Mirror — specification

> **Provenance.** This file is the working transcription of the project brief as
> given in this conversation, saved so that the repo carries the requirements
> rather than a summary of them. The **Section J inventory (28 items) is
> verbatim** from the brief. The prose around it is a faithful reconstruction of
> the brief's requirements; where a number or rule was later measured or chosen
> in a phase, the measured value is in `docs/PROGRESS.md` and in
> `packages/ui/tokens/image-tokens.json`, which override anything restated here.
> If any sentence below misstates the brief, it is a bug: correct it.

---

## 1. What Mirror is

A **privacy-first, mobile-first digital behaviour analytics** app. It shows how
you use your phone — not just how long: depth versus endless scrolling, curiosity
versus habit, how interests evolve, attention budgets, calm weekly goals.

Raw history (titles, searches, timestamps) **never leaves the device** in Privacy
Mode.

## 2. Non-negotiables

Privacy principles override all design, feature and deployment convenience.

1. **Local-first.** Raw events never leave the device in Privacy Mode.
2. **Allowed sources only:** official OAuth APIs; user exports / Data
   Portability; our own browser extension capturing on allow-listed sites; OS
   usage APIs. **Forbidden:** accessibility-service scraping, overlays, screen
   recording, notification scraping, root/jailbreak tricks.
3. **DIP vs PIP are never merged automatically.** The UI labels them
   *Private* / *Public*; the terms DIP and PIP appear only in code and docs.
4. **Never expose watch, search or purchase history to matches.**
5. **Labels are descriptive estimates**, never clinical or diagnostic.
6. **No dark patterns, streaks or engagement nudges.** Nudges are opt-in.
7. **Every feature declares its data tier (A/B/C/D) and degrades gracefully.**
8. **Permissioned once, then automatic**, revocable in one tap.
9. **Honest capability** — never fake a signal that the data cannot support.
10. **Deployment, OTA and remote config can never add collection, permissions or
    outbound data.** The app works with the backend off. No secrets in the repo,
    images or bundle. No third-party analytics or release-health user tracking.

## 3. Design rules

- The attached reference image is the **single source of truth** for palette,
  mood, materials and layout language. Do not invent a palette or a typeface
  before analysing it. Reproduce its **layout language, materials and mood** —
  never its movie content, names, logos or photography. (If no image had been
  attached, the correct move is to ask for one.)
- **No theme list, no presets.** Tokens are generated from the image; dark is the
  default view and is derived from the same image, not inverted from light.
- **Tokens only** — never hardcode glass values anywhere else.
- **At most 3 live-blurred layers** on mobile, and live blur is limited to the
  **tab bar and sheets**; everything else is pre-composited.
- **WCAG 2.2 AA**, with contrast checks in CI.
- **Every interactive element is at least 48 × 48 dp.**
- **Font scaling to 200 %** must work.
- **Reduce-motion and reduce-transparency** must be honoured.
- **Performance budgets:** cold start < 2 s; 60 fps scrolling; background
  collection < ~2 % battery/day.
- **Notifications:** local, opt-in, quiet hours, no guilt or streak copy.
- No grain, no vignette, no second accent colour, no saturated brand colour.

## 4. Stack and repository layout

Fixed unless justified in a phase report.

```
apps/mobile        React Native (Expo), Android first
apps/extension     browser extension (allow-listed capture)
apps/web           marketing / share-card host
services/api       backend (encrypted sync, optional)
packages/connectors  OAuth connectors + preference schemas
packages/core-analytics  scoring, sessions, tiers
packages/ml        embeddings, on-device models
packages/shared-types    event schema, DTOs
packages/ui        design system (this package)
docs               SPEC, PROGRESS, design evidence, mockups
infra              EAS profiles, store config, CI helpers
scripts            generators and checkers
.github/workflows  CI
Makefile           one entry point for the gates
```

## 5. Phase plan (each phase ends with a review and a STOP)

| phase | scope |
| --- | --- |
| **P-UI-0** | image analysis → design brief |
| **P-UI-1** | image-derived tokens + single-file HTML phone-frame prototype |
| **P-UI-2** | React Native design system in `/packages/ui` + mockups of every screen |
| **P0** | monorepo scaffold, CI, EAS build profiles, event schema, connectors & preference schemas, synthetic data, privacy canary harness, store-readiness draft |
| **P1** | encrypted local storage, Android UsageStats collector, ingestion pipeline, importers, embeddings |
| **P2** | scoring engine + dashboard + Why-this-score + **release stage 1** (signed APK/AAB) |
| **P3** | interest evolution, discovery timeline, rabbit-hole detection, what-if, focus windows |
| **P4** | behaviour profile, weekly report, attention budget, ask sheet, widgets |
| **P5** | OAuth connectors, consent dashboard, browser extension, iOS DeviceActivity, **release stage 2** |
| **P6** | backend, encrypted sync, social layer, share cards, **release stage 3** |
| **P7** | security review (ASVS/MASVS), store readiness, staged rollout, **release stage 4** |

### Required output for every phase

1. Plan
2. File-tree changes
3. Full code
4. Tests
5. Run instructions
6. Limitations
7. Release impact — stage, and every deployment step labelled **AUTOMATED** or
   **MANUAL**
8. A question only if it is truly blocking

Then **stop and wait** for "continue" / "approved".

### The IQS formula (from the brief)

The brief defines the Interaction Quality Score over five 0–100 sub-scores:

```
IQS = 100 × (0.35 × Depth
           + 0.25 × Intentionality
           + 0.20 × Active engagement
           + 0.10 × Focus
           + 0.10 × Follow-through)
      − doomscroll penalty                    (penalty ≤ 25)
```

Depth's weight rises to 0.5 when completion and query-refinement signals are
available. **The P2 engine does not implement this literally**: its five factors,
the crosswalk to these components and the deviations awaiting approval are
recorded in `docs/metrics.md` §2. That document, not this summary, is the source
of truth for what the shipped score computes.

### Test requirements (standing)

- Unit tests per score formula, including the **empty / zero / single-event /
  all-sessions-under-8s** edges.
- **Property-based tests** (fast-check or Hypothesis) for the scoring and
  sessionisation code.
- A **privacy canary test**: mitmproxy on an emulator plus Playwright for the
  extension, **failing CI on any canary appearing in a request body, URL, header,
  log line or error report**. Release builds are covered too.
- Heavy work stays off the UI thread.
- Every feature sits behind a **typed flag**, with **social off by default**.

## 6. Section J — the screen inventory (28 items, verbatim)

Some of these are bottom sheets or states within a parent screen (Why drawer, Ask
sheet, update state, widget), but **each must appear in the gallery and in the
tests**.

1. Onboarding + privacy promise
2. Permission primers (Usage access, notifications)
3. Dashboard
4. Interest Evolution
5. Depth
6. Curiosity vs Habit
7. IQS
8. Sessions
9. Discovery Journey
10. Behavior Profile
11. Rabbit Hole
12. Weekly Report + Goals
13. Connections / Consent Dashboard (with capability matrix)
14. Privacy Center (network log, delete everything)
15. Public Profile editor (live preview)
16. Matches / Chat
17. Why drawer
18. What-if Simulator
19. Attention Budget
20. Focus Windows
21. Learning Arcs
22. Ask sheet
23. Privacy Receipt
24. Demo persona picker
25. Intent Check settings
26. Private Share Card preview
27. Home-screen widget
28. "Update available / app version" state (calm, non-blocking)

## 7. Decisions confirmed in conversation

- The attached reference image **is** the intended reference; keep using it (not
  the streaming-service example in the earlier draft spec).
- P-UI-0 approved as delivered.
- P-UI-1 delivered; dark variant derived from the same image, dark as the default
  theme, light available as a toggle; **every interactive element on the phone
  ≥ 48 dp**.
- Wherever a measured value disagrees with an assumed value, **the measured value
  ships**.
- The **design brief stays frozen**; the `title-lg 22/28` type step ships as a
  **token delta** only (it is not folded back into the brief).
- The Section J inventory above **replaces** the earlier 18-item derivation.
