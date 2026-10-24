/**
 * packages/core-analytics/tests/focuswindows.test.mjs
 *
 * Tests for J20 Focus Windows (`computeFocusWindows`):
 *   - 4 standing edge cases: empty, zero-duration, single-event, all-sessions-under-8s
 *   - Requires >= 21 distinct local days (3 weeks) AND >= 5 sittings per weekday × 4-hour cell
 *   - Clear empty states for `< 21` days and `< 5` sittings/cell
 *   - Minimum-activity guard (`>= 15 min` inside cell) before computing per-hour switching rate
 *   - Strictly zero diagnosis / clinical / chronotype wording in all outputs
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
  computeFocusWindows,
  MIN_FOCUS_WINDOW_DAYS,
  MIN_FOCUS_CELL_SESSIONS,
} = await bundleTs(join(HERE, '..', 'src/index.ts'), {
  outfile: join(HERE, '.build', 'core-focuswindows.mjs'),
});

// 2026-10-05 is a Monday (00:00 UTC)
const MON_0 = Date.parse('2026-10-05T00:00:00.000Z');
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MIN_MS = 60_000;

const FORBIDDEN_DIAGNOSIS_PATTERN =
  /\b(diagnos|disorder|adhd|attention deficit|chronotype|clinical|syndrome|addict|insomnia|impulsiv|pathology|healthy|unhealthy|dysregulat)/i;

function assertNoDiagnosisWording(res) {
  const blob = JSON.stringify(res);
  assert.equal(
    FORBIDDEN_DIAGNOSIS_PATTERN.test(blob),
    false,
    `Diagnosis/clinical wording found in FocusWindowsResult: ${blob}`,
  );
}

/* ----------------------------------------------------- 4 standing edge cases --- */

test('edge 1: empty sessions -> insufficient_days empty state (0 of 21 days), no diagnosis wording', () => {
  const res = computeFocusWindows({ sessions: [] });
  assert.equal(MIN_FOCUS_WINDOW_DAYS, 21);
  assert.equal(MIN_FOCUS_CELL_SESSIONS, 5);
  assert.equal(res.status, 'insufficient_days');
  assert.equal(res.ready, false);
  assert.equal(res.distinctDays, 0);
  assert.equal(res.daysRemaining, 21);
  assert.ok(res.emptyStateTitle.includes('21 days'));
  assert.ok(res.emptyStateBody.includes('0 of 21'));
  assert.deepEqual(res.qualifiedCells, []);
  assert.deepEqual(res.suggestedWindows, []);
  assertNoDiagnosisWording(res);
});

test('edge 2: zero-duration sessions are ignored -> insufficient_days (0 of 21 days)', () => {
  const res = computeFocusWindows({
    sessions: [{ id: 'z1', app: 'org.wikipedia', startMs: MON_0 + 9 * HOUR_MS, endMs: MON_0 + 9 * HOUR_MS }],
  });
  assert.equal(res.status, 'insufficient_days');
  assert.equal(res.distinctDays, 0);
  assertNoDiagnosisWording(res);
});

test('edge 3: single event -> insufficient_days (1 of 21 days, 20 more days needed)', () => {
  const res = computeFocusWindows({
    sessions: [
      { id: 's1', app: 'org.wikipedia', startMs: MON_0 + 9 * HOUR_MS, endMs: MON_0 + 9 * HOUR_MS + 25 * MIN_MS },
    ],
  });
  assert.equal(res.status, 'insufficient_days');
  assert.equal(res.ready, false);
  assert.equal(res.distinctDays, 1);
  assert.equal(res.daysRemaining, 20);
  assert.match(res.emptyStateBody, /1 of 21 local days recorded/);
  assertNoDiagnosisWording(res);
});

