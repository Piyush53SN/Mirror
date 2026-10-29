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
  LinkButton,
  Meter,
  Pill,
  SectionHeader,
  Stat,
  Surface,
  Text,
  TierBadge,
  useTheme,
} from '@mirror/ui';
import { BOUNDARY_GUARD_SHORT } from '../buildDetails';
import { AppShell } from '../components/AppShell';
import { DayPickerStrip } from '../components/DayPickerStrip';
import { formatDuration, useMirrorApp } from '../context/MirrorAppContext';

type JourneyFilter = 'all' | 'evolution' | 'discovery' | 'rabbithole' | 'arcs';

const FILTER_OPTIONS: { id: JourneyFilter; label: string }[] = [
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
    lastSyncedAt,
    evolution,
    discovery,
    rabbitHole,
    p3Reliable,
    orphanCount,
    totalGaps,
    checkPermissionAndCollect,
    setActiveTab,
  } = useMirrorApp();
  const [filter, setFilter] = React.useState<JourneyFilter>('all');

  const noMultiDayHistoryYet =
    p3Reliable &&
    (!evolution || !evolution.hasHistory || evolution.rows.length === 0) &&
    (!discovery || !discovery.hasHistory) &&
    (!rabbitHole || !rabbitHole.hasHistory);

  const showUnifiedComingCard = filter === 'all' && noMultiDayHistoryYet;

  const showEvolution = !showUnifiedComingCard && (filter === 'all' || filter === 'evolution');
  const showDiscovery = !showUnifiedComingCard && (filter === 'all' || filter === 'discovery');
  const showRabbit = !showUnifiedComingCard && (filter === 'all' || filter === 'rabbithole');
  const showArcs = !showUnifiedComingCard && (filter === 'all' || filter === 'arcs');

  const historyCaption = evolution?.historyStartDay
    ? `history starts ${evolution.historyStartDay} · ${evolution.distinctDays} local ${evolution.distinctDays === 1 ? 'day' : 'days'}`
    : `${evolution?.distinctDays ?? 0} local ${(evolution?.distinctDays ?? 0) === 1 ? 'day' : 'days'}`;

  return (
    <AppShell
      title="Journey"
      subtitle={`Multi-day patterns ending ${selectedDay} (${historyCaption}${lastSyncedAt ? ` · synced ${lastSyncedAt}` : ''})`}
      actions={
        <Pill theme={theme} variant="secondary" onPress={checkPermissionAndCollect}>
          Refresh
        </Pill>
      }
    >
      <DayPickerStrip />

      {showUnifiedComingCard ? (
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
                MULTI-DAY PATTERNS · MINIMUM 3 DAYS
              </Text>
              <Text role="title-lg" theme={theme}>
                Coming with more data
              </Text>
              <Text role="label" tone="muted" theme={theme}>
                {`${evolution?.distinctDays ?? 0} of ${evolution?.minDays ?? 3} local days recorded so far${evolution?.historyStartDay ? ` · history starts ${evolution.historyStartDay}` : ''}`}
              </Text>
            </View>
            <TierBadge tier="D" theme={theme} />
          </View>
          <EmptyState
            title={`Needs at least ${evolution?.minDays ?? 3} days of local history (${evolution?.distinctDays ?? 0} of ${evolution?.minDays ?? 3} recorded)`}
            body="Interest evolution, cross-app discovery routes, and rabbit-hole checks appear here automatically once 3 local days are collected — without repeating single-day totals."
            action={
              <Pill theme={theme} variant="secondary" onPress={checkPermissionAndCollect}>
                Refresh
              </Pill>
            }
            theme={theme}
          />
        </Surface>
      ) : (
        <View style={{ flexDirection: 'row', gap: theme.space(1.5), flexWrap: 'wrap' }}>
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
      )}

      {!p3Reliable ? (
        <Callout theme={theme} tone="limit">
          {BOUNDARY_GUARD_SHORT(orphanCount, totalGaps)}
        </Callout>
      ) : null}

      {/* Interest Evolution — multi-day hero surface */}
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
                MULTI-DAY RHYTHM · OS USAGE
              </Text>
              <Text role="title-lg" theme={theme}>
                Interest Evolution
              </Text>
              <Text role="label" tone="muted" theme={theme}>
                {evolution?.historyStartDay
                  ? `${evolution.distinctDays} local ${evolution.distinctDays === 1 ? 'day' : 'days'} · history starts ${evolution.historyStartDay}`
                  : `${evolution?.distinctDays ?? 0} local days · multi-day app rhythm`}
              </Text>
            </View>
            <TierBadge tier="D" theme={theme} />
          </View>

          <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap', alignItems: 'center' }}>
            {evolution?.limitedHistory ? <Chip static label="Limited history" theme={theme} /> : null}
            <ConfidenceChip tiers={['D']} label="App-level rhythm · no content" theme={theme} />
          </View>

          {!p3Reliable ? (
            <Text role="micro" tone="muted" theme={theme}>
              Waiting for clean session boundaries before computing multi-day evolution.
            </Text>
          ) : !evolution || !evolution.hasHistory || evolution.rows.length === 0 ? (
            <EmptyState
              title="Coming with more data"
              body={`Needs at least ${evolution?.minDays ?? 3} days of local history (${evolution?.distinctDays ?? 0} of ${evolution?.minDays ?? 3} recorded so far${evolution?.historyStartDay ? `, history starts ${evolution.historyStartDay}` : ''}). Multi-day trends appear once 3 local days are collected — without repeating single-day totals.`}
              theme={theme}
            />
          ) : (
            <View style={{ gap: theme.space(2.5) }}>
              {evolution.limitedHistory ? (
                <Callout theme={theme} tone="neutral">
                  {`Limited history (${evolution.distinctDays} local days, below 14-day full window): ${evolution.summaryLine}`}
                </Callout>
              ) : null}

              <View
                style={{
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.color.card,
                  borderWidth: 1,
                  borderColor: theme.color.borderCard,
                  padding: theme.space(3),
                  gap: theme.space(2.5),
                }}
              >
                {(() => {
                  const maxTotalMs = Math.max(1, ...evolution.rows.map((r) => r.totalSessionMs || 1));
                  return evolution.rows.map((row, idx) => (
                    <View key={row.app} style={{ gap: theme.space(1.5) }}>
                      {idx > 0 ? <Divider theme={theme} /> : null}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.space(2) }}>
                        <View style={{ flex: 1 }}>
                          <Text role="label" theme={theme}>
                            {row.label}
                          </Text>
                          <Text role="micro" tone="muted" theme={theme}>
                            {`${row.activeDays}/${evolution.distinctDays} days active · ${row.seenSinceText}`}
                          </Text>
                        </View>
                        <Chip static label={row.trendLabel} theme={theme} />
                      </View>
                      <Meter
                        theme={theme}
                        value={(row.totalSessionMs || 0) / maxTotalMs}
                        label="Sitting span share"
                        caption={`${formatDuration(row.totalSessionMs || 0)} · ${row.sessionCount} sittings (${row.dominantBand})`}
                        tone={row.trend === 'growing' ? 'anchor' : 'muted'}
                      />
                    </View>
                  ));
                })()}
              </View>

              <Text role="micro" tone="muted" theme={theme}>
                Apps only · topic evolution needs content or export sources.
              </Text>
            </View>
          )}
        </Surface>
      ) : null}

      {/* Discovery Journey */}
      {showDiscovery ? (
        <Card theme={theme} style={{ marginBottom: 0 }}>
          <View style={{ gap: theme.space(0.5), marginBottom: theme.space(2) }}>
            <Text role="micro" tone="muted" theme={theme}>
              CROSS-APP SEQUENCES · REPEATED ROUTES
            </Text>
            <SectionHeader
              theme={theme}
              title="Discovery Journey"
              caption={
                discovery?.historyStartDay
                  ? `seen since ${discovery.historyStartDay} · ${discovery.distinctDays} local ${discovery.distinctDays === 1 ? 'day' : 'days'}`
                  : 'repeated app-to-app routes within ≤5 min & multi-day rhythm'
              }
            />
          </View>
          {!p3Reliable ? (
            <Callout theme={theme} tone="limit">
              {BOUNDARY_GUARD_SHORT(orphanCount, totalGaps)}
            </Callout>
          ) : !discovery || !discovery.hasHistory ? (
            <EmptyState
              title="Coming with more data"
              body={`Needs at least ${discovery?.minDays ?? 3} days of local history (${discovery?.distinctDays ?? 0} of ${discovery?.minDays ?? 3} recorded so far${discovery?.historyStartDay ? `, history starts ${discovery.historyStartDay}` : ''}). Cross-app routes and multi-day visit rhythm appear once 3 local days are collected — without repeating single-day totals or marking day-1 apps as "New".`}
              theme={theme}
            />
          ) : (
            <View style={{ gap: theme.space(2.5) }}>
              {discovery.limitedHistory ? (
                <Callout theme={theme} tone="neutral">
                  {`Limited history (${discovery.distinctDays} local days, below 14-day window): single-day visits reflect normal app rotation, never newly installed apps.`}
                </Callout>
              ) : null}

              {discovery.routes.length > 0 ? (
                <View
                  style={{
                    borderRadius: theme.radius.md,
                    backgroundColor: theme.color.card,
                    borderWidth: 1,
                    borderColor: theme.color.borderCard,
                    padding: theme.space(3),
                    gap: theme.space(2),
                  }}
                >
                  <Text role="label" theme={theme}>
                    Repeated cross-app routes (within ≤5 min)
                  </Text>
                  {(() => {
                    const maxRouteCount = Math.max(1, ...discovery.routes.map((r) => r.count));
                    return discovery.routes.map((rt) => (
                      <Meter
                        key={`${rt.fromApp}->${rt.toApp}`}
                        theme={theme}
                        value={rt.count / maxRouteCount}
                        label={`${rt.fromLabel} → ${rt.toLabel}`}
                        caption={`${rt.count}× across ${rt.activeDays}d`}
                        tone="anchor"
                      />
                    ));
                  })()}
                </View>
              ) : (
                <Text role="micro" tone="muted" theme={theme}>
                  {`No cross-app route repeated ≥2 times within 5 min across ${discovery.distinctDays} local days yet.`}
                </Text>
              )}

              <View style={{ flexDirection: 'row', gap: theme.space(3), flexWrap: 'wrap' }}>
                <Stat
                  value={`${discovery.repeatAppsCount}`}
                  label="Multi-day apps"
                  hint={`of ${discovery.totalAppsVisited} visited`}
                  theme={theme}
                />
                <Stat
                  value={discovery.repeatShareMeasurable ? `${Math.round(discovery.repeatSessionShare * 100)}%` : 'Small sample'}
                  label="Repeat-app sitting share"
                  hint={discovery.topAppByTime ? `Top: ${discovery.topAppByTime.label}` : 'Sustained sittings'}
                  theme={theme}
                />
              </View>

              <Divider theme={theme} />
              <Text role="micro" tone="muted" theme={theme}>
                {`Explicit intent labels on ${selectedDay}: ${discovery.explicitLabels.decisive} of 5 needed (${discovery.explicitLabels.decisive >= 5 ? 'ready for deliberate vs drift tagging' : 'label opens in Sessions to tag routes'})`}
              </Text>
            </View>
          )}
        </Card>
      ) : null}

      {/* Rabbit Hole — spec bar: 4+ returns, session over 30 min */}
      {showRabbit ? (
        <Card theme={theme} style={{ marginBottom: 0 }}>
          <View style={{ gap: theme.space(0.5), marginBottom: theme.space(2) }}>
            <Text role="micro" tone="muted" theme={theme}>
              RETURN CLUSTERS · 4+ RETURNS & OVER 30 MIN
            </Text>
            <SectionHeader
              theme={theme}
              title="Rabbit Hole — sustained return clusters"
              caption="4+ returns across >30 min — intent comes only from your labels"
            />
          </View>
          {!p3Reliable ? (
            <Callout theme={theme} tone="limit">
              {BOUNDARY_GUARD_SHORT(orphanCount, totalGaps)}
            </Callout>
          ) : !rabbitHole || !rabbitHole.hasHistory ? (
            <EmptyState
              title="Coming with more data"
              body={`Needs at least ${rabbitHole?.minDays ?? 3} days of local history (${rabbitHole?.distinctDays ?? 0} of ${rabbitHole?.minDays ?? 3} recorded so far${rabbitHole?.historyStartDay ? `, history starts ${rabbitHole.historyStartDay}` : ''}). Sustained return clusters (4+ returns to one app across >30 min) appear once 3 local days are collected.`}
              theme={theme}
            />
          ) : (
            <View style={{ gap: theme.space(2.5) }}>
              <Text role="micro" tone="muted" theme={theme}>
                {rabbitHole.definitionText}
              </Text>

              {rabbitHole.clusters.length === 0 ? (
                <EmptyState
                  title="No rabbit-hole clusters detected"
                  body={`No app had 4 or more returns adding up to over 30 min across ${rabbitHole.distinctDays} local days.`}
                  theme={theme}
                />
              ) : (
                <View style={{ gap: theme.space(2) }}>
                  {rabbitHole.clusters.map((c) => {
                    const returns = typeof c.returnCount === 'number' ? c.returnCount : Math.max(0, c.sittingCount - 1);
                    const lbl = c.explicitLabels;
                    const labelBadge =
                      !lbl || lbl.decisive === 0
                        ? 'Intent unlabelled'
                        : lbl.intentional > 0 && lbl.mindless === 0
                          ? 'User-labelled: intentional'
                          : lbl.mindless > 0 && lbl.intentional === 0
                            ? 'User-labelled: mindless'
                            : 'User-labelled: mixed';
                    return (
                      <View
                        key={c.id}
                        style={{
                          borderRadius: theme.radius.md,
                          backgroundColor: theme.color.card,
                          borderWidth: 1,
                          borderColor: theme.color.borderCard,
                          padding: theme.space(3),
                          gap: theme.space(1.5),
                        }}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.space(2) }}>
                          <View style={{ flex: 1 }}>
                            <Text role="label" theme={theme}>
                              {c.label}
                            </Text>
                            <Text role="micro" tone="muted" theme={theme}>
                              {`${c.day} · ${new Date(c.startMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–${new Date(c.endMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                            </Text>
                          </View>
                          <Chip static label={labelBadge} theme={theme} />
                        </View>
                        <View style={{ flexDirection: 'row', gap: theme.space(3), flexWrap: 'wrap' }}>
                          <Stat
                            value={`${returns}×`}
                            label="Returns"
                            hint={`${c.sittingCount} sittings`}
                            theme={theme}
                          />
                          <Stat
                            value={formatDuration(c.totalSittingMs)}
                            label="Combined sitting time"
                            hint="Never auto-judged"
                            theme={theme}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: theme.space(2) }}>
                <Text role="micro" tone="muted" theme={theme} style={{ flex: 1 }}>
                  {rabbitHole.capabilities.whatMirrorWillNotDo}
                </Text>
                <LinkButton theme={theme} onPress={() => setActiveTab('sessions')}>
                  Label in Sessions
                </LinkButton>
              </View>
            </View>
          )}
        </Card>
      ) : null}

      {/* Learning Arcs — honest unavailable state */}
      {showArcs ? (
        <Card theme={theme} style={{ marginBottom: 0 }}>
          <View style={{ gap: theme.space(0.5), marginBottom: theme.space(2) }}>
            <Text role="micro" tone="muted" theme={theme}>
              TOPIC THREADS · NEEDS CONTENT SOURCES
            </Text>
            <SectionHeader
              theme={theme}
              title="Learning Arcs"
              caption="requires explicit captures, exports, or opt-in connectors"
            />
          </View>
          <DegradedNotice
            needs={[]}
            anyOf={['A', 'B', 'C']}
            available={['D']}
            feature="Multi-week learning arcs"
            theme={theme}
          />
          <Text role="micro" tone="muted" theme={theme} style={{ marginTop: theme.space(2) }}>
            App names alone cannot distinguish studying a subject from scrolling a feed. Learning arcs stay off until you add an export or opt-in connector in a future release.
          </Text>
        </Card>
      ) : null}
    </AppShell>
  );
}
