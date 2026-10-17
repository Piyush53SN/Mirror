# apps/mobile

Expo prebuild app (SDK 58, React Native 0.88, React 19).

**P1a status:** a minimal entry point (`index.js` → `App.tsx`) renders the first
screen in the inventory, and Metro bundles it in production mode as part of
`npm run security:bundle`. That is a toolchain proof, not the app: no navigation,
no native project, no build. `npm run android` will not work until P1b runs
`npx expo prebuild` and the native modules exist.

The app runs on Expo 58 / RN 0.88 / React 19. `app.json` and `eas.json` are
validated by `tests/config.test.mjs`; no EAS build has been run.

Migrations completed in P1a: the design system moved to React 19 / RN 0.88, and
`react-test-renderer` 19.3.1 was kept (deprecated, but working) with the tests
updated to render through `act`. P1b decides whether the runner moves to React
Native Testing Library when Jest/JUnit enter the picture.

The Android usage collector needs `PACKAGE_USAGE_STATS`, which is not a runtime
permission: the person grants it in system Settings. The app must deep-link there
and re-check on resume; no permission is ever requested silently.
