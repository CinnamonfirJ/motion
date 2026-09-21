/**
 * Per-(stream,user) watch-time tracking for spike eligibility (MOMENT anti-cheat).
 * A viewer must accrue SPIKE_CONFIG.minimumWatchSeconds before their reactions count toward
 * a spike. Watch start is set the first time we see a user on a stream (ws subscribe or
 * first reaction), whichever is earlier. In-memory is fine — it's ephemeral realtime state.
 */
const starts = new Map<string, number>(); // key `${streamId}:${userId}` -> epoch ms

const key = (streamId: string, userId: string) => `${streamId}:${userId}`;

export function noteWatch(streamId: string, userId: string, now: number): void {
  const k = key(streamId, userId);
  if (!starts.has(k)) starts.set(k, now);
}

export function watchMs(streamId: string, userId: string, now: number): number {
  const s = starts.get(key(streamId, userId));
  return s ? Math.max(0, now - s) : 0;
}

/** Demo/reset: clear watch state for a stream (or everything). */
export function resetWatch(streamId?: string): void {
  if (!streamId) {
    starts.clear();
    return;
  }
  const prefix = `${streamId}:`;
  for (const k of [...starts.keys()]) if (k.startsWith(prefix)) starts.delete(k);
}

/** Demo helper: backdate a user's watch start so they become eligible immediately. */
export function seedWatch(streamId: string, userId: string, backdatedMs: number): void {
  starts.set(key(streamId, userId), backdatedMs);
}
