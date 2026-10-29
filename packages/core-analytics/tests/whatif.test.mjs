/**
 * packages/core-analytics/tests/whatif.test.mjs
 *
 * Tests for J18 What-if Simulator (`computeWhatIf`):
 *   - 4 standing edge cases: empty, zero-duration, single-event, all-sessions-under-8s
 *   - Every scenario output is explicitly labelled "Estimate"
 *   - Never rescaled to 100 (/55 without 5 labels, /75 with 5+ labels, smaller when minimum-activity hides noisy factors)
 *   - Only measured factors enter value and max; unmeasured factors remain unmeasured
 *   - Every scenario states its assumptions explicitly AND explains when a scenario shows no change
 *   - Property-based invariants via fast-check
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const {
  buildCanonicalDaySittings,
  computeWhatIf,
  formatDurationShort,
  sessionBands,
  sumSittingSpanMs,
} = await bundleTs(join(HERE, '..', 'src/index.ts'), {
  outfile: join(HERE, '.build', 'core-whatif.mjs'),
});

const DAY_START = Date.parse('2026-10-24T00:00:00.000Z');
const DAY_END = DAY_START + 86_400_000;
const WINDOW = { fromMs: DAY_START, toMs: DAY_END };
const MIN_MS = 60_000;

/* ----------------------------------------------------- 4 standing edge cases --- */

test('edge 1: empty sessions returns hasBaseline false, no scenarios, fixed 100 scale with 0 measuredMax, no NaN', () => {
  const res = computeWhatIf({ window: WINDOW, sessions: [] });
  assert.equal(res.hasBaseline, false);
  assert.equal(res.baselineSessionCount, 0);
  assert.equal(res.baselineIqs.value, null);
  assert.equal(res.baselineIqs.max, 100);
  assert.equal(res.baselineIqs.measuredMax, 0);
  assert.equal(res.baselineIqs.unmeasuredMax, 100);
  assert.deepEqual(res.scenarios, []);
});

test('edge 2: zero-duration sessions are ignored and produce hasBaseline false', () => {
  const res = computeWhatIf({
    window: WINDOW,
    sessions: [
      { id: 'z1', app: 'org.wikipedia', startMs: DAY_START + 3_600_000, endMs: DAY_START + 3_600_000 },
    ],
  });
  assert.equal(res.hasBaseline, false);
  assert.deepEqual(res.scenarios, []);
});

test('edge 3: single-event (1 sitting of 25m -> only late_night 15 of 100 meets minimum-activity floor, never rescaled to 100)', () => {
  const res = computeWhatIf({
    window: WINDOW,
    sessions: [
      {
        id: 'single_1',
        app: 'org.wikipedia',
        startMs: DAY_START + 12 * 3_600_000,
        endMs: DAY_START + 12 * 3_600_000 + 25 * MIN_MS,
      },
    ],
    appLabels: { 'org.wikipedia': 'Wikipedia' },
    utcOffsetMinutes: 0,
  });

  assert.equal(res.hasBaseline, true);
  assert.equal(res.smallSampleBaseline, true);
  assert.equal(res.baselineIqs.max, 100);
  assert.equal(res.baselineIqs.measuredMax, 15, 'only late_night (15) meets minimum activity on 1 sitting of 25 min');
  assert.equal(res.baselineIqs.unmeasuredMax, 85);
  assert.equal(res.scenarios.length, 4);

  for (const sc of res.scenarios) {
    assert.equal(sc.badge, 'Estimate');
    assert.ok(sc.timeEstimateLabel.startsWith('Estimate:'));
    assert.ok(sc.iqsEstimateLabel.startsWith('Estimate:'));
    assert.ok(sc.assumption.length > 20);
    assert.equal(sc.estimatedIqs.max, 100);
    assert.ok(sc.estimatedIqs.measuredMax <= 15, 'never rescaled to 100');
  }

  // Pausing the only app leaves 0 sittings -> IQS not measurable (measuredMax 0, value null)
  const paused = res.scenarios.find((s) => s.id === 'pause_top_app');
  assert.equal(paused.estimatedIqs.value, null);
  assert.equal(paused.estimatedIqs.max, 100);
  assert.equal(paused.estimatedIqs.measuredMax, 0);
  assert.ok(paused.iqsEstimateLabel.includes('not rescaled to 100'));
  assert.match(paused.noChangeReason, /0 sittings remain/);
});