test('edge 4: all-sessions-under-8s across 21 days with 5+ sittings/cell -> ready, 0 suggested low-switching windows, switching rate hidden (<15m active)', () => {
  const sessions = [];
  // 21 consecutive days; on the 3 Mondays (day 0, 7, 14) add 2 short 4s opens each in 08:00–12:00 (= 6 sittings, 24s total)
  for (let d = 0; d < 21; d += 1) {
    const count = d % 7 === 0 ? 2 : 1;
    for (let k = 0; k < count; k += 1) {
      const start = MON_0 + d * DAY_MS + (9 + k) * HOUR_MS;
      sessions.push({ id: `d${d}_${k}`, app: 'org.wikipedia', startMs: start, endMs: start + 4_000 });
    }
  }
  const res = computeFocusWindows({ sessions, utcOffsetMinutes: 0 });
  assert.equal(res.status, 'ready');
  assert.equal(res.ready, true);
  assert.equal(res.distinctDays, 21);
  assert.equal(res.qualifiedCells.length, 1);
  assert.equal(res.qualifiedCells[0].label, 'Mon 08:00–12:00');
  assert.equal(res.qualifiedCells[0].sessionCount, 6);
  assert.equal(res.qualifiedCells[0].sustainedShare, 0);
  assert.equal(res.qualifiedCells[0].switchesPerHour, null, '24s < 15m minimum activity hides switchesPerHour');
  assert.deepEqual(res.suggestedWindows, [], '0% >=8s opens must not suggest a focus window');
  assertNoDiagnosisWording(res);
});

/* ---------------- 21-day & 5-sessions/cell boundary tests ------------------- */

test('20 days (< 21 days / 3 weeks) stays in insufficient_days empty state even when a cell already has 6 sittings', () => {
  const sessions = [];
  for (let d = 0; d < 20; d += 1) {
    const extra = d === 0 ? 5 : 1; // Mon 08:00–12:00 gets 5 + 1 + 1 = 7 sittings across 3 Mondays, yet total days = 20 < 21!
    for (let k = 0; k < extra; k += 1) {
      const start = MON_0 + d * DAY_MS + 9 * HOUR_MS + k * 20 * MIN_MS;
      sessions.push({ id: `s_${d}_${k}`, app: 'org.wikipedia', startMs: start, endMs: start + 10 * MIN_MS });
    }
  }
  const res = computeFocusWindows({ sessions, utcOffsetMinutes: 0 });
  assert.equal(res.status, 'insufficient_days');
  assert.equal(res.ready, false);
  assert.equal(res.distinctDays, 20);
  assert.equal(res.daysRemaining, 1);
  assert.equal(res.cellsMeetingSampleFloor, 1, 'reports cell progress transparently while gated');
  assert.deepEqual(res.qualifiedCells, []);
  assert.deepEqual(res.suggestedWindows, []);
  assertNoDiagnosisWording(res);
});

test('21 days with at most 4 sittings per cell (< 5 floor) returns insufficient_cell_samples empty state', () => {
  // Spread 1 sitting per day across rotating 4-hour blocks so each cell gets at most 3 sittings
  const sessions = [];
  for (let d = 0; d < 21; d += 1) {
    const blockHour = (d % 6) * 4 + 1;
    const start = MON_0 + d * DAY_MS + blockHour * HOUR_MS;
    sessions.push({ id: `rot_${d}`, app: 'org.wikipedia', startMs: start, endMs: start + 12 * MIN_MS });
  }
  const res = computeFocusWindows({ sessions, utcOffsetMinutes: 0 });
  assert.equal(res.status, 'insufficient_cell_samples');
  assert.equal(res.ready, false);
  assert.equal(res.distinctDays, 21);
  assert.equal(res.cellsMeetingSampleFloor, 0);
  assert.match(res.emptyStateTitle, /5\+ sittings yet/);
  assert.deepEqual(res.qualifiedCells, []);
  assert.deepEqual(res.suggestedWindows, []);
  assertNoDiagnosisWording(res);
});

