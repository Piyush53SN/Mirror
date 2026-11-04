/**
 * packages/ui/tests/settings-consolidation-ui.test.mjs
 *
 * P4.4-UX (3): one Settings screen holds reminders (with the single quiet-hours control),
 * export and typed DELETE. Layout-only: the same stored prefs and the same handlers.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import TestRenderer from 'react-test-renderer';
import React from 'react';
import * as esbuild from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const UI = join(HERE, '..');
const ROOT = join(UI, '../..');
const OUT = join(HERE, '.build');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let mod;

before(async () => {
  mkdirSync(OUT, { recursive: true });
  const entry = join(OUT, 'entry-settings-consolidation-ui.tsx');
  const p = (x) => x.replace(/\\/g, '/');
  writeFileSync(
    entry,
    [
      `export * from '${p(join(UI, 'src/index.ts'))}';`,
      `export { SettingsSheet } from '${p(join(ROOT, 'apps/mobile/src/components/SettingsSheet.tsx'))}';`,
      `export { MirrorAppContext } from '${p(join(ROOT, 'apps/mobile/src/context/MirrorAppContext.tsx'))}';`,
      `export { DEFAULT_WEEKLY_REPORT_PREFS } from '${p(join(ROOT, 'packages/store/src/index.ts'))}';`,
    ].join('\n'),
  );
  await esbuild.build({
    entryPoints: [entry],
    outfile: join(OUT, 'settings-consolidation-ui.bundle.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    jsx: 'automatic',
    alias: { 'react-native': join(UI, 'mockups/rn-dom.tsx') },
    external: ['react', 'react-test-renderer', 'node:sqlite'],
    logLevel: 'warning',
  });
  mod = await import(pathToFileURL(join(OUT, 'settings-consolidation-ui.bundle.mjs')).href);
});

function value(extra = {}) {
  return {
    insets: { top: 0, bottom: 0, left: 0, right: 0 },
    showSettings: true,
    setShowSettings: () => {},
    weeklyReportPrefs: { ...mod.DEFAULT_WEEKLY_REPORT_PREFS },
    updateWeeklyReportPrefs: async () => ({ ok: true }),
    openNotificationSettings: () => {},
    lastReset: null,
    collectingSince: '2026-10-25',
    resetStoredData: async () => {},
    exportAllData: async () => ({ ok: true }),
    clearStoredLabels: async () => {},
    ...extra,
  };
}

function mount(v) {
  let r;
  TestRenderer.act(() => {
    r = TestRenderer.create(
      React.createElement(
        mod.ThemeProvider,
        { initialTheme: 'dark' },
        React.createElement(
          mod.MirrorAppContext.Provider,
          { value: v },
          React.createElement(mod.SettingsSheet, { open: v.showSettings, onClose: () => {} }),
        ),
      ),
    );
  });
  return r;
}

const has = (r, id) => r.root.findAll((el) => el.props?.['data-testid'] === id).length > 0;

test('Settings sheet: reminders, the single quiet-hours control, export and typed DELETE live together', () => {
  const r = mount(value());
  assert.ok(has(r, 'settings-sheet'));
  assert.ok(has(r, 'settings-reminders'), 'reminders section present');
  assert.ok(has(r, 'quiet-hours-night'), 'reminder quiet-hours control present');
  assert.ok(has(r, 'settings-local-data'), 'data controls present');
  assert.ok(has(r, 'export-data-trigger'), 'export present');
  assert.ok(has(r, 'delete-all-data-trigger'), 'typed DELETE present');
});

test('Settings sheet: nothing is shown when closed; the quiet-hours control renders its three presets once each', () => {
  const closed = mount(value({ showSettings: false }));
  assert.equal(has(closed, 'settings-sheet'), false);
  const open = mount(value());
  const ids = open.root
    .findAll((el) => String(el.props?.['data-testid'] ?? '').startsWith('quiet-hours-'))
    .map((el) => el.props['data-testid']);
  assert.deepEqual(ids.sort(), ['quiet-hours-after_midnight', 'quiet-hours-late', 'quiet-hours-night']);
});