test('edge 4: all-sessions-under-8s (>=5 opens, <15m total) measures session_length (25 of 100) only and flags small sample', () => {
  const sessions = [0, 1, 2, 3, 4, 5].map((i) => ({
    id: `b_${i}`,
    app: i % 2 === 0 ? 'com.reddit.frontpage' : 'org.wikipedia',
    startMs: DAY_START + 10 * 3_600_000 + i * 10 * MIN_MS,
    endMs: DAY_START + 10 * 3_600_000 + i * 10 * MIN_MS + 4_000, // 4s < 8s
  }));
  const res = computeWhatIf({ window: WINDOW, sessions, utcOffsetMinutes: 0 });
  assert.equal(res.hasBaseline, true);
  assert.equal(res.smallSampleBaseline, true);
  assert.equal(res.baselineIqs.max, 100);
  assert.equal(res.baselineIqs.measuredMax, 25, 'session_length (25) only; switching & late_night hidden on 24s total');
  const skipShort = res.scenarios.find((s) => s.id === 'skip_short_bounces');
  assert.equal(skipShort.remainingSessions, 0);
  assert.equal(skipShort.estimatedIqs.value, null);
  assert.ok(skipShort.timeEstimateLabel.startsWith('Estimate:'));
  assert.ok(skipShort.iqsEstimateLabel.startsWith('Estimate:'));
});

/* ---------------- J18 no-change explanation & small-sample baseline --------- */

test('explains clearly when scenarios show no change (e.g. no sitting longer than 10 min today, no quiet-hours activity, no <8s bounce)', () => {
  // 5 daytime sittings of 4m–7m each (total 27m >= 15m, longest = 7m <= 10m, 0 late-night, 0 bounces <8s)
  const sessions = [
    { id: 's1', app: 'org.wikipedia', startMs: DAY_START + 9 * 3_600_000, endMs: DAY_START + 9 * 3_600_000 + 7 * MIN_MS },
    { id: 's2', app: 'com.reddit.frontpage', startMs: DAY_START + 10 * 3_600_000, endMs: DAY_START + 10 * 3_600_000 + 6 * MIN_MS },
    { id: 's3', app: 'org.wikipedia', startMs: DAY_START + 12 * 3_600_000, endMs: DAY_START + 12 * 3_600_000 + 5 * MIN_MS },
    { id: 's4', app: 'com.reddit.frontpage', startMs: DAY_START + 14 * 3_600_000, endMs: DAY_START + 14 * 3_600_000 + 5 * MIN_MS },
    { id: 's5', app: 'org.wikipedia', startMs: DAY_START + 16 * 3_600_000, endMs: DAY_START + 16 * 3_600_000 + 4 * MIN_MS },
  ];

  const res = computeWhatIf({
    window: WINDOW,
    sessions,
    sittingCapMinutes: 10,
    quietHours: { startHour: 23, endHour: 5 },
    utcOffsetMinutes: 0,
  });

  const cap = res.scenarios.find((s) => s.id === 'cap_sittings');
  assert.equal(cap.deltaTimeMs, 0);
  assert.match(cap.noChangeReason, /no sitting longer than 10 min today/i);
  assert.match(cap.noChangeReason, /longest sitting was 7m/i);

  const qh = res.scenarios.find((s) => s.id === 'quiet_hours');
  assert.equal(qh.deltaTimeMs, 0);
  assert.match(qh.noChangeReason, /no sitting activity fell inside 23:00–05:00 local today/i);

  const skip = res.scenarios.find((s) => s.id === 'skip_short_bounces');
  assert.equal(skip.deltaTimeMs, 0);
  assert.match(skip.noChangeReason, /no brief open under 8 s recorded today/i);
});

