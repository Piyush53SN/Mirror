# Mirror metrics — formulas, inputs, caveats

This file is the reference for every number Mirror shows. It exists so that the
engine, the screens and the copy cannot disagree. It is versioned with the code:
`docs/metrics.md` and `packages/core-analytics/src/scoring.ts` change together,
and `packages/core-analytics/tests/metrics-doc.test.mjs` fails if a factor in the
engine is missing from this file.

Read this together with the deviation record in §2 — **the engine does not
implement the brief's weighted formula literally**, and that is a decision
awaiting approval, not a detail to be smoothed over.

---

## 1. Notation

| term | meaning |
| --- | --- |
| **Window** | Half-open interval `[fromMs, toMs)`. IQS is always computed over a window. |
| **Session** | One app's foreground interval, built by `sessionize()`. Same-app intervals merge when ≤ 60 s apart; an unclosed interval is dropped, never extended. |
| **Short session** | `< 8 000 ms` (`SHORT_SESSION_MS`). |
| **Tier** | A (OAuth), B (user export), C (own extension), D (OS usage). |
| **Measurable** | The factor has enough data to produce a number. If not, it is `null`, not `0`. |
| **`max`** | Sum of the maxima of the *measurable* factors. 100 with topic data; 75 usage-only. |
| **Points** | Rounded to one decimal. `Σ points === value` by construction. |

---

## 2. The brief's formula, and the deviation

### 2.1 What the brief specifies

The original brief defines IQS as a weighted sum of five 0–100 sub-scores, minus a
penalty (transcribed from the brief and preserved in the P-UI-1 prototype's Why
sheet, which was built before the engine existed):

```
IQS = 100 × (0.35 × Depth
           + 0.25 × Intentionality
           + 0.20 × Active engagement
           + 0.10 × Focus
           + 0.10 × Follow-through)
      − Doomscroll penalty          (penalty ≤ 25, score floor 0)
```

In the brief, **Depth's weight is itself confidence-bearing**: with usage only it
is 0.35; importing an export that adds completion and query-refinement signals
raises it to 0.5. Sessions under 8 s with under 15 % completion contribute zero.

### 2.2 What the engine computes

```
IQS = Σ points(f)  over measurable factors f
max = Σ max(f)     over measurable factors f
```

| engine factor | max | one-line formula |
| --- | --- | --- |
| `session_length` | 25 | `25 × (1 − shortSessions / sessions)` |
| `deliberate_share` | 20 | `20 × intentional / (intentional + mindless)`; needs ≥ 5 decisive labels |
| `switching` | 15 | `15 × 20 / (switchesPerHour + 20)`; needs ≥ 3 sittings |
| `late_night` | 15 | `15 × (1 − lateMs / totalMs)`; late = 23:00–05:00 local |
| `topic_depth` | 25 | `25 × mean pairwise cosine` of up to 120 scorable session vectors; needs ≥ 5 |

### 2.3 Crosswalk — spec component → engine factor

| brief component | weight | engine factor(s) | relation | what is lost |
| --- | --- | --- | --- | --- |
| **Depth** | 0.35 | `session_length` (25) + `topic_depth` (25) | **split / redefined** | Content completion and query refinement are absent. `session_length` measures whether opens survive 8 s, not how deep the content was. `topic_depth` measures topic coherence, which the brief did not name. |
| **Intentionality** | 0.25 | `deliberate_share` (20) | **direct** | Weight is 20, not 25. Labels are self-report and per session. |
| **Active engagement** | 0.20 | — | **not measured** | Requires interaction events (taps, scroll depth, completion). UsageStats has none; accessibility/notification scraping is forbidden. |
| **Focus** | 0.10 | `late_night` (15) + `switching` (15) | **reinterpreted** | Focus is a property of a sitting, not of the hour. The engine scores time-of-day and fragmentation instead. |
| **Follow-through** | 0.10 | — | **not measured** | Requires completion or a return-to-task signal; no such data in P2. |
| **Doomscroll penalty** | ≤ 25 | — | **dropped** | Fragmentation and late-night time already reduce the score as positive factors; a penalty on top would double-count. |

