#!/usr/bin/env node
/**
 * scripts/check-prototype.mjs — measure the prototype in a real browser.
 *
 * This is the authoritative tap-target check. tests/prototype.test.mjs runs the
 * same assertions through a hand-written DOM stub so that CI can run with no
 * browser and no network; this script does it with real layout, real fonts and
 * real CSS, which is what actually decides whether a 48dp rule holds.
 *
 * Usage:
 *   npm run check:prototype                 # puppeteer or playwright, whichever is installed
 *   node scripts/check-prototype.mjs --keep # keep the browser open (debugging)
 *
 * Exit code is non-zero if any check fails, so it can gate a release.
 * If neither browser library is installed the script says so and exits 2 —
 * it never reports success it did not measure.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = pathToFileURL(join(ROOT, 'prototype/index.html')).href;
const TABS = ['home', 'insights', 'journey', 'sessions', 'you'];
const PERSONAS = ['0', '1', '2'];

const fail = (msg) => {
  console.error(`FAIL  ${msg}`);
  failures.push(msg);
};
const ok = (msg) => console.log(`ok    ${msg}`);
const failures = [];

/* ------------------------------------------------------------ browsers ---- */

async function loadBrowser() {
  for (const pkg of ['puppeteer', 'puppeteer-core', 'playwright', 'playwright-core']) {
    try {
      const mod = await import(pkg);
      if (pkg.startsWith('puppeteer')) {
        return { name: pkg, launch: (opts) => mod.default.launch(opts) };
      }
      return { name: pkg, launch: (opts) => mod.chromium.launch(opts) };
    } catch {
      /* keep looking */
    }
  }
  return null;
}

/* --------------------------------------------------------------- main ----- */

const browserLib = await loadBrowser();
if (!browserLib) {
  console.error(
    [
      'No browser automation library available, so nothing was measured.',
      '',
      'Install one of:',
      '  npm i -D puppeteer            # downloads a Chromium build',
      '  npm i -D playwright && npx playwright install chromium',
      '',
      'Meanwhile `npm run test:prototype` runs the same assertions against the',
      'DOM stub in tests/dom-stub.mjs. That stub is not a browser: it does not do',
      'flex distribution, text shaping, RTL, or real font metrics.',
    ].join('\n'),
  );
  process.exit(2);
}

console.log(`browser:  ${browserLib.name}`);
const browser = await browserLib.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 1000, deviceScaleFactor: 2 });

// Fail the run on anything the prototype should never do at runtime.
const requests = [];
await page.setRequestInterception(true);
page.on('request', (req) => {
  requests.push(req.url());
  req.continue();
});
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));

await page.goto(PAGE, { waitUntil: 'load' });
ok('page loaded');

/* --- offline guarantee: every request must be the file itself --- */
const external = requests.filter((u) => !u.startsWith('file://') && !u.startsWith('data:'));
if (external.length) fail(`prototype made external requests: ${external.join(', ')}`);
else ok(`no network requests (${requests.length} total, all local)`);

/* --- boot into the dashboard --- */
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('[data-action="explore-demo"]')][0];
  if (btn) btn.click();
});

