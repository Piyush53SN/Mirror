import * as React from 'react';
import { Pressable, View } from 'react-native';
import {
  Callout,
  Card,
  Chip,
  ConfidenceChip,
  Divider,
  EmptyState,
  LinkButton,
  Meter,
  Pill,
  SectionHeader,
  Stat,
  Surface,
  TIERS,
  Text,
  TextField,
  TierBadge,
  useTheme,
} from '@mirror/ui';
import { BOUNDARY_GUARD_SHORT, BUILD_SHORT } from '../buildDetails';
import { AppShell } from '../components/AppShell';
import { formatDuration, useMirrorApp } from '../context/MirrorAppContext';

const ALL_TIERS = [TIERS.A, TIERS.B, TIERS.C, TIERS.D] as const;

export function YouTab(): React.ReactElement {
  const theme = useTheme();
  const {
    focusWindows,
    lastReset,
    collectingSince,
    quality,
    p3Reliable,
    orphanCount,
    totalGaps,
    latestSyncOrphans,
    resetStoredData,
    exportAllData,
    clearStoredLabels,
    handleBuildTap,
    checkPermissionAndCollect,
  } = useMirrorApp();

  const [confirmingExport, setConfirmingExport] = React.useState(false);
  const [exportPassphrase, setExportPassphrase] = React.useState('');
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = React.useState('');
  const [confirmingClearLabels, setConfirmingClearLabels] = React.useState(false);
  const [busyAction, setBusyAction] = React.useState<'none' | 'export' | 'delete' | 'clearLabels'>('none');
  const [privacyNotice, setPrivacyNotice] = React.useState<string | null>(null);

  const deletePhraseMatches = deleteConfirmText.trim() === 'DELETE';

  const handleRunExport = React.useCallback(
    async (mode: 'save' | 'share') => {
      setBusyAction('export');
      setPrivacyNotice(null);
      try {
        const res = exportAllData
          ? await exportAllData({ passphrase: exportPassphrase, mode })
          : false;
        const ok = typeof res === 'boolean' ? res : res.ok;
        const encrypted = typeof res === 'boolean' ? exportPassphrase.trim().length > 0 : res.encrypted;
        const via =
          typeof res === 'boolean'
            ? 'share_sheet'
            : res.savedVia;
        if (ok) {
          setConfirmingExport(false);
          setExportPassphrase('');
          const encDesc = encrypted
            ? 'encrypted with your passphrase (XChaCha20-Poly1305)'
            : 'in plaintext JSON';
          setPrivacyNotice(
            via === 'save_dialog'
              ? `Saved local export file ${encDesc}.`
              : `Opened Android share sheet with your local export ${encDesc}.`,
          );
        } else {
          setPrivacyNotice('Export was cancelled or could not be completed right now.');
        }
      } finally {
        setBusyAction('none');
      }
    },
    [exportAllData, exportPassphrase],
  );

  const handleConfirmDeleteAll = React.useCallback(async () => {
    if (deleteConfirmText.trim() !== 'DELETE') return;
    setBusyAction('delete');
    setPrivacyNotice(null);
    try {
      await resetStoredData('user_delete_all');
      setConfirmingDelete(false);
      setDeleteConfirmText('');
      setPrivacyNotice('All local Mirror data has been deleted from this device.');
    } finally {
      setBusyAction('none');
    }
  }, [deleteConfirmText, resetStoredData]);

  const handleConfirmClearLabels = React.useCallback(async () => {
    setBusyAction('clearLabels');
    setPrivacyNotice(null);
    try {
      await clearStoredLabels();
      setConfirmingClearLabels(false);
      setPrivacyNotice('All manual intent labels have been cleared from this device.');
    } finally {
      setBusyAction('none');
    }
  }, [clearStoredLabels]);

  const resetDateLabel = React.useMemo(() => {
    if (!lastReset?.at) return null;
    if (typeof lastReset.at === 'number') {
      return new Date(lastReset.at).toISOString().slice(0, 10);
    }
    return String(lastReset.at).slice(0, 10);
  }, [lastReset]);

  const resetReasonText = React.useMemo(() => {
    if (!lastReset) return '';
    const prev = (lastReset as { previousHistoryStartDay?: string | null }).previousHistoryStartDay;
    const suffix = prev ? `, previous history began ${prev}` : '';
    if (lastReset.reason === 'user_delete_all') {
      return `you chose Delete all local data on this phone${suffix}`;
    }
    if (lastReset.reason === 'keystore_invalidated') {
      return `Android Keystore key was invalidated (for example after a lock-screen change), so Mirror started a fresh encrypted store${suffix}`;
    }
    if (lastReset.reason === 'key_mismatch_reset') {
      return `the encrypted database key was reset on this phone${suffix}`;
    }
    return `local storage was cleared or reinstalled${suffix}`;
  }, [lastReset]);

  return (
    <AppShell
      title="You"
      subtitle={`Focus Windows · Privacy · Data Tiers${focusWindows?.historyStartDay ? ` (history starts ${focusWindows.historyStartDay})` : ''}`}
      actions={
        <Pill theme={theme} variant="secondary" onPress={checkPermissionAndCollect}>
          Refresh
        </Pill>
      }
    >
      {/* Focus Windows — observed timing blocks (requires 21 days AND 5 sittings/cell) */}
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
              OBSERVED TIMING BLOCKS · 21 DAYS & 5 SITTINGS/CELL
            </Text>
            <Text role="title-lg" theme={theme}>
              Focus Windows
            </Text>
            <Text role="label" tone="muted" theme={theme}>
              {focusWindows?.ready
                ? `Observed across ${focusWindows.distinctDays} days (${focusWindows.cellsMeetingSampleFloor} qualifying cells)`
                : focusWindows?.progressLabel ?? 'Needs 3 weeks of data and ≥5 sittings per cell'}
            </Text>
          </View>
          <TierBadge tier="D" theme={theme} />
        </View>

        <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap', alignItems: 'center' }}>
          <Chip static label="Descriptive · non-clinical" theme={theme} />
          <ConfidenceChip tiers={['D']} label="21d & ≥5 sittings/cell" theme={theme} />
        </View>

        {!p3Reliable ? (
          <Callout theme={theme} tone="limit">
            {BOUNDARY_GUARD_SHORT(orphanCount, totalGaps)}
          </Callout>
        ) : !focusWindows || !focusWindows.ready ? (
          <View style={{ gap: theme.space(2.5) }}>
            <EmptyState
              title={`Coming with more data — ${focusWindows?.emptyStateTitle ?? 'Needs 3 weeks of data and 5 sittings per cell'}`}
              body={
                focusWindows?.emptyStateBody ??
                'Focus Windows stay hidden until Mirror has at least 21 local days of history and 5 or more sittings in a weekday × 4-hour block.'
              }
              theme={theme}
            />
            {focusWindows ? (
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
                <Meter
                  theme={theme}
                  value={Math.min(1, focusWindows.distinctDays / focusWindows.minDays)}
                  label="History progress (21-day requirement)"
                  caption={`${focusWindows.distinctDays} / ${focusWindows.minDays} days`}
                  tone="anchor"
                />
                <Text role="micro" tone="muted" theme={theme}>
                  {`${focusWindows.progressLabel}${focusWindows.historyStartDay ? ` · history starts ${focusWindows.historyStartDay}` : ''}`}
                </Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={{ gap: theme.space(2.5) }}>
            <Text role="micro" tone="muted" theme={theme}>
              {focusWindows.progressLabel}
            </Text>
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
                const windows = focusWindows.suggestedWindows;
                const maxHoldMs = Math.max(1, ...windows.map((w) => w.totalSittingMs || 1));
                return windows.map((w, idx) => (
                  <View key={w.cellId} style={{ gap: theme.space(1.5) }}>
                    {idx > 0 ? <Divider theme={theme} /> : null}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: theme.space(2) }}>
                      <Text role="label" theme={theme}>
                        {`${idx + 1}. ${w.label}`}
                      </Text>
                      <Text role="micro" tone="muted" theme={theme}>
                        {`${w.sessionCount} sittings across ${w.distinctDays}d`}
                      </Text>
                    </View>
                    <Meter
                      theme={theme}
                      value={(w.totalSittingMs || 0) / maxHoldMs}
                      label="Block sitting span"
                      caption={`${formatDuration(w.totalSittingMs || 0)}${w.switchesPerHour !== null ? ` · ${w.switchesPerHour.toFixed(1)} switches/hr` : ''}`}
                      tone={idx === 0 ? 'anchor' : 'muted'}
                    />
                    <Text role="micro" tone="muted" theme={theme}>
                      {`${Math.round(w.sustainedShare * 100)}% sustained (≥8 s)${w.explicitLabels && w.explicitLabels.decisive > 0 ? ` · ${w.explicitLabels.intentional}/${w.explicitLabels.decisive} user-labelled intentional` : ''}`}
                    </Text>
                  </View>
                ));
              })()}
            </View>
            <Callout theme={theme} tone="neutral">
              {focusWindows.capabilities.nonDiagnosticRule}
            </Callout>
          </View>
        )}
      </Surface>

      {/* Local Data & Privacy Controls (Export + Clear Labels + Typed Delete All + Reset Audit) */}
      <Card theme={theme} style={{ marginBottom: 0 }}>
        <View style={{ gap: theme.space(0.5), marginBottom: theme.space(2) }}>
          <Text role="micro" tone="muted" theme={theme}>
            ON-DEVICE STORAGE · ZERO CLOUD SYNC
          </Text>
          <SectionHeader
            theme={theme}
            title="Local Data & Privacy"
            caption={`encrypted SQLite on this phone${collectingSince ? ` · last sync ${collectingSince}` : ''}`}
          />
        </View>

        <View style={{ gap: theme.space(2.5) }}>
          <Text role="body" theme={theme}>
            Mirror stores every event, derived sitting, and explicit intent label solely on this phone in an XChaCha20-Poly1305 encrypted SQLite database. Release builds declare no internet permission.
          </Text>

          {lastReset && resetDateLabel ? (
            <Callout theme={theme} tone="neutral">
              {`History reset on ${resetDateLabel} (${resetReasonText}). Analytics reflect only data collected after that reset.`}
            </Callout>
          ) : null}

          {privacyNotice ? (
            <Callout theme={theme} tone="neutral">
              {privacyNotice}
            </Callout>
          ) : null}

          <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap', alignItems: 'center' }}>
            {!confirmingExport ? (
              <Pill
                testID="export-data-trigger"
                theme={theme}
                variant="secondary"
                disabled={busyAction !== 'none'}
                onPress={() => {
                  setPrivacyNotice(null);
                  setConfirmingExport(true);
                }}
              >
                Export all local data (JSON)
              </Pill>
            ) : null}

            {!confirmingClearLabels ? (
              <Pill
                testID="clear-labels-trigger"
                theme={theme}
                variant="quiet"
                disabled={busyAction !== 'none'}
                onPress={() => {
                  setPrivacyNotice(null);
                  setConfirmingClearLabels(true);
                }}
              >
                Clear manual labels
              </Pill>
            ) : null}

            {!confirmingDelete ? (
              <Pill
                testID="delete-all-data-trigger"
                theme={theme}
                variant="quiet"
                disabled={busyAction !== 'none'}
                onPress={() => {
                  setPrivacyNotice(null);
                  setDeleteConfirmText('');
                  setConfirmingDelete(true);
                }}
              >
                Delete all local data
              </Pill>
            ) : null}
          </View>

          {confirmingExport ? (
            <View
              testID="export-data-panel"
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
                Export local data (JSON)
              </Text>
              <Callout theme={theme} tone="limit">
                Plaintext warning: Without a passphrase, your exported JSON contains readable app names, open timestamps, derived sittings, and manual intent labels. Add an optional passphrase below to encrypt the export with XChaCha20-Poly1305 before saving or sharing.
              </Callout>
              <TextField
                testID="export-passphrase-input"
                value={exportPassphrase}
                onChangeText={setExportPassphrase}
                placeholder="Optional passphrase (leave blank for plaintext)"
                autoCapitalize="none"
                secureTextEntry
                accessibilityLabel="Optional passphrase to encrypt exported JSON"
                theme={theme}
              />
              <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap', alignItems: 'center' }}>
                <Pill
                  testID="export-save-btn"
                  theme={theme}
                  variant="primary"
                  disabled={busyAction !== 'none'}
                  onPress={() => handleRunExport('save')}
                >
                  {busyAction === 'export' ? 'Preparing export…' : 'Save JSON file'}
                </Pill>
                <Pill
                  testID="export-share-btn"
                  theme={theme}
                  variant="secondary"
                  disabled={busyAction !== 'none'}
                  onPress={() => handleRunExport('share')}
                >
                  Share JSON
                </Pill>
                <LinkButton
                  testID="export-cancel-btn"
                  theme={theme}
                  onPress={() => {
                    setExportPassphrase('');
                    setConfirmingExport(false);
                  }}
                >
                  Cancel
                </LinkButton>
              </View>
            </View>
          ) : null}

          {confirmingClearLabels ? (
            <View
              testID="clear-labels-confirm-panel"
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
                Clear all manual intent labels?
              </Text>
              <Text role="micro" tone="muted" theme={theme}>
                Your recorded app sittings and screen-time history remain intact; only your manual Intentional / Mindless / Not sure tags are removed.
              </Text>
              <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap', alignItems: 'center' }}>
                <Pill
                  testID="clear-labels-confirm-btn"
                  theme={theme}
                  variant="primary"
                  disabled={busyAction !== 'none'}
                  onPress={handleConfirmClearLabels}
                >
                  {busyAction === 'clearLabels' ? 'Clearing…' : 'Confirm clear labels'}
                </Pill>
                <LinkButton theme={theme} onPress={() => setConfirmingClearLabels(false)}>
                  Cancel
                </LinkButton>
              </View>
            </View>
          ) : null}

          {confirmingDelete ? (
            <View
              testID="delete-all-data-confirm-panel"
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
                Delete all local data on this phone?
              </Text>
              <Text role="micro" tone="muted" theme={theme}>
                This permanently erases all stored usage events, derived sittings, data-gap records, and explicit intent labels inside Mirror, and records today as your local reset date. Android’s own UsageStats history in Settings is untouched.
              </Text>
              <Text role="micro" theme={theme}>
                Type DELETE in capital letters to enable permanent deletion:
              </Text>
              <TextField
                testID="delete-all-data-input"
                value={deleteConfirmText}
                onChangeText={setDeleteConfirmText}
                placeholder="Type DELETE"
                autoCapitalize="characters"
                accessibilityLabel="Type DELETE to confirm deleting all local data"
                theme={theme}
              />
              <View style={{ flexDirection: 'row', gap: theme.space(2), flexWrap: 'wrap', alignItems: 'center' }}>
                <Pill
                  testID="delete-all-data-confirm-btn"
                  theme={theme}
                  variant={deletePhraseMatches ? 'primary' : 'quiet'}
                  disabled={busyAction !== 'none' || !deletePhraseMatches}
                  onPress={handleConfirmDeleteAll}
                >
                  {busyAction === 'delete' ? 'Deleting…' : 'Yes, delete everything'}
                </Pill>
                <LinkButton
                  testID="delete-all-data-cancel-btn"
                  theme={theme}
                  onPress={() => {
                    setDeleteConfirmText('');
                    setConfirmingDelete(false);
                  }}
                >
                  Cancel
                </LinkButton>
              </View>
            </View>
          ) : null}
        </View>
      </Card>

      {/* Tier Matrix & Connector Availability */}
      <Card theme={theme} style={{ marginBottom: 0 }}>
        <View style={{ gap: theme.space(0.5), marginBottom: theme.space(2) }}>
          <Text role="micro" tone="muted" theme={theme}>
            FOUR DATA TIERS · V0.1 AVAILABILITY
          </Text>
          <SectionHeader
            theme={theme}
            title="Data sources & privacy tiers"
            caption="each tier makes an explicit trade-off between richness and access"
          />
        </View>

        <View style={{ gap: theme.space(2.5) }}>
          {ALL_TIERS.map((meta, idx) => (
            <View key={meta.letter} style={{ gap: theme.space(1.5) }}>
              {idx > 0 ? <Divider theme={theme} /> : null}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.space(2) }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(1.5), flexShrink: 1 }}>
                  <TierBadge tier={meta.letter} theme={theme} />
                  <Text role="label" theme={theme}>
                    {`Tier ${meta.letter} · ${meta.name}`}
                  </Text>
                </View>
                <Chip
                  static
                  label={meta.letter === 'D' ? 'Active on this phone' : 'Not in v0.1'}
                  theme={theme}
                />
              </View>
              <Text role="micro" tone="muted" theme={theme}>
                {meta.how}
              </Text>
              {!meta.connectorAvailable ? (
                <Text role="micro" tone="muted" theme={theme}>
                  {meta.letter === 'B'
                    ? 'Manual file import is not enabled in v0.1 yet.'
                    : 'No OAuth or cloud connectors exist in v0.1 — Mirror makes zero network calls.'}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      </Card>

      {/* Data Quality & Session Boundary Health */}
      <Card theme={theme} style={{ marginBottom: 0 }}>
        <View style={{ gap: theme.space(0.5), marginBottom: theme.space(2) }}>
          <Text role="micro" tone="muted" theme={theme}>
            COLLECTION INTEGRITY · HONEST GAPS
          </Text>
          <SectionHeader
            theme={theme}
            title="Data quality & session boundaries"
            caption={p3Reliable ? 'boundaries clean (unmatched ≤50, total ≤100)' : 'boundary guard active'}
          />
        </View>

        <View style={{ gap: theme.space(2) }}>
          <View style={{ flexDirection: 'row', gap: theme.space(3), flexWrap: 'wrap' }}>
            <Stat
              value={String(orphanCount)}
              label="Unmatched events"
              hint="Threshold ≤50"
              theme={theme}
            />
            <Stat
              value={String(totalGaps)}
              label="Total boundary events"
              hint="Threshold ≤100"
              theme={theme}
            />
            {quality && quality.measuredGapMs > 0 ? (
              <Stat
                value={formatDuration(quality.measuredGapMs)}
                label="Unmeasured span"
                hint="Recorded collection gaps"
                theme={theme}
              />
            ) : null}
          </View>

          <Text role="micro" tone="muted" theme={theme}>
            {quality?.sentence ?? 'Zero collection gaps or unmatched boundary events on the selected day.'}
          </Text>

          {latestSyncOrphans && latestSyncOrphans.total > 0 ? (
            <Text role="micro" tone="muted" theme={theme}>
              {`Latest sync unmatched closes (${latestSyncOrphans.total}): ${latestSyncOrphans.byApp
                .map((item) => `${item.label} (${item.count})`)
                .join(', ')}`}
            </Text>
          ) : null}
        </View>
      </Card>

      {/* What this build is — silent 7-tap unlocks hidden DebugView without a visible hint */}
      <Pressable
        onPress={handleBuildTap}
        accessibilityRole="button"
        accessibilityLabel="What this build is"
        style={{ minHeight: theme.size.touchTarget, minWidth: theme.size.touchTarget }}
      >
        <Card theme={theme} style={{ marginBottom: 0 }}>
          <SectionHeader
            theme={theme}
            title="What this build is"
            caption="On-device architecture & privacy posture"
          />
          <Text role="body" theme={theme}>
            {BUILD_SHORT}
          </Text>
        </Card>
      </Pressable>
    </AppShell>
  );
}
