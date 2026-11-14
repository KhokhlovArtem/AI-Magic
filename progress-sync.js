import { decideSync, mergeConflictingSaves } from './sync-decisions.js';

// store.read() returns null or { state, revision }; store.write(state, revision)
// returns { status: 'saved', data } or { status: 'conflict' }. The caller must
// serialize local edits and persist the returned state and baseline together.
export async function synchronizeProgress({ store, local, base, saveBackup, maxAttempts = 3 }) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new TypeError('Invalid attempt limit');
  const originalLocal = local === null ? null : structuredClone(local);
  const originalBase = base === null ? null : structuredClone(base);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const remote = await store.read();
    const cloud = remote?.state ?? null;
    const decision = decideSync(originalLocal, cloud, originalBase);
    if (decision === 'empty') return { status: 'empty' };
    if (decision === 'equal' || decision === 'cloud') {
      return { status: 'ready', state: structuredClone(cloud), revision: remote.revision };
    }
    if (decision === 'conflict' && (originalLocal === null || cloud === null)) {
      return { status: 'needs-resolution', local: originalLocal, cloud: structuredClone(cloud) };
    }
    let next = originalLocal;
    if (decision === 'conflict') {
      if (typeof saveBackup !== 'function') throw new Error('A backup is required before merging conflicting progress');
      // Backup failure aborts the operation before any cloud modification.
      await saveBackup({ local: structuredClone(originalLocal), cloud: structuredClone(cloud), revision: remote.revision });
      next = mergeConflictingSaves(originalLocal, cloud);
    }
    const result = await store.write(next, remote?.revision ?? null);
    if (result.status === 'saved') {
      return { status: 'ready', state: structuredClone(result.data.state), revision: result.data.revision };
    }
    if (result.status !== 'conflict') throw new Error('Unexpected progress write result');
  }
  return { status: 'retry', local: originalLocal };
}
