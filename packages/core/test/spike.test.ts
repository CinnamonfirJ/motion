import { describe, it, expect } from "vitest";
import { evaluateSpike, DEFAULT_CONFIG, type SpikeSample } from "../src/index.js";

const cfg = DEFAULT_CONFIG.spike;
const START = 1_000_000;

/** Build reactions: `count` reactions spread across [fromMs,toMs] from `users` distinct users. */
function burst(fromMs: number, toMs: number, count: number, users: number): SpikeSample[] {
  const out: SpikeSample[] = [];
  for (let i = 0; i < count; i++) {
    const t = fromMs + Math.floor(((toMs - fromMs) * i) / Math.max(1, count - 1));
    out.push({ serverTimeMs: t, userId: `u${i % users}` });
  }
  return out;
}

describe("evaluateSpike", () => {
  it("does not detect during cold-start grace", () => {
    const now = START + 2_000; // inside 8s grace
    const r = burst(START, now, 20, 10);
    const e = evaluateSpike(r, { now, streamStartedAt: START }, cfg);
    expect(e.isCandidate).toBe(false);
    expect(e.reason).toBe("cold-start-grace");
  });

  it("does not detect normal background activity", () => {
    const now = START + 90_000;
    // steady, uniform activity from 6 rotating users across the whole baseline window.
    // Uniform rate => recentRate ≈ baselineRate => ratio ≈ 1, well below the 3x multiplier,
    // while still clearing the min-reactions and min-unique gates.
    const r: SpikeSample[] = [];
    let i = 0;
    for (let t = now - 60_000; t <= now; t += 500) r.push({ serverTimeMs: t, userId: `u${i++ % 6}` });
    const e = evaluateSpike(r, { now, streamStartedAt: START }, cfg);
    expect(e.isCandidate).toBe(false);
    expect(e.reason).toBe("below-multiplier");
  });

  it("detects a concentrated spike from enough unique users", () => {
    const now = START + 90_000;
    // sparse baseline + dense recent burst from 8 distinct users
    const baseline: SpikeSample[] = [];
    for (let t = now - 60_000; t < now - 10_000; t += 5000) baseline.push({ serverTimeMs: t, userId: "u0" });
    const recent = burst(now - 8_000, now, 24, 8);
    const e = evaluateSpike([...baseline, ...recent], { now, streamStartedAt: START }, cfg);
    expect(e.isCandidate).toBe(true);
    expect(e.reason).toBe("spike");
    expect(e.uniqueRecent).toBe(8);
  });

  it("rejects a loud single user hammering (below unique)", () => {
    const now = START + 90_000;
    const recent = burst(now - 8_000, now, 30, 1); // one user, 30 taps
    const e = evaluateSpike(recent, { now, streamStartedAt: START }, cfg);
    expect(e.isCandidate).toBe(false);
    expect(e.reason).toBe("below-min-unique");
  });

  it("rejects tiny absolute activity even if ratio is high", () => {
    const now = START + 90_000;
    const recent = burst(now - 8_000, now, 3, 3); // 3 reactions total
    const e = evaluateSpike(recent, { now, streamStartedAt: START }, cfg);
    expect(e.isCandidate).toBe(false);
    expect(e.reason).toBe("below-min-reactions");
  });

  it("respects cooldown after a prior detection", () => {
    const now = START + 90_000;
    const recent = burst(now - 8_000, now, 24, 8);
    const e = evaluateSpike(recent, { now, streamStartedAt: START, cooldownUntil: now + 10_000 }, cfg);
    expect(e.isCandidate).toBe(false);
    expect(e.reason).toBe("cooldown");
  });

  it("small stream: baseline floor prevents erratic detection", () => {
    const now = START + 90_000;
    // only 5 reactions ever, from 5 users, in the recent window
    const recent = burst(now - 8_000, now, 5, 5);
    const e = evaluateSpike(recent, { now, streamStartedAt: START }, cfg);
    // 5 < minRecentReactions(6) -> rejected; proves tiny streams don't over-fire
    expect(e.isCandidate).toBe(false);
  });
});
