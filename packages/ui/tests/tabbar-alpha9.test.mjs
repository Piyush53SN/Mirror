// alpha.9 C4: the tab bar's effective background must hide what scrolls behind it. The tint is at
// least 0.92 opaque, and the text on the bar keeps 4.5:1 against the composited background in both
// themes, over every stop of the backdrop gradient it can sit on. The scrim fades into the bar.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const OUT = join(HERE, '.build');
let tokens;

before(async () => {
  mkdirSync(OUT, { recursive: true });
  const outfile = join(OUT, 'tabbar-alpha9.mjs');
  await esbuild.build({ entryPoints: [join(HERE, '..', 'src', 'tokens.ts')], outfile, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent' });
  tokens = await import(pathToFileURL(outfile).href);
});

function parseRgba(s) {
  const m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(s);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  const h = /^#([0-9a-f]{6})$/i.exec(s);
  if (h) return { r: parseInt(h[1].slice(0, 2), 16), g: parseInt(h[1].slice(2, 4), 16), b: parseInt(h[1].slice(4, 6), 16), a: 1 };
  throw new Error(`cannot parse ${s}`);
}
function over(fg, bg) {
  const a = fg.a;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}
function lum(c) {
  const f = (v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}
function contrast(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

for (const name of ['light', 'dark']) {
  test(`${name}: the tab bar tint is at least 0.92 opaque`, () => {
    const t = tokens.createTheme(name);
    const tint = parseRgba(t.palette.tabbarTint);
    assert.ok(tint.a >= 0.92, `tint alpha ${tint.a} must be at least 0.92`);
  });

  test(`${name}: text on the tab bar keeps 4.5:1 over every backdrop stop it can sit on`, () => {
    const t = tokens.createTheme(name);
    const tint = parseRgba(t.palette.tabbarTint);
    for (const stop of t.palette.gradient) {
      const bg = over(tint, parseRgba(stop));
      for (const ink of [t.color.ink, t.color.inkMuted]) {
        const ratio = contrast(parseRgba(ink), bg);
        assert.ok(ratio >= 4.5, `${name}: ${ink} on ${stop} gives ${ratio.toFixed(2)}:1`);
      }
    }
  });
}

test('the bottom scrim fades from transparent into the backdrop behind the bar', () => {
  const src = readFileSync(join(ROOT, 'apps/mobile/src/components/AppShell.tsx'), 'utf8');
  assert.match(src, /testID="tab-bar-bottom-scrim"/);
  assert.match(src, /rgba\(theme\.palette\.gradient\[3\], 0\), rgba\(theme\.palette\.gradient\[3\], 0\.92\)/, 'transparent to 0.92 fade');
});
