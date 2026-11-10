// Decisions are deliberately separate from transport and never mutate a save.
// A missing baseline must not be treated as evidence that either copy is newer.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

export function sameSave(a, b) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

// null means no copy / no known common ancestor, not an empty game state.
export function decideSync(local, cloud, base) {
  if (local === null && cloud === null) return 'empty';
  if (local === null) return base === null ? 'cloud' : 'conflict';
  if (cloud === null) return base === null ? 'local' : 'conflict';
  if (sameSave(local, cloud)) return 'equal';
  if (base === null) return 'conflict';
  if (sameSave(local, base)) return 'cloud';
  if (sameSave(cloud, base)) return 'local';
  return 'conflict';
}

// Only monotonic achievements are merged. Cloud remains authoritative for
// counters, energy and balance until their server-side journals are available.
export function mergeConflictingSaves(local, cloud) {
  const progress = { ...cloud.progress };
  for (const [key, entry] of Object.entries(local.progress || {})) {
    const current = progress[key];
    if (!current) {
      progress[key] = { ...entry };
      continue;
    }
    progress[key] = {
      ...current,
      passed: Boolean(current.passed || entry.passed),
      best: Math.max(current.best || 0, entry.best || 0),
      migrated: Boolean(current.migrated || entry.migrated)
    };
  }
  return {
    ...cloud,
    progress,
    rewards: [...new Set([...(cloud.rewards || []), ...(local.rewards || [])])],
    active: null
  };
}