Consequences, stated plainly:

1. **Two of five brief components are absent** (Active engagement, Follow-through).
   They are listed on the Why sheet under "What is not in this number".
2. **One extra factor exists** (`topic_depth`) that the brief did not specify.
3. **Weights differ**: 25/20/15/15/25 versus 35/25/20/10/10.
4. **There is no penalty term**; the score is a weighted sum of positive factors.
5. **A missing factor reduces `max`** instead of contributing zero.

### 2.4 Decisions for approval

D-P2-01, D-P2-02, D-P2-03 **approved 2026-10-17** (P2 engine approved). D-P2-04
**approved 2026-10-17**: use "Interaction Quality Score" per spec. The record
below is kept for history.

**D-P2-01 — the engine's five factors replace the brief's five components as the operational IQS. Approved 2026-10-17.**
The brief's literal formula needs five 0–100 sub-scores. Mirror can compute two
of them (Depth-in-time, Intentionality) from tier D, one partially (Focus), and
none for Active engagement and Follow-through without data it is not allowed to
collect. The engine therefore uses only what it can measure and names the rest.
*If approved:* no code change; this file and the Why sheet are the record.
*If rejected:* the alternative is to re-weight the same five measures to
35/25/20/10/10 (max 90 until Follow-through exists) or to adopt the literal
formula with zeros for missing components — which would violate rule 9 ("never
fake a signal"), so it needs to be an explicit product decision, not a default.

**D-P2-02 — no doomscroll penalty. Approved 2026-10-17.**
The brief subtracts up to 25 points. The engine has no penalty term: fragmentation
(`switching`) and late-night time are scored as factors, so poor behaviour already
lowers the score, and a second subtraction would count the same minutes twice.
*If approved:* no code change. *If rejected:* the penalty's inputs and cap have to
be defined; the prototype used short-session share and late-night share, which are
already factors here.

**D-P2-03 — a missing factor reduces the maximum; it is never a zero and never renormalised. Approved 2026-10-17.**
The brief's fixed weights assume every component exists. Mirror reports `49/75`
rather than scaling 49/75 up to 65/100, because renormalising silently changes the
weights and a zero would claim a measurement that was never made.
*If approved:* no code change. *If rejected:* the score becomes comparable only
within a tier, and the UI copy has to say that the missing components are scored
as zero.

**D-P2-04 — the expansion of IQS. Approved 2026-10-17: use "Interaction Quality Score".**
The brief's prototype expands IQS as *"Interaction quality score"*; the P2 UI
said *"Interest Quality Score"* and the Home card said *"Interest quality"*. The
metric is the same; the words were not. Per review 2026-10-17 the spec wins:
IQS is **Interaction Quality Score** everywhere — docs, code comments and UI
copy. The UI now says "Interaction quality" on the Home card and
"Interaction Quality Score" on the sheet. The mockup gallery is regenerated
from the screen, so its frames follow the same copy.


---

## 3. Factors

Each section gives the formula, the inputs, when it becomes measurable, its
caveats, and a worked example from the demo week (usage-only persona Ananya:
273 sittings, 60 decisive labels, 31 % short, 43 % late, 13.6 switches/h).

### `session_length` — 25 points, tier D

**Formula.** `points = round1(25 × (1 − nShort / nSessions))`, where
`nShort = |{s : duration(s) < 8 000 ms}|`. A session is one app's merged
foreground interval inside the window.

**Inputs.** `app_foreground` / `app_background` events from Android UsageStats,
sessionised. No content, no titles.

**Measurable when.** `nSessions > 0`. Otherwise `null` and 25 points leave `max`.

**Caveats.**
- It measures **abandoned opens**, not depth: a 3-hour sitting and a 9-minute
  sitting both count as "not short". The UI must not call this "deep use".
- The brief's Depth also required completion (> 15 %) and query refinement; this
  factor has neither, which is why it is 25 and not 35.
- Longer is not better: the factor stops rewarding at 8 s, deliberately.
- An unclosed interval is dropped, so a crash mid-session lowers the denominator
  rather than inventing a duration.

**Worked example.** Ananya: 84 of 273 opens under 8 s → `25 × (1 − 0.3077) =
17.3`.

**Tests.** `scoring.test.mjs`: empty, zero-duration, single event, all-under-8 s,
arithmetic closure, fast-check bounds.

### `deliberate_share` — 20 points, tier D

**Formula.** `points = round1(20 × intentional / decisive)`, `decisive =
intentional + mindless`. `unsure` is excluded from both numerator and denominator.
Requires `decisive ≥ 5` (`MIN_LABELS`).

**Inputs.** The person's own intent labels (J25), one label per session id. This is
the only factor that is self-report rather than observation.

**Measurable when.** ≥ 5 decisive labels. Otherwise `null` and 20 points leave
`max`.

**Caveats.**
- **Self-report**, requested occasionally, never inferred from content. A mood can
  move the score; the confidence line says how many labels it rests on.
- One label per sitting, so a 40-minute sitting counts the same as a 2-minute one.
  The label is about the *choice to open*, not the duration.
- `unsure` is not "mindless": excluding it prevents a non-answer from becoming a
  negative.
- The brief called this Intentionality (0.25); the engine's 20 is a deliberate
  5-point difference — see D-P2-01.

**Worked example.** Ananya: 43 of 60 intentional → `20 × 0.7167 = 14.3`.

**Tests.** half-intentional, too-few-labels (max falls, not zero), `unsure`
excluded, fast-check.

### `switching` — 15 points, tier D

**Formula.** `points = round1(15 × 20 / (perHour + 20))`, where
`perHour = switches / activeHours`. A **switch** is a consecutive pair of
different-app sessions whose gap is ≤ 5 minutes (`SWITCH_GAP_MS`).
`activeHours = total session ms / 3 600 000`.

**Inputs.** Session app ids and timings. App identity is metadata, sealed at rest.

**Measurable when.** ≥ 3 sittings. Otherwise `null` and 15 points leave `max`.

**Caveats.**
- Smooth by design: 0/h scores 15, 20/h scores 7.5, 100/h scores 2.5, and it never
  reaches zero. A cliff would punish one unusual hour; a population benchmark
  would be the comparison the product promises not to make.
- Switching is not inherently bad (some tasks need two apps). The factor is
  "pressure", not "failure".
- Sessions are per app, so scrolling within one feed is invisible here.
- A gap over 5 minutes starts a new sitting and is not a switch.

**Worked example.** Ananya: 113 switches / 8.3 active hours = 13.6/h →
`15 × 20 / 33.6 = 8.9`.

**Tests.** monotonic decrease, bounded (0, 15], never divides by zero, < 3
sittings unmeasured.

### `late_night` — 15 points, tier D

**Formula.** `points = round1(15 × (1 − lateMs / totalMs))`, where `lateMs` is the
part of each session inside **23:00–05:00 local**, computed by walking local days
so a session crossing midnight is counted on both sides. Local time comes from
`utcOffsetMinutes` supplied by the caller.

**Inputs.** Session start/end and the device's UTC offset. No content.

**Measurable when.** `totalMs > 0`. Otherwise `null` and 15 points leave `max`.

**Caveats.**
- **Time zone is an input.** A wrong offset shifts the window; the engine never
  guesses from the device clock at read time. DST changes are handled by passing
  the offset that applied to the window.
- Night-shift workers are structurally penalised. This is a known limitation of
  time-of-day scoring, not a moral judgement, and the copy must not moralise.
- It measures *when* time was spent, not sleep and not focus. The brief's Focus
  component is only partly covered (D-P2-01).

**Worked example.** Ananya: 43 % late → `15 × 0.57 = 8.5`.

**Tests.** wrapped window, session spanning midnight, share lowers the part
proportionally.

### `topic_depth` — 25 points, tier A

**Formula.** `points = round1(25 × meanCosine)`, where `meanCosine` is the mean
pairwise cosine similarity of up to **120** scorable session vectors, each 384-d
and unit-normalised. Needs ≥ 5 vectors.

**Inputs.** Topic vectors attached to sittings by a **real** encoder
(`isScorableModel` rejects any model id containing "placeholder"). The placeholder
n-gram embedder is explicitly excluded.

**Measurable when.** ≥ 5 scorable vectors. Otherwise `null` and 25 points leave
`max`.

**Caveats.**
- It measures **coherence**, not quality: a week of one topic scores high; a
  deliberately broad week scores lower. Never present it as "better".
- The brief did not name this factor. It is the engine's addition, and it is
  excluded until a real encoder ships (P5).
- Cosine ignores magnitude; two unrelated short vectors can look similar by
  chance, which is why the sample floor is 5 and the sample is capped at 120
  (7 140 pairs, O(n²), cheap for one week).
- A mean is not a distribution: the Why sheet says how many sittings it covers.

**Worked example.** Usage-only personas have zero scorable vectors, so the factor
is `null` and Ananya's score is `49/75` — not `49/100`.

**Tests.** placeholder excluded, coherent vectors earn points, < 5 vectors
unmeasured.

---

## 4. The composite

```
value = null                                   if no factor is measurable
      = round1(Σ points of measurable factors) otherwise
max   = Σ max of measurable factors            (100, 75, or less)
band  = "not measured" | "usage-only band" | "full band"
```

- **Never rescaled.** `value/max` is the score; the UI prints `/ 75` when topic
  depth is missing.
- **Never zero for unknown.** `value === null` and `band === "not measured"`.
- **Parts close.** `Σ points` is asserted equal to `value` in the suite.
- **Stable arithmetic.** One decimal; no floating drift in the sum beyond `round1`.

## 5. Confidence

Confidence is **not** a probability and not a statistical interval. It is a
coverage-and-sample indicator, and every component is shown as a sentence:

```
coverage    = 1 − overlap(counted gap spans, window) / windowMs
sampleScore = min(1, sessions / 30)
labelScore  = min(1, decisiveLabels / 20)
tierScore   = measurableFactors / 5
score       = 0.4·coverage + 0.25·sampleScore + 0.2·labelScore + 0.15·tierScore
level       = none (0 sessions) | high ≥ 0.75 | medium ≥ 0.5 | low otherwise
```

Reasons always include: the gap statement, the sitting count, the label count and
the topic statement; partial coverage adds the "covers N of 100 points" sentence.

**Caveats.**
- The weights are a product choice, not a statistical derivation.
- Gaps with no `fromMs`/`toMs` count as a gap count but contribute **zero** to
  coverage — the engine will not invent a span.
- Sample and labels saturate: 30 sittings and 20 labels are "enough" by design,
  so a large week does not get a confidence above 1 (and 0.97 is the usage-only
  ceiling, set by 4/5 factors).

### 5.1 OS totals for per-app daily, open times only (P2 fix: no invented durations)

**Direction change round 8 (2026-10-22):** Event-reconstruction lost 99% for games (Honkai 31s vs OS 52m48s, Genshin 27s vs 9m36s, 336 orphan events). Root causes: systemui fg (notification shade) closing previous at 31s (OS still counts Honkai as fg), per-class mismatch fg MainActivity vs bg empty, cursor overlap 2s fg outside window bg inside → orphan, unknown types CONFIGURATION_CHANGE=5 and FOREGROUND_SERVICE 19-22 dropped.

**Round 8 rule (superseded):** Per-app daily totals from OS aggregate, session timeline approximate scaled to daily totals where disagree (`factor = os/sess` when `abs(os-sess) > max(10%*os,60s)`).

**P2 fix round 11 (2026-10-22):** Scaled timeline invents durations – Genshin orig 22s shown as 8m54s, Security orig 7m20s shown as 16s, orphans 319 still. Fix: **show only open times (when app came to foreground), no durations, no scaling.** Daily totals from OS aggregate are authoritative, open times informative.

**Current rule (P2 close):**
- **Per-app daily totals** come from OS aggregate `UsageStatsManager.queryUsageStats(INTERVAL_DAILY)` – same source Digital Wellbeing uses, one local day per bucket. Totals match by construction. Excludes launchers (HOME role via `getLauncherPackages()`) and Mirror itself and system UI (Settings rule: exclude `com.android.settings`, `systemui`, `permissioncontroller`, `packageinstaller`, `intentresolver`, `android` everywhere – only launchers+Mirror close previous).
- **App opens** come from raw `UsageEvents` (RESUMED=1, PAUSED=2, STOPPED=23, DESTROYED=24, SCREEN_NON_INTERACTIVE=16, KEYGUARD_SHOWN=17, DEVICE_SHUTDOWN=26). Show only `start_ms` (open time), no `duration_ms`, no `scaled_duration_ms`, no scaling. This avoids inventing durations (Genshin 22s→8m54s, Security 7m20s→16s) when raw events lose 99% due to orphans.
- **Orphans 319:** many bg without fg due to fg outside 2s overlap window bg inside, single-foreground closes previous at next fg later bg becomes orphan, className mismatch, systemui fg. With OS totals for per-app daily, orphan count no longer affects totals, only timeline. Timeline now shows open times only, so orphans do not invent durations.
- **Scores must not use scaled durations or start/end as exact:** `ScoreInput` has optional `approximate?: boolean`. When true (sessions from raw events, approximate), `confidenceFor` caps confidence score to **0.49** and forces level `low`, with reason explaining 99% loss. IQS value may still be computed but confidence low, so UI must not present it as exact. Sessions count, focus windows, rabbit hole, curiosity vs habit must not use scaled durations or start/end times as exact – they must use OS totals or original sessions with low confidence, or be marked approximate. With open-times-only UI, durations not shown at all.
- **0.49 cap:** When `approximate` true, `score = min(score, 0.49)` and `level = low` regardless of computed coverage/sample/labels. This prevents approximate timeline (which loses 99% for games) from feeding scores as high/medium confidence exact. Documented in `scoring.ts` `confidenceFor`. IQS in J3 dashboard shows `/75` when only tier D (usage patterns) available, with “Based on usage patterns only” chip and data-tier chip D, and Why sheet.
- **Fixture:** `honkai-day-raw.json` is synthetic invented to reproduce 31s vs 52m48s, will be replaced with real raw events captured via hidden debug screen Share button. See `packages/core-analytics/tests/fixtures/README.md` for capture steps. Until real day captured, show only open times – no scaling.

**J3 dashboard wiring:** Real J3 (Frosted Horizon) wired to real data – IQS from `scoreIqs` with real sessions (tier-D only), `WhySheet` with parts summing to score, `Chip` “Based on usage patterns only”, `TierBadge` D + `ConfidenceChip` D, caveat, confidence reasons. Per-app totals OS, app opens only.

## 6. Curiosity vs habit (displayed beside IQS, not part of it)

```
deepMs     = Σ duration of sittings labelled intentional
habitMs    = Σ duration of sittings labelled mindless
unlabeled  = Σ duration of sittings with no label
switches/h = the same switching rate as above
```

Requires ≥ 5 decisive labels; otherwise `null` and the screen shows the empty
state. Caveats: the split is self-report, a long sitting counts once, and nothing
in the product frames habit as a failure or sends a nudge about it.

## 7. Depth bands (distribution, not a score)

Counts and milliseconds per band: `< 8 s`, `8 s – 1 min`, `1 – 5 min`,
`5 – 20 min`, `> 20 min`. Bands describe a distribution; they do not rank apps or
people.

## 8. What is deliberately not measured

- Watch completion, scroll depth, query refinement (tier C/A; not in P2).
- Active engagement (no interaction events; scraping is forbidden).
- Follow-through (needs a return-to-task signal).
- Anything on another device.
- Content by name: titles never enter a score, and topic vectors are sealed at
  rest and derived from content only on-device.

## 9. Versioning

Bump `IQS_METRICS_VERSION` in `scoring.ts` (and this file's heading) when a formula
or a weight changes. Scores are recomputable from the store: sessions, labels,
gaps and vectors are all retained, so a re-score does not need the old payload —
but the UI must not compare scores computed under different versions without
saying so.

Current version: **1** (P2).
