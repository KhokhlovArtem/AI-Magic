import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { synchronizeProgress } from '../progress-sync.js';

const save = (progress, coins = 0) => ({ progress, rewards: [], coins, active: null });

test('backs up both saves before merging divergent changes', async () => {
  const local = save({ a: { passed: true } }, 10);
  const cloud = save({ b: { passed: true } }, 3);
  let written;
  const backups = [];
  const store = {
    async read() { return { state: cloud, revision: 2 }; },
    async write(state, revision) {
      assert.equal(backups.length, 1);
      assert.equal(revision, 2);
      written = structuredClone(state);
      return { status: 'saved', data: { state, revision: 3 } };
    }
  };
  const result = await synchronizeProgress({ store, local, base: null, saveBackup: async backup => backups.push(backup) });
  assert.equal(result.status, 'ready');
  assert.deepEqual(Object.keys(written.progress).sort(), ['a', 'b']);
  assert.equal(written.coins, 3);
  assert.deepEqual(backups[0].local, local);
  assert.deepEqual(backups[0].cloud, cloud);
});

test('backup failure never overwrites cloud data', async () => {
  let writes = 0;
  const store = { async read() { return { state: save({ b: {} }), revision: 1 }; }, async write() { writes++; } };
  await assert.rejects(synchronizeProgress({ store, local: save({ a: {} }), base: null, saveBackup: async () => { throw new Error('storage full'); } }));
  assert.equal(writes, 0);
});

test('concurrent update is reread and incorporated on retry', async () => {
  const local = save({ a: { passed: true } });
  let cloud = save({ b: { passed: true } }), revision = 1, writes = 0;
  const store = {
    async read() { return { state: structuredClone(cloud), revision }; },
    async write(state, expected) {
      writes++;
      if (writes === 1) { cloud = save({ b: { passed: true }, c: { passed: true } }); revision++; return { status: 'conflict' }; }
      assert.equal(expected, revision);
      cloud = structuredClone(state);
      return { status: 'saved', data: { state: cloud, revision: ++revision } };
    }
  };
  const result = await synchronizeProgress({ store, local, base: null, saveBackup: async () => {} });
  assert.equal(result.status, 'ready');
  assert.deepEqual(Object.keys(result.state.progress).sort(), ['a', 'b', 'c']);
});

test('missing cloud after prior synchronization requires a decision', async () => {
  let writes = 0;
  const local = save({ a: { passed: true } });
  const store = { async read() { return null; }, async write() { writes++; } };
  const result = await synchronizeProgress({ store, local, base: local });
  assert.equal(result.status, 'needs-resolution');
  assert.equal(writes, 0);
});