test('21+ days with >= 5 sittings in Mon 08:00–12:00 surfaces descriptive window, excludes installers/utilities, and counts explicit labels only', () => {
  const sessions = [];
  const intentLabels = {};
  for (let d = 0; d < 21; d += 1) {
    if (d % 7 === 0) {
      // 3 Mondays × 2 sustained sittings = 6 sittings (60m total, 0 switches) in Mon 08:00–12:00
      for (let k = 0; k < 2; k += 1) {
        const id = `mon_${d}_${k}`;
        const start = MON_0 + d * DAY_MS + (9 + k) * HOUR_MS;
        sessions.push({ id, app: 'org.wikipedia', startMs: start, endMs: start + 10 * MIN_MS });
        intentLabels[id] = 'intentional';
      }
      // Excluded utility & installer opens in same block must never inflate sessionCount!
      sessions.push({
        id: `clk_${d}`,
        app: 'com.google.android.deskclock',
        startMs: MON_0 + d * DAY_MS + 8 * HOUR_MS + 10 * MIN_MS,
        endMs: MON_0 + d * DAY_MS + 8 * HOUR_MS + 11 * MIN_MS,
      });
      sessions.push({
        id: `inst_${d}`,
        app: 'com.miui.packageinstaller',
        startMs: MON_0 + d * DAY_MS + 8 * HOUR_MS + 20 * MIN_MS,
        endMs: MON_0 + d * DAY_MS + 8 * HOUR_MS + 21 * MIN_MS,
      });
    } else {
      // Other days: 1 sitting per day in 16:00–20:00 (3 sittings per weekday < 5)
      const start = MON_0 + d * DAY_MS + 17 * HOUR_MS;
      sessions.push({ id: `day_${d}`, app: 'com.reddit.frontpage', startMs: start, endMs: start + 8 * MIN_MS });
    }
  }

  const res = computeFocusWindows({ sessions, intentLabels, utcOffsetMinutes: 0 });
  assert.equal(res.status, 'ready');
  assert.equal(res.ready, true);
  assert.equal(res.distinctDays, 21);
  assert.equal(res.qualifiedCells.length, 1);
  assert.equal(res.suggestedWindows.length, 1);
  const win = res.suggestedWindows[0];
  assert.equal(win.label, 'Mon 08:00–12:00');
  assert.equal(win.sessionCount, 6, 'clock and packageinstaller excluded from cell count');
  assert.equal(win.distinctDays, 3);
  assert.equal(win.sustainedShare, 1);
  assert.equal(win.switchesPerHour, 0);
  assert.equal(win.explicitLabels.intentional, 6);
  assert.equal(win.explicitLabels.decisive, 6);
  assertNoDiagnosisWording(res);
});

test('property: Focus Windows enforces 21-day and 5-session/cell invariants with zero NaN and zero diagnosis wording', () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          dayOffset: fc.integer({ min: 0, max: 30 }),
          hour: fc.integer({ min: 0, max: 23 }),
          durSec: fc.integer({ min: 0, max: 2400 }),
          app: fc.constantFrom('org.wikipedia', 'com.reddit.frontpage', 'com.google.android.deskclock', 'dev.mirror.app'),
        }),
        { minLength: 0, maxLength: 60 },
      ),
      (rows) => {
        const sessions = rows.map((r, idx) => {
          const startMs = MON_0 + r.dayOffset * DAY_MS + r.hour * HOUR_MS + (idx % 10) * MIN_MS;
          return { id: `fw_${idx}`, app: r.app, startMs, endMs: startMs + r.durSec * 1000 };
        });
        const res = computeFocusWindows({ sessions, utcOffsetMinutes: 330 });
        if (res.distinctDays < 21) {
          assert.equal(res.status, 'insufficient_days');
          assert.equal(res.ready, false);
          assert.deepEqual(res.qualifiedCells, []);
          assert.deepEqual(res.suggestedWindows, []);
        } else if (res.cellsMeetingSampleFloor === 0) {
          assert.equal(res.status, 'insufficient_cell_samples');
          assert.equal(res.ready, false);
        } else {
          assert.equal(res.status, 'ready');
          assert.equal(res.ready, true);
          for (const cell of res.qualifiedCells) {
            assert.ok(cell.sessionCount >= 5);
            assert.ok(cell.sustainedShare >= 0 && cell.sustainedShare <= 1);
            if (cell.totalSittingMs < 15 * MIN_MS) {
              assert.equal(cell.switchesPerHour, null);
            }
          }
        }
        assert.equal(JSON.stringify(res).includes('NaN'), false);
        assertNoDiagnosisWording(res);
      },
    ),
    { numRuns: 150 },
  );
});
