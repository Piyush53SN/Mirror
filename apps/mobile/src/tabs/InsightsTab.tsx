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
  WhySheet,
  useTheme,
} from '@mirror/ui';
import { BOUNDARY_GUARD_SHORT } from '../buildDetails';
import { AppShell } from '../components/AppShell';
import { DayPickerStrip } from '../components/DayPickerStrip';
import { formatDuration, useMirrorApp } from '../context/MirrorAppContext';

type InsightsFilter = 'all' | 'whatif' | 'iqs' | 'curiosity' | 'depth';

const FILTER_OPTIONS: { id: InsightsFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'whatif', label: 'What-if' },
  { id: 'iqs', label: 'Score parts' },
  { id: 'curiosity', label: 'Curiosity vs Habit' },
  { id: 'depth', label: 'Depth' },
];

export function InsightsTab(): React.ReactElement {
  const theme = useTheme();
  const {
    selectedDay,
    lastSyncedAt,
    iqs,
    curiosity,
    depthBands,
    dayScoredSessions,
    sittingSpanMs,
    dailyTotals,
    dailyTotalsSource,
    hasEventsWithoutSittings,
    whatIf,
    whatIfCapMin,
    setWhatIfCapMin,
    whatIfQuietPreset,
    setWhatIfQuietPreset,
    intentLabels,
    p3Reliable,
    orphanCount,
    totalGaps,
    checkPermissionAndCollect,
    setActiveTab,
  } = useMirrorApp();
  const [filter, setFilter] = React.useState<InsightsFilter>('all');

  const explicitLabelCount = React.useMemo(
    () =>
      Object.values(intentLabels).filter(
        (lbl) => lbl === 'intentional' || lbl === 'mindless',
      ).length,
    [intentLabels],
  );

  const sittingCount = dayScoredSessions.length;
  const bandTotalCount = React.useMemo(
    () => depthBands.reduce((sum, b) => sum + b.count, 0),
    [depthBands],
  );
  const bandTotalMs = React.useMemo(
    () => depthBands.reduce((sum, b) => sum + b.ms, 0),
    [depthBands],
  );

  const isEmptyDay =
    filter === 'all' &&
    !hasEventsWithoutSittings &&
    (!whatIf || !whatIf.hasBaseline) &&
    sittingCount === 0 &&
    dailyTotals.length === 0;

  const showWhatIf = !isEmptyDay && (filter === 'all' || filter === 'whatif');
  const showIqs = !isEmptyDay && (filter === 'all' || filter === 'iqs');
  const showCuriosity = !isEmptyDay && (filter === 'all' || filter === 'curiosity');
  const showDepth = !isEmptyDay && (filter === 'all' || filter === 'depth');

  const measuredIqsFactors = React.useMemo(
    () => (iqs ? iqs.factors.filter((f) => f.measurable && f.max > 0) : []),
    [iqs],
  );
  const unmeasuredIqsFactors = React.useMemo(
    () => (iqs ? iqs.factors.filter((f) => !f.measurable && f.max > 0) : []),
    [iqs],
  );
  const iqsScaleMax = iqs && iqs.max > 0 ? iqs.max : 100;
  const iqsMeasuredMax =
    iqs && typeof iqs.measuredMax === 'number'
      ? iqs.measuredMax
      : measuredIqsFactors.reduce((sum, f) => sum + f.max, 0);

  return (
    <AppShell
      title="Insights"
      subtitle={`What-if · Score parts · Curiosity · Depth (${selectedDay}${lastSyncedAt ? ` · synced ${lastSyncedAt}` : ''})`}
      actions={
        <Pill theme={theme} variant="secondary" onPress={checkPermissionAndCollect}>
          Refresh
        </Pill>
      }
    >
      <DayPickerStrip />

      {isEmptyDay ? (
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
          <EmptyState
            title="Coming with more data"
            body={`No sittings are recorded on ${selectedDay} yet. What-if estimates, score breakdowns, curiosity splits, and sitting-length bands appear automatically once app activity is collected for this day.`}
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

      {/* What-if Simulator (every output labelled Estimate, fixed 100 scale) */}
      {showWhatIf ? (
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
                COUNTERFACTUAL ARITHMETIC · ESTIMATE
              </Text>
              <Text role="title-lg" theme={theme}>
                What-if Simulator
              </Text>
              <Text role="label" tone="muted" theme={theme}>
                {`Estimates from ${selectedDay}'s usage — measured factors only on the fixed 100-point scale`}
              </Text>
            </View>
            <TierBadge tier="D" theme={theme} />
          </View>

          <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap', alignItems: 'center' }}>
            <Chip static label="Estimate" theme={theme} />
            <Chip static label="Measured factors only" theme={theme} />
            {whatIf?.smallSampleBaseline ? <Chip static label="Small sample" theme={theme} /> : null}
            <ConfidenceChip tiers={['D']} label="OS usage · no app content" theme={theme} />
          </View>

          {!p3Reliable ? (
            <Callout theme={theme} tone="limit">
              {BOUNDARY_GUARD_SHORT(orphanCount, totalGaps)}
            </Callout>
          ) : hasEventsWithoutSittings ? (
            <EmptyState
              title={`Usage events recorded on ${selectedDay}, but no sittings were built yet`}
              body={`What-if simulations need derived sittings on ${selectedDay} (${dailyTotals.length} app${dailyTotals.length === 1 ? '' : 's'} recorded foreground time on Home). Tap Refresh to rebuild sittings from stored events.`}
              action={
                <Pill theme={theme} onPress={checkPermissionAndCollect}>
                  Refresh sittings
                </Pill>
              }
              theme={theme}
            />
          ) : !whatIf || !whatIf.hasBaseline ? (
            <EmptyState
              title="Coming with more data"
              body={`Open a few apps on ${selectedDay} and tap Refresh to model counterfactual sitting caps, quiet hours, and short-bounce scenarios.`}
              theme={theme}
            />
          ) : (
            <View style={{ gap: theme.space(3) }}>
              {/* Baseline summary inset panel */}
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
                <View style={{ flexDirection: 'row', gap: theme.space(3), flexWrap: 'wrap' }}>
                  <View style={{ flex: 1, minWidth: 120 }}>
                    <Stat
                      value={formatDuration(whatIf.baselineTimeMs)}
                      label={
                        whatIf.timeSource === 'os_aggregate'
                          ? dailyTotalsSource === 'stored_events'
                            ? 'Stored screen time'
                            : dailyTotalsSource === 'os_bucket_approx'
                              ? 'Approx. screen time'
                              : 'OS screen time'
                          : 'Recorded time'
                      }
                      hint={
                        whatIf.timeSource === 'os_aggregate'
                          ? dailyTotalsSource === 'stored_events'
                            ? 'Stored · Mirror events'
                            : dailyTotalsSource === 'os_bucket_approx'
                              ? 'Approximate · OS buckets'
                              : 'Day-clipped OS events'
                          : 'Sitting spans'
                      }
                      theme={theme}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 120 }}>
                    <Stat
                      value={`${sittingCount} ${sittingCount === 1 ? 'sitting' : 'sittings'}`}
                      label={`Sitting spans · ${sittingCount > 0 ? formatDuration(sittingSpanMs) : '0s'}`}
                      hint="Merged ≤15m reopens"
                      theme={theme}
                    />
                  </View>
                </View>
                <Divider theme={theme} />
                <Text role="micro" tone="muted" theme={theme}>
                  {`Baseline score: ${whatIf.baselineIqs.value === null ? 'Not yet scored' : `${Math.round(whatIf.baselineIqs.value)} / ${whatIf.baselineIqs.max > 0 ? whatIf.baselineIqs.max : 100}`} (${whatIf.baselineIqs.band}, ${whatIf.baselineIqs.confidence.level} confidence — ${whatIf.baselineIqs.measuredMax ?? iqsMeasuredMax} pts measured today)`}
                </Text>
              </View>

              {/* Scenario preset controls */}
              <View style={{ flexDirection: 'row', gap: theme.space(1.5), flexWrap: 'wrap' }}>
                <Pill
                  theme={theme}
                  variant={whatIfCapMin === 10 ? 'primary' : 'secondary'}
                  onPress={() => setWhatIfCapMin(10)}
                >
                  Cap 10m
                </Pill>
                <Pill
                  theme={theme}
                  variant={whatIfCapMin === 20 ? 'primary' : 'secondary'}
                  onPress={() => setWhatIfCapMin(20)}
                >
                  Cap 20m
                </Pill>
                <Pill
                  theme={theme}
                  variant={whatIfQuietPreset === '23-05' ? 'primary' : 'secondary'}
                  onPress={() => setWhatIfQuietPreset('23-05')}
                >
                  Quiet 23:00–05:00
                </Pill>
                <Pill
                  theme={theme}
                  variant={whatIfQuietPreset === '22-07' ? 'primary' : 'secondary'}
                  onPress={() => setWhatIfQuietPreset('22-07')}
                >
                  Quiet 22:00–07:00
                </Pill>
              </View>

              {/* Individual counterfactual estimate sub-panels */}
              <View style={{ gap: theme.space(2.5) }}>
                {whatIf.scenarios.map((sc) => {
                  const baseMs = typeof sc.baselineTimeMs === 'number' ? sc.baselineTimeMs : whatIf.baselineTimeMs;
                  const estMs = typeof sc.estimatedTimeMs === 'number' ? sc.estimatedTimeMs : baseMs;
                  const deltaMs = typeof sc.deltaTimeMs === 'number' ? sc.deltaTimeMs : 0;
                  const retainedRatio = baseMs > 0 ? Math.min(1, Math.max(0, estMs / baseMs)) : 0;
                  const deltaCaption =
                    deltaMs < 0
                      ? `-${formatDuration(Math.abs(deltaMs))} · Estimate`
                      : '0s change · Estimate';
                  return (
                    <View
                      key={sc.id}
                      style={{
                        borderRadius: theme.radius.md,
                        backgroundColor: theme.color.card,
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
                        <Text role="label" theme={theme} style={{ flex: 1, flexShrink: 1, minWidth: 160 }}>
                          {sc.title}
                        </Text>
                        <Chip static label={sc.badge} theme={theme} />
                      </View>

                      <Text role="body" theme={theme}>
                        {sc.timeEstimateLabel}
                      </Text>

                      <Meter
                        theme={theme}
                        value={retainedRatio}
                        label="Remaining span"
                        caption={deltaCaption}
                        tone={deltaMs < 0 ? 'anchor' : 'muted'}
                      />

                      <Text role="micro" theme={theme}>
                        {sc.iqsEstimateLabel}
                      </Text>

                      {sc.noChangeReason ? (
                        <Text role="micro" tone="muted" theme={theme}>
                          {sc.noChangeReason}
                        </Text>
                      ) : null}

                      {sc.estimatedIqs.measuredFactors.length > 0 ? (
                        <Text role="micro" tone="muted" theme={theme}>
                          {sc.estimatedIqs.measuredFactors.map((f) => f.estimateLabel).join(' · ')}
                        </Text>
                      ) : null}

                      <Text role="micro" tone="muted" theme={theme}>
                        {`Assumption: ${sc.assumption}`}
                      </Text>
                    </View>
                  );
                })}
              </View>

              {whatIf.minimumActivityNote ? (
                <Callout theme={theme} tone="neutral">
                  {whatIf.minimumActivityNote}
                </Callout>
              ) : null}

              {whatIf.unmeasuredFactorSummary.length > 0 ? (
                <Text role="micro" tone="muted" theme={theme}>
                  {`Not modeled (not measured today): ${whatIf.unmeasuredFactorSummary.join(' · ')}`}
                </Text>
              ) : null}

              <Text role="micro" tone="muted" theme={theme}>
                {whatIf.disclaimer}
              </Text>
            </View>
          )}
        </Surface>
      ) : null}

      {/* Score Breakdown */}
      {showIqs ? (
        <Card theme={theme} style={{ marginBottom: 0 }}>
          <View style={{ gap: theme.space(0.5), marginBottom: theme.space(2) }}>
            <Text role="micro" tone="muted" theme={theme}>
              SCORE DECOMPOSITION · FIXED 0–100 SCALE
            </Text>
            <SectionHeader
              theme={theme}
              title="Score Factor Breakdown"
              caption={`measured parts vs unmeasured parts on ${selectedDay} (${sittingCount} sitting${sittingCount === 1 ? '' : 's'})`}
            />
          </View>
          {hasEventsWithoutSittings ? (
            <EmptyState
              title={`Usage events recorded on ${selectedDay}, but no sittings were built yet`}
              body="Factor scores require derived sittings on this day. Tap Refresh to rebuild sittings from stored events."
              action={
                <Pill theme={theme} onPress={checkPermissionAndCollect}>
                  Refresh sittings
                </Pill>
              }
              theme={theme}
            />
          ) : iqs ? (
            <WhySheet
              score={iqs.value ?? 0}
              maxScore={iqsScaleMax}
              measuredMax={iqsMeasuredMax}
              components={measuredIqsFactors.map((f) => ({
                label: f.label,
                points: f.points,
                maxPoints: f.max,
                note: f.detail,
                tier: f.tier,
              }))}
              unmeasuredComponents={unmeasuredIqsFactors.map((f) => ({
                label: f.label,
                maxPoints: f.max,
                reason: f.detail,
                tier: f.tier,
              }))}
              confidence={{
                scorePct: Math.round(iqs.confidence.score * 100),
                level: iqs.confidence.level,
                explanation:
                  iqs.confidence.explanation ??
                  `Confidence is ${Math.round(iqs.confidence.score * 100)}% (${iqs.confidence.level}) from ${iqs.confidence.sample} sitting${iqs.confidence.sample === 1 ? '' : 's'} and ${iqs.confidence.labels} explicit label${iqs.confidence.labels === 1 ? '' : 's'}.`,
                reasons: iqs.confidence.reasons,
              }}
              caveat={iqs.caveat}
              theme={theme}
            />
          ) : (
            <EmptyState
              title="Coming with more data"
              body="Open a few apps and tap Refresh. Mirror never fabricates missing score parts."
              theme={theme}
            />
          )}
        </Card>
      ) : null}

      {/* Curiosity vs Habit */}
      {showCuriosity ? (
        <Card theme={theme} style={{ marginBottom: 0 }}>
          <View style={{ gap: theme.space(0.5), marginBottom: theme.space(2) }}>
            <Text role="micro" tone="muted" theme={theme}>
              EXPLICIT INTENT · USER LABELS ONLY
            </Text>
            <SectionHeader
              theme={theme}
              title="Curiosity vs Habit"
              caption="only explicit user labels count — duration hints never count"
            />
          </View>
          {curiosity ? (
            <View style={{ gap: theme.space(2.5) }}>
              {(() => {
                const labelledMs = curiosity.deepMs + curiosity.habitMs;
                const curiosityShare = labelledMs > 0 ? curiosity.deepMs / labelledMs : 0;
                const habitShare = labelledMs > 0 ? curiosity.habitMs / labelledMs : 0;
                const totalDaySittingMs = labelledMs + curiosity.unlabeledMs;
                const unlabeledShare = totalDaySittingMs > 0 ? curiosity.unlabeledMs / totalDaySittingMs : 0;
                const switchDetail =
                  typeof curiosity.switchesPerSitting === 'number'
                    ? `${curiosity.switchesPerSitting.toFixed(2)} switches / sitting · ${curiosity.switchesPerHour.toFixed(1)} / active hr`
                    : `${curiosity.switchesPerHour.toFixed(1)} switches / active hr`;
                return (
                  <>
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
                      <View style={{ flexDirection: 'row', gap: theme.space(3), flexWrap: 'wrap' }}>
                        <View style={{ flex: 1, minWidth: 120 }}>
                          <Stat
                            value={formatDuration(curiosity.deepMs)}
                            label="Intentional"
                            hint={`${Math.round(curiosityShare * 100)}% of labelled span`}
                            theme={theme}
                          />
                        </View>
                        <View style={{ flex: 1, minWidth: 120 }}>
                          <Stat
                            value={formatDuration(curiosity.habitMs)}
                            label="Mindless / routine"
                            hint={`${Math.round(habitShare * 100)}% of labelled span`}
                            theme={theme}
                          />
                        </View>
                      </View>
                      <Divider theme={theme} />
                      <Meter
                        theme={theme}
                        value={curiosityShare}
                        label="Intentional share of labelled sittings"
                        caption={formatDuration(curiosity.deepMs)}
                        tone="anchor"
                      />
                      <Meter
                        theme={theme}
                        value={habitShare}
                        label="Mindless / routine share of labelled sittings"
                        caption={formatDuration(curiosity.habitMs)}
                        tone="muted"
                      />
                      {curiosity.unlabeledMs > 0 ? (
                        <Meter
                          theme={theme}
                          value={unlabeledShare}
                          label="Unlabelled sitting span"
                          caption={formatDuration(curiosity.unlabeledMs)}
                          tone="muted"
                        />
                      ) : null}
                    </View>
                    <Text role="micro" tone="muted" theme={theme}>
                      {`${Math.round(curiosity.labelShare * 100)}% of ${selectedDay}'s sitting span explicitly labelled · ${switchDetail}`}
                    </Text>
                  </>
                );
              })()}
            </View>
          ) : (
            <View style={{ gap: theme.space(2.5) }}>
              <EmptyState
                title={`Coming with more data (${explicitLabelCount} of 5 explicit labels)`}
                body="Mirror will not infer whether an open was curiosity or habit from duration or app category. Label 5 or more sittings in Sessions to unlock this split."
                action={
                  <LinkButton theme={theme} onPress={() => setActiveTab('sessions')}>
                    Label sittings in Sessions
                  </LinkButton>
                }
                theme={theme}
              />
              <DegradedNotice
                needs={['D']}
                anyOf={['A', 'B', 'C']}
                available={['D']}
                feature="Topic-assisted curiosity split"
                theme={theme}
              />
            </View>
          )}
        </Card>
      ) : null}

      {/* Depth & Sitting Length Mix */}
      {showDepth ? (
        <Card theme={theme} style={{ marginBottom: 0 }}>
          <View style={{ gap: theme.space(0.5), marginBottom: theme.space(2) }}>
            <Text role="micro" tone="muted" theme={theme}>
              SITTING DURATION DISTRIBUTION · OS USAGE
            </Text>
            <SectionHeader
              theme={theme}
              title="Depth & Sitting Length Mix"
              caption={`${sittingCount} sitting${sittingCount === 1 ? '' : 's'} on ${selectedDay} · ${formatDuration(sittingSpanMs)} sitting spans`}
            />
          </View>
          <View style={{ gap: theme.space(2.5) }}>
            <DegradedNotice
              needs={['D']}
              anyOf={['A', 'B', 'C']}
              available={['D']}
              feature="Content depth"
              theme={theme}
            />
            {sittingCount > 0 ? (
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
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: theme.space(1) }}>
                  <Text role="label" theme={theme}>
                    {`Sitting-length bands (${bandTotalCount} sitting${bandTotalCount === 1 ? '' : 's'})`}
                  </Text>
                  <Text role="micro" tone="muted" theme={theme}>
                    {`${formatDuration(bandTotalMs)} sitting spans`}
                  </Text>
                </View>
                <Divider theme={theme} />
                {depthBands.map((band) => (
                  <Meter
                    key={band.id}
                    theme={theme}
                    value={band.share}
                    label={band.label}
                    caption={`${band.count} (${Math.round(band.share * 100)}%) · ${formatDuration(band.ms)}`}
                    tone={band.id === 'under-8s' ? 'muted' : 'anchor'}
                  />
                ))}
              </View>
            ) : hasEventsWithoutSittings ? (
              <EmptyState
                title={`Usage events recorded on ${selectedDay}, but no sittings were built yet`}
                body="Sitting-length bands require derived sittings on this day. Tap Refresh to rebuild sittings from stored events."
                action={
                  <Pill theme={theme} onPress={checkPermissionAndCollect}>
                    Refresh sittings
                  </Pill>
                }
                theme={theme}
              />
            ) : (
              <EmptyState
                title="Coming with more data"
                body="Open apps and tap Refresh to inspect sitting-length bands."
                theme={theme}
              />
            )}
          </View>
        </Card>
      ) : null}
    </AppShell>
  );
}
