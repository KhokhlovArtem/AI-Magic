// Separate storage records ensure that switching accounts cannot reuse another
// account's in-memory baseline. Guest data is deliberately a distinct record.
const PREFIX = 'ai-magic-sync-v1';

function recordKey(userId, trackId) {
  if (userId !== null && (typeof userId !== 'string' || !userId)) throw new TypeError('Invalid user');
  if (typeof trackId !== 'string' || !trackId || trackId.length > 100) throw new TypeError('Invalid track');
  return `${PREFIX}:${userId === null ? 'guest' : `user:${encodeURIComponent(userId)}`}:${encodeURIComponent(trackId)}`;
}

export function readLocalRecord(storage, userId, trackId) {
  const raw = storage.getItem(recordKey(userId, trackId));
  if (raw === null) return null;
  const record = JSON.parse(raw);
  if (!record || record.version !== 1 || !Object.hasOwn(record, 'state') || !Object.hasOwn(record, 'base') || !Array.isArray(record.backups)) {
    throw new Error('Invalid local progress record');
  }
  return record;
}

// State, common baseline and backups are one localStorage write: if the write
// fails, the previous record remains intact. Callers must surface the error.
export function writeLocalRecord(storage, userId, trackId, record) {
  const key = recordKey(userId, trackId);
  if (!record || !Object.hasOwn(record, 'state') || !Object.hasOwn(record, 'base') || !Array.isArray(record.backups)) {
    throw new TypeError('Invalid local progress record');
  }
  storage.setItem(key, JSON.stringify({ version: 1, state: record.state, base: record.base, backups: record.backups }));
}
