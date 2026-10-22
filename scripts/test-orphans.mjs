#!/usr/bin/env node
import { readFileSync } from 'fs';
import { buildUsageEvents } from '../packages/core-analytics/src/usage.ts';

const honkaiRaw = JSON.parse(readFileSync('./packages/core-analytics/tests/fixtures/honkai-day-raw.json','utf8'));
const deviceRaw = JSON.parse(readFileSync('./packages/core-analytics/tests/fixtures/device-day-raw.json','utf8'));

function testFixture(name, rows) {
  const since = Math.min(...rows.map(r=>r.timeStamp));
  const until = Math.max(...rows.map(r=>r.timeStamp)) + 1000;
  const result = buildUsageEvents(rows, { sinceMs: since, untilMs: until, ignorePackages: [], maxIntervalMs: 6*3600*1000 });
  const orphans = result.dropped.filter(d=>d.reason==='orphan_background').length;
  const gaps = result.gaps.filter(g=>g.reason==='orphan_background').reduce((a,g)=>a+g.count,0);
  console.log(`${name}: rows=${rows.length}, intervals=${result.stats.intervals}, orphans dropped=${orphans}, gaps orphan=${gaps}, totalMs=${result.stats.totalMs}, carriedOut=${result.stats.carriedOut}`);
  console.log(`  dropped by reason:`, result.dropped.reduce((acc,d)=>{acc[d.reason]=(acc[d.reason]||0)+1; return acc;},{}));
  return { orphans, gaps, intervals: result.stats.intervals, totalMs: result.stats.totalMs };
}

console.log('Testing honkai-day-raw.json (synthetic 31s vs 52m48s, 336 orphan originally)');
testFixture('honkai', honkaiRaw);

console.log('\nTesting device-day-raw.json (synthetic realistic day)');
testFixture('device-day', deviceRaw);

// Simulate real day with 319 orphans: create many fg/bg with launcher closing causing duplicate bg
// Example: App A fg at T, App B fg at T+10s closes A, then bg A at T+12s duplicate -> orphan suppressed by recentClose
console.log('\nSimulating real day with duplicate bg after single-foreground close (should be suppressed)');
const simRows = [
  { packageName: 'com.example.appA', className: 'Main', eventType: 1, timeStamp: 1000000 },
  { packageName: 'com.example.appB', className: 'Main', eventType: 1, timeStamp: 1010000 }, // closes A
  { packageName: 'com.example.appA', className: 'Main', eventType: 2, timeStamp: 1012000 }, // duplicate bg shortly after close -> should be suppressed
  { packageName: 'com.example.appB', className: 'Main', eventType: 2, timeStamp: 1020000 },
  { packageName: 'com.example.appC', className: 'Main', eventType: 1, timeStamp: 1030000 },
  { packageName: 'com.example.appC', className: 'Main', eventType: 2, timeStamp: 1040000 },
];
testFixture('sim-duplicate-bg', simRows);

console.log('\nWith recentClose suppress 10s + 60s overlap, duplicate bg should be below_minimum not orphan_background');
