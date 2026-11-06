/**
 * packages/ui/tests/intent-check-ui.test.mjs
 *
 * P4.4c Intent Check UI guards (source-level, no device needed):
 *   - exactly three answers: Intentional, Mindless, Not sure
 *   - no guilt, streak, red, or alarm copy in the card, settings, or notification
 *   - no overlay, modal, alert, or sound (in-app card and quiet notification only)
 *   - permission is requested only from the explicit turn-on path
 *   - the Home card is mounted on Home; the toggle lives in Settings
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bundleTs } from '../../../scripts/lib/ts-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const CARD = read('apps/mobile/src/components/IntentCheckCard.tsx');
const SETTINGS = read('apps/mobile/src/components/IntentCheckSettings.tsx');
const HOME = read('apps/mobile/src/tabs/HomeTab.tsx');
const REMINDERS = read('apps/mobile/src/components/ReminderSettings.tsx');
const PROVIDER = read('apps/mobile/src/MirrorAppProvider.tsx');
const CORE_SRC = read('packages/core-analytics/src/intentCheck.ts');

const FORBIDDEN = /streak|wasted|failed|wrong|bad\b|lost|should have|you were|fell off|overlay|modal|alert\(|vibrat|sound/i;

test('intent check: exactly three answers, in the agreed wording', () => {
  const list = CARD.slice(CARD.indexOf('export const INTENT_CHECK_ANSWERS'), CARD.indexOf('export function IntentCheckCard'));
  const texts = [...list.matchAll(/text: '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(texts, ['Intentional', 'Mindless', 'Not sure']);
  // The card renders its answers from that list, so the wording is single-sourced.
  assert.match(CARD, /INTENT_CHECK_ANSWERS\.map/);
});

test('intent check: no guilt, streak, red, alarm, or overlay copy in the feature', async () => {
  const core = await bundleTs(join(ROOT, 'packages/core-analytics/src/intentCheck.ts'), {
    outfile: join(HERE, '.build', 'intent-check-ui-core.mjs'),
  });
  const copy = [
    core.INTENT_CHECK_NOTIFICATION_TITLE,
    core.INTENT_CHECK_NOTIFICATION_BODY,
    CARD,
    SETTINGS,
  ].join('\n');
  // Only check user-facing text: strip import lines and identifiers.
  const userText = copy
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^import .*$/gm, '');
  assert.equal(FORBIDDEN.test(userText), false, `forbidden copy found: ${userText.match(FORBIDDEN)?.[0]}`);
});

test('intent check: the notification is quiet (no sound, no vibration) and does not name the app', async () => {
  const core = await bundleTs(join(ROOT, 'packages/core-analytics/src/intentCheck.ts'), {
    outfile: join(HERE, '.build', 'intent-check-ui-core2.mjs'),
  });
  assert.equal(core.INTENT_CHECK_NOTIFICATION_TITLE, 'Mirror');
  assert.equal(/app|package|\.[a-z]+\.[a-z]+/i.test(core.INTENT_CHECK_NOTIFICATION_BODY), false);
  assert.match(CORE_SRC, /INTENT_CHECK_NOTIFICATION_ID = 4401/);
});

test('intent check: permission is requested only on the explicit turn-on path', () => {
  const block = PROVIDER.slice(PROVIDER.indexOf('const updateIntentCheck'), PROVIDER.indexOf('const answerIntentCheck'));
  assert.match(block, /if \(enabled\) \{[\s\S]*?requestOptInNotificationPermission\(rt\.usage\(\)\)/);
  // The card and the runtime never request permission.
  assert.equal(CARD.includes('requestOptInNotificationPermission'), false);
  assert.equal(SETTINGS.includes('requestOptInNotificationPermission'), false);
});

test('intent check: card is on Home; toggle lives in Settings; both are mounted', () => {
  assert.match(HOME, /import \{ IntentCheckCard \} from '\.\.\/components\/IntentCheckCard'/);
  assert.match(HOME, /<IntentCheckCard \/>/);
  assert.match(REMINDERS, /<IntentCheckSettings \/>/);
  assert.match(SETTINGS, /testID="intent-check-toggle"/);
});

test('intent check: the answer path writes through the single label writer', () => {
  assert.match(PROVIDER, /await rt\.answerIntentCheck\(sessionId, lbl\)/);
  assert.match(PROVIDER, /setSittingLabels\(updatedLabels\)/);
});

test('intent check: default off in the core policy', () => {
  assert.match(CORE_SRC, /enabled: false,/);
});

test('intent check: one line when notifications are denied (exact wording, gated)', () => {
  assert.ok(
    SETTINGS.includes('Notifications are off, so the question appears in the app only.'),
    'exact denial line',
  );
  assert.match(SETTINGS, /const notificationsOff = enabled && notificationsAllowed === false;/);
  assert.match(SETTINGS, /\{notificationsOff \? \(/);
});
