import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

function findUnescapedJsxText(filePath) {
  const text = readFileSync(filePath, 'utf8');
  const issues = [];
  // Find <Text ...>...</Text> where inner is plain text (no { } interpolation) containing < that would break Metro bundler (e.g., <50, <=2s)
  // If inner contains {, it's a JS expression like {`... >= ...`} or {variable}, so < > inside JS string is safe – skip
  const textTagRegex = /<(?:Text|Body|Caption|H1|H2|Mono|Pill|LinkButton)[^>]*>([^<]*?)<\/(?:Text|Body|Caption|H1|H2|Mono|Pill|LinkButton)>/gs;
  for (const m of text.matchAll(textTagRegex)) {
    const inner = m[1];
    if (inner.trim() === '') continue;
    // Skip if inner contains { or } – it's JS expression, not plain JSX text
    if (inner.includes('{') || inner.includes('}')) continue;
    // Skip if already escaped
    if (inner.includes('&lt;') || inner.includes('&gt;')) {
      const cleaned = inner.replace(/&lt;/g, '').replace(/&gt;/g, '');
      if (!/[<>]/.test(cleaned)) continue;
    }
    // Check for literal < followed by digit/letter/= or <= >= that would be parsed as JSX tag and cause SyntaxError in :app:createBundleReleaseJsAndAssets (like 689:364 <50 bug)
    if (/<\s*\d|<\s*[a-zA-Z]|<==|<=|>=/.test(inner)) {
      const line = text.slice(0, m.index).split('\n').length;
      issues.push({ line, snippet: inner.trim().slice(0, 200), file: filePath });
    }
  }
  // Also check JSX prop caption="... <50 ..." – attribute value with < inside quotes is okay in JSX string, but to be safe flag <50, <=, < 50 in caption
  const captionRegex = /caption="[^"]*<[^"]*"/g;
  for (const m of text.matchAll(captionRegex)) {
    const snippet = m[0];
    if (/<\s*\d/.test(snippet) || /<=/.test(snippet)) {
      const line = text.slice(0, m.index).split('\n').length;
      issues.push({ line, snippet: snippet.slice(0, 200), file: filePath, type: 'caption' });
    }
  }
  return issues;
}

test('apps/mobile (.tsx files) have no unescaped < > in JSX text that would break Metro bundler', async () => {
  const { globSync } = await import('node:fs');
  const files = ['apps/mobile/App.tsx', ...globSync('apps/mobile/src/**/*.tsx', { cwd: ROOT })];
  assert.ok(files.length >= 9, `expected mobile .tsx files to be scanned, found ${files.length}`);
  const allIssues = [];
  for (const rel of files) {
    const full = join(ROOT, rel);
    const issues = findUnescapedJsxText(full);
    allIssues.push(...issues.map((i) => ({ ...i, file: rel })));
  }
  if (allIssues.length > 0) {
    console.error('Found unescaped JSX issues in apps/mobile:');
    for (const iss of allIssues) {
      console.error(`  ${iss.file}:${iss.line}: ${iss.snippet}`);
    }
  }
  assert.equal(
    allIssues.length,
    0,
    `apps/mobile has ${allIssues.length} unescaped < > in JSX text – use {'...'} or &lt; &gt;`,
  );
});

test('packages/ui has no unescaped < > in JSX Text', async () => {
  const { globSync } = await import('node:fs');
  const files = globSync('packages/ui/src/**/*.tsx', { cwd: ROOT });
  const allIssues = [];
  for (const rel of files) {
    const full = join(ROOT, rel);
    const issues = findUnescapedJsxText(full);
    allIssues.push(...issues.map(i => ({ ...i, file: rel })));
  }
  if (allIssues.length > 0) {
    console.error('Found unescaped JSX issues in packages/ui:');
    for (const iss of allIssues) {
      console.error(`  ${iss.file}:${iss.line}: ${iss.snippet}`);
    }
  }
  assert.equal(allIssues.length, 0, `packages/ui has ${allIssues.length} unescaped < > in JSX Text`);
});

test('no literal {{ }} double braces in JSX text across apps/mobile', async () => {
  const { globSync } = await import('node:fs');
  const files = ['apps/mobile/App.tsx', ...globSync('apps/mobile/src/**/*.tsx', { cwd: ROOT })];
  const issues = [];
  const regex = /<(?:Text|Body|Caption|H1|H2|Mono|Pill|LinkButton)[^>]*>([^<]*\{\{[^}]*\}\}[^<]*?)<\/(?:Text|Body|Caption|H1|H2|Mono|Pill|LinkButton)>/gs;
  for (const rel of files) {
    const text = readFileSync(join(ROOT, rel), 'utf8');
    for (const m of text.matchAll(regex)) {
      const inner = m[1];
      const line = text.slice(0, m.index).split('\n').length;
      issues.push({ file: rel, line, snippet: inner.trim().slice(0, 200) });
    }
  }
  assert.equal(issues.length, 0, `Found literal {{ }} in JSX text: ${JSON.stringify(issues)}`);
});

test('apps/mobile and core-analytics contain no stale "OS aggregate" wording and explicitly label Stored / Approximate older-day sources', async () => {
  const { globSync } = await import('node:fs');
  const sourceFiles = [
    'apps/mobile/App.tsx',
    ...globSync('apps/mobile/src/**/*.{ts,tsx}', { cwd: ROOT }),
    ...globSync('packages/core-analytics/src/**/*.ts', { cwd: ROOT }),
  ];
  const staleHits = [];
  for (const rel of sourceFiles) {
    const text = readFileSync(join(ROOT, rel), 'utf8');
    if (/os aggregate/i.test(text)) {
      staleHits.push(rel);
    }
  }
  assert.deepEqual(staleHits, [], `Stale "OS aggregate" copy found in: ${staleHits.join(', ')}`);

  const homeTab = readFileSync(join(ROOT, 'apps/mobile/src/tabs/HomeTab.tsx'), 'utf8');
  assert.match(homeTab, /Stored · Mirror events/);
  assert.match(homeTab, /Approximate · OS daily buckets/);
  assert.match(homeTab, /Day-clipped OS foreground events/);

  const debugView = readFileSync(join(ROOT, 'apps/mobile/src/components/DebugView.tsx'), 'utf8');
  assert.match(debugView, /pre-00:00 bucket/);
  assert.match(debugView, /Totals source:/);
});

