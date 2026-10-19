/**
 * Faithful fake for expo-sqlite's withTransactionAsync that reproduces
 * "cannot commit - no transaction is active" on nested or concurrent use.
 *
 * The old expoDriver called withTransactionAsync directly, so two concurrent
 * transactions or a nested transaction would hit SQLite's lack of re-entrancy
 * and throw. The fixed driver serializes top-level transactions and runs
 * nested ones inside the outer transaction.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Fake that throws if withTransactionAsync is called while already in tx
class OldFakeExpoDb {
  constructor() {
    this.inTx = false;
  }
  async execAsync() {}
  async runAsync() {}
  async getAllAsync() { return []; }
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

// New driver logic (copy of apps/mobile/src/storage/expoDriver.ts fixed version)
function fixedExpoDriver(db) {
  let depth = 0;
  let queue = Promise.resolve();
  return {
    async exec(sql) { await db.execAsync(sql); },
    async run(sql, params = []) { await db.runAsync(sql, params); },
    async all(sql, params = []) { return await db.getAllAsync(sql, params); },
    async transaction(fn) {
      if (depth > 0) {
        depth += 1;
        try { return await fn(); } finally { depth -= 1; }
      }
      let release;
      const next = new Promise((res) => { release = res; });
      const prev = queue;
      queue = next;
      await prev;
      depth += 1;
      try {
        let result;
        let error;
        try {
          await db.withTransactionAsync(async () => { result = await fn(); });
        } catch (e) { error = e; }
        if (error) throw error;
        return result;
      } finally {
        depth -= 1;
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

test('old driver fails on nested transaction (reproduces bug)', async () => {
  const db = new OldFakeExpoDb();
  const driver = oldExpoDriver(db);
  await assert.rejects(
    async () => {
      await driver.transaction(async () => {
        await driver.transaction(async () => {
          return 1;
        });
      });
    },
    /cannot commit - no transaction is active/,
    'nested transactions should reproduce the reported error',
  );
});

test('fixed driver allows nested transaction by running inside outer', async () => {
  const db = new OldFakeExpoDb();
  const driver = fixedExpoDriver(db);
  const result = await driver.transaction(async () => {
    const inner = await driver.transaction(async () => 42);
    return inner + 1;
  });
  assert.equal(result, 43);
});

test('old driver fails on concurrent transactions (reproduces race)', async () => {
  const db = new OldFakeExpoDb();
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

test('fixed driver serializes concurrent transactions', async () => {
  const db = new OldFakeExpoDb();
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
  assert.deepEqual(order, ['t1-start', 't1-end', 't2-start', 't2-end'], 'second transaction waits for first');
});

test('fixed driver propagates errors and releases queue', async () => {
  const db = new OldFakeExpoDb();
  const driver = fixedExpoDriver(db);
  await assert.rejects(
    () => driver.transaction(async () => { throw new Error('boom'); }),
    /boom/,
  );
  // queue must be released, next transaction should succeed
  const ok = await driver.transaction(async () => 99);
  assert.equal(ok, 99);
});
