// alpha.9 C3: Pill and Chip must not fix a height or clip wrapped text. A wrapped label has to grow
// its container (minHeight), and no numberOfLines may cut it. This fails if either rule is broken.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/primitives/controls.tsx', import.meta.url), 'utf8');

function body(startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  const b = src.indexOf(endMarker, a + 20);
  assert.ok(a >= 0 && b > a, `found ${startMarker}`);
  // Comments may explain the rule ("minHeight, not height:"); only code counts.
  return src.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const PILL = body('export function Pill({', '\nexport function ');
const CHIP = body('export function Chip({', '\nexport function ');

for (const [name, text] of [['Pill', PILL], ['Chip', CHIP]]) {
  test(`${name}: no fixed height on a container that holds text`, () => {
    // `height:` as a key is a fixed height; `minHeight:` and `const height =` are not.
    assert.doesNotMatch(text, /(?<![A-Za-z])height:/, `${name} must use minHeight, not height`);
  });
  test(`${name}: no numberOfLines (wrapped text stays whole)`, () => {
    assert.doesNotMatch(text, /numberOfLines/, `${name} must not truncate its label`);
  });
}