test('explains when cap_sittings reduces screen time while composite IQS stays unchanged (0.0 pts)', () => {
  // 5 daytime sittings on same app (0 switches, 0 late-night, 0 <8s opens), one 18m sitting capped to 10m -> -8m time, 0.0 pts IQS delta
  const sessions = [0, 1, 2, 3, 4].map((i) => ({
    id: `c_${i}`,
    app: 'org.wikipedia',
    startMs: DAY_START + (9 + i) * 3_600_000,
    endMs: DAY_START + (9 + i) * 3_600_000 + (i === 0 ? 18 * MIN_MS : 5 * MIN_MS),
  }));
  const res = computeWhatIf({ window: WINDOW, sessions, sittingCapMinutes: 10, utcOffsetMinutes: 0 });
  const cap = res.scenarios.find((s) => s.id === 'cap_sittings');
  assert.equal(cap.deltaTimeMs, -8 * MIN_MS);
  assert.equal(cap.estimatedIqs.deltaPoints, 0);
  assert.match(cap.noChangeReason, /Sitting spans drop by 8m, while IQS stays unchanged \(0\.0 pts\)/);
});

/* -------------------------- core J18 acceptance criteria -------------------- */

test('every scenario output is labelled Estimate, never rescaled to 100 (/55 without 5 labels, /75 with 5+ explicit labels), uses only measured factors, and states assumptions', () => {
  // Daytime + late-night sessions across 3 apps
  const sessions = [
    // YouTube: 35m sitting at 14:00 UTC + 30m late-night sitting at 23:20 UTC
    { id: 'yt_1', app: 'com.google.android.youtube', startMs: DAY_START + 14 * 3_600_000, endMs: DAY_START + 14 * 3_600_000 + 35 * MIN_MS },
    { id: 'yt_2', app: 'com.google.android.youtube', startMs: DAY_START + 23 * 3_600_000 + 20 * MIN_MS, endMs: DAY_START + 23 * 3_600_000 + 50 * MIN_MS },
    // Wikipedia: three daytime sittings (15m, 12m, 8m)
    { id: 'wk_1', app: 'org.wikipedia', startMs: DAY_START + 9 * 3_600_000, endMs: DAY_START + 9 * 3_600_000 + 15 * MIN_MS },
    { id: 'wk_2', app: 'org.wikipedia', startMs: DAY_START + 11 * 3_600_000, endMs: DAY_START + 11 * 3_600_000 + 12 * MIN_MS },
    { id: 'wk_3', app: 'org.wikipedia', startMs: DAY_START + 16 * 3_600_000, endMs: DAY_START + 16 * 3_600_000 + 8 * MIN_MS },
    // Reddit: one 5s bounce + two daytime sittings (6m, 7m)
    { id: 'rd_b', app: 'com.reddit.frontpage', startMs: DAY_START + 18 * 3_600_000, endMs: DAY_START + 18 * 3_600_000 + 5_000 },
    { id: 'rd_1', app: 'com.reddit.frontpage', startMs: DAY_START + 19 * 3_600_000, endMs: DAY_START + 19 * 3_600_000 + 6 * MIN_MS },
    { id: 'rd_2', app: 'com.reddit.frontpage', startMs: DAY_START + 20 * 3_600_000, endMs: DAY_START + 20 * 3_600_000 + 7 * MIN_MS },
  ];

  const osTotals = [
    { app: 'com.google.android.youtube', label: 'YouTube', totalMs: 70 * MIN_MS },
    { app: 'org.wikipedia', label: 'Wikipedia', totalMs: 35 * MIN_MS },
    { app: 'com.reddit.frontpage', label: 'Reddit', totalMs: 15 * MIN_MS },
  ];

  // Case A: 0 explicit labels -> max MUST be 55 (Deliberate share & Topic depth unmeasured!)
  const resNoLabels = computeWhatIf({
    window: WINDOW,
    sessions,
    osTotals,
    appLabels: {
      'com.google.android.youtube': 'YouTube',
      'org.wikipedia': 'Wikipedia',
      'com.reddit.frontpage': 'Reddit',
    },
    utcOffsetMinutes: 0,
  });

  assert.equal(resNoLabels.baselineIqs.max, 100);
  assert.equal(resNoLabels.baselineIqs.measuredMax, 55);
  assert.equal(resNoLabels.baselineIqs.unmeasuredMax, 45);
  assert.equal(resNoLabels.baselineTimeMs, 120 * MIN_MS);
  assert.equal(resNoLabels.timeSource, 'os_aggregate');
  assert.equal(resNoLabels.unmeasuredFactorSummary.length, 2);

  for (const sc of resNoLabels.scenarios) {
    assert.equal(sc.badge, 'Estimate');
    assert.equal(sc.estimatedIqs.badge, 'Estimate');
    assert.ok(sc.timeEstimateLabel.startsWith('Estimate:'), `missing Estimate prefix: ${sc.timeEstimateLabel}`);
    assert.ok(sc.iqsEstimateLabel.startsWith('Estimate:'), `missing Estimate prefix: ${sc.iqsEstimateLabel}`);
    assert.ok(sc.iqsEstimateLabel.includes('not rescaled to 100'));
    assert.equal(sc.estimatedIqs.max, 100);
    assert.equal(sc.estimatedIqs.measuredMax, 55, `must keep 55 measured pts without labels, got ${sc.estimatedIqs.measuredMax}`);
    assert.equal(sc.estimatedIqs.unmeasuredMax, 45);
    assert.equal(sc.estimatedIqs.measuredFactors.length, 3);
    for (const mf of sc.estimatedIqs.measuredFactors) {
      assert.ok(mf.estimateLabel.startsWith('Estimate:'));
    }
    assert.equal(sc.estimatedIqs.unmeasuredFactors.length, 2);
    assert.ok(sc.assumption.startsWith('Assumes '));
  }

  // Quiet hours 23:00–05:00 removes yt_2 (30m late night) -> Late-night quiet hours rises to full 15/15!
  const qh = resNoLabels.scenarios.find((s) => s.id === 'quiet_hours');
  const lnFactor = qh.estimatedIqs.measuredFactors.find((f) => f.id === 'late_night');
  assert.equal(lnFactor.points, 15);
  assert.ok(qh.estimatedIqs.deltaPoints > 0);

  // Case B: 6 decisive explicit labels -> measuredMax becomes 75 (4 measured Tier-D factors, Topic depth 25 still unmeasured!)
  const resWithLabels = computeWhatIf({
    window: WINDOW,
    sessions,
    osTotals,
    labels: {
      wk_1: 'intentional',
      wk_2: 'intentional',
      wk_3: 'intentional',
      rd_1: 'intentional',
      rd_2: 'mindless',
      yt_1: 'mindless',
    },
    utcOffsetMinutes: 0,
  });

  assert.equal(resWithLabels.baselineIqs.max, 100);
  assert.equal(resWithLabels.baselineIqs.measuredMax, 75);
  assert.equal(resWithLabels.baselineIqs.unmeasuredMax, 25);
  for (const sc of resWithLabels.scenarios) {
    assert.equal(sc.estimatedIqs.max, 100);
    assert.equal(sc.estimatedIqs.measuredMax, 75, `with >=5 surviving decisive labels, measuredMax must be 75 (never 100)`);
    assert.equal(sc.estimatedIqs.unmeasuredMax, 25);
    assert.equal(sc.estimatedIqs.measuredFactors.length, 4);
    assert.equal(sc.estimatedIqs.unmeasuredFactors.length, 1); // Topic depth only
  }
});

