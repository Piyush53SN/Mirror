/**
 * Faithful fake for expo-sqlite's withTransactionAsync that reproduces:
 *   1. "cannot commit - no transaction is active" on unserialized concurrent use
 *   2. Staggered concurrent transactions (t2 arriving while t1 is mid-flight),
 *      where a broken shared `depth > 0` counter previously bypassed the queue
 *      and caused interleaved SELECT/INSERT races ("UNIQUE constraint failed: events.id").
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeExpoDb {
  constructor() {
    this.inTx = false;
    this.rows = new Set();
  }
  async execAsync() {}
  async runAsync(sql, params = []) {
    await new Promise((r) => setTimeout(r, 2));
    if (/INSERT INTO events/i.test(sql) && !/OR IGNORE/i.test(sql)) {
      const id = params[0];
      if (this.rows.has(id)) {
        throw new Error('Error code 19: UNIQUE constraint failed: events.id');
      }
      this.rows.add(id);
    } else if (/INSERT OR IGNORE INTO events/i.test(sql)) {
      this.rows.add(params[0]);
    }
  }
  async getAllAsync(sql, params = []) {
    await new Promise((r) => setTimeout(r, 2));
    if (/SELECT id FROM events/i.test(sql)) {
      return this.rows.has(params[0]) ? [{ id: params[0] }] : [];
    }
    return [];
  }
  async withTransactionAsync(fn) {
    if (this.inTx) {
      throw new Error('cannot commit - no transaction is active');
    }
    this.inTx = true;
    try {
      await fn();
    } finally {
      this.inTx = false;
    }
  }
}

// Mirror of apps/mobile/src/storage/expoDriver.ts (strict FIFO queue, no depth bypass)
function fixedExpoDriver(db) {
  let queue = Promise.resolve();
  return {
    async exec(sql) { await db.execAsync(sql); },
    async run(sql, params = []) { await db.runAsync(sql, params); },
    async all(sql, params = []) { return await db.getAllAsync(sql, params); },
    async transaction(fn) {
      let release;
      const next = new Promise((res) => { release = res; });
      const prev = queue;
      queue = next;
      await prev;
      try {
        let result;
        let error;
        try {
          await db.withTransactionAsync(async () => { result = await fn(); });
        } catch (e) { error = e; }
        if (error) throw error;
        return result;
      } finally {
        release();
      }
    },
  };
}

function oldExpoDriver(db) {
  return {
    async exec(sql) { await db.execAsync(sql); },
    async run(sql, params = []) { await db.runAsync(sql, params); },
    async all(sql, params = []) { return await db.getAllAsync(sql, params); },
    async transaction(fn) {
      let result;
      await db.withTransactionAsync(async () => { result = await fn(); });
      return result;
    },
  };
}

test('old driver fails on concurrent transactions (reproduces race)', async () => {
  const db = new FakeExpoDb();
  const driver = oldExpoDriver(db);
  const t1 = driver.transaction(async () => {
    await new Promise((r) => setTimeout(r, 20));
    return 1;
  });
  const t2 = driver.transaction(async () => 2);
  await assert.rejects(
    () => Promise.all([t1, t2]),
    /cannot commit - no transaction is active/,
  );
});

test('fixed driver serializes same-tick concurrent transactions', async () => {
  const db = new FakeExpoDb();
  const driver = fixedExpoDriver(db);
  const order = [];
  const t1 = driver.transaction(async () => {
    order.push('t1-start');
    await new Promise((r) => setTimeout(r, 20));
    order.push('t1-end');
    return 1;
  });
  const t2 = driver.transaction(async () => {
    order.push('t2-start');
    order.push('t2-end');
    return 2;
  });
  const results = await Promise.all([t1, t2]);
  assert.deepEqual(results, [1, 2]);
  assert.deepEqual(order, ['t1-start', 't1-end', 't2-start', 't2-end']);
});

test('fixed driver serializes staggered concurrent transactions arriving mid-flight (prevents UNIQUE constraint failed: events.id)', async () => {
  const db = new FakeExpoDb();
  const driver = fixedExpoDriver(db);
  const order = [];

  const insertIfMissing = async (tag, ids) =>
    driver.transaction(async () => {
      order.push(`${tag}-start`);
      let inserted = 0;
      let duplicate = 0;
      for (const id of ids) {
        const existing = await driver.all('SELECT id FROM events WHERE id = ?', [id]);
        if (existing.length > 0) {
          duplicate += 1;
          continue;
        }
        await driver.run('INSERT INTO events (id) VALUES (?)', [id]);
        inserted += 1;
      }
      order.push(`${tag}-end`);
      return { inserted, duplicate };
    });

  const t1 = insertIfMissing('t1', ['evt_1', 'evt_2', 'evt_3']);
  // Arrive 5ms later while t1 is already inside withTransactionAsync
  await new Promise((r) => setTimeout(r, 5));
  const t2 = insertIfMissing('t2', ['evt_1', 'evt_2', 'evt_3', 'evt_4']);

  const [r1, r2] = await Promise.all([t1, t2]);
  assert.deepEqual(order, ['t1-start', 't1-end', 't2-start', 't2-end']);
  assert.deepEqual(r1, { inserted: 3, duplicate: 0 });
  assert.deepEqual(r2, { inserted: 1, duplicate: 3 });
  assert.equal(db.rows.size, 4, 'all 4 unique events stored, zero lost');
});

test('fixed driver propagates errors and releases queue', async () => {
  const db = new FakeExpoDb();
  const driver = fixedExpoDriver(db);
  await assert.rejects(
    () => driver.transaction(async () => { throw new Error('boom'); }),
    /boom/,
  );
  const ok = await driver.transaction(async () => 99);
  assert.equal(ok, 99);
});
