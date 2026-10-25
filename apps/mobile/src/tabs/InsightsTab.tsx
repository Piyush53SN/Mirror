import * as React from 'react';
import { View } from 'react-native';
import {
  Card,
  Chip,
  DegradedNotice,
  Divider,
  EmptyState,
  LinkButton,
  Pill,
  SectionHeader,
  Text,
  TierBadge,
  WhySheet,
  useTheme,
} from '@mirror/ui';
import { P3_GUARD_SHORT } from '../buildDetails';
import { AppShell } from '../components/AppShell';
import { DayPickerStrip } from '../components/DayPickerStrip';
import { formatDuration, useMirrorApp } from '../context/MirrorAppContext';

type InsightsFilter = 'all' | 'whatif' | 'factors' | 'curiosity' | 'depth';

const FILTER_OPTIONS: ReadonlyArray<{ id: InsightsFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'whatif', label: 'What-if' },
  { id: 'factors', label: 'IQS Factors' },
  { id: 'curiosity', label: 'Curiosity vs Habit' },
  { id: 'depth', label: 'Depth' },
];

export function InsightsTab(): React.ReactElement {
  const theme = useTheme();
  const {
    selectedDay,
    iqs,
    whatIf,
    whatIfCapMin,
    setWhatIfCapMin,
    whatIfQuietPreset,
    setWhatIfQuietPreset,
    curiosity,
    depthBands,
    dayScoredSessions,
    orphanCount,
    totalGaps,
    p3Reliable,
    checkPermissionAndCollect,
    setActiveTab,
  } = useMirrorApp();
  const [filter, setFilter] = React.useState<InsightsFilter>('all');

  const showWhatIf = filter === 'all' || filter === 'whatif';
  const showFactors = filter === 'all' || filter === 'factors';
  const showCuriosity = filter === 'all' || filter === 'curiosity';
  const showDepth = filter === 'all' || filter === 'depth';

  return (
    <AppShell
      title="Insights"
      subtitle={`Measured factors & local estimates · ${selectedDay}`}
      actions={
        <Pill theme={theme} variant="secondary" onPress={checkPermissionAndCollect}>
          Refresh
        </Pill>
      }
    >
      <DayPickerStrip />

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

      {/* J18 What-if Simulator – every output labelled Estimate, never rescaled to 100, measured factors only */}
      {showWhatIf ? (
        <Card theme={theme} elevated>
          <SectionHeader
            theme={theme}
            title="What-if Simulator — Estimates"
            caption={
              whatIf && whatIf.hasBaseline
                ? `${selectedDay} · ${whatIf.timeSource === 'os_aggregate' ? `OS total ${formatDuration(whatIf.baselineTimeMs)} · Sittings ${formatDuration(whatIf.sittingTimeMs)}` : `Sittings ${formatDuration(whatIf.sittingTimeMs)}`} · IQS ${whatIf.baselineIqs.value ?? '—'} / ${whatIf.baselineIqs.max} (never rescaled to 100)`
                : `${selectedDay} · local counterfactual arithmetic over recorded sittings`
            }
          />
          {!p3Reliable ? (
            <EmptyState
              title="Needs reliable session boundaries"
              body={P3_GUARD_SHORT(orphanCount, totalGaps)}
              theme={theme}
            />
          ) : !whatIf || !whatIf.hasBaseline ? (
            <EmptyState
              title={`No sittings recorded for ${selectedDay}`}
              body="What-if Simulator runs local arithmetic over real sittings on the selected day. Use apps and tap Refresh once sittings are recorded."
              theme={theme}
            />
          ) : (
            <View style={{ gap: theme.space(3) }}>
              <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap', alignItems: 'center' }}>
                <Chip static label="Estimate" theme={theme} />
                <Chip static label="Measured factors only" theme={theme} />
                {whatIf.smallSampleBaseline ? <Chip static label="Small sample today" theme={theme} /> : null}
                <TierBadge tier="D" theme={theme} />
              </View>

              <View style={{ gap: theme.space(1) }}>
                {whatIf.minimumActivityNote ? (
                  <Text role="micro" tone="muted" theme={theme}>
                    {whatIf.minimumActivityNote}
                  </Text>
                ) : null}
                <Text role="micro" tone="muted" theme={theme}>
                  {`Measured in estimates (${whatIf.baselineIqs.max} max, never rescaled to 100): ${whatIf.measuredFactorSummary.join(' · ') || 'none (below minimum activity)'}`}
                </Text>
                {whatIf.unmeasuredFactorSummary.length > 0 ? (
                  <Text role="micro" tone="muted" theme={theme}>
                    {`Excluded (not measured, never guessed): ${whatIf.unmeasuredFactorSummary.join(' · ')}`}
                  </Text>
                ) : null}
              </View>

              <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap', alignItems: 'center' }}>
                <Text role="micro" tone="muted" theme={theme}>
                  Adjust:
                </Text>
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

              <Divider theme={theme} />

              {whatIf.scenarios.map((sc) => (
                <View key={sc.id} style={{ gap: theme.space(1), paddingVertical: theme.space(1) }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: theme.space(2),
                    }}
                  >
                    <Text role="label" theme={theme} style={{ flex: 1 }}>
                      {sc.title}
                    </Text>
                    <Chip static label={sc.badge} theme={theme} />
                  </View>
                  <Text role="body" theme={theme}>
                    {sc.timeEstimateLabel}
                  </Text>
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
                      {sc.estimatedIqs.measuredFactors.map((mf) => mf.estimateLabel).join(' · ')}
                    </Text>
                  ) : null}
                  <Text role="micro" tone="muted" theme={theme}>
                    {`Assumption: ${sc.assumption}`}
                  </Text>
                  <Divider theme={theme} />
                </View>
              ))}

              <Text role="micro" tone="muted" theme={theme}>
                {whatIf.disclaimer}
              </Text>
            </View>
          )}
        </Card>
      ) : null}

      {/* J7: IQS Factor Breakdown */}
      {showFactors ? (
        <Card theme={theme} elevated>
          <SectionHeader
            theme={theme}
            title="IQS Factor Breakdown"
            caption={`Every measured part of ${selectedDay} — missing parts stay unmeasured`}
          />
          {iqs ? (
            <View style={{ gap: theme.space(2) }}>
              <WhySheet
                score={iqs.value ?? 0}
                maxScore={iqs.max}
                components={iqs.factors.map((f) => ({
                  label: f.label,
                  points: f.points,
                  note: f.detail,
                  tier: f.tier,
                }))}
                caveat={iqs.caveat}
                theme={theme}
              />
            </View>
          ) : (
            <EmptyState
              title={`No score breakdown for ${selectedDay}`}
              body="Factor breakdown appears as soon as usage data is collected for this day."
              theme={theme}
            />
          )}
        </Card>
      ) : null}

      {/* J6: Curiosity vs Habit */}
      {showCuriosity ? (
        <Card theme={theme} elevated>
          <SectionHeader
            theme={theme}
            title="Curiosity vs Habit"
            caption="Explicit labels only — routine habit is never framed as failure"
          />
          {curiosity ? (
            <View style={{ gap: theme.space(2) }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text role="label" theme={theme}>
                  Intentional sittings
                </Text>
                <Text role="label" theme={theme}>
                  {formatDuration(curiosity.deepMs)}
                </Text>
              </View>
              <Divider theme={theme} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text role="label" theme={theme}>
                  Mindless / routine sittings
                </Text>
                <Text role="label" theme={theme}>
                  {formatDuration(curiosity.habitMs)}
                </Text>
              </View>
              <Divider theme={theme} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text role="label" theme={theme}>
                  Unlabelled sitting time
                </Text>
                <Text role="label" tone="muted" theme={theme}>
                  {formatDuration(curiosity.unlabeledMs)}
                </Text>
              </View>
              <Text role="micro" tone="muted" theme={theme}>
                {`Explicit label coverage: ${Math.round(curiosity.labelShare * 100)}% of sitting time on ${selectedDay} (${iqs?.confidence.labels ?? 5}+ decisive labels).`}
              </Text>
            </View>
          ) : (
            <EmptyState
              title="Needs at least 5 explicit labels on this day"
              body={`${iqs?.confidence.labels ?? 0} of 5 decisive explicit labels (intentional or mindless) recorded for ${selectedDay}. Mirror never guesses intent from sitting duration — label opens in Sessions if you want this split.`}
              action={
                <LinkButton theme={theme} onPress={() => setActiveTab('sessions')}>
                  Open Sessions tab
                </LinkButton>
              }
              theme={theme}
            />
          )}
          <View style={{ marginTop: theme.space(2) }}>
            <DegradedNotice
              needs={['D']}
              anyOf={['A', 'B', 'C']}
              available={['D']}
              feature="Topic-assisted curiosity split"
              theme={theme}
            />
          </View>
        </Card>
      ) : null}

      {/* J5: Depth & Sitting Length Mix */}
      {showDepth ? (
        <Card theme={theme} elevated>
          <SectionHeader
            theme={theme}
            title="Depth & Sitting Length Mix"
            caption="Content depth requires Tier A/B/C; Tier D reports sitting-length bands"
          />
          <DegradedNotice
            needs={['D']}
            anyOf={['A', 'B', 'C']}
            available={['D']}
            feature="Content depth"
            theme={theme}
          />
          {dayScoredSessions.length === 0 ? (
            <EmptyState
              title={`No sittings recorded for ${selectedDay}`}
              body="Sitting-length bands appear once at least one complete sitting is recorded on this day. Length is descriptive only — long sittings are never scored higher than short ones."
              theme={theme}
            />
          ) : (
            <View style={{ gap: theme.space(1.5), marginTop: theme.space(2) }}>
              <Text role="micro" tone="muted" theme={theme}>
                {`${dayScoredSessions.length} sitting${dayScoredSessions.length === 1 ? '' : 's'} on ${selectedDay} (descriptive only — only under-8s bounces enter IQS):`}
              </Text>
              {depthBands.map((band, idx) => (
                <View key={band.id} style={{ gap: theme.space(1) }}>
                  {idx > 0 ? <Divider theme={theme} /> : null}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text role="label" theme={theme}>
                      {band.label}
                    </Text>
                    <Text role="micro" tone="muted" theme={theme}>
                      {`${band.count} (${Math.round(band.share * 100)}%) · ${formatDuration(band.ms)}`}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </Card>
      ) : null}
    </AppShell>
  );
}
