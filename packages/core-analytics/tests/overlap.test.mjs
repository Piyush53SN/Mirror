import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import fc from 'fast-check';
import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const core = await bundleTs(join(PKG, 'src/index.ts'), { outfile: join(HERE, '.build', 'core-overlap.mjs') });
const { buildUsageEvents, sessionize, USAGE_EVENT_TYPE } = core;

const T0 = Date.parse('2026-10-16T09:00:00Z');
const at = (m) => T0 + m * 60_000;
const fg = (pkg, min) => ({ packageName: pkg, eventType: USAGE_EVENT_TYPE.MOVE_TO_FOREGROUND, timeStamp: at(min) });
const bg = (pkg, min) => ({ packageName: pkg, eventType: USAGE_EVENT_TYPE.MOVE_TO_BACKGROUND, timeStamp: at(min) });
const base = { sinceMs: T0, untilMs: T0 + 60 * 60_000 };

test('single foreground enforcement: new fg closes previous app', () => {
  // WhatsApp 0-10, then YouTube 10-20 without WhatsApp bg
  // Previously this left both open, now WhatsApp should close at 10
  const rows = [fg('com.whatsapp', 0), fg('com.google.android.youtube', 10), bg('com.google.android.youtube', 20)];
  const result = buildUsageEvents(rows, base);
  assert.equal(result.stats.intervals, 2, 'should have 2 intervals');
  // WhatsApp interval 0-10, YouTube 10-20
  const intervals = result.events
    .filter((e) => e.kind === 'app_background')
    .map((e) => ({ app: e.app, dur: e.duration_ms }))
    .sort((a, b) => a.app.localeCompare(b.app));
  // Check no overlap: intervals should not overlap
  const sorted = result.events
    .filter((e) => e.kind === 'app_foreground')
    .map((e) => ({ app: e.app, start: Date.parse(e.at) }))
    .sort((a, b) => a.start - b.start);
  // With single foreground, WhatsApp ends at YouTube start
  const whatsappBg = result.events.find((e) => e.app === 'com.whatsapp' && e.kind === 'app_background');
  assert.ok(whatsappBg, 'whatsapp should be closed by youtube fg');
  assert.equal(whatsappBg.duration_ms, 10 * 60_000);
});

test('no two intervals overlap (property)', () => {
  const arbRows = fc.array(
    fc.record({
      pkg: fc.constantFrom('com.a', 'com.b', 'com.c', 'com.whatsapp', 'com.supercell.brawlstars'),
      type: fc.constantFrom('fg', 'bg'),
      minute: fc.integer({ min: 0, max: 50 }),
    }),
    { maxLength: 30 },
  ).map((rows) =>
    rows.map((r) => ({
      packageName: r.pkg,
      eventType: r.type === 'fg' ? USAGE_EVENT_TYPE.MOVE_TO_FOREGROUND : USAGE_EVENT_TYPE.MOVE_TO_BACKGROUND,
      timeStamp: at(r.minute),
    })),
  );

  fc.assert(
    fc.property(arbRows, (rows) => {
      const result = buildUsageEvents(rows, base);
      const intervals = [];
      for (let i = 0; i < result.events.length; i += 2) {
        const fgEv = result.events[i];
        const bgEv = result.events[i + 1];
        if (!fgEv || !bgEv) continue;
        intervals.push({ app: fgEv.app, start: Date.parse(fgEv.at), end: Date.parse(bgEv.at) });
      }
      intervals.sort((a, b) => a.start - b.start);
      for (let i = 1; i < intervals.length; i++) {
        // No overlap allowed: next start >= prev end, because single foreground
        // Note: if same app, merge may have happened in sessionize, but here
        // buildUsageEvents should already enforce single foreground
        if (intervals[i].start < intervals[i - 1].end) {
          // Allow same start if same timestamp closing/opening, but not overlapping
          // Overlap means start < prev end and not equal
          if (intervals[i].start !== intervals[i - 1].end) {
            // If different apps, they should not overlap
            // If same app, they also should not overlap because open map prevents
            return false;
          }
        }
      }
      return true;
    }),
    { numRuns: 200 },
  );
});