test('cap_sittings recomputes directly from sitting durations, reconciles with sitting-length bands, and never exceeds sum of time above the cap (even when OS aggregate differs)', () => {
  // Known day with long sittings matching sitting-length bands:
  //   - over 20 min: 45m + 35m = 80m (excess above 10m = 35m + 25m = 60m)
  //   - 5–20 min: 16m + 12m + 8m = 36m (excess above 10m = 6m + 2m + 0m = 8m)
  //   - 1–5 min: 4m + 3m + 2m = 9m (excess above 10m = 0m)
  //   - cross-midnight sitting: 23:10 prev day -> 00:15 today = 15m inside window (excess above 10m = 5m)
  // Total clipped sitting time = 80 + 36 + 9 + 15 = 140m (2h 20m).
  // Total time above 10m cap = 60 + 8 + 5 = 73m (1h 13m).
  // Remaining capped sitting time = (2*10) + (10+10+8) + 9 + 10 = 67m (1h 07m, -52% of 2h 20m sitting time).
  // Even when OS aggregate is smaller (1h 32m = 92m because sessionize merges <=15m idle gaps),
  // cap_sittings MUST NOT subtract 73m from 92m to produce 19m (-79%).
  const sessions = [
    { id: 'prev_midnight', app: 'org.wikipedia', startMs: DAY_START - 50 * MIN_MS, endMs: DAY_START + 15 * MIN_MS },
    { id: 'long_45', app: 'com.google.android.youtube', startMs: DAY_START + 9 * 3_600_000, endMs: DAY_START + 9 * 3_600_000 + 45 * MIN_MS },
    { id: 'long_35', app: 'com.google.android.youtube', startMs: DAY_START + 11 * 3_600_000, endMs: DAY_START + 11 * 3_600_000 + 35 * MIN_MS },
    { id: 'mid_16', app: 'org.wikipedia', startMs: DAY_START + 13 * 3_600_000, endMs: DAY_START + 13 * 3_600_000 + 16 * MIN_MS },
    { id: 'mid_12', app: 'org.wikipedia', startMs: DAY_START + 15 * 3_600_000, endMs: DAY_START + 15 * 3_600_000 + 12 * MIN_MS },
    { id: 'mid_8', app: 'com.reddit.frontpage', startMs: DAY_START + 16 * 3_600_000, endMs: DAY_START + 16 * 3_600_000 + 8 * MIN_MS },
    { id: 'short_4', app: 'com.reddit.frontpage', startMs: DAY_START + 17 * 3_600_000, endMs: DAY_START + 17 * 3_600_000 + 4 * MIN_MS },
    { id: 'short_3', app: 'com.reddit.frontpage', startMs: DAY_START + 18 * 3_600_000, endMs: DAY_START + 18 * 3_600_000 + 3 * MIN_MS },
    { id: 'short_2', app: 'com.reddit.frontpage', startMs: DAY_START + 19 * 3_600_000, endMs: DAY_START + 19 * 3_600_000 + 2 * MIN_MS },
  ];
  const osTotals = [
    { app: 'com.google.android.youtube', label: 'YouTube', totalMs: 52 * MIN_MS },
    { app: 'org.wikipedia', label: 'Wikipedia', totalMs: 26 * MIN_MS },
    { app: 'com.reddit.frontpage', label: 'Reddit', totalMs: 14 * MIN_MS },
  ]; // OS total = 92m (1h 32m)

  const clippedForBands = sessions.map((s) => ({
    ...s,
    startMs: Math.max(DAY_START, s.startMs),
    endMs: Math.min(DAY_END, s.endMs),
  }));
  const bands = sessionBands(clippedForBands);
  const bandsTotalMs = bands.reduce((sum, b) => sum + b.ms, 0);
  assert.equal(bandsTotalMs, 140 * MIN_MS);

  const expectedAbove10m = (15 - 10 + 45 - 10 + 35 - 10 + 16 - 10 + 12 - 10) * MIN_MS; // 73m
  const expectedRemaining10m = 140 * MIN_MS - expectedAbove10m; // 67m

  const res10 = computeWhatIf({
    window: WINDOW,
    sessions,
    osTotals,
    sittingCapMinutes: 10,
    utcOffsetMinutes: 0,
  });
  assert.equal(res10.baselineTimeMs, 92 * MIN_MS);
  assert.equal(res10.sittingTimeMs, bandsTotalMs);

  const cap10 = res10.scenarios.find((s) => s.id === 'cap_sittings');
  assert.equal(cap10.timeSource, 'sessions');
  assert.equal(cap10.baselineTimeMs, bandsTotalMs, 'cap_sittings baseline must equal sitting-length bands total');
  assert.equal(cap10.affectedSessions, 5);
  assert.ok(Math.abs(cap10.deltaTimeMs) <= expectedAbove10m, 'cap-reduction must never exceed sum of time above cap');
  assert.equal(Math.abs(cap10.deltaTimeMs), expectedAbove10m);
  assert.equal(cap10.estimatedTimeMs, expectedRemaining10m, 'capped sitting spans must be 67m, never 19m');
  assert.equal(Math.round(cap10.deltaTimePct * 100), -52, 'must be -52% vs 2h 20m sitting spans, never -79%');
  assert.match(cap10.timeEstimateLabel, /vs 2h 20m sitting spans/);

  // Cap at 20m: only 45m (25m above) and 35m (15m above) exceed 20m -> 40m reduction -> 100m remaining (-29%)
  const res20 = computeWhatIf({
    window: WINDOW,
    sessions,
    osTotals,
    sittingCapMinutes: 20,
    utcOffsetMinutes: 0,
  });
  const cap20 = res20.scenarios.find((s) => s.id === 'cap_sittings');
  const expectedAbove20m = (45 - 20 + 35 - 20) * MIN_MS;
  assert.equal(cap20.affectedSessions, 2);
  assert.ok(Math.abs(cap20.deltaTimeMs) <= expectedAbove20m);
  assert.equal(Math.abs(cap20.deltaTimeMs), expectedAbove20m);
  assert.equal(cap20.estimatedTimeMs, 100 * MIN_MS);
});

