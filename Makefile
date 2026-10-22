# Mirror — one entry point for everything that can be run.
#
# `make verify` is what CI runs and what must be green before a phase is reported
# complete. Targets that need hardware or credentials say so and exit 2 rather
# than pretending to pass.

NPM ?= npm
NODE ?= node

.PHONY: help install verify test typecheck lint security android-manifest android-build release-stage1 ota-guard offline-test changelog gallery mockups privacy privacy-addon privacy-extension privacy-android mobile-start mobile-android build-preview build-production clean

help:
	@echo "make install             install node deps"
	@echo "make verify              tokens, typechecks, all unit/property/privacy tests (CI target)"
	@echo "make test                tests only"
	@echo "make typecheck           both TypeScript projects"
	@echo "make lint                ESLint over the P0 packages, scripts and tests"
	@echo "make security            lint + secret scan + dependency audit + bundle reachability"
	@echo "make android-manifest    audit the merged AndroidManifest.xml (exit 2 if nothing is built)"
	@echo "make android-build       Gradle debug build + merged-manifest gate (needs JDK + Android SDK)"
	@echo "make release-stage1      Stage 1 preflight; signing itself is MANUAL (no keystore here)"
	@echo "make ota-guard           OTA guard – updates disabled/narrow-only, no new permissions/collection"
	@echo "make offline-test        offline test – works with backend off, no secrets, no analytics"
	@echo "make changelog           generate CHANGELOG.md since previous tag"
	@echo "make gallery             regenerate the 96 mockup frames"
	@echo "make privacy             privacy canary self-test + scanner tests + python addon tests"
	@echo "make privacy-extension   Playwright extension canary (needs playwright + a built extension)"
	@echo "make privacy-android     emulator + mitmproxy canary run (needs adb, emulator, mitmproxy)"
	@echo "make mobile-start        Expo dev server (P1+)"
	@echo "make mobile-android      build and install the debug app on a device/emulator (P1+)"
	@echo "make build-preview       EAS internal APK (needs EXPO_TOKEN; MANUAL credential setup)"
	@echo "make build-production    EAS production AAB (needs EXPO_TOKEN; MANUAL credential setup)"

install:
	$(NPM) install

verify:
	$(NPM) run verify

test:
	$(NPM) test

typecheck:
	$(NPM) run typecheck

lint:
	$(NPM) run lint

security:
	$(NPM) run security

android-manifest:
	$(NPM) run android:manifest

android-build:
	bash scripts/android/build-and-gate.sh

release-stage1:
	$(NODE) scripts/android/release-preflight.mjs

ota-guard:
	$(NODE) scripts/android/check-ota-guard.mjs

offline-test:
	$(NODE) scripts/android/check-offline.mjs

changelog:
	$(NODE) scripts/release/changelog.mjs

gallery:
	$(NPM) run mockups

privacy:
	$(NPM) run test:privacy

privacy-addon:
	$(NPM) run privacy:addon

privacy-extension:
	$(NPM) run privacy:extension

privacy-android:
	$(NPM) run privacy:android

mobile-start:
	cd apps/mobile && $(NPM) start

mobile-android:
	cd apps/mobile && $(NPM) run android

build-preview:
	cd apps/mobile && npx eas-cli build --platform android --profile preview --non-interactive

build-production:
	cd apps/mobile && npx eas-cli build --platform android --profile production --non-interactive

clean:
	rm -rf packages/ui/tests/.build tests/.build packages/*/tests/.build privacy .reports