test('sessionize no overlapping sessions per single-foreground input', () => {
  const ev = (kind, at, app) => ({
    schema_version: 1,
    id: `evt_${kind}_${at.replace(/\D/g, '')}_${app}`.slice(0, 40),
    kind,
    at,
    tier: 'D',
    origin: 'os',
    content: 'metadata',
    app,
  });
  const t = (h, m) => `2026-10-16T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`;

  // Simulate already de-overlapped events
  const events = [
    ev('app_foreground', t(9, 0), 'com.a'),
    ev('app_background', t(9, 10), 'com.a'),
    ev('app_foreground', t(9, 10), 'com.b'),
    ev('app_background', t(9, 20), 'com.b'),
    ev('app_foreground', t(9, 20), 'com.c'),
    ev('app_background', t(9, 30), 'com.c'),
  ];
  const { sessions } = sessionize(events);
  sessions.sort((a, b) => a.startMs - b.startMs);
  for (let i = 1; i < sessions.length; i++) {
    assert.ok(sessions[i].startMs >= sessions[i - 1].endMs, `sessions should not overlap: ${sessions[i - 1].app} ${sessions[i - 1].end} vs ${sessions[i].app} ${sessions[i].start}`);
  }
});

test('launcher foreground closes previous app but not counted', () => {
  const rows = [
    fg('com.whatsapp', 0),
    { packageName: 'com.miui.home', eventType: USAGE_EVENT_TYPE.MOVE_TO_FOREGROUND, timeStamp: at(5) },
    fg('com.google.android.youtube', 10),
    bg('com.google.android.youtube', 15),
  ];
  const result = buildUsageEvents(rows, base);
  // WhatsApp should close at 5 (launcher fg), not stay open to 10
  const whatsapp = result.events.find((e) => e.app === 'com.whatsapp' && e.kind === 'app_background');
  assert.ok(whatsapp, 'whatsapp should be closed by launcher');
  assert.equal(whatsapp.duration_ms, 5 * 60_000, 'should be 5 min, not 10');
  // Launcher itself not counted
  assert.equal(result.events.filter((e) => e.app === 'com.miui.home').length, 0);
});

test('STOPPED must not close app whose other activity is still resumed (per className tracking)', () => {
  // WhatsApp Main resumed, Conversation resumed, Main STOPPED (23), Conversation PAUSED (2)
  // App should stay open after Main STOPPED, close only at Conversation PAUSED
  const rows = [
    { packageName: 'com.whatsapp', className: 'com.whatsapp.Main', eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: at(0) },
    { packageName: 'com.whatsapp', className: 'com.whatsapp.Conversation', eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: at(1) },
    { packageName: 'com.whatsapp', className: 'com.whatsapp.Main', eventType: USAGE_EVENT_TYPE.ACTIVITY_STOPPED, timeStamp: at(5) },
    { packageName: 'com.whatsapp', className: 'com.whatsapp.Conversation', eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: at(10) },
  ];
  const result = buildUsageEvents(rows, base);
  assert.equal(result.stats.intervals, 1, 'should have 1 interval (not closed at 5)');
  const bg = result.events.find((e) => e.app === 'com.whatsapp' && e.kind === 'app_background');
  assert.ok(bg, 'should have bg');
  assert.equal(bg.duration_ms, 10 * 60_000, 'duration from earliest fg 0 to last bg 10, not 5');
});

test('multiple activities same app: close only when last activity paused', () => {
  const rows = [
    { packageName: 'com.a', className: 'A', eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: at(0) },
    { packageName: 'com.a', className: 'B', eventType: USAGE_EVENT_TYPE.ACTIVITY_RESUMED, timeStamp: at(2) },
    { packageName: 'com.a', className: 'A', eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: at(4) },
    { packageName: 'com.a', className: 'B', eventType: USAGE_EVENT_TYPE.ACTIVITY_PAUSED, timeStamp: at(8) },
  ];
  const result = buildUsageEvents(rows, base);
  assert.equal(result.stats.intervals, 1);
  assert.equal(result.events.find((e) => e.kind === 'app_background').duration_ms, 8 * 60_000);
});

test('invalid_package top 10 logging: empty and special chars counted', () => {
  const rows = [
    { packageName: '', eventType: USAGE_EVENT_TYPE.MOVE_TO_FOREGROUND, timeStamp: at(0) },
    { packageName: 'com.invalid.package!', eventType: USAGE_EVENT_TYPE.MOVE_TO_FOREGROUND, timeStamp: at(1) },
    fg('com.valid.app', 2),
    bg('com.valid.app', 5),
  ];
  const result = buildUsageEvents(rows, base);
  // Should have 1 valid interval, 2 invalid drops
  assert.equal(result.stats.intervals, 1);
  const { getTopInvalidPackages } = core;
  const top = getTopInvalidPackages(result.dropped);
  assert.ok(top.length >= 2, 'should have at least 2 invalid');
  assert.ok(top.some((t) => t.pkg === '' || t.pkg === '<empty>'), 'empty should be counted');
});
