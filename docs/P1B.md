# P1b — encrypted store, collector, ingestion, importers, embeddings

**Reading order:** §1–6 are **P1b-1** (delivered 2026-10-17, commit `2753206`).
§7 onward are **P1b-2** (this delivery). The split was agreed because P1b was too
large for one review.

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

-- schema version 2 (P1b-2)
sessions(id PK, start_ms, end_ms, duration_ms, source, payload BLOB)
event_vectors(event_id PK, model, dim, vec BLOB)
data_gaps(id PK AUTOINCREMENT, source, reason, from_ms, to_ms, count, recorded_at)
daily_rollups(day PK, payload BLOB, computed_at)
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

---

# P1b-2 — ingestion, importers, embeddings

## 7. The sync boundary: the cursor is a state, not a timestamp

A sitting can start before a collection and close after it. Storing only `lastSyncAt`
would force the collector to choose between two wrong answers: drop the open
interval (the sitting disappears) or extend it to "now" (the sitting is fabricated).
Mirror stores a **cursor state** instead:

```json
meta["cursor_state:usage_stats"] = {
  "at": 1792339200000,
  "open": [{ "app": "com.google.android.youtube", "startMs": 1792335600000 }]
}
```

The pass is:

1. read `{at, open}`; query `[at − 2 s, min(now, at + 2 d))`;
2. complete the carried intervals with this window's rows;
3. write events whose ids are deterministic from `(package, start)`;
4. write gaps;
5. **only then** write `{at: windowEnd, open: stillOpen}`.

So a session that straddles two syncs is written **once, whole**, in the second
pass: its foreground row is behind the cursor, and the pair is inserted together
with the full span. The state is written after the append, so a crash re-reads the
same window and the deterministic ids make it a no-op. If the process dies after
the append but before the cursor write, the re-read inserts nothing.

Tests (`packages/core-analytics/tests/usage.test.mjs`): a two-sync straddle, a
three-sync straddle, an interval still open at the end of a window, and an open
interval older than 6 h, which becomes an `abandoned_open` gap rather than being
extended to now.

## 8. Gaps are counted, never silently discarded

Every interval Mirror cannot measure becomes a row in `data_gaps`:

| reason | meaning | span? |
| --- | --- | --- |
| `too_long` | the OS reported an interval longer than 6 h (a broken stream, a device sleeping with a stale foreground) | yes, so the time is measurable |
| `abandoned_open` | a foreground was still open after 6 h and cannot be a sitting any more | start only |
| `orphan_background` | a close with no matching open | no |
| `invalid_package` | a row whose package name is not a package name | no |
| `os_query_failed` | reserved: the OS refused the query | no |

`store.gapSummary()` returns `{count, byReason, measuredGapMs}`, and
`describeGapSummary()` turns it into the sentence the Privacy Centre will show
(“5 collection gaps (2 h 30 min unmeasured; …)”). P2's scoring reads the summary
so a day with a six-hour gap never reads as a day with twenty minutes of use.

Two deliberate non-gaps: a package on the ignore list (launchers, system UI,
Mirror) produces **no** gap, because nothing was missed; and intervals shorter
than `minIntervalMs` (default 0) are kept, because short is not the same as
unmeasured.

## 9. Ingestion: sessions and daily rollups

`packages/core-analytics/src/ingest.ts` is pure. It takes events, gaps and a
window, and returns:

- **sessions** — one app, one sitting. Two intervals of the same app merge when
  the gap is ≤ 60 s; a longer gap is two sittings. Each session has a
  deterministic id (`ses_<base36 bounds>_<app fingerprint>`) that satisfies the
  event validator's `SESSION_ID`, plus the ids of the events that formed it.
- **assignments** — every foreground/background event maps to a session id **or
  an explicit null**. Nulls matter: when a merge changes the set of sessions, an
  event that used to belong to a deleted session must be cleared.
- **rollups** — one object per local day: first/last event time, event count,
  session count, session milliseconds, per-app milliseconds and session counts
  (capped at 40 apps, with `apps_omitted` saying how many were hidden), unlock
  count, import count and the day's gap summary. **No title, query, url or host
  field exists in the shape**, and a test serialises a rollup containing an
  imported post and asserts the title does not appear.

Day bucketing uses an explicit `utcOffsetMinutes` (`330` for IST) rather than the
process timezone. A session crossing midnight is split by **duration** across the
two days but counted once, on the day it started — splitting the count would
overstate the number of opens.

