import * as React from 'react';
import { View } from 'react-native';
import {
  Callout,
  Card,
  Chip,
  ConfidenceChip,
  DegradedNotice,
  Divider,
  EmptyState,
  Meter,
  Pill,
  SectionHeader,
  Stat,
  Surface,
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
    dailyTotalsSource,
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

  const maxRouteCount = React.useMemo(
    () => (discovery && discovery.routes.length > 0 ? Math.max(1, ...discovery.routes.map((r) => r.count)) : 1),
    [discovery],
  );

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
      {/* Frosted glass section filter strip */}
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

      {/* J4 Frosted Horizon Hero — Interest Evolution (explicit empty state below 3 local days) */}
      {showEvolution ? (
        <Surface
          radius="hero"
          theme={theme}
          style={{
            padding: theme.space(4),
            borderWidth: 1,
            borderColor: theme.color.borderHairline,
            gap: theme.space(3),
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.space(2) }}>
            <View style={{ flex: 1, gap: theme.space(0.5) }}>
              <Text role="micro" tone="muted" theme={theme}>
                MULTI-DAY RHYTHM · TIER D
              </Text>
              <Text role="title-lg" theme={theme}>
                Interest Evolution
              </Text>
              <Text role="label" tone="muted" theme={theme}>
                {evolution && evolution.hasHistory
                  ? `history starts ${evolution.historyStartDay} · ${evolution.distinctDays} days (${evolution.historyStartDay} to ${evolution.lastDay})`
                  : `${evolution?.distinctDays ?? 0} of ${evolution?.minDays ?? 3} local days recorded (needs 3+ distinct days)`}
              </Text>
            </View>
            <TierBadge tier="D" theme={theme} />
          </View>

          <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap', alignItems: 'center' }}>
            <Chip static label="Based on usage patterns only" theme={theme} />
            {evolution?.limitedHistory ? <Chip static label="Limited history" theme={theme} /> : null}
            <ConfidenceChip tiers={['D']} label="Tier D · App-level across days" theme={theme} />
          </View>

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
              <Text role="micro" tone="muted" theme={theme}>
                {`${evolution.summaryLine} · topic evolution requires Tier A/B/C`}
              </Text>

              {evolution.limitedHistory ? (
                <Callout theme={theme} tone="neutral">
                  {`Limited history (${evolution.distinctDays} days recorded): growing and fading compare recent vs earlier days in this short window, not long-term change.`}
                </Callout>
              ) : null}

              <View style={{ gap: theme.space(2) }}>
                {evolution.rows.map((r) => {
                  const dayRatio =
                    evolution.distinctDays > 0
                      ? Math.min(1, Math.max(0, r.activeDays / evolution.distinctDays))
                      : 0;
                  return (
                    <View
                      key={r.app}
                      style={{
                        borderRadius: theme.radius.md,
                        backgroundColor: theme.glass.card.fill,
                        borderWidth: 1,
                        borderColor: theme.color.borderCard,
                        padding: theme.space(3),
                        gap: theme.space(1.5),
                      }}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          flexWrap: 'wrap',
                          gap: theme.space(2),
                        }}
                      >
                        <Text role="label" theme={theme} style={{ flex: 1, flexShrink: 1, minWidth: 140 }}>
                          {r.label}
                        </Text>
                        <Chip static label={r.trendLabel} theme={theme} />
                      </View>

                      <Meter
                        theme={theme}
                        value={dayRatio}
                        label={`${r.activeDays} of ${evolution.distinctDays} active days`}
                        caption={`${r.sessionCount} sitting${r.sessionCount === 1 ? '' : 's'} · ${r.dominantBand}`}
                        tone={dayRatio >= 0.5 ? 'anchor' : 'muted'}
                      />

                      <Text role="micro" tone="muted" theme={theme}>
                        {r.seenSinceText}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </Surface>
      ) : null}

      {/* J9 Frosted Glass Card — Discovery Journey (explicit empty state below 3 local days) */}
      {showDiscovery ? (
        <Card theme={theme} style={{ marginBottom: 0 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.space(2), marginBottom: theme.space(2) }}>
            <View style={{ flex: 1, gap: theme.space(0.5) }}>
              <Text role="micro" tone="muted" theme={theme}>
                CROSS-APP HANDOFFS · TIER D
              </Text>
              <SectionHeader
                theme={theme}
                title="Discovery Journey"
                caption={
                  discovery && discovery.hasHistory
                    ? `history starts ${discovery.historyStartDay} · ${discovery.distinctDays} days · cross-app routes and repeat rhythm`
                    : `${discovery?.distinctDays ?? 0} of ${discovery?.minDays ?? 3} local days recorded (needs 3+ distinct days)`
                }
              />
            </View>
            <TierBadge tier="D" theme={theme} />
          </View>

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
                {discovery.limitedHistory ? <Chip static label="Limited history" theme={theme} /> : null}
                <Text role="micro" tone="muted" theme={theme}>
                  {'Sustained app handoffs within 5 min; step-by-step topic routes require Tier A/B/C.'}
                </Text>
              </View>

              {/* Multi-day handoff & repeat summary inset glass panel */}
              <View
                style={{
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.glass.card.fill,
                  borderWidth: 1,
                  borderColor: theme.color.borderCard,
                  padding: theme.space(3),
                  gap: theme.space(2),
                }}
              >
                <View style={{ flexDirection: 'row', gap: theme.space(3), flexWrap: 'wrap' }}>
                  <View style={{ flex: 1, minWidth: 120 }}>
                    <Stat
                      value={String(discovery.totalHandoffs)}
                      label={discovery.totalHandoffs === 1 ? 'Cross-app handoff' : 'Cross-app handoffs'}
                      hint={`Within 5 min · ${discovery.distinctDays} days`}
                      theme={theme}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 120 }}>
                    <Stat
                      value={`${discovery.repeatAppsCount} / ${discovery.totalAppsVisited}`}
                      label="Repeat apps (2+ days)"
                      hint={`${discovery.singleDayAppsCount} single-day${discovery.limitedHistory ? ' (limited history)' : ''}`}
                      theme={theme}
                    />
                  </View>
                </View>

                {discovery.repeatShareMeasurable ? (
                  <>
                    <Divider theme={theme} />
                    <Meter
                      theme={theme}
                      value={discovery.repeatSessionShare}
                      label="Sustained sittings in repeat apps"
                      caption={`${Math.round(discovery.repeatSessionShare * 100)}%`}
                      tone="anchor"
                    />
                  </>
                ) : (
                  <Text role="micro" tone="muted" theme={theme}>
                    {`Repeat share hidden: ${discovery.sustainedSessionCount} sustained sitting${discovery.sustainedSessionCount === 1 ? '' : 's'} recorded (needs 5+).`}
                  </Text>
                )}
              </View>

              {/* Repeated cross-app routes inset glass panel */}
              <View
                style={{
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.glass.card.fill,
                  borderWidth: 1,
                  borderColor: theme.color.borderCard,
                  padding: theme.space(3),
                  gap: theme.space(2),
                }}
              >
                <Text role="label" theme={theme}>
                  {`Repeated cross-app routes (${discovery.routes.length})`}
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
                    <Meter
                      key={`${rt.fromApp}->${rt.toApp}`}
                      theme={theme}
                      value={rt.count / maxRouteCount}
                      label={`${rt.fromLabel} → ${rt.toLabel}`}
                      caption={`${rt.count}x · ${rt.activeDays}/${discovery.distinctDays}d`}
                      tone="anchor"
                    />
                  ))
                )}
              </View>

              {/* Honest Tier-D standing & label reconciliation */}
              <View style={{ gap: theme.space(1) }}>
                <Text role="micro" tone="muted" theme={theme}>
                  {`Top app by time (${selectedDay}): ${
                    discovery.topAppByTime
                      ? `${discovery.topAppByTime.label} (${formatDuration(discovery.topAppByTime.totalMs)}, ${
                          dailyTotalsSource === 'stored_events'
                            ? 'Stored · Mirror events'
                            : dailyTotalsSource === 'os_bucket_approx'
                              ? 'Approximate · OS daily buckets'
                              : 'day-clipped OS foreground'
                        })`
                      : 'none recorded'
                  }`}
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

      {/* J11 Frosted Glass Card — Rabbit Hole (neutral short-return clusters, never penalises IQS) */}
      {showRabbitHole ? (
        <Card theme={theme} style={{ marginBottom: 0 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.space(2), marginBottom: theme.space(2) }}>
            <View style={{ flex: 1, gap: theme.space(0.5) }}>
              <Text role="micro" tone="muted" theme={theme}>
                NEUTRAL CLUSTER CHECK · TIER D
              </Text>
              <SectionHeader
                theme={theme}
                title="Rabbit Hole — short-return clusters"
                caption={
                  rabbitHole && rabbitHole.hasHistory
                    ? `history starts ${rabbitHole.historyStartDay} · ${rabbitHole.distinctDays} days · neutral Tier-D cluster check`
                    : `${rabbitHole?.distinctDays ?? 0} of ${rabbitHole?.minDays ?? 3} local days recorded (needs 3+ distinct days)`
                }
              />
            </View>
            <TierBadge tier="D" theme={theme} />
          </View>

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
                <Chip static label="Never penalises IQS" theme={theme} />
              </View>

              <Callout theme={theme} tone="neutral">
                {`Printed definition: ${rabbitHole.definitionText}${rabbitHole.limitedHistory ? ` Limited history (${rabbitHole.distinctDays} days recorded): cluster counts reflect this short window only.` : ''}`}
              </Callout>

              <View
                style={{
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.glass.card.fill,
                  borderWidth: 1,
                  borderColor: theme.color.borderCard,
                  padding: theme.space(3),
                  gap: theme.space(2),
                }}
              >
                {rabbitHole.clusterCount === 0 ? (
                  <Text role="body" theme={theme}>
                    {`0 clusters matched this definition across ${rabbitHole.distinctDays} days. That is a real result, not a missing signal.`}
                  </Text>
                ) : (
                  <View style={{ gap: theme.space(2) }}>
                    <View style={{ flexDirection: 'row', gap: theme.space(3), flexWrap: 'wrap' }}>
                      <View style={{ flex: 1, minWidth: 110 }}>
                        <Stat
                          value={String(rabbitHole.clusterCount)}
                          label={rabbitHole.clusterCount === 1 ? 'Cluster matched' : 'Clusters matched'}
                          hint={`${rabbitHole.totalClusterSittings} sittings`}
                          theme={theme}
                        />
                      </View>
                      <View style={{ flex: 1, minWidth: 110 }}>
                        <Stat
                          value={formatDuration(rabbitHole.totalClusterMs)}
                          label="Cluster sitting span"
                          hint={
                            rabbitHole.lateNightShareMeasurable
                              ? `${Math.round(rabbitHole.lateNightShare * 100)}% in 23:00–05:00`
                              : 'Late-night % hidden (<5m)'
                          }
                          theme={theme}
                        />
                      </View>
                    </View>
                    <Text role="micro" tone="muted" theme={theme}>
                      {rabbitHole.clusterExplicitLabels.total > 0
                        ? `Your explicit labels inside these clusters: ${rabbitHole.clusterExplicitLabels.intentional} intentional, ${rabbitHole.clusterExplicitLabels.mindless} mindless${rabbitHole.clusterExplicitLabels.unsure > 0 ? `, ${rabbitHole.clusterExplicitLabels.unsure} unsure` : ''}.`
                        : 'No explicit labels on sittings in these clusters (unlabelled sittings are not assumed mindless).'}
                    </Text>
                    <Divider theme={theme} />
                    {rabbitHole.clusters.map((c) => (
                      <View
                        key={c.id}
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'baseline',
                          flexWrap: 'wrap',
                          gap: theme.space(2),
                        }}
                      >
                        <Text role="label" theme={theme} style={{ flex: 1, flexShrink: 1 }}>
                          {`${c.label} · ${c.sittingCount} short returns`}
                        </Text>
                        <Text role="micro" tone="muted" theme={theme}>
                          {`${c.day} · ${formatDuration(c.totalSittingMs)}`}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <View
                style={{
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.glass.card.fill,
                  borderWidth: 1,
                  borderColor: theme.color.borderCard,
                  padding: theme.space(3),
                  gap: theme.space(1),
                }}
              >
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

      {/* J21 Learning Arcs — honest Tier A/B/C empty state */}
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