test('reconciles Home sitting spans and Insights What-if / Depth sitting spans with zero rounding or terminology discrepancy (including .8s sub-second boundary)', () => {
  // Exact boundary case: 2h 4m 59.8s (7,499,800 ms) previously formatted as "2h 4m sitting spans"
  // via Math.floor on Home vs "2h 5m sitting time" via Math.round in What-if.
  const sessions = [
    { id: 'h_1', app: 'com.openai.chatgpt', startMs: DAY_START + 3_600_000, endMs: DAY_START + 3_600_000 + 69 * MIN_MS },
    { id: 'h_2', app: 'cn.wps.moffice_eng.xiaomi.lite', startMs: DAY_START + 3 * 3_600_000, endMs: DAY_START + 3 * 3_600_000 + 25 * MIN_MS },
    { id: 'h_3', app: 'com.whatsapp', startMs: DAY_START + 5 * 3_600_000, endMs: DAY_START + 5 * 3_600_000 + 30 * MIN_MS + 59_800 },
  ];
  const canonical = buildCanonicalDaySittings(sessions, { window: WINDOW });
  const homeSittingSpanMs = sumSittingSpanMs(canonical);
  const homeLabel = `${formatDurationShort(homeSittingSpanMs)} sitting spans`;
  assert.equal(homeLabel, '2h 4m sitting spans');

  const whatIf = computeWhatIf({
    window: WINDOW,
    sessions: canonical,
    sittingCapMinutes: 10,
    utcOffsetMinutes: 330,
  });
  const bands = sessionBands(canonical);
  const bandTotalMs = bands.reduce((sum, b) => sum + b.ms, 0);

  assert.equal(whatIf.sittingTimeMs, homeSittingSpanMs);
  assert.equal(bandTotalMs, homeSittingSpanMs);
  assert.equal(`${formatDurationShort(whatIf.sittingTimeMs)} sitting spans`, homeLabel);
  assert.equal(`${formatDurationShort(bandTotalMs)} sitting spans`, homeLabel);

  for (const sc of whatIf.scenarios) {
    assert.equal(sc.timeEstimateLabel.includes('sitting time'), false, `stale 'sitting time' in ${sc.timeEstimateLabel}`);
    assert.equal(sc.assumption.includes('sitting time'), false, `stale 'sitting time' in ${sc.assumption}`);
    if (sc.timeSource === 'sessions') {
      assert.ok(
        sc.timeEstimateLabel.includes(`vs ${homeLabel}`),
        `expected '${homeLabel}' in '${sc.timeEstimateLabel}'`,
      );
    }
  }
});

