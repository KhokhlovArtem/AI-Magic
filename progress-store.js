// The caller must keep local changes until a write succeeds. RLS is enforced by
// Supabase; userId is a filter, not an authorization mechanism.
function validateKey(userId, trackId) {
  if (typeof userId !== 'string' || !userId || typeof trackId !== 'string' || !trackId || trackId.length > 100) {
    throw new TypeError('Invalid progress key');
  }
}

export async function readProgress(client, userId, trackId) {
  validateKey(userId, trackId);
  const { data, error } = await client.from('track_progress')
    .select('state,revision').eq('user_id', userId).eq('track_id', trackId).maybeSingle();
  if (error) throw error;
  if (data && (!Number.isSafeInteger(data.revision) || data.revision < 1)) throw new Error('Invalid cloud revision');
  return data;
}

// expectedRevision === null is an insert only; a unique conflict must be read
// and reconciled rather than overwritten. Every update is compare-and-swap.
export async function writeProgress(client, userId, trackId, state, expectedRevision) {
  validateKey(userId, trackId);
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new TypeError('Invalid progress state');
  if (expectedRevision !== null && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1 || expectedRevision >= Number.MAX_SAFE_INTEGER)) {
    throw new TypeError('Invalid expected revision');
  }
  let result;
  if (expectedRevision === null) {
    result = await client.from('track_progress')
      .insert({ user_id: userId, track_id: trackId, state, revision: 1 })
      .select('state,revision').single();
    if (result.error?.code === '23505') return { status: 'conflict' };
  } else {
    result = await client.from('track_progress')
      .update({ state, revision: expectedRevision + 1 })
      .eq('user_id', userId).eq('track_id', trackId).eq('revision', expectedRevision)
      .select('state,revision').maybeSingle();
  }
  if (result.error) throw result.error;
  return result.data ? { status: 'saved', data: result.data } : { status: 'conflict' };
}
