// alpha.9 visual rules that are cheap to pin in source: one selected style with a checkmark in
// Appearance (C2), the header titles and the icon Refresh (C6), and the flat-fill rule for chips.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

test('C2: Appearance colours only the selected option, with a checkmark; the others are outlined', () => {
  const src = read('apps/mobile/src/components/AppearanceSettings.tsx');
  assert.match(src, /variant="secondary"/, 'unselected options are outlined');
  assert.match(src, /appearance === o\.id \? `✓ \$\{o\.label\}` : o\.label/, 'the selected label carries a checkmark');
});

test('C6: Home titles "Mirror" with the date as subtitle; Refresh is an icon button', () => {
  const src = read('apps/mobile/src/tabs/HomeTab.tsx');
  assert.match(src, /title="Mirror"/);
  assert.match(src, /subtitle=\{tooltipDayLabel\(selectedDay\)\}/);
  assert.match(src, /<IconButton theme=\{theme\} label="Refresh"/);
});

test('C6: the Insights subtitle is short enough for one line', () => {
  const src = read('apps/mobile/src/tabs/InsightsTab.tsx');
  const m = /subtitle=\{`([^`]*)`\}/.exec(src);
  assert.ok(m, 'Insights subtitle is a template');
  assert.ok(m[1].replace(/\$\{[^}]*\}/g, '2026-11-08').length <= 40, `subtitle "${m[1]}" should stay on one line`);
});

test('C1: the selected style is the gradient, not a flat anchor fill, in goal rows and the segmented control', () => {
  const goals = read('apps/mobile/src/components/GoalTypeOptions.tsx');
  assert.doesNotMatch(goals, /backgroundColor: selected \? theme\.color\.anchor/, 'goal rows do not use a flat anchor fill');
  assert.match(goals, /SelectedGradient/);
  const controls = read('packages/ui/src/primitives/controls.tsx');
  assert.doesNotMatch(controls, /backgroundColor: selected \? t\.color\.anchor/, 'segments do not use a flat anchor fill');
  assert.doesNotMatch(controls, /backgroundColor: selected \? t\.palette\.navSelected/, 'tabs do not use the flat nav tint');
});

test('D3: the chip rows and the time split use no flat opaque grey fill for a selected item', () => {
  const split = read('apps/mobile/src/components/HomeCharts.tsx');
  assert.doesNotMatch(split, /backgroundColor: isChosen \? theme\.glass\.chip\.fill/);
});
