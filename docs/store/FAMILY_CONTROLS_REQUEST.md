# Family Controls entitlement — request text

Apple grants `com.apple.developer.family-controls` per app, after a written
request. Without it, `DeviceActivity` cannot report screen time and
`ManagedSettings` cannot shield apps; every iOS screen-time feature would show its
degraded state.

**This is a MANUAL step.** I cannot submit it: it requires the Apple Developer
account holder, the Team ID, and acceptance of Apple's terms. The text below is
ready to paste, with the two bracketed fields to fill in.

Status: draft for P5. Submit **before** the P5 build — approval can take days to
weeks, and the iOS collector must ship behind a runtime check either way.

---

## Form fields

**App name:** Mirror
**Bundle ID:** `dev.mirror.app`
**Team ID:** `[TEAM ID — from developer.apple.com → Membership]`
**Entitlement requested:** Family Controls (`com.apple.developer.family-controls`)
**Frameworks used:** Family Controls, DeviceActivity
**Frameworks not used:** ManagedSettings (see "What we are not asking for")
**Distribution:** App Store, India first, then EU/UK/US
**App category:** Health & Fitness (primary), Productivity (secondary)

## 1. What the app does

Mirror is a private, on-device digital-behaviour app for **adults who want to
understand their own attention**. It shows descriptive estimates — how long
sessions actually last, how deep a reading session went, whether a routine looks
like curiosity or habit — and a calm weekly summary. It is not a parental-control
app, not a child-safety app, and not a medical or diagnostic product.

The iOS screen-time features that need this entitlement are:

1. **Sessions and attention estimates.** `DeviceActivity` provides app and
   category usage for the person's own device. Without it, the app cannot show
   session length on iOS at all.
2. **Focus windows (self-imposed).** The person schedules a window (for example,
   25 minutes) and Mirror reports afterwards whether it held. ManagedSettings is
   **not** requested: Mirror does not block or shield apps, so it needs no
   app-blocking capability.

## 2. Why the standard APIs are not sufficient

iOS exposes no public API for per-app usage without the Family Controls
entitlement. Screen Time's own UI is not accessible to third-party apps, and the
alternatives are exactly what this app refuses to do: device management profiles,
MDM, private APIs, or asking a person to screenshot their Screen Time and upload
it. The app is built so that a refusal is survivable: without the entitlement,
iOS shows the degraded state and explains what is missing. Nothing is estimated
from a guessed signal.

## 3. Data handling (this is the part Apple cares most about)

- **On device only.** `DeviceActivity` events are aggregated locally and stored in
  an encrypted database. There is no Mirror account and no Mirror server in the
  shipped configuration.
- **No transmission.** Screen-time data is never sent off the device. The app has
  a privacy canary test that fails the build if any content-bearing value appears
  in a request, header, log line or error report.
- **No advertising, no analytics, no tracking.** The app contains no third-party
  SDKs, no advertising identifier, and does not track across apps or websites.
  (`NSPrivacyTracking` is false; the App Privacy answer is "no data collected".)
- **No children.** The app is rated 18+/17+ where required and does not create
  child accounts, family groups or parental controls. Family Sharing is not used.
- **Retention and deletion.** The person chooses a 90/180/365-day window. "Delete
  everything" erases the encrypted store immediately; uninstalling does the same.
- **Revocation.** Screen-time access is revoked in one tap in the app, and the
  app stops collecting immediately (and deletes what that grant covered, as
  recorded in its consent log).

## 4. Consent flow the reviewer can reproduce

1. Onboarding explains, in plain words, what screen time is read and what is never
   read (no content, no keystrokes, no screenshots).
2. The primer opens the system Family Controls prompt. Declining is a first-class
   path: the app continues with the features that do not need it.
3. The Privacy Center lists the grant, its scopes and its date, with a one-tap
   revoke.
4. The Debug build includes a "Demo data" mode, so a reviewer can see every screen
   without granting anything. Demo data is labelled as such on every screen.

## 5. What we are not asking for

- No `ManagedSettings` (no app shielding or blocking).
- No child or family accounts, no `FamilyActivityPicker` selection of another
  person's device.
- No background upload, no server-side processing, no sharing of screen time with
  any third party or with other users of the app.
- No use of screen-time data for advertising, profiling for ads, or sale.

## 6. Review notes

- The entitlement is used for **self-monitoring by the person using the device**,
  not for supervising someone else.
- The app never presents estimates as clinical facts; labels are descriptive and
  every screen that cannot compute a signal says so.
- Contact: `[SUPPORT EMAIL]`

---

## If the request is denied

Mirror does not fake the capability. The fallback, decided now so it is not
improvised later:

1. **iOS ships without screen-time collection.** Sessions, attention budget,
   depth and focus-window *measurement* show their degraded state with the reason;
   focus windows remain a self-set intention with a manual check-in.
2. **Android is unaffected** — UsageStats is a public API, and the full product
   ships there.
3. **Re-apply with evidence.** The denial reason is recorded in
   `docs/PROGRESS.md`, and the request is resubmitted after P5 with the shipped
   build, the privacy policy URL, and the canary report.

That fallback is consistent with the brief's honest-capability rule: an iOS build
that quietly labels visit length as "depth" would be worse than one that says
"not available on this device".
