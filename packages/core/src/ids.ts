/** Small id helpers. Kept tiny and dependency-free. */

function rand(): string {
  // Prefer crypto.randomUUID when available (Node 18+, modern browsers, RN Hermes shim).
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function newId(prefix: string): string {
  return `${prefix}_${rand().replace(/-/g, "").slice(0, 20)}`;
}

/** A client-side idempotency key for a reaction event. */
export function newEventId(): string {
  return `evt_${rand().replace(/-/g, "")}`;
}