The app fetches events from **6 h before to 6 h after** the day it is ingesting.
A sitting that starts at 23:50 and ends at 00:10 only exists as a pair; pairing
needs the neighbour, while the day's counts still come only from events inside it.
The session is stored once, its duration is split across the two rollups, and both
halves of the pair are assigned to it — so attribution does not depend on which
side of midnight happened to be ingested first.

A rollup is written only when the window covers the whole local day. Otherwise the
day is listed in `partialDays` and `apps/mobile/src/collector/ingest.ts` skips the
write: replacing a complete rollup with a partial one would make an average worse
than no average.

`store.applySessions()` deletes the sessions overlapping the window, inserts the
new ones and reassigns changed events **in one transaction**, so a crash cannot
leave a session half-rebuilt.

**Migration.** `SCHEMA_VERSION` is 2. A v1 database is migrated in place; the test
builds a real v1 file (migration 1 only, a v1 sealed event), opens it with the v2
store, and asserts the event still decrypts, the new tables answer, and a session
row and rollup can be written. A file stamped with a version **newer** than the
build is refused rather than guessed at.

## 10. Importers: which connector export, exactly

The brief said "a connector export". The one intended — and the only one built in
P1b-2 — is **Reddit's own data export**, the ZIP you request at
`reddit.com/settings/data-request`. It is not the Reddit API connector:

| | tier | mechanism | phase |
| --- | --- | --- | --- |
| Reddit OAuth connector (`reddit`) | **A** | official API, `read`/`save` scopes | **P5** |
| Reddit data export (`reddit-export`) | **B** | the ZIP the person downloads | **P1b-2** |

Two importers ship:

| id | reads | notes |
| --- | --- | --- |
| `reddit-export` | `saved_posts.csv`, `saved_comments.csv` | `posts.csv`/`comments.csv` are deliberately ignored: Mirror imports saves, not everything a person ever wrote. Reddit exports their own GDPR chat/private-message archive; **that is not read either**, and no code path opens it. |
| `google-takeout` | `watch-history.json` | strips the "Watched " verb; skips `From Google Ads` entries and counts them; a non-array file (Takeout splits long histories into parts) is a warning, not a guess. |

Decisions:

- **No ZIP reader.** The person unzips the export and selects the files. A parser
  for an untrusted container is attack surface for no product gain in P1b.
- **Preview is read-only.** `preview()` parses, hashes and counts; it never
  appends. It reports total, fresh, duplicates, first/last item and a month
  histogram, so "what would this do?" is answerable before anything is written.
- **Dedupe is `item_hash`.** `store.hashItems()` HMACs each canonical id; the
  store holds the hash, never the id. Re-importing the same export is a refusal
  (`nothing-new`), not a duplicate write. The event id is derived from the hash, so
  even a preview/commit race converges.
- **Consent is `export:<importer>`.** Every imported event cites it; `revoke()`
  deletes exactly those events and the `imports` row, proven end-to-end against
  the real encrypted store in the tests.
- **Content opt-in still applies.** Imported items are `content: 'content'`
  because a saved title is readable. With content switched off the commit is
  refused with `content-off`, not silently counted as zero.
- **Limits, stated:** files over 64 M characters are skipped with a warning (not
  truncated); warnings are capped at 40 + a suppressed count; parsing is per-file
  and in memory, so the largest supported export is bounded by the phone, not by
  a streaming reader. That is a limitation, not a claim.

## 11. Embeddings: a labelled placeholder

`packages/ml` ships `placeholder-ngram-v1`:

- 384 dimensions, matching `TOPIC_VECTOR_DIM` and the store's float32 layout
  (**1,536 B** per vector, sealed);
- hashed character 3/4/5-grams plus word unigrams, signed hashing, FNV-1a —
  deterministic, network-free, no model file;
- `EMBEDDER.placeholder === true`, and the model id is stored beside every vector.

It does **not** understand meaning: "borrow checker" and "ownership model" are
only close if they share n-grams. Its cosine scale is compressed (unrelated prose
sits near 0.2 rather than 0.05), which the lexical test records explicitly instead
of pretending an ideal scale.

**Re-embedding path**, already wired into the store:

1. `store.reembedCandidates(model)` selects content events whose vector is missing
   or was produced by a different model, and returns their **sealed** text;
2. the new embedder replaces `embed()` and bumps `EMBEDDER.id`;
3. `store.writeVectors()` replaces the row with the new model id.

Nothing else changes, because no consumer may assume an embedding's meaning without
checking the model id.

## 12. Encryption: expo-sqlite + per-record AEAD, not SQLCipher

