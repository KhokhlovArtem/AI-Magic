import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readProgress, writeProgress } from '../progress-store.js';

// Small in-memory PostgREST double for the compare-and-swap protocol.
function database() {
  let row = null;
  return {
    from(table) {
      assert.equal(table, 'track_progress');
      let operation = 'read', values, filters = {};
      const query = {
        select() { return query; },
        eq(key, value) { filters[key] = value; return query; },
        insert(value) { operation = 'insert'; values = structuredClone(value); return query; },
        update(value) { operation = 'update'; values = structuredClone(value); return query; },
        async single() { return query.maybeSingle(); },
        async maybeSingle() {
          if (operation === 'insert') {
            if (row) return { data: null, error: { code: '23505' } };
            row = values;
          } else if (operation === 'update') {
            if (!row || Object.entries(filters).some(([key, value]) => row[key] !== value)) return { data: null, error: null };
            row = { ...row, ...values };
          } else if (!row || Object.entries(filters).some(([key, value]) => row[key] !== value)) {
            return { data: null, error: null };
          }
          return { data: { state: structuredClone(row.state), revision: row.revision }, error: null };
        }
      };
      return query;
    }
  };
}

test('racing inserts and stale updates never overwrite the winning save', async () => {
  const client = database(), user = 'user', track = 'ai';
  assert.equal(await readProgress(client, user, track), null);
  assert.equal((await writeProgress(client, user, track, { n: 1 }, null)).status, 'saved');
  assert.equal((await writeProgress(client, user, track, { n: 2 }, null)).status, 'conflict');
  assert.equal((await writeProgress(client, user, track, { n: 3 }, 1)).status, 'saved');
  assert.equal((await writeProgress(client, user, track, { n: 4 }, 1)).status, 'conflict');
  assert.deepEqual(await readProgress(client, user, track), { state: { n: 3 }, revision: 2 });
});

test('invalid revision and state are rejected without writing', async () => {
  const client = database();
  await assert.rejects(writeProgress(client, 'user', 'ai', [], null), TypeError);
  await assert.rejects(writeProgress(client, 'user', 'ai', {}, 0), TypeError);
  assert.equal(await readProgress(client, 'user', 'ai'), null);
});
