import * as React from 'react';
import { View } from 'react-native';
import {
  Callout,
  Card,
  LinkButton,
  Pill,
  SectionHeader,
  Text,
  TextField,
  useTheme,
} from '@mirror/ui';
import { useMirrorApp } from '../context/MirrorAppContext';

/**
 * Settings → Your data. Export JSON (plaintext warning, optional XChaCha20-Poly1305
 * passphrase, system share/save), clear labels, typed DELETE all, reset audit.
 * Moved verbatim from You; behaviour unchanged.
 */
export function LocalDataControls(): React.ReactElement {
  const theme = useTheme();
  const {
    lastReset,
    collectingSince,
    resetStoredData,
    exportAllData,
    clearStoredLabels,
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
    <View testID="settings-local-data" style={{ gap: theme.space(3) }}>
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
                Plaintext warning: Without a passphrase, your exported JSON contains readable app names, open timestamps, derived sittings, manual intent labels, soft attention budgets, weekly goals, and local reminder preferences. Add an optional passphrase below to encrypt the export with XChaCha20-Poly1305 before saving or sharing.
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
                This permanently erases all stored usage events, derived sittings, data-gap records, manual intent labels, soft attention budgets, weekly goals, and local reminder preferences inside Mirror, and records today as your local reset date. Android’s own UsageStats history in Settings is untouched.
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

    </View>
  );
}
