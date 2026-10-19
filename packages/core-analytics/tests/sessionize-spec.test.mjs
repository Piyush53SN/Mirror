import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const core = await bundleTs(join(PKG, 'src/index.ts'), { outfile: join(HERE, '.build', 'core-spec.mjs') });
const { sessionize, buildJourneys, DEFAULT_MERGE_GAP_MS, DEFAULT_CROSS_APP_LINK_GAP_MS } = core;

const ev = (kind, at, app = 'com.a') => ({
  schema_version: 1,
  id: `evt_${kind}_${at.replace(/\D/g, '')}`.slice(0, 40),
  kind,
  at,
  tier: 'D',
  origin: 'os',
  content: 'metadata',
  app,
});
const t = (h, m = 0, s = 0) => `2026-10-16T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}Z`;

test('default merge gap is 15 minutes per spec', () => {
  assert.equal(DEFAULT_MERGE_GAP_MS, 15 * 60 * 1000);
});

test('default cross-app link gap is 3 minutes per spec', () => {
  assert.equal(DEFAULT_CROSS_APP_LINK_GAP_MS, 3 * 60 * 1000);
});

test('15m idle per app merges, 16m splits', () => {
  const merged = sessionize([
    ev('app_foreground', t(9, 0), 'com.a'),
    ev('app_background', t(9, 1), 'com.a'),
    ev('app_foreground', t(9, 14), 'com.a'), // 13 min gap
    ev('app_background', t(9, 15), 'com.a'),
  ]);
  assert.equal(merged.sessions.length, 1, '13 min gap should merge under 15 min rule');

  const split = sessionize([
    ev('app_foreground', t(9, 0), 'com.a'),
    ev('app_background', t(9, 1), 'com.a'),
    ev('app_foreground', t(9, 17), 'com.a'), // 16 min gap
    ev('app_background', t(9, 18), 'com.a'),
  ]);
  assert.equal(split.sessions.length, 2, '16 min gap should split');
});

test('journey links cross-app switches within 3 min', () => {
  const { sessions } = sessionize([
    ev('app_foreground', t(9, 0), 'com.a'),
    ev('app_background', t(9, 1), 'com.a'),
    ev('app_foreground', t(9, 2), 'com.b'),
    ev('app_background', t(9, 3), 'com.b'),
  ]);
  assert.equal(sessions.length, 2);
  const journeys = buildJourneys(sessions);
  assert.equal(journeys.length, 1, 'gap 1 min between sessions should be one journey');
  assert.deepEqual(journeys[0].apps.sort(), ['com.a', 'com.b'].sort());
});

test('journey splits when gap >3 min', () => {
  const { sessions } = sessionize([
    ev('app_foreground', t(9, 0), 'com.a'),
    ev('app_background', t(9, 1), 'com.a'),
    ev('app_foreground', t(9, 5), 'com.b'),
    ev('app_background', t(9, 6), 'com.b'),
  ]);
  const journeys = buildJourneys(sessions);
  assert.equal(journeys.length, 2, 'gap 4 min should split journeys');
});
