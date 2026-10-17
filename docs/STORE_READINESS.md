# Store readiness — P0 draft

This is the draft the release phases (P2, P5, P6, P7) fill in. It records what
Mirror will tell each store, so that a claim in the app and a claim in the store
listing cannot drift apart. Anything marked **MANUAL** needs a person with store
access; anything marked **AUTOMATED** is checked by a script in this repo.

Status: **draft**. No submission is possible before P7, and nothing here claims a
submission has been made.

---

## 1. What Mirror is, in store language

A digital-behaviour app that shows estimates of how you spend attention on your
own device. All analysis runs on the phone. There is no account, no sign-in, no
server-side profile and no advertising.

## 2. Data safety declarations (Google Play)

| Play Console question | Answer | Why |
| --- | --- | --- |
| Does your app collect or share any of the required user data types? | **No**, when used in the default Private mode with no connectors | Events are written to app-private storage, aggregated on-device, and never transmitted. There is no analytics SDK. |
| Is data encrypted in transit? | **Yes** | The only outbound traffic is OAuth token exchange and (P6) optional encrypted sync, both over TLS. |
| Can users request data deletion? | **Yes, in the app** | "Delete all data" wipes the encrypted store and derived aggregates. No account exists, so no web deletion URL is required. |
| Is data shared with third parties? | **No** | OAuth APIs are read by the app; data flows *from* the provider *to* the device, never the reverse. |
| Advertising ID | **Not used; permission blocked in the manifest** | `com.google.android.gms.permission.AD_ID` is in `blockedPermissions`. |
| Optional connectors | **User-initiated, declared at the point of consent** | If a person connects Reddit/YouTube/Spotify/GitHub, imported items are described on the consent screen and deleted in one tap on disconnect. |

**Open question for P7 (MANUAL):** whether Play treats locally-processed,
never-transmitted usage data as "collection" under the current Data safety
definitions. The conservative declaration is "no collection"; if the reviewer
disagrees, the fallback is to declare "App activity — in-app actions — processed
on device, not shared", which is also true. Decide with the console text in front
of us, not from memory.

## 3. Permissions declarations (Google Play)

| Permission | Why it is needed | Declaration required |
| --- | --- | --- |
| `PACKAGE_USAGE_STATS` (Usage Access) | The only way Android exposes which apps were in the foreground and for how long. Without it, the dashboard, sessions and attention budget have nothing to show. | **Yes — Play's Usage Access declaration form (MANUAL).** Explain: digital wellbeing, on-device only, no accessibility or screen capture. |
| Notifications (`POST_NOTIFICATIONS`, P4) | Opt-in local nudges and the weekly report. | Standard runtime permission. No declaration. |
| `BIND_ACCESSIBILITY_SERVICE` | **Never requested.** | — |
| `SYSTEM_ALERT_WINDOW` (overlays) | **Never requested.** | — |
| `MEDIA_PROJECTION` (screen recording) | **Never requested.** | — |
| `BIND_NOTIFICATION_LISTENER_SERVICE` | **Never requested.** | — |

The app-config test (`tests/config.test.mjs`) fails if any of the forbidden
permissions appear in `app.json`, and the manifest is the only place Android
permissions are declared.

## 4. App Store (iOS) declarations

| Item | Answer |
| --- | --- |
| App Privacy — data collected | **None** in Private mode; connector imports are on-device only. |
| Tracking | **No.** No ATT prompt is needed because nothing is tracked across apps or sites. |
| Encryption | `ITSAppUsesNonExemptEncryption = false` — only OS-provided TLS. |
| Family Controls / DeviceActivity entitlement | **Required in P5** for screen-time-adjacent features. This is a **MANUAL** request to Apple with a written justification; the iOS collector degrades to "not available" until granted. |
| Account deletion | Not applicable — no accounts. |

## 5. Store listing assets

| Asset | Source | Status |
| --- | --- | --- |
| App name | Mirror | fixed |
| Icon | design system (P-UI) | TODO P7 |
| Screenshots | **real app screenshots**, captured from a build | TODO P2 (first build). The mockup gallery is a design artefact and must **not** be submitted as screenshots. |
| Feature graphic | design system | TODO P7 |
| Privacy policy URL | must be hosted | **MANUAL**, P7 |
| Content rating | Everyone; no ads, no purchases, no user-generated content | P7 |
| Data safety form | section 2 above | **MANUAL**, P7 |
| Usage Access declaration | section 3 above | **MANUAL**, P7 |

## 6. Release stages, and what each needs

The brief's four release stages map to builds like this:

| Stage | Phase | Artifact | Distribution | Blocking checks |
| --- | --- | --- | --- | --- |
| 1 | P2 | signed APK + AAB | internal testing track | install on a clean device, usage-access grant, delete-all works, canary clean on a release build |
| 2 | P5 | AAB | closed testing | connectors consent/revoke, extension canary clean, iOS device activity (if entitlement granted) |
| 3 | P6 | AAB | open testing | sync off by default, server cannot read ciphertext, account deletion (if sync creates one) |
| 4 | P7 | AAB | production staged rollout | ASVS/MASVS review closed, accessibility audit, privacy policy live |

## 7. What is automated, what is manual

| Step | Label |
| --- | --- |
| Version/type checks of `app.json` and `eas.json` | **AUTOMATED** (`tests/config.test.mjs`) |
| Permission allow/deny checks | **AUTOMATED** (`tests/config.test.mjs`) |
| Extension manifest permission checks | **AUTOMATED** (`tests/config.test.mjs`) |
| Privacy canary against a release build | **AUTOMATED once an emulator runs** (`scripts/privacy/android-emulator.sh`), **MANUAL** trigger today |
| EAS build (preview/production) | **AUTOMATED script**, **MANUAL** credential setup (`EXPO_TOKEN`, signing keys) |
| Play Console Data safety form | **MANUAL** |
| Usage Access declaration | **MANUAL** |
| Family Controls entitlement | **MANUAL** |
| Store screenshots | **MANUAL** capture from a real build |
| Staged rollout percentages | **MANUAL** |

## 8. Store-review risks, named now

1. **Usage Access is a sensitive permission.** A reviewer may ask why a
   non-parental-control app needs it. The answer is the product: without it there
   is no data at all. The declaration must say so plainly and point at the
   on-device processing.
2. **"Digital wellbeing" claims invite medical framing.** The app must never
   claim diagnosis, treatment or clinical benefit; labels are descriptive
   estimates. Store copy inherits the same rule.
3. **The extension is a separate distribution surface** (Chrome Web Store) with
   its own permission review. Its manifest requests five hosts and `storage`;
   that is the whole permission surface, and a test enforces it.
4. **P6 sync changes the Data safety answer.** If sync ships, it must be
   end-to-end encrypted, off by default, and declared. The declaration is
   revisited in P6, not copied from here.