test('property: What-if invariants hold across arbitrary sessions, OS totals, labels, caps, and quiet hours', () => {
  const VALID_TIER_D_MAXIMA = [0, 15, 25, 30, 40, 45, 55, 60, 75];
  const appArb = fc.constantFrom(
    'org.wikipedia',
    'com.reddit.frontpage',
    'com.google.android.youtube',
    'com.miui.packageinstaller',
    'dev.mirror.app',
  );

  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          minute: fc.integer({ min: -45, max: 1450 }),
          durSec: fc.integer({ min: 0, max: 3600 }),
          app: appArb,
          lbl: fc.constantFrom('intentional', 'mindless', 'unsure', null),
        }),
        { minLength: 0, maxLength: 35 },
      ),
      fc.option(
        fc.array(
          fc.record({
            app: appArb,
            totalMs: fc.integer({ min: 0, max: 120 * MIN_MS }),
          }),
          { minLength: 0, maxLength: 5 },
        ),
        { nil: undefined },
      ),
      fc.constantFrom(10, 20),
      fc.constantFrom({ startHour: 23, endHour: 5 }, { startHour: 22, endHour: 7 }),
      (items, osTotals, capMin, qh) => {
        const sessions = [];
        const labelMap = {};
        items.forEach((it, idx) => {
          const id = `w_${idx}`;
          const startMs = DAY_START + it.minute * MIN_MS;
          const endMs = startMs + it.durSec * 1000;
          sessions.push({ id, app: it.app, startMs, endMs });
          if (it.lbl) labelMap[id] = it.lbl;
        });

        const res = computeWhatIf({
          window: WINDOW,
          sessions,
          osTotals,
          labels: labelMap,
          sittingCapMinutes: capMin,
          quietHours: qh,
          utcOffsetMinutes: 330,
        });

        assert.equal(res.baselineIqs.max, 100);
        assert.ok(res.baselineIqs.measuredMax !== 100, 'Tier-D without topic vectors can never have measuredMax 100');
        assert.ok(VALID_TIER_D_MAXIMA.includes(res.baselineIqs.measuredMax));
        assert.equal(res.baselineIqs.measuredMax + res.baselineIqs.unmeasuredMax, 100);

        const capMs = capMin * MIN_MS;
        const scorableSessions = sessions
          .filter((s) => s.app !== 'com.miui.packageinstaller' && s.app !== 'dev.mirror.app')
          .map((s) => ({
            ...s,
            startMs: Math.max(DAY_START, s.startMs),
            endMs: Math.min(DAY_END, s.endMs),
          }))
          .filter((s) => s.endMs > s.startMs);
        const sumAboveCapMs = scorableSessions.reduce(
          (acc, s) => acc + Math.max(0, s.endMs - s.startMs - capMs),
          0,
        );

        for (const sc of res.scenarios) {
          assert.equal(sc.badge, 'Estimate');
          assert.ok(sc.timeEstimateLabel.startsWith('Estimate:'));
          assert.ok(sc.iqsEstimateLabel.startsWith('Estimate:'));
          assert.ok(sc.assumption.length > 10);
          assert.ok(sc.estimatedTimeMs >= 0 && sc.estimatedTimeMs <= sc.baselineTimeMs);
          assert.ok(sc.deltaTimePct >= -1 && sc.deltaTimePct <= 0);
          assert.equal(Number.isNaN(sc.deltaTimePct), false);
          assert.equal(sc.estimatedIqs.max, 100);
          assert.ok(VALID_TIER_D_MAXIMA.includes(sc.estimatedIqs.measuredMax));
          assert.equal(sc.estimatedIqs.measuredMax + sc.estimatedIqs.unmeasuredMax, 100);
          if (sc.id === 'cap_sittings') {
            assert.equal(sc.baselineTimeMs, res.sittingTimeMs);
            assert.ok(
              Math.abs(sc.deltaTimeMs) <= Math.round(sumAboveCapMs),
              `cap-reduction ${Math.abs(sc.deltaTimeMs)} exceeded sum above cap ${sumAboveCapMs}`,
            );
          }
          if (sc.affectedSessions === 0 && sc.deltaTimeMs === 0) {
            assert.ok(typeof sc.noChangeReason === 'string' && sc.noChangeReason.length > 10);
          }
          if (sc.estimatedIqs.value !== null) {
            const sumPts = Math.round(sc.estimatedIqs.measuredFactors.reduce((a, b) => a + b.points, 0) * 10) / 10;
            assert.equal(sc.estimatedIqs.value, sumPts);
          }
        }
      },
    ),
    { numRuns: 200 },
  );
});
