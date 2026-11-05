// Node preload (used via NODE_OPTIONS=--import). When FAKE_NOW is set, `new Date()`
// and `Date.now()` report that instant. When FAKE_NOW is unset, this file does nothing.
//
//   FAKE_CLOCK_MODE=frozen (default)  the clock stands still at FAKE_NOW.
//                                     Used per test file by scripts/test/clock-matrix.mjs,
//                                     so every result is reproducible.
//   FAKE_CLOCK_MODE=tick              the clock starts at FAKE_NOW and advances in real time.
//                                     Used for whole-pipeline runs: build tools wait on elapsed
//                                     time and hang under a frozen clock.
const raw = process.env.FAKE_NOW;
if (raw) {
  const start = Date.parse(raw);
  if (!Number.isFinite(start)) {
    throw new Error(`FAKE_NOW is not a valid ISO instant: ${raw}`);
  }
  const mode = process.env.FAKE_CLOCK_MODE ?? 'frozen';
  if (mode !== 'frozen' && mode !== 'tick') {
    throw new Error(`FAKE_CLOCK_MODE must be "frozen" or "tick", got "${mode}"`);
  }
  const realAtStart = Date.now();
  const RealDate = Date;
  const current = () => (mode === 'frozen' ? start : start + (RealDate.now() - realAtStart));
  class FakeDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(current());
      else super(...args);
    }
    static now() {
      return current();
    }
  }
  globalThis.Date = FakeDate;
}