**This is a deliberate deviation from the specification the product was briefed
against, which named SQLCipher.** `docs/SPEC.md` line 94 says "encrypted local
storage" and does not name a library; this section records why the implementation
did not use SQLCipher anyway, so the difference is a decision rather than an
omission.

| | SQLCipher | what Mirror does |
| --- | --- | --- |
| integration | a native SQLite fork; needs a prebuilt `.so` or a custom dev client | `expo-sqlite` (already in Expo Go) + AEAD in JS |
| granularity | whole-file pages | one envelope per record |
| tamper detection | at the page level, after decryption | per record: a modified payload fails its tag and is reported |
| rotation | re-key the database | key id travels in each envelope, so a rotation is detectable per record |
| field control | all or nothing | content and metadata columns can be treated differently |

What that buys, concretely: a copied `mirror.db` yields ciphertext for everything a
person would recognise. What it does **not** buy is a hidden schema.

### What remains unencrypted

| Plaintext | Why it is there | What it reveals |
| --- | --- | --- |
| event `at`, `kind`, `tier`, `origin`, `content` | indexed for range queries and retention | when the phone was used, and roughly how |
| `session_id`, `consent_id` | foreign-key-style joins and revocation | that events belong together, and under which grant |
| `item_hash` (HMAC-SHA256) | dedupe without storing the item | that two events are the same item — only to someone who also has the key |
| vector `model` id and `dim` | re-embedding selection without decrypting | that a vector exists, and which model made it |
| gap `reason`, `count`, `from_ms`, `to_ms` | scoring must see missing time | when Mirror could not see, and how much |
| rollup `day` | one row per day | that a day exists; the contents are sealed |
| **SQLite structure, freelist, WAL framing, row counts, file size, write timing** | inherent to a SQLite file | volume and rhythm — *that* you used the phone, not what you read |

The last row is the honest limit: per-record encryption hides content, not
traffic analysis of the file itself. A rooted device or a compromised OS while the
app is unlocked defeats this class of protection entirely; the app must be able to
read its own data. That is stated in the threat model above rather than implied
away.

## 13. Android prebuild and compile status

The first prebuild was run in this environment:

```
cd apps/mobile && npx expo prebuild --platform android --no-install --clean
```

It succeeded and produced `apps/mobile/android/` (committed, since the merged-manifest
gate and device builds need it). The generated `AndroidManifest.xml` declares exactly
three permissions — `INTERNET`, `VIBRATE` and `PACKAGE_USAGE_STATS` — and carries
**15 `tools:node="remove"`** markers from `blockedPermissions` (location, camera,
microphone, contacts, SMS, call log, phone state, storage, overlays, AD_ID,
`QUERY_ALL_PACKAGES`, install packages). The markers are *removals*, not requests;
the merged manifest is what the gate reads, and it is what must not contain them. Two prebuild warnings were
fixed rather than ignored: `edgeToEdgeEnabled` was removed from `app.json`, and
`expo-system-ui` was added so `userInterfaceStyle` is honoured.

**The Kotlin module has still not been compiled.** There is no JDK and no Android
SDK in this environment (`java`, `kotlinc` and `/usr/lib/jvm` are absent), so
`./gradlew` cannot run. First compile and the merged-manifest gate against a real
build are **MANUAL device/CI steps**, listed in §14. Claiming otherwise would be
the exact kind of hand-wave the project forbids.

## 14. What P1b-2 does not do

- **No UI.** Rolls up data that no screen yet reads; the Privacy Centre gap row
  and the Sessions list are P2.
- **No real embedder.** §11 is a placeholder by design.
- **No Reddit OAuth connector.** That is P5; this phase reads the export only.
- **No ZIP extraction, no streaming parser.** The person unzips; parsing is
  per-file in memory (64 M character cap).
- **No Kotlin compile and no on-device measurement.** MANUAL:

  | Step | Label | Command |
  | --- | --- | --- |
  | Install JDK 17 + Android SDK, accept licences | MANUAL | Android Studio, or `sdkmanager --licenses` |
  | Compile the Kotlin module | MANUAL | `cd apps/mobile/android && ./gradlew :app:assembleDebug` |
  | Merge the manifest and run the gate | MANUAL | `cd apps/mobile && npx expo run:android --variant debug` then `npm run android:manifest` |
  | Measure cold start and battery | MANUAL | device, `adb shell am start -W`, Battery Historian |
  | Canary with mitmproxy + Playwright | MANUAL | `npm run privacy:extension` (script exits 2 without the tools) |

- **Import UX is library-level.** The preview/commit functions and the consent
  subject are tested; the screens that call them land with P2's UI.
