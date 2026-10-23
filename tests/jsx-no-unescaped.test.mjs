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
  const textTagRegex = /<Text[^>]*>([^<]*?)<\/Text>/gs;
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

test('App.tsx has no unescaped < > in JSX Text that would break Metro bundler (e.g., <50, <=2s)', () => {
  const appPath = join(ROOT, 'apps/mobile/App.tsx');
  const issues = findUnescapedJsxText(appPath);
  if (issues.length > 0) {
    console.error('Found unescaped JSX issues in App.tsx:');
    for (const iss of issues) {
      console.error(`  Line ${iss.line}: ${iss.snippet}`);
    }
  }
  assert.equal(issues.length, 0, `App.tsx has ${issues.length} unescaped < > in JSX Text – use {'...'} or &lt; &gt; to avoid SyntaxError in :app:createBundleReleaseJsAndAssets (like 689:364 <50 bug)`);
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

test('no literal {{ }} double braces in JSX Text', () => {
  const appPath = join(ROOT, 'apps/mobile/App.tsx');
  const text = readFileSync(appPath, 'utf8');
  const issues = [];
  const regex = /<Text[^>]*>([^<]*\{\{[^}]*\}\}[^<]*?)<\/Text>/gs;
  for (const m of text.matchAll(regex)) {
    const inner = m[1];
    const line = text.slice(0, m.index).split('\n').length;
    issues.push({ line, snippet: inner.trim().slice(0, 200) });
  }
  assert.equal(issues.length, 0, `Found literal {{ }} in JSX Text: ${JSON.stringify(issues)}`);
});
