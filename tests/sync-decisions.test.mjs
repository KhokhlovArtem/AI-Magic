import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { decideSync, sameSave, mergeConflictingSaves } from '../sync-decisions.js';

const base = { coins: 3, progress: { topic: true }, active: { answers: [1, 2] } };
const local = { ...base, coins: 4 };
const cloud = { ...base, active: { answers: [1, 2, 3] } };

test('first sign-in does not silently choose between different saves', () => {
  assert.equal(decideSync(local, cloud, null), 'conflict');
  assert.equal(decideSync(local, null, null), 'local');
  assert.equal(decideSync(null, cloud, null), 'cloud');
});

test('only one change since a known common base can be propagated', () => {
  assert.equal(decideSync(local, base, base), 'local');
  assert.equal(decideSync(base, cloud, base), 'cloud');
  assert.equal(decideSync(local, cloud, base), 'conflict');
});

test('missing copy after synchronization requires explicit resolution', () => {
  assert.equal(decideSync(null, base, base), 'conflict');
  assert.equal(decideSync(base, null, base), 'conflict');
});

test('object key order does not create a conflict; array order matters', () => {
  assert.equal(sameSave({ b: 1, a: [1, 2] }, { a: [1, 2], b: 1 }), true);
  assert.equal(sameSave({ a: [1, 2] }, { a: [2, 1] }), false);
  assert.equal(decideSync(base, base, null), 'equal');
  assert.equal(decideSync(null, null, null), 'empty');
});

test('conflict merges achievements and rewards, keeps cloud balance and drops unfinished quiz', () => {
  const localSave = { coins: 9, rewards: ['q1', 'q3'], progress: { a: { passed: true, best: 4 }, c: { passed: true, best: 5 } }, active: { index: 2 } };
  const cloudSave = { coins: 3, rewards: ['q1', 'q2'], progress: { a: { passed: false, best: 3 }, b: { passed: true, best: 4 } }, active: { index: 1 } };
  const merged = mergeConflictingSaves(localSave, cloudSave);
  assert.deepEqual(Object.keys(merged.progress).sort(), ['a', 'b', 'c']);
  assert.equal(merged.progress.a.passed, true);
  assert.equal(merged.progress.a.best, 4);
  assert.deepEqual(new Set(merged.rewards), new Set(['q1', 'q2', 'q3']));
  assert.equal(merged.coins, 3);
  assert.equal(merged.active, null);
  assert.equal(localSave.active.index, 2);
  assert.equal(cloudSave.progress.a.passed, false);
});
