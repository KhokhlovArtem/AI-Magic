import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readLocalRecord, writeLocalRecord } from '../local-progress.js';

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
const record = coins => ({ state: { coins }, base: null, backups: [] });

test('guest, accounts and tracks have independent records', () => {
  const store = storage();
  writeLocalRecord(store, null, 'ai', record(1));
  writeLocalRecord(store, 'one', 'ai', record(2));
  writeLocalRecord(store, 'two', 'ai', record(3));
  writeLocalRecord(store, 'one', 'security', record(4));
  assert.equal(readLocalRecord(store, null, 'ai').state.coins, 1);
  assert.equal(readLocalRecord(store, 'one', 'ai').state.coins, 2);
  assert.equal(readLocalRecord(store, 'two', 'ai').state.coins, 3);
  assert.equal(readLocalRecord(store, 'one', 'security').state.coins, 4);
});

test('failed write leaves the earlier state, baseline and backups untouched', () => {
  const store = storage();
  writeLocalRecord(store, 'one', 'ai', { state: { coins: 1 }, base: { coins: 1 }, backups: [{ coins: 0 }] });
  const failing = { getItem: store.getItem, setItem() { throw new Error('quota'); } };
  assert.throws(() => writeLocalRecord(failing, 'one', 'ai', record(2)), /quota/);
  assert.deepEqual(readLocalRecord(store, 'one', 'ai'), { version: 1, state: { coins: 1 }, base: { coins: 1 }, backups: [{ coins: 0 }] });
});

test('malformed records raise an error rather than creating an empty save', () => {
  const store = storage();
  writeLocalRecord(store, 'one', 'ai', record(1));
  const corrupt = { getItem: () => '{', setItem: store.setItem };
  assert.throws(() => readLocalRecord(corrupt, 'one', 'ai'), SyntaxError);
  assert.equal(readLocalRecord(store, 'one', 'ai').state.coins, 1);
});
