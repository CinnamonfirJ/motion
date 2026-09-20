/**
 * Authoritative stream clock (PRD §8, §40, §35 "client clock drift").
 *
 * There is exactly ONE source of truth: the stream's server-authoritative `startedAt`.
 * Playback position, reaction timestamps, spike detection and clipping are ALL derived
 * from it. Clients never trust their own wall clock for product-critical timing — they
 * derive stream time from server time and a measured clock offset.
 */

/** Position within a looping "fake-live" source video, given the authoritative clock. */
export function streamPositionSec(
  startedAt: number,
  durationSec: number,
  now: number
): number {
  if (durationSec <= 0) return 0;
  const elapsedSec = Math.max(0, (now - startedAt) / 1000);
  return elapsedSec % durationSec;
}

/** Absolute stream time in ms since the stream went live (monotonic, not looped). */
export function streamTimeMs(startedAt: number, now: number): number {
  return Math.max(0, now - startedAt);
}

/**
 * Clock sync: a client samples server time and computes the offset to apply to its own
 * `Date.now()`. Using request/response midpoint (NTP-style) cancels one-way latency.
 * Returns offset to ADD to local time to get server time.
 */
export function computeClockOffset(
  clientSentAt: number,
  serverTime: number,
  clientReceivedAt: number
): number {
  const roundTrip = clientReceivedAt - clientSentAt;
  const estimatedServerAtReceive = serverTime + roundTrip / 2;
  return Math.round(estimatedServerAtReceive - clientReceivedAt);
}

/** Server "now" as estimated by a client that has measured an offset. */
export function serverNow(localNow: number, clockOffsetMs: number): number {
  return localNow + clockOffsetMs;
}

/**
 * Validate/clamp a client-reported stream time against the authoritative clock so a
 * lying or lagging client can't backdate reactions to steal a founding slot. PRD §35.
 * We accept the client value only if it's within `toleranceMs` of the authoritative
 * position; otherwise we snap to authoritative.
 */
export function reconcileStreamTime(
  clientStreamTimeMs: number,
  startedAt: number,
  serverReceiveTime: number,
  toleranceMs = 3_000
): number {
  const authoritative = streamTimeMs(startedAt, serverReceiveTime);
  if (!Number.isFinite(clientStreamTimeMs) || clientStreamTimeMs < 0) return authoritative;
  if (Math.abs(clientStreamTimeMs - authoritative) <= toleranceMs) {
    return Math.round(clientStreamTimeMs);
  }
  return authoritative;
}