/* --- the 48dp rule, per persona and per tab, measured by the page and by us --- */
for (const persona of PERSONAS) {
  await page.evaluate((p) => {
    const btn = [...document.querySelectorAll(`[data-ctl="persona"][data-value="${p}"]`)][0];
    if (btn) btn.click();
  }, persona);

  for (const tab of TABS) {
    await page.evaluate((t) => {
      const btn = [...document.querySelectorAll(`[data-action="tab"][data-value="${t}"]`)][0];
      if (btn) btn.click();
    }, tab);

    const result = await page.evaluate(() => {
      const screen = document.getElementById('screen');
      const targets = [...screen.querySelectorAll('[data-tap]')].filter((el) => el.offsetParent !== null);
      const small = [];
      for (const el of targets) {
        const r = el.getBoundingClientRect();
        if (r.width < 48 || r.height < 48) {
          small.push(`${el.dataset.action || el.tagName} ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
      }
      const nameless = [...screen.querySelectorAll('button')]
        .filter((b) => b.offsetParent !== null && !(b.getAttribute('aria-label') || b.textContent.trim()))
        .length;
      return { count: targets.length, small, nameless };
    });

    if (result.small.length) fail(`persona ${persona} / ${tab}: ${result.small.join(', ')}`);
    else ok(`persona ${persona} / ${tab}: ${result.count} tap targets all >= 48dp`);
    if (result.nameless) fail(`persona ${persona} / ${tab}: ${result.nameless} buttons without an accessible name`);
  }
}

/* --- both themes, both transparency modes, 200% text: still no clipping --- */
for (const theme of ['dark', 'light']) {
  for (const transparency of ['on', 'reduced']) {
    await page.evaluate((t, tr) => {
      document.documentElement.dataset.theme = t;
      document.documentElement.dataset.transparency = tr;
    }, theme, transparency);

    const check = await page.evaluate(() => {
      const screen = document.getElementById('screen');
      const bar = screen.querySelector('.tabbar');
      const clipped = [...screen.querySelectorAll('h1, h2, .stat b, .tabbar button')]
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .map((el) => el.textContent.trim().slice(0, 24));
      return { tabbarHeight: bar ? Math.round(bar.getBoundingClientRect().height) : 0, clipped };
    });
    if (check.clipped.length) fail(`${theme}/${transparency}: text clipped: ${check.clipped.join(' | ')}`);
    else ok(`${theme}/${transparency}: no clipped headings or labels (tab bar ${check.tabbarHeight}px)`);
  }
}

for (const scale of [1.5, 2]) {
  const res = await page.evaluate((s) => {
    document.documentElement.style.setProperty('--m-text-scale', String(s));
    const screen = document.getElementById('screen');
    const overflow = [...screen.querySelectorAll('h1, h2, .stat b, .t-title, .item')]
      .filter((el) => el.scrollWidth > el.clientWidth + 2)
      .map((el) => el.textContent.trim().slice(0, 22));
    return { overflow, bodyFont: parseFloat(getComputedStyle(document.body).fontSize) };
  }, scale);
  if (res.overflow.length) fail(`text scale ${scale * 100}%: ${res.overflow.length} elements overflow (${res.overflow.slice(0, 2).join(' | ')})`);
  else ok(`text scale ${scale * 100}%: body renders at ${res.bodyFont.toFixed(1)}px, nothing overflows`);
}
await page.evaluate(() => document.documentElement.style.removeProperty('--m-text-scale'));

/* --- reduce-motion must remove animation, not just shorten it --- */
const motion = await page.evaluate(() => {
  document.documentElement.dataset.motion = 'reduced';
  const animated = [...document.querySelectorAll('*')].filter((el) => {
    const d = getComputedStyle(el).animationDuration;
    return d && d !== '0s' && parseFloat(d) > 0.05;
  }).map((el) => el.className || el.tagName);
  return animated;
});
if (motion.length) fail(`reduce-motion still animates ${motion.length} elements: ${motion.slice(0, 5).join(', ')}`);
else ok('reduce-motion: no element animates for longer than 50ms');
await page.evaluate(() => document.documentElement.dataset.motion = 'auto');

/* --- the live-blur budget, measured on the compositor inputs --- */
const blur = await page.evaluate(() => {
  const blurred = [...document.querySelectorAll('*')].filter((el) => {
    const s = getComputedStyle(el);
    const f = s.backdropFilter || s.webkitBackdropFilter;
    return f && f !== 'none' && /blur\(([1-9]|\d\d)/.test(f);
  });
  return blurred.map((el) => el.className || el.tagName);
});
if (blur.length > 3) fail(`${blur.length} live-blurred layers on screen: ${blur.join(', ')}`);
else ok(`live-blurred layers: ${blur.length} (budget 3) — ${blur.join(', ') || 'none'}`);

/* --- a frame-budget sanity number (not a benchmark, just a smoke signal) --- */
const frames = await page.evaluate(
  () =>
    new Promise((resolve) => {
      let frames = 0;
      const start = performance.now();
      const tick = () => {
        frames++;
        if (performance.now() - start < 1000) requestAnimationFrame(tick);
        else resolve(Math.round((frames * 1000) / (performance.now() - start)));
      };
      requestAnimationFrame(tick);
    }),
);
console.log(`info  ~${frames}fps while idle on this machine (a smoke signal, not a benchmark)`);

/* --- screenshots for the phase record --- */
await page.evaluate(() => {
  document.documentElement.dataset.theme = 'dark';
  document.documentElement.dataset.transparency = 'on';
});
const shotDir = join(ROOT, 'docs/design/screens');
await page.screenshot({ path: join(shotDir, 'p-ui-1-dark.png') });
await page.evaluate(() => (document.documentElement.dataset.theme = 'light'));
await page.screenshot({ path: join(shotDir, 'p-ui-1-light.png') });
ok(`screenshots written to docs/design/screens (dark/light)`);

if (consoleErrors.length) fail(`console errors: ${consoleErrors.slice(0, 3).join(' | ')}`);
else ok('no console errors or page exceptions');

if (process.argv.includes('--keep')) {
  console.log('--keep: leaving the browser open for 5 minutes');
  await new Promise((r) => setTimeout(r, 300000));
}

await browser.close();

console.log('');
if (failures.length) {
  console.error(`${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('all browser checks passed');
