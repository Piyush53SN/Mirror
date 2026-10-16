#!/usr/bin/env node
/**
 * mockups/render.mjs — render every Section J screen to static HTML.
 *
 * The pages are produced by rendering the *real* design-system components (the
 * same code the app will use) through the DOM binding in rn-dom.tsx, with the
 * generated token CSS inlined. That means a mockup cannot drift from the design
 * system: if a token changes, `npm run tokens && npm run mockups` changes the
 * picture, and tests measure the artifact a reviewer looks at.
 *
 * Usage:
 *   node packages/ui/mockups/render.mjs            # all screens, all states
 *   node packages/ui/mockups/render.mjs --screen home --theme dark
 *
 * Output (committed, so a reviewer can browse the screens without running node):
 *   packages/ui/mockups/gallery/<slug>.html        one page per screen
 *   packages/ui/mockups/gallery/index.html         the gallery
 *   packages/ui/mockups/gallery/manifest.json      what was rendered (for tests)
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildRenderer, paths } from './render-lib.mjs';

const HERE = paths.here;
const UI = paths.ui;
const ROOT = paths.root;
const OUT = paths.gallery;

const args = process.argv.slice(2);
const onlyScreen = args.includes('--screen') ? args[args.indexOf('--screen') + 1] : null;

/* ---------------------------------------------------------------- build ----- */


/* ----------------------------------------------------------------- pages ---- */

/** The token CSS is the same file the app imports — no second palette. */
function tokenCss() {
  return readFileSync(join(UI, 'tokens/tokens.css'), 'utf8');
}

