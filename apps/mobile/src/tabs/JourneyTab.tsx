import * as React from 'react';
import { View } from 'react-native';
import {
  Card,
  Chip,
  DegradedNotice,
  Divider,
  EmptyState,
  Pill,
  SectionHeader,
  Text,
  TierBadge,
  useTheme,
} from '@mirror/ui';
import { P3_GUARD_SHORT } from '../buildDetails';
import { AppShell } from '../components/AppShell';
import { formatDuration, useMirrorApp } from '../context/MirrorAppContext';

type JourneyFilter = 'all' | 'evolution' | 'discovery' | 'rabbithole' | 'arcs';

const FILTER_OPTIONS: ReadonlyArray<{ id: JourneyFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'evolution', label: 'Evolution' },
  { id: 'discovery', label: 'Discovery' },
  { id: 'rabbithole', label: 'Rabbit Hole' },
  { id: 'arcs', label: 'Learning Arcs' },
];

export function JourneyTab(): React.ReactElement {
  const theme = useTheme();
  const {
    selectedDay,
    evolution,
    discovery,
    rabbitHole,
    orphanCount,
    totalGaps,
    p3Reliable,
    checkPermissionAndCollect,
  } = useMirrorApp();
  const [filter, setFilter] = React.useState<JourneyFilter>('all');

  const showEvolution = filter === 'all' || filter === 'evolution';
  const showDiscovery = filter === 'all' || filter === 'discovery';
  const showRabbitHole = filter === 'all' || filter === 'rabbithole';
  const showArcs = filter === 'all' || filter === 'arcs';

  return (
    <AppShell
      title="Journey"
      subtitle="Multi-day usage patterns & Tier-D boundaries"
      actions={
        <Pill theme={theme} variant="secondary" onPress={checkPermissionAndCollect}>
          Refresh
        </Pill>
      }
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(1.5) }}>
        {FILTER_OPTIONS.map((opt) => (
          <Pill
            key={opt.id}
            theme={theme}
            variant={filter === opt.id ? 'primary' : 'secondary'}
            onPress={() => setFilter(opt.id)}
          >
            {opt.label}
          </Pill>
        ))}
      </View>

      {/* J4 Interest Evolution – shows clear empty state on <3 days instead of disappearing */}
      {showEvolution ? (
        <Card theme={theme} elevated>
          <SectionHeader
            theme={theme}
            title="Interest Evolution"
            caption={
              evolution && evolution.hasHistory
                ? `history starts ${evolution.historyStartDay} · ${evolution.distinctDays} days (${evolution.historyStartDay} to ${evolution.lastDay})`
                : `${evolution?.distinctDays ?? 0} of ${evolution?.minDays ?? 3} local days recorded (needs 3+ distinct days)`
            }
          />
          {!p3Reliable ? (
            <EmptyState
              title="Needs reliable session boundaries"
              body={P3_GUARD_SHORT(orphanCount, totalGaps)}
              theme={theme}
            />
          ) : !evolution || !evolution.hasHistory || evolution.rows.length === 0 ? (
            <EmptyState
              title="Needs at least 3 days of local history"
              body={`${evolution?.distinctDays ?? 0} of ${evolution?.minDays ?? 3} local days recorded so far${evolution?.historyStartDay ? ` (history starts ${evolution.historyStartDay})` : ''}. Interest Evolution shows this progress empty state below 3 distinct local days rather than disappearing or repeating single-day OS totals.`}
              theme={theme}
            />
          ) : (
            <View style={{ gap: theme.space(3) }}>
              <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap', alignItems: 'center' }}>
                <Chip static label="Based on usage patterns only" theme={theme} />
                <TierBadge tier="D" theme={theme} />
                <Text role="micro" tone="muted" theme={theme}>
                  {'App-level across days; topic evolution requires Tier A/B/C.'}
                </Text>
              </View>
              <Text role="micro" tone="muted" theme={theme}>
                {evolution.summaryLine}
              </Text>
              {evolution.limitedHistory ? (
                <Text role="micro" tone="muted" theme={theme}>
                  {`Limited history (${evolution.distinctDays} days recorded): growing and fading compare recent vs earlier days in this short window, not long-term change.`}
                </Text>
              ) : null}
              {evolution.rows.map((r) => (
                <View key={r.app} style={{ paddingVertical: theme.space(2), gap: theme.space(1) }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      gap: theme.space(2),
                    }}
                  >
                    <Text role="label" theme={theme}>
                      {r.label}
                    </Text>
                    <Text role="micro" tone="muted" theme={theme}>
                      {r.trendLabel}
                    </Text>
                  </View>
                  <Text role="micro" tone="muted" theme={theme}>
                    {`${r.seenSinceText} · active ${r.activeDays} of ${evolution.distinctDays} days · ${r.sessionCount} sitting${r.sessionCount === 1 ? '' : 's'} (typical: ${r.dominantBand})`}
                  </Text>
                  <Divider theme={theme} />
                </View>
              ))}
            </View>
          )}
        </Card>
      ) : null}

      {/* J9 Discovery Journey – shows clear empty state on <3 days instead of disappearing */}
      {showDiscovery ? (
        <Card theme={theme} elevated>
          <SectionHeader
            theme={theme}
            title="Discovery Journey"
            caption={
              discovery && discovery.hasHistory
                ? `history starts ${discovery.historyStartDay} · ${discovery.distinctDays} days · cross-app routes and repeat rhythm`
                : `${discovery?.distinctDays ?? 0} of ${discovery?.minDays ?? 3} local days recorded (needs 3+ distinct days)`
            }
          />
          {!p3Reliable ? (
            <EmptyState
              title="Needs reliable session boundaries"
              body={P3_GUARD_SHORT(orphanCount, totalGaps)}
              theme={theme}
            />
          ) : !discovery || !discovery.hasHistory ? (
            <EmptyState
              title="Needs at least 3 days of local history"
              body={`${discovery?.distinctDays ?? 0} of ${discovery?.minDays ?? 3} local days recorded so far${discovery?.historyStartDay ? ` (history starts ${discovery.historyStartDay})` : ''}. Repeated cross-app handoff routes and multi-day visit rhythm appear once 3+ distinct local days are collected.`}
              theme={theme}
            />
          ) : (
            <View style={{ gap: theme.space(3) }}>
              <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap', alignItems: 'center' }}>
                <Chip static label="Based on usage patterns only" theme={theme} />
                <TierBadge tier="D" theme={theme} />
                <Text role="micro" tone="muted" theme={theme}>
                  {'Sustained app handoffs within 5 min; step-by-step topic routes require Tier A/B/C.'}
                </Text>
              </View>

              <View style={{ gap: theme.space(2) }}>
                <Text role="label" theme={theme}>
                  {`Repeated cross-app routes (${discovery.totalHandoffs} handoff${discovery.totalHandoffs === 1 ? '' : 's'} across ${discovery.distinctDays} days)`}
                </Text>
                {discovery.sustainedSessionCount === 0 ? (
                  <Text role="micro" tone="muted" theme={theme}>
                    {`All ${discovery.shortBounceCount} recorded opens ended in under 8 s — no sustained cross-app routes formed.`}
                  </Text>
                ) : discovery.routes.length === 0 ? (
                  <Text role="micro" tone="muted" theme={theme}>
                    {`No repeated cross-app pair (2+ handoffs within 5 min) across these ${discovery.distinctDays} days.`}
                  </Text>
                ) : (
                  discovery.routes.map((rt) => (
                    <View
                      key={`${rt.fromApp}->${rt.toApp}`}
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        gap: theme.space(2),
                        paddingVertical: theme.space(1),
                      }}
                    >
                      <Text role="label" theme={theme} style={{ flex: 1 }}>
                        {`${rt.fromLabel} → ${rt.toLabel}`}
                      </Text>
                      <Text role="micro" tone="muted" theme={theme}>
                        {`${rt.count}x · ${rt.activeDays} of ${discovery.distinctDays} days`}
                      </Text>
                    </View>
                  ))
                )}
              </View>

              <Divider theme={theme} />

              <View style={{ gap: theme.space(1) }}>
                <Text role="micro" tone="muted" theme={theme}>
                  {discovery.repeatShareMeasurable
                    ? `Repeat apps (2+ days): ${discovery.repeatAppsCount} of ${discovery.totalAppsVisited} (${Math.round(discovery.repeatSessionShare * 100)}% of sustained sittings) · Single-day visits: ${discovery.singleDayAppsCount}${discovery.limitedHistory ? ' (limited history — not necessarily new apps)' : ''}`
                    : `Repeat apps (2+ days): ${discovery.repeatAppsCount} of ${discovery.totalAppsVisited} (repeat share hidden: ${discovery.sustainedSessionCount} sustained sitting${discovery.sustainedSessionCount === 1 ? '' : 's'}, needs 5+) · Single-day visits: ${discovery.singleDayAppsCount}${discovery.limitedHistory ? ' (limited history — not necessarily new apps)' : ''}`}
                </Text>
                <Text role="micro" tone="muted" theme={theme}>
                  {`Top app by time (${selectedDay}): ${discovery.topAppByTime ? `${discovery.topAppByTime.label} (${formatDuration(discovery.topAppByTime.totalMs)}, OS aggregate)` : 'none recorded'}`}
                </Text>
                <Text role="micro" tone="muted" theme={theme}>
                  {`New topics opened: ${discovery.newTopicsOpened.value} — ${discovery.newTopicsOpened.detail}`}
                </Text>
                <Text role="micro" tone="muted" theme={theme}>
                  {`Searches started: ${discovery.searchesStarted.value} — ${discovery.searchesStarted.detail}`}
                </Text>
                <Text role="micro" tone="muted" theme={theme}>
                  {discovery.explicitLabels.total > 0
                    ? `Explicit labels (${selectedDay}): ${discovery.explicitLabels.decisive} decisive (${discovery.explicitLabels.intentional} intentional, ${discovery.explicitLabels.mindless} mindless${discovery.explicitLabels.unsure > 0 ? `, ${discovery.explicitLabels.unsure} unsure` : ''})`
                    : `Explicit labels (${selectedDay}): 0 decisive (optional — matches Why sheet; intent is never guessed)`}
                </Text>
              </View>
            </View>
          )}
        </Card>
      ) : null}

      {/* J11 Rabbit Hole – shows clear empty state on <3 days instead of disappearing */}
      {showRabbitHole ? (
        <Card theme={theme} elevated>
          <SectionHeader
            theme={theme}
            title="Rabbit Hole — short-return clusters"
            caption={
              rabbitHole && rabbitHole.hasHistory
                ? `history starts ${rabbitHole.historyStartDay} · ${rabbitHole.distinctDays} days · neutral Tier-D cluster check`
                : `${rabbitHole?.distinctDays ?? 0} of ${rabbitHole?.minDays ?? 3} local days recorded (needs 3+ distinct days)`
            }
          />
          {!p3Reliable ? (
            <EmptyState
              title="Needs reliable session boundaries"
              body={P3_GUARD_SHORT(orphanCount, totalGaps)}
              theme={theme}
            />
          ) : !rabbitHole || !rabbitHole.hasHistory ? (
            <EmptyState
              title="Needs at least 3 days of local history"
              body={`${rabbitHole?.distinctDays ?? 0} of ${rabbitHole?.minDays ?? 3} local days recorded so far${rabbitHole?.historyStartDay ? ` (history starts ${rabbitHole.historyStartDay})` : ''}. Short-return cluster checks wait for 3+ distinct local days and never penalise IQS.`}
              theme={theme}
            />
          ) : (
            <View style={{ gap: theme.space(3) }}>
              <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap', alignItems: 'center' }}>
                <Chip static label="Based on usage patterns only" theme={theme} />
                <TierBadge tier="D" theme={theme} />
                <Text role="micro" tone="muted" theme={theme}>
                  {'Never penalises IQS; content and search drift require Tier A/B/C.'}
                </Text>
              </View>

              <View style={{ gap: theme.space(1) }}>
                <Text role="label" theme={theme}>
                  Printed definition
                </Text>
                <Text role="micro" tone="muted" theme={theme}>
                  {rabbitHole.definitionText}
                </Text>
                {rabbitHole.limitedHistory ? (
                  <Text role="micro" tone="muted" theme={theme}>
                    {`Limited history (${rabbitHole.distinctDays} days recorded): cluster counts reflect this short window only.`}
                  </Text>
                ) : null}
              </View>

              <Divider theme={theme} />

              {rabbitHole.clusterCount === 0 ? (
                <Text role="micro" tone="muted" theme={theme}>
                  {`0 clusters matched this definition across ${rabbitHole.distinctDays} days. That is a real result, not a missing signal.`}
                </Text>
              ) : (
                <View style={{ gap: theme.space(2) }}>
                  <Text role="label" theme={theme}>
                    {rabbitHole.lateNightShareMeasurable
                      ? `${rabbitHole.clusterCount} cluster${rabbitHole.clusterCount === 1 ? '' : 's'} (${rabbitHole.totalClusterSittings} sittings · ${formatDuration(rabbitHole.totalClusterMs)} total · ${Math.round(rabbitHole.lateNightShare * 100)}% in 23:00–05:00)`
                      : `${rabbitHole.clusterCount} cluster${rabbitHole.clusterCount === 1 ? '' : 's'} (${rabbitHole.totalClusterSittings} sittings · ${formatDuration(rabbitHole.totalClusterMs)} total · late-night % hidden below 5m cluster time)`}
                  </Text>
                  <Text role="micro" tone="muted" theme={theme}>
                    {rabbitHole.clusterExplicitLabels.total > 0
                      ? `Your explicit labels inside these clusters: ${rabbitHole.clusterExplicitLabels.intentional} intentional, ${rabbitHole.clusterExplicitLabels.mindless} mindless${rabbitHole.clusterExplicitLabels.unsure > 0 ? `, ${rabbitHole.clusterExplicitLabels.unsure} unsure` : ''}.`
                      : 'No explicit labels on sittings in these clusters (unlabelled sittings are not assumed mindless).'}
                  </Text>
                  {rabbitHole.clusters.map((c) => (
                    <View
                      key={c.id}
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        gap: theme.space(2),
                        paddingVertical: theme.space(1),
                      }}
                    >
                      <Text role="label" theme={theme} style={{ flex: 1 }}>
                        {`${c.label} · ${c.sittingCount} short returns`}
                      </Text>
                      <Text role="micro" tone="muted" theme={theme}>
                        {`${c.day} · ${formatDuration(c.totalSittingMs)}`}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              <Divider theme={theme} />

              <View style={{ gap: theme.space(1) }}>
                <Text role="label" theme={theme}>
                  What Tier D can detect
                </Text>
                {rabbitHole.capabilities.tierDCanDetect.map((line, idx) => (
                  <Text key={`can-${idx}`} role="micro" tone="muted" theme={theme}>
                    {`• ${line}`}
                  </Text>
                ))}
                <Text role="label" theme={theme} style={{ marginTop: theme.space(1) }}>
                  What Tier D cannot detect
                </Text>
                {rabbitHole.capabilities.tierDCannotDetect.map((line, idx) => (
                  <Text key={`cannot-${idx}`} role="micro" tone="muted" theme={theme}>
                    {`• ${line}`}
                  </Text>
                ))}
                <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(1) }}>
                  {rabbitHole.capabilities.whatMirrorWillNotDo}
                </Text>
              </View>
            </View>
          )}
        </Card>
      ) : null}

      {/* J21 Learning Arcs – honest Tier A/B/C empty state */}
      {showArcs ? (
        <View style={{ gap: theme.space(2) }}>
          <DegradedNotice
            needs={['D']}
            anyOf={['A', 'B', 'C']}
            available={['D']}
            feature="Learning arcs"
            theme={theme}
          />
        </View>
      ) : null}
    </AppShell>
  );
}
