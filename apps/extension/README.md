# apps/extension

Manifest V3 capture extension — **scaffold only in P0**. `manifest.json` exists so
the permission surface can be tested before any capture code exists:
`tests/config.test.mjs` fails the build if the manifest asks for `<all_urls>`,
`history`, `cookies`, `webRequest`, `tabs` or any host outside the allowlist.

The capture logic (`content.js`, `background.js`, `build.mjs`) arrives in P5
together with the canary run, which loads the built extension in Chromium and
fails on any canary in a request, console line or error report.
