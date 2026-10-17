# apps/mobile

Expo prebuild app (SDK 58, React Native 0.88, React 19).

**P0 status:** configuration only. `app.json` and `eas.json` are validated by
`tests/config.test.mjs`; no native project has been generated yet and no build has
been run. P1 adds the app entry point, the UsageStats native module and the
encrypted store — at which point `npm install` pulls Expo and `npx expo prebuild`
generates `android/` and `ios/`.

Two known P1 migrations, recorded now rather than discovered later:

1. `packages/ui` is built against React 18 / RN 0.74. Expo 58 requires React 19 /
   RN 0.88, so P1 upgrades the design system's peer and dev dependencies.
2. `react-test-renderer` is deprecated in React 19. The UI tests keep working on
   18 today; P1 moves them to the renderer that ships with the app stack.

The Android usage collector needs `PACKAGE_USAGE_STATS`, which is not a runtime
permission: the person grants it in system Settings. The app must deep-link there
and re-check on resume; no permission is ever requested silently.
