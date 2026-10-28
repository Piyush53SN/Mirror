import * as React from 'react';
import { Platform, ScrollView, StatusBar, View } from 'react-native';
import { Backdrop, Card, Pill, SectionHeader, Text, Toolbar, rgba, useTheme } from '@mirror/ui';
import {
  BUILD_FULL,
  J4_FULL,
  J9_FULL,
  J11_FULL,
  J18_FULL,
  J20_FULL,
  P3_GUARD_FULL,
} from '../buildDetails';
import { formatDuration, lastNDays, useMirrorApp } from '../context/MirrorAppContext';

function formatSignedDuration(diffMs: number): string {
  if (!Number.isFinite(diffMs) || diffMs === 0) return '0s';
  return `${diffMs > 0 ? '+' : '-'}${formatDuration(Math.abs(diffMs))}`;
}

export function DebugView(): React.ReactElement {
  const theme = useTheme();
  const {
    selectedDay,
    setSelectedDay,
    setShowDebug,
    dailyTotalsSource,
    validation,
    flaggedDiscrepancies = [],
    labels,
    collectingSince,
    singleDayRows,
    honkaiDebug,
    debugEvents,
    copyRawEvents,
    copyStatus,
    quality,
    latestSyncOrphans,
    raw24hOrphans,
    invalidTop,
    orphanCount,
    lastReset,
  } = useMirrorApp();

  const sourceSummary =
    dailyTotalsSource === 'stored_events'
      ? 'Stored (Mirror SQLite day-clipped events — OS UsageEvents buffer rolled off)'
      : dailyTotalsSource === 'os_bucket_approx'
        ? 'Approximate (OS INTERVAL_DAILY bucket fallback — no UsageEvents or stored events)'
        : 'OS UsageEvents (live, clipped strictly to local day)';

  const topInset =
    Platform.OS === 'android' ? (StatusBar.currentHeight ?? 28) + theme.space(1.5) : theme.space(6);

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.canvas }}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />
      <Backdrop theme={theme} />
      <View style={{ paddingTop: topInset }}>
        <Toolbar
          title="Debug – hidden"
          subtitle={`Selected day: ${selectedDay}`}
          actions={
            <Pill theme={theme} onPress={() => setShowDebug(false)}>
              Close debug
            </Pill>
          }
          theme={theme}
        />
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: theme.space(4), paddingTop: theme.space(2), paddingBottom: theme.space(8) }}
      >
        <View style={{ gap: theme.space(3) }}>
        <Card theme={theme} elevated>
          <SectionHeader
            theme={theme}
            title="Sessions – why open times only, no durations"
            caption="P2 fix: no invented durations"
          />
          <Text role="micro" tone="muted" theme={theme}>
            {[
              'Per-app daily totals sum raw OS UsageEvents foreground intervals clipped strictly to [00:00 local, min(now, 24:00 local)] with a 6h pre-midnight lookback, matching Digital Wellbeing without INTERVAL_DAILY pre-midnight bucket bleed. Excludes launchers (HOME role via getLauncherPackages), Mirror itself, Settings, Play Store/Services, and all Package installers.',
              'Session timeline comes from raw UsageEvents (RESUMED=1, PAUSED=2, STOPPED=23, DESTROYED=24, CONTINUE_PREVIOUS_DAY=4, SCREEN_NON_INTERACTIVE=16, KEYGUARD_SHOWN=17, DEVICE_SHUTDOWN=26). Show only open times (when app came to foreground), no durations, no scaling. Daily totals authoritative, open times informative.',
              'Scores: approximate session data does NOT feed scores as exact. ScoreInput has approximate flag, confidenceFor caps score to 0.49 and level low when approximate true.',
            ].join('\n\n')}
          </Text>
        </Card>

        <Card theme={theme} elevated>
          <SectionHeader
            theme={theme}
            title={`Validation – same period ${selectedDay}`}
            caption="flags any app differing from OS by more than max(10%, 60s)"
          />
          <View style={{ gap: theme.space(1.5) }}>
            <View
              style={{
                padding: theme.space(1.5),
                borderRadius: theme.radius.sm,
                borderWidth: 1,
                borderColor: theme.color.borderCard,
                backgroundColor:
                  flaggedDiscrepancies.length > 0
                    ? rgba(theme.color.anchor, theme.isDark ? 0.24 : 0.12)
                    : rgba(theme.color.chip, theme.isDark ? 0.22 : 0.14),
                gap: theme.space(1),
              }}
            >
              <Text role="label" weight="medium" theme={theme}>
                {flaggedDiscrepancies.length === 0
                  ? 'Per-app OS vs Mirror check (tolerance max(10%, 60s)): PASS — 0 apps flagged'
                  : `Per-app OS vs Mirror check (tolerance max(10%, 60s)): FLAGGED ${flaggedDiscrepancies.length} app${flaggedDiscrepancies.length === 1 ? '' : 's'}`}
              </Text>
              <Text role="micro" tone="muted" theme={theme}>
                {`Period: ${selectedDay} local day · Totals source: ${sourceSummary}. Compares Home, Day fg (OS UsageEvents), Stored (SQLite), and independent OS UsageStats.`}
              </Text>
              {flaggedDiscrepancies.map((d) => (
                <View
                  key={d.app}
                  style={{
                    paddingTop: theme.space(1),
                    borderTopWidth: 1,
                    borderTopColor: theme.color.borderHairline,
                    gap: theme.space(0.5),
                  }}
                >
                  <Text role="micro" weight="medium" theme={theme}>
                    {`[FLAGGED ${d.status.toUpperCase()}] ${d.label} (${d.app}) — ${d.comparison}: Mirror ${formatDuration(d.mirrorMs)} vs OS ${formatDuration(d.osMs)}, diff ${formatSignedDuration(d.diffMs)} (${d.diffPct >= 0 ? '+' : ''}${d.diffPct.toFixed(1)}%, limit ${formatDuration(d.toleranceMs)})`}
                  </Text>
                  <Text role="micro" tone="muted" theme={theme}>
                    {`4-source trace: Home ${formatDuration(d.displayedMs)} · Day fg ${formatDuration(d.dayFgMs)} · Stored ${formatDuration(d.storedMs)} · Sittings ${formatDuration(d.sittingSpanMs)} · Raw INTERVAL_DAILY ${formatDuration(d.rawBucketMs)}${d.preMidnightBucketMs > 0 ? ` (pre-00:00 +${formatDuration(d.preMidnightBucketMs)})` : ''}`}
                  </Text>
                </View>
              ))}
            </View>

            {validation ? (
              <View style={{ gap: theme.space(0.75) }}>
                <Text role="micro" weight="medium" theme={theme}>
                  {`Stored vs Day fg summary (max(10%, 60s)): max diff ${validation.maxAbsPct.toFixed(1)}% / ${formatDuration(validation.maxAbsMs)}, ${validation.ok ? 'OK' : `FAIL ${validation.overThreshold.length} app${validation.overThreshold.length === 1 ? '' : 's'}`}`}
                </Text>
                {validation.rows.slice(0, 20).map((r) => (
                  <Text key={r.app} role="micro" tone="muted" theme={theme}>
                    {`${r.status !== 'ok' ? '[FLAGGED] ' : ''}${labels[r.app] ?? r.app}: OS ${formatDuration(r.osMs)}, Mirror ${formatDuration(r.mirrorMs)}, diff ${r.diffPct >= 0 ? '+' : ''}${r.diffPct.toFixed(1)}% (${formatSignedDuration(r.diffMs)}) ${r.status}`}
                  </Text>
                ))}
              </View>
            ) : (
              <Text role="micro" tone="muted" theme={theme}>
                No validation yet
              </Text>
            )}
          </View>
        </Card>

        <Card theme={theme} elevated>
          <SectionHeader
            theme={theme}
            title={`Single-day OS vs Mirror – ${selectedDay}`}
            caption={`Source: ${dailyTotalsSource} · last sync cursor ${collectingSince ?? 'unknown'}`}
          />
          <Text role="micro" tone="muted" theme={theme} style={{ marginBottom: theme.space(1.5) }}>
            {
              'Column key: Home = total shown on Home; Day fg = live OS UsageEvents clipped to [00:00, 24:00); Stored = Mirror SQLite foreground clipped + interval-unioned; Sittings = merged <=15m sitting spans; Raw INTERVAL_DAILY = unclipped OS daily buckets. Rows exceeding max(10%, 60s) are sorted first and marked [FLAGGED].'
            }
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(1), marginBottom: theme.space(2) }}>
            {lastNDays(14).map((day) => (
              <Pill key={day} theme={theme} onPress={() => setSelectedDay(day)}>
                {day === selectedDay ? `● ${day}` : day}
              </Pill>
            ))}
          </View>
          {singleDayRows.length === 0 ? (
            <Text role="micro" tone="muted" theme={theme}>
              {`No data for ${selectedDay}`}
            </Text>
          ) : (
            singleDayRows.slice(0, 30).map((r) => {
              const bucketStartNote =
                typeof r.earliestBucketStartMs === 'number'
                  ? `from ${new Date(r.earliestBucketStartMs).toLocaleString([], {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}`
                  : '';
              const bleedNote =
                typeof r.preMidnightBucketMs === 'number' && r.preMidnightBucketMs > 0
                  ? ` (pre-00:00 bucket +${formatDuration(r.preMidnightBucketMs)}${bucketStartNote ? `, ${bucketStartNote}` : ''}${typeof r.bucketCount === 'number' && r.bucketCount > 0 ? `, ${r.bucketCount} buckets` : ''})`
                  : typeof r.bucketCount === 'number' && r.bucketCount > 0
                    ? ` (${r.bucketCount} bucket${r.bucketCount === 1 ? '' : 's'}${bucketStartNote ? `, ${bucketStartNote}` : ''})`
                    : '';
              const homeSegment =
                typeof r.displayedMs === 'number' ? `Home ${formatDuration(r.displayedMs)} · ` : '';
              return (
                <View key={r.app} style={{ paddingVertical: theme.space(1) }}>
                  <Text role="micro" weight={r.flagged ? 'medium' : 'auto'} theme={theme}>
                    {`${r.flagged ? '[FLAGGED > max(10%, 60s)] ' : ''}${r.label} – ${homeSegment}Day fg ${formatDuration(r.osMs)} / Stored ${formatDuration(r.mirrorMs)} diff ${r.diffPct >= 0 ? '+' : ''}${r.diffPct.toFixed(1)}% ${r.status}${typeof r.sittingSpanMs === 'number' ? ` · Sittings ${formatDuration(r.sittingSpanMs)}` : ''}${typeof r.rawBucketMs === 'number' ? ` · Raw INTERVAL_DAILY ${formatDuration(r.rawBucketMs)}${bleedNote}` : ''}`}
                  </Text>
                  <Text role="micro" tone="muted" theme={theme}>
                    {r.flagReason ? `${r.app} · ${r.flagReason}` : r.app}
                  </Text>
                </View>
              );
            })
          )}
        </Card>

        {honkaiDebug.length > 0 ? (
          <Card theme={theme} elevated>
            <SectionHeader
              theme={theme}
              title={`Inspected & flagged app raw events last 24h (${honkaiDebug.length})`}
              caption="ChatGPT, flagged apps, and Honkai/Genshin RESUMED/PAUSED/STOPPED + class names"
            />
            {honkaiDebug.map((e, idx) => (
              <View key={idx} style={{ paddingVertical: theme.space(1) }}>
                <Text role="micro" theme={theme}>
                  {`${new Date(e.timeStamp).toLocaleTimeString()} ${e.eventType}:${e.typeName} ${e.packageName}${e.className ? ` / ${e.className}` : ''}`}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}

        {debugEvents.length > 0 ? (
          <Card theme={theme}>
            <SectionHeader
              theme={theme}
              title={`Debug - raw UsageEvents last 24h (${debugEvents.length})`}
              caption="foreground, background, stopped, destroyed, screen, keyguard"
            />
            <View style={{ flexDirection: 'row', gap: theme.space(2), marginBottom: theme.space(2) }}>
              <Pill theme={theme} onPress={copyRawEvents}>
                Share raw events JSON
              </Pill>
              {copyStatus ? (
                <Text role="micro" tone="muted" theme={theme}>
                  {copyStatus}
                </Text>
              ) : null}
            </View>
            {debugEvents.map((e, idx) => (
              <View key={idx} style={{ paddingVertical: theme.space(1) }}>
                <Text role="micro" theme={theme}>
                  {`${new Date(e.timeStamp).toLocaleTimeString()} ${e.eventType}:${e.typeName} ${e.packageName}${e.className ? ` / ${e.className.split('.').pop()}` : ''}`}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}

        <Card theme={theme}>
          <SectionHeader theme={theme} title="Data quality details" caption="unmatched OS events & spanned gaps" />
          <Text role="micro" tone="muted" theme={theme}>
            {quality?.sentence ?? 'No collection gaps recorded.'}
          </Text>
          <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(1) }}>
            {`${quality?.count ?? 0} recorded events, by reason: ${Object.entries(quality?.byReason ?? {}).map(([k, v]) => `${k}:${v}`).join(', ') || 'none'}`}
          </Text>
          <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(1) }}>
            {lastReset
              ? `Last store reset: ${lastReset.day} (${new Date(lastReset.at).toISOString()}) · reason=${lastReset.reason}${lastReset.previousHistoryStartDay ? ` · prevStart=${lastReset.previousHistoryStartDay}` : ''}${lastReset.detail ? ` · ${lastReset.detail}` : ''}`
              : 'Last store reset: none recorded in current SQLite store'}
          </Text>
          {latestSyncOrphans ? (
            <View style={{ marginTop: theme.space(2), gap: theme.space(1) }}>
              <Text role="label" theme={theme}>
                {`Latest sync unmatched closes: ${latestSyncOrphans.total}`}
              </Text>
              {latestSyncOrphans.total > 0 ? (
                <>
                  <Text role="micro" tone="muted" theme={theme}>
                    {`By event type: ${latestSyncOrphans.byEventType.map((t) => `${t.typeName} × ${t.count}`).join(', ')}`}
                  </Text>
                  <Text role="micro" tone="muted" theme={theme}>
                    {`By app: ${latestSyncOrphans.byApp.map((a) => `${a.label} × ${a.count} (${a.byType})`).join('; ')}`}
                  </Text>
                  <Text role="micro" tone="muted" theme={theme}>
                    {`Newest: ${latestSyncOrphans.newest.map((n) => `${n.label} (${n.typeName} at ${new Date(n.at).toLocaleTimeString()})`).join(', ')}`}
                  </Text>
                </>
              ) : null}
            </View>
          ) : null}
          {raw24hOrphans ? (
            <View style={{ marginTop: theme.space(2), gap: theme.space(1) }}>
              <Text role="label" theme={theme}>
                {`Last 24h raw OS stream unmatched closes (after lifecycle fix): ${raw24hOrphans.total}`}
              </Text>
              {raw24hOrphans.total > 0 ? (
                <>
                  <Text role="micro" tone="muted" theme={theme}>
                    {`By event type: ${raw24hOrphans.byEventType.map((t) => `${t.typeName} × ${t.count}`).join(', ')}`}
                  </Text>
                  <Text role="micro" tone="muted" theme={theme}>
                    {`By app: ${raw24hOrphans.byApp.map((a) => `${a.label} × ${a.count} (${a.byType})`).join('; ')}`}
                  </Text>
                  <Text role="micro" tone="muted" theme={theme}>
                    {`Newest: ${raw24hOrphans.newest.map((n) => `${new Date(n.at).toLocaleTimeString()} ${n.label} (${n.typeName})`).join(' · ')}`}
                  </Text>
                </>
              ) : null}
              {(quality?.byReason?.orphan_background ?? 0) > raw24hOrphans.total ? (
                <Text role="micro" tone="muted" theme={theme}>
                  {`Stored pre-recompute count (${quality?.byReason?.orphan_background ?? 0}) came from earlier syncs; P3 gates on the live raw-stream count (${orphanCount}) and recomputes stored rows on sync.`}
                </Text>
              ) : null}
            </View>
          ) : null}
          {invalidTop.length > 0 ? (
            <View style={{ marginTop: theme.space(1) }}>
              <Text role="label" theme={theme}>
                Top invalid_package:
              </Text>
              {invalidTop.map((it) => (
                <Text key={it.pkg} role="micro" tone="muted" theme={theme}>
                  {`${it.pkg} - ${it.count}`}
                </Text>
              ))}
            </View>
          ) : null}
        </Card>

        <Card theme={theme}>
          <SectionHeader
            theme={theme}
            title="P3 guard – why blocked, overlap honesty"
            caption="honest gate 60s not 120s, 1h does NOT pair unrelated"
          />
          <Text role="micro" tone="muted" theme={theme}>
            {P3_GUARD_FULL(orphanCount)}
          </Text>
        </Card>

        <Card theme={theme}>
          <SectionHeader
            theme={theme}
            title="J4 Interest Evolution – full details"
            caption="seen since, limited-history caveat, depth"
          />
          <Text role="micro" tone="muted" theme={theme}>
            {J4_FULL}
          </Text>
        </Card>

        <Card theme={theme}>
          <SectionHeader
            theme={theme}
            title="J9 Discovery Journey – full details"
            caption="cross-app routes, repeat rhythm, Tier-D bounds"
          />
          <Text role="micro" tone="muted" theme={theme}>
            {J9_FULL}
          </Text>
        </Card>

        <Card theme={theme}>
          <SectionHeader
            theme={theme}
            title="J11 Rabbit Hole – full details"
            caption="short-return clusters, Tier-D can/cannot, neutral rules"
          />
          <Text role="micro" tone="muted" theme={theme}>
            {J11_FULL}
          </Text>
        </Card>

        <Card theme={theme}>
          <SectionHeader
            theme={theme}
            title="J18 What-if Simulator – full details"
            caption="Estimate labels, never /100, measured factors only, assumptions, no-change reason"
          />
          <Text role="micro" tone="muted" theme={theme}>
            {J18_FULL}
          </Text>
        </Card>

        <Card theme={theme}>
          <SectionHeader
            theme={theme}
            title="J20 Focus Windows – full details"
            caption="21+ days (3 weeks), 5+ sittings/cell, descriptive timing only"
          />
          <Text role="micro" tone="muted" theme={theme}>
            {J20_FULL}
          </Text>
        </Card>

        <Card theme={theme}>
          <SectionHeader
            theme={theme}
            title="What this build is – full"
            caption="Stage 1 - OS totals for per-app, raw events for open times only"
          />
          <Text role="micro" tone="muted" theme={theme}>
            {BUILD_FULL}
          </Text>
        </Card>
        </View>
        <View pointerEvents="none" style={{ height: theme.space(10) }} />
      </ScrollView>
    </View>
  );
}