const pageCss = `
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #08080A; color: #ECECEC;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  body { padding: 0; }
  .wrap { display: flex; flex-wrap: wrap; gap: 32px; padding: 32px; align-items: flex-start; }
  .frame { width: 390px; height: 844px; overflow: hidden; border-radius: var(--m-radius-phone);
    box-shadow: 0 30px 80px rgba(0,0,0,0.45); position: relative; }
  .frame > div { height: 100%; }
  .meta { max-width: 360px; color: #9D9D9D; font-size: 13px; line-height: 1.5; }
  .meta h1 { color: #ECECEC; font-size: 24px; margin: 0 0 6px; }
  .meta h2 { color: #ECECEC; font-size: 14px; margin: 18px 0 6px; letter-spacing: .04em; text-transform: uppercase; }
  .meta code { color: #CACACA; }
  .tag { display: inline-block; padding: 2px 8px; border-radius: 999px; border: 1px solid #3A3A3A;
    color: #9D9D9D; font-size: 11px; margin-right: 6px; }
  .states { display: flex; gap: 32px; flex-wrap: wrap; }
  .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(430px, 1fr)); gap: 28px; padding: 28px; }
  .cell { display: flex; flex-direction: column; gap: 10px; }
  .cell .frame { transform-origin: top left; }
  .cell h3 { margin: 0; font-size: 14px; color: #ECECEC; }
  .cell p { margin: 0; font-size: 12px; color: #9D9D9D; line-height: 1.45; }
  a { color: #CACACA; }
  /* The phone frames are the artifact; the review chrome must not be measured
     as if it were part of the app. */
  [data-review-chrome] { color: #9D9D9D; }
`;

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function page({ title, head, body, subtitle }) {
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · Mirror mockup</title>
<style id="m-tokens">
${tokenCss()}
</style>
<style>${pageCss}</style>
</head>
<body>
${head ?? ''}
${body}
${subtitle ? `<p data-review-chrome style="padding:0 32px 32px;color:#9D9D9D;font-size:12px">${escapeHtml(subtitle)}</p>` : ''}
</body>
</html>
`;
}

/* ------------------------------------------------------------------ main ---- */

// Bundled + imported through the shared seam, so the tests render exactly what
// this script renders.
const mod = await buildRenderer({ force: true });
const { htmlFor, specFor, personaFor, SCREENS, PERSONAS, createTheme } = mod;

mkdirSync(OUT, { recursive: true });

const rendered = [];
for (const spec of SCREENS) {
  if (onlyScreen && spec.slug !== onlyScreen) continue;
  const states = spec.states;
  const persona = personaFor(spec);

  const frames = [];
  for (const state of states) {
    for (const theme of ['dark', 'light']) {
      const themeObj = createTheme(theme);
      const html = htmlFor({ spec, persona, state, theme: themeObj, element: mod.renderScreen(spec, persona, themeObj, state) });
      const label = `${state} · ${theme} · ${persona.name}`;
      frames.push(`
        <div class="cell">
          <h3>${spec.id} ${escapeHtml(spec.title)} — ${escapeHtml(label)}</h3>
          <div class="frame"${theme === 'light' ? ' data-theme="light"' : ''} data-screen="${spec.slug}" data-state="${state}" data-mock-theme="${theme}">${html}</div>
        </div>`);
      rendered.push({ id: spec.id, slug: spec.slug, title: spec.title, phase: spec.phase, state, theme, persona: persona.id, requires: spec.requires, rule: spec.rule, bytes: html.length });
    }
  }

  const file = page({
    title: `${spec.id} ${spec.title}`,
    subtitle: `${spec.rule} · needs tier ${spec.requires.length ? spec.requires.join('/') : 'none'} · ships in ${spec.phase}`,
    body: `<div class="wrap">
      <div class="states">${frames.join('')}</div>
      <div class="meta" data-review-chrome>
        <h1>${spec.id} · ${escapeHtml(spec.title)}</h1>
        <p>${escapeHtml(spec.rule)}</p>
        <p><span class="tag">needs ${spec.requires.length ? spec.requires.join('/') : 'no data'}</span><span class="tag">${spec.phase}</span><span class="tag">persona ${escapeHtml(persona.name)}</span></p>
        <h2>What this file is</h2>
        <p>Rendered by <code>packages/ui/mockups/render.mjs</code> from the real components in
        <code>packages/ui/screens</code> through the DOM binding, with the generated token CSS inlined.
        It is not a drawing of the screen.</p>
        <h2>Reproduce</h2>
        <p><code>npm run tokens &amp;&amp; npm --workspace @mirror/ui run mockups</code></p>
        <p><a href="./index.html">All screens</a></p>
      </div>
    </div>`,
  });
  writeFileSync(join(OUT, `${spec.slug}.html`), file);
  console.log(`rendered ${spec.id} ${spec.slug} (${frames.length} frames)`);
}

/* gallery */
const gallery = page({
  title: 'Section J — all screens',
  subtitle: 'Generated from packages/ui/screens. Dark is the default theme; light is the same tokens.',
  body: `<div class="gallery">
    ${rendered
      .filter((r) => r.state === 'default' && r.theme === 'dark')
      .map(
        (r) => `<div class="cell">
          <h3>${r.id} · ${escapeHtml(r.title)}</h3>
          <p>${escapeHtml(r.rule)}</p>
          <p><span class="tag">tier ${r.requires.length ? r.requires.join('/') : 'none'}</span><span class="tag">${r.phase}</span><a href="./${r.slug}.html">open states →</a></p>
          <iframe src="./${r.slug}.html" style="width:470px;height:920px;border:0" title="${escapeHtml(r.title)}"></iframe>
        </div>`,
      )
      .join('')}
  </div>`,
});
writeFileSync(join(OUT, 'index.html'), gallery);

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ generatedFrom: 'packages/ui/screens/index.tsx', screens: SCREENS.length, frames: rendered }, null, 2) + '\n');

if (!existsSync(join(OUT, 'index.html'))) throw new Error('gallery was not written');
console.log(`\n${rendered.length} frames · ${SCREENS.filter((s) => !onlyScreen || s.slug === onlyScreen).length} screens → ${OUT}`);
