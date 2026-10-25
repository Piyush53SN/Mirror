import * as React from 'react';
import { Platform, ScrollView, StatusBar, View } from 'react-native';
import { Backdrop, Card, Pill, SectionHeader, Text, Toolbar, useTheme } from '@mirror/ui';
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

export function DebugView(): React.ReactElement {
  const theme = useTheme();
  const {
    selectedDay,
    setSelectedDay,
    setShowDebug,
    validation,
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
  } = useMirrorApp();

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
              'Per-app daily totals come from OS aggregate queryUsageStats (INTERVAL_DAILY, same as Digital Wellbeing), so they match by construction. Excludes launchers (HOME role via getLauncherPackages), Mirror itself, Settings, Play Store/Services, and all Package installers.',
              'Session timeline comes from raw UsageEvents (RESUMED=1, PAUSED=2, STOPPED=23, DESTROYED=24, SCREEN_NON_INTERACTIVE=16, KEYGUARD_SHOWN=17, DEVICE_SHUTDOWN=26). Show only open times (when app came to foreground), no durations, no scaling. Daily totals authoritative, open times informative.',
              'Scores: approximate session data does NOT feed scores as exact. ScoreInput has approximate flag, confidenceFor caps score to 0.49 and level low when approximate true.',
            ].join('\n\n')}
          </Text>
        </Card>

        <Card theme={theme} elevated>
          <SectionHeader
            theme={theme}
            title={`Validation – same period ${selectedDay}`}
            caption="fixed to compare same period on both sides"
          />
          {validation ? (
            <View style={{ gap: theme.space(1) }}>
              <Text role="label" theme={theme}>
                {`OS vs Mirror validation (max(10%,60s)): max diff ${validation.maxAbsPct.toFixed(1)}% / ${formatDuration(validation.maxAbsMs)}, ${validation.ok ? 'OK' : `FAIL ${validation.overThreshold.length} apps`}`}
              </Text>
              <Text role="micro" tone="muted" theme={theme}>
                {`Period: ${selectedDay} local day, OS from queryUsageStats, Mirror from sessions (raw events). Should be same period.`}
              </Text>
              {validation.rows.slice(0, 20).map((r) => (
                <Text key={r.app} role="micro" tone="muted" theme={theme}>
                  {`${labels[r.app] ?? r.app}: OS ${formatDuration(r.osMs)}, Mirror ${formatDuration(r.mirrorMs)}, diff ${r.diffPct.toFixed(1)}% (${formatDuration(r.diffMs)}) ${r.status}`}
                </Text>
              ))}
            </View>
          ) : (
            <Text role="micro" tone="muted" theme={theme}>
              No validation yet
            </Text>
          )}
        </Card>

        <Card theme={theme} elevated>
          <SectionHeader
            theme={theme}
            title={`Single-day OS vs Mirror – ${selectedDay}`}
            caption={`Mirror vs OS same day, last sync cursor ${collectingSince ?? 'unknown'}`}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(1), marginBottom: theme.space(2) }}>
            {lastNDays(7).map((day) => (
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
            singleDayRows.slice(0, 30).map((r) => (
              <View key={r.app} style={{ paddingVertical: theme.space(1) }}>
                <Text role="micro" theme={theme}>
                  {`${r.label} – Mirror ${formatDuration(r.mirrorMs)} / OS ${formatDuration(r.osMs)} diff ${r.diffPct.toFixed(1)}% ${r.status}`}
                </Text>
                <Text role="micro" tone="muted" theme={theme}>
                  {r.app}
                </Text>
              </View>
            ))
          )}
        </Card>

        {honkaiDebug.length > 0 ? (
          <Card theme={theme} elevated>
            <SectionHeader
              theme={theme}
              title={`Honkai/Genshin raw events last 24h (${honkaiDebug.length})`}
              caption="RESUMED/PAUSED/STOPPED and class names"
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
