# P1b-1 — encrypted store and the Android collector

This is the phase where Mirror starts handling real data. Three promises are
enforced here, and each one is a test:

1. **Raw events are encrypted at rest.** A stolen database leaks *that* the phone
   was used, not *what* was read.
2. **A write needs consent.** Tier A/B/C events cite a live grant; revoking the
   grant deletes exactly what it produced.
3. **Deleting means deleting.** `deleteAll()` and the retention sweep remove rows
   and the pages they lived on.

## 1. Storage layout

```
events(id PK, at, kind, tier, origin, content, session_id, item_hash, consent_id, payload BLOB)
consent_log(id PK, at, action, subject, tier, scopes, promise, method, deletes_imported_events)
connections(connector_id PK, status, scopes, token_ref, connected_at, last_sync_at, items_imported, revoked_at)
imports(id PK, source_id, export_format, imported_at, item_count, consent_id)
meta(key PK, value)            schema_version, ingest cursors
```

The split is deliberate: **metadata columns** (time, kind, tier, grant id) are
indexed and queryable and carry nothing a person would recognise; **`payload`** is
one AEAD-sealed JSON object holding the app name, host, query, subject, item hash
and vector. That is why `events` can be queryable without a plaintext index of
what you read.

### Crypto

| Choice | Reason |
| --- | --- |
| XChaCha20-Poly1305 (`@noble/ciphers`) | AEAD with a 24-byte nonce, so nonces are random rather than counter-based. A counter needs durable state that survives a crash; reusing one is catastrophic. |
| HKDF-SHA256 from one 32-byte root | Encryption key and item-hash key are independent, derived with distinct info strings. |
| Random nonce per record, envelope versioned | `0x01 | keyIdLen | keyId | nonce | ciphertext+tag`; the key id lets a rotation be detected instead of producing silent garbage. |
| HMAC-SHA256 item hashes | Two events about the same item can be joined without storing what it was. Reversing the hash requires the install key. |

The root key is created on first launch with `expo-crypto` and stored through
`expo-secure-store` (Android Keystore / iOS Keychain), marked
`WHEN_UNLOCKED_THIS_DEVICE_ONLY`. It is never written to the database, logged or
exported. Uninstalling deletes the key, which makes every ciphertext the app wrote
unreadable.

**Threat model, stated plainly:** the encryption protects data at rest — a copied
database file, a backup, a forensic image of storage. It does **not** protect
against a rooted device or a compromised OS while the app is installed and
unlocked, because the app must be able to read its own data. Mirror does not claim
otherwise.

## 2. Consent, enforced at the write path

`MirrorStore.appendEvents()` validates against the event schema, then checks the
grant **inside the same transaction as the insert**:

- tier A/B/C events need a `consent` id that is live in `consent_log`;
- tier D events must not carry one;
- content events are refused when `allowContent` is false (the storage-side
  enforcement of the `collectContent` preference);
- re-ingesting the same id inserts nothing, so a retried collection is safe.

`revoke()` writes the revocation and deletes, in one transaction: every event
whose `consent_id` matches, every import record for that grant, and — for the OS
usage grant — all tier-D events, because that grant is the only thing that makes
them lawful to keep.

## 3. Retention and deletion

- `sweepExpired()` deletes events older than the chosen 90/180/365-day window.
- `deleteAll()` empties every table, checkpoints the WAL, and runs `VACUUM`.
- `PRAGMA secure_delete = ON` is set at open, so SQLite zeroes deleted content
  rather than leaving it in free pages.

Tests read the database **file bytes** after deletion and assert the canary
content is gone — a promise about the file, not about a row count.

## 4. The Android collector

Three thin layers, so the interesting part is testable:

| Layer | File | What it does |
| --- | --- | --- |
| Kotlin | `apps/mobile/modules/mirror-usage-stats/.../UsageStatsModule.kt` | `hasPermission()`, `openSettings()`, `queryEvents(since, until)` — raw `UsageEvents` rows, nothing else |
| Decision layer | `packages/core-analytics/src/usage.ts` | pairing, dropping, capping, id generation, cursor |
| Orchestration | `collectUsage(source, store, {now})` | read cursor → query → build → write → advance cursor |

Rules in the decision layer, each with tests:

- a foreground with no close is **dropped**, never extended to "now";
- a background with no open is an orphan, dropped;
- an interval longer than 6 h is treated as an OS glitch, dropped;
- system UI, launchers and Mirror itself are ignored;
- rows outside the queried window, unknown event types and malformed package
  names are dropped with a reason;
- ids are deterministic from `(package, start)`, so re-reading an overlapping
  window inserts nothing;
- the cursor advances only after a successful write.

Background collection is one **WorkManager-backed** Expo BackgroundTask
(`expo-background-task`), registered at 24 h. WorkManager persists scheduled work
across reboots, which is why Mirror requests no `RECEIVE_BOOT_COMPLETED` of its
own. The OS decides when the task actually runs; the pass is safe at any interval.

## 5. The merged-manifest gate

`app.json` is intent; the merged manifest is what installs. `npm run
android:manifest` reads
`apps/mobile/android/app/build/intermediates/merged_manifests/<variant>/AndroidManifest.xml`
and fails if:

- `PACKAGE_USAGE_STATS` is missing;
- anything on the forbidden list appears (accessibility, overlays, media
  projection, notification listening, AD_ID, contacts, location, mic, camera, SMS,
  call log, phone state, `QUERY_ALL_PACKAGES`, install packages);
- a permission appears that is not on the reviewed library allowlist;
- a service exposes an accessibility or notification-listener capability.

Exit code 2 means **nothing was built** — never a pass. The parser and policy are
tested against fixtures (`scripts/android/fixtures/`): a clean manifest, a library
adding AD_ID, an accessibility service, and a manifest missing the usage
permission.

**Status: scripted and unit-tested; not yet executed against a real build.** This
environment has no Android SDK. The command that produces the manifest is in the
script's own error message, and the step is wired into the canary workflow behind
an "is there an `android/` directory" guard.

## 6. What P1b-1 does *not* do

- **No UI.** Nothing renders the store; ingestion into screens is P1b-2.
- **No importers and no embeddings** — P1b-2.
- **No session attribution.** `session_id` is written when a caller supplies it;
  assigning it from sessions is P1b-2.
- **The Kotlin module has not been compiled.** No Android SDK here. It is written
  against the Expo Modules API and typecheced only at the TS boundary; treat its
  first compile as part of P1b-2's device work.
