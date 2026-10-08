import { describe, it, expect } from "vitest";
import {
  evaluateUniqueSpike,
  evaluateConfirmation,
  hasFreshReactorBurst,
  evaluateReactorBurst,
  scoreFoundingCurators,
  categoryFromMix,
  buildHistogram,
  SPIKE_CONFIG,
  CURATOR_SCORE_CONFIG,
  type ReactorSample,
  type CandidateReactor,
} from "../src/index.js";

const NOW = 1_000_000;
const WATCH_OK = SPIKE_CONFIG.minimumWatchSeconds * 1000; // 15s

function sample(userId: string, secondsAgo: number, watchMs = WATCH_OK): ReactorSample {
  return { userId, serverTimeMs: NOW - secondsAgo * 1000, watchMs };
}

describe("evaluateUniqueSpike", () => {
  it("counts UNIQUE reactors, not raw taps", () => {
    // one user tapping many times in the last 5s => uniqueRecent = 1, no spike
    const many = Array.from({ length: 20 }, (_, i) => ({ userId: "solo", serverTimeMs: NOW - i * 100, watchMs: WATCH_OK }));
    const e = evaluateUniqueSpike(many, { now: NOW });
    expect(e.uniqueRecent).toBe(1);
    expect(e.isSpike).toBe(false);
  });

  it("ignores reactors below the 15s watch-time eligibility", () => {
    const recent = Array.from({ length: 8 }, (_, i) => sample(`u${i}`, 1, 4000)); // 4s watch < 15s
    const e = evaluateUniqueSpike(recent, { now: NOW });
    expect(e.uniqueRecent).toBe(0);
    expect(e.isSpike).toBe(false);
  });

  it("can detect a fresh five-person burst before watch-time accrues", () => {
    const recent = Array.from({ length: 5 }, (_, i) => sample(`new${i}`, 1, 0));
    const e = evaluateUniqueSpike(recent, {
      now: NOW,
      cfg: { ...SPIKE_CONFIG, minimumWatchSeconds: 0 },
    });
    expect(e.uniqueRecent).toBe(5);
    expect(e.isSpike).toBe(true);
  });

  it("fires when unique eligible reactors clear N_min on a quiet stream", () => {
    const recent = Array.from({ length: SPIKE_CONFIG.minimumUniqueReactors }, (_, i) => sample(`u${i}`, 1));
    const e = evaluateUniqueSpike(recent, { now: NOW });
    expect(e.uniqueRecent).toBe(SPIKE_CONFIG.minimumUniqueReactors);
    expect(e.isSpike).toBe(true);
    expect(e.reason).toBe("spike");
  });

  it("requires 4x the rolling baseline on a busy stream", () => {
    // Busy baseline: 24 distinct users spread across the last 60s => baselinePer5s = 2 => threshold = max(4, 8) = 8
    const baseline: ReactorSample[] = [];
    for (let i = 0; i < 24; i++) baseline.push(sample(`b${i}`, 6 + i * 2));
    // 6 unique in the recent 5s — above N_min(4) but below 4x baseline(8) => no spike
    const recent6 = Array.from({ length: 6 }, (_, i) => sample(`r${i}`, 1));
    const e6 = evaluateUniqueSpike([...baseline, ...recent6], { now: NOW });
    expect(e6.threshold).toBeGreaterThanOrEqual(8);
    expect(e6.isSpike).toBe(false);
    // 9 unique clears it
    const recent9 = Array.from({ length: 9 }, (_, i) => sample(`r${i}`, 1));
    const e9 = evaluateUniqueSpike([...baseline, ...recent9], { now: NOW });
    expect(e9.isSpike).toBe(true);
  });

  it("respects the 30s cooldown", () => {
    const recent = Array.from({ length: 10 }, (_, i) => sample(`u${i}`, 1));
    const e = evaluateUniqueSpike(recent, { now: NOW, cooldownUntil: NOW + 5000 });
    expect(e.isSpike).toBe(false);
    expect(e.reason).toBe("cooldown");
  });
});

describe("hasFreshReactorBurst", () => {
  it("detects five distinct fresh reactors spread across the cold-start window", () => {
    const recent = Array.from({ length: 5 }, (_, i) => ({
      userId: `fresh${i}`,
      serverTimeMs: NOW - i * 2_500,
      watchMs: 0,
    }));
    expect(hasFreshReactorBurst(recent, NOW, 15_000, WATCH_OK, 5)).toBe(true);
  });

  it("does not count repeat taps or reactions outside the window", () => {
    const samples = [
      { userId: "repeat", serverTimeMs: NOW - 1_000, watchMs: 0 },
      { userId: "repeat", serverTimeMs: NOW - 2_000, watchMs: 0 },
      { userId: "late", serverTimeMs: NOW - 16_000, watchMs: 0 },
      { userId: "watched", serverTimeMs: NOW - 3_000, watchMs: WATCH_OK },
    ];
    expect(hasFreshReactorBurst(samples, NOW, 15_000, WATCH_OK, 5)).toBe(false);
  });
});

describe("evaluateReactorBurst", () => {
  const opts = { windowMs: 15_000, baselineMs: 60_000, minimumReactors: 5, multiplier: 2 };

  it("fires for the first five Scouts — a mix of fresh and long-watching — tapping seconds apart", () => {
    const samples: ReactorSample[] = [
      sample("fresh1", 12, 0),
      sample("fresh2", 9, 2_000),
      sample("watched1", 7, 90_000),
      sample("watched2", 4, 40_000),
      sample("fresh3", 1, 500),
    ];
    const r = evaluateReactorBurst(samples, NOW, opts);
    expect(r.uniqueRecent).toBe(5);
    expect(r.isBurst).toBe(true);
  });

  it("does not fire for four Scouts or one Scout tapping repeatedly", () => {
    const four = Array.from({ length: 4 }, (_, i) => sample(`u${i}`, i + 1));
    expect(evaluateReactorBurst(four, NOW, opts).isBurst).toBe(false);
    const spam = Array.from({ length: 20 }, (_, i) => sample("solo", i * 0.5));
    expect(evaluateReactorBurst(spam, NOW, opts).isBurst).toBe(false);
  });

  it("needs more reactors on a stream that is already busy", () => {
    // 30 distinct users across the prior 45s => 10 per 15s => threshold 20
    const baseline = Array.from({ length: 30 }, (_, i) => sample(`b${i}`, 16 + i));
    const recent = Array.from({ length: 6 }, (_, i) => sample(`r${i}`, 1));
    const r = evaluateReactorBurst([...baseline, ...recent], NOW, opts);
    expect(r.threshold).toBe(20);
    expect(r.isBurst).toBe(false);
  });
});

describe("scoreFoundingCurators", () => {
  const start = NOW;
  const end = NOW + 12_000;
  function reactor(userId: string, o: Partial<CandidateReactor> = {}): CandidateReactor {
    return {
      userId,
      walletAddress: `0x${userId}`,
      firstServerTimeMs: start,
      firstStreamTimeMs: 0,
      watchMs: 60_000,
      reputation: 5,
      antiBotScore: 1,
      ...o,
    };
  }

  it("rewards earlier timing over later (all else equal)", () => {
    const early = reactor("early", { firstServerTimeMs: start });
    const late = reactor("late", { firstServerTimeMs: start + 10_000 });
    const sel = scoreFoundingCurators([late, early], start, end);
    expect(sel[0]!.userId).toBe("early");
  });

  it("a clean high-watch early user outranks a suspicious spammer who clicked first", () => {
    const spammer = reactor("spam", { firstServerTimeMs: start, watchMs: 16_000, reputation: 0, antiBotScore: 0.1 });
    const genuine = reactor("real", { firstServerTimeMs: start + 800, watchMs: 90_000, reputation: 12, antiBotScore: 1 });
    const sel = scoreFoundingCurators([spammer, genuine], start, end);
    expect(sel[0]!.userId).toBe("real");
  });

  it("caps at maxFoundingCurators and is deterministic regardless of input order", () => {
    const rs = Array.from({ length: 9 }, (_, i) => reactor(`u${i}`, { firstServerTimeMs: start + i * 100 }));
    const a = scoreFoundingCurators(rs, start, end);
    const b = scoreFoundingCurators([...rs].reverse(), start, end);
    expect(a).toHaveLength(CURATOR_SCORE_CONFIG.maxFoundingCurators);
    expect(a.map((c) => c.userId)).toEqual(b.map((c) => c.userId));
    expect(a[0]!.rank).toBe(1);
  });

  it("handles fewer than five eligible users", () => {
    const sel = scoreFoundingCurators([reactor("a"), reactor("b")], start, end);
    expect(sel).toHaveLength(2);
  });

  it("can select five new viewers who reacted before watch-time accrues", () => {
    const rs = Array.from({ length: 5 }, (_, i) => reactor(`fresh${i}`, {
      firstServerTimeMs: start + i,
      watchMs: 0,
      reputation: 0,
    }));
    expect(scoreFoundingCurators(rs, start, end)).toHaveLength(5);
  });
});

describe("cold-start confirmation", () => {
  it("confirms five distinct first-time reactions without requiring repeat taps", () => {
    const reactions = Array.from({ length: 5 }, (_, i) => ({
      userId: `fresh${i}`,
      walletAddress: `0x${i}`,
      type: "fire" as const,
      streamTimeMs: i,
      serverTimeMs: NOW + i,
    }));
    expect(evaluateConfirmation(reactions, { windowMs: 12_000, minTotalReactions: 5, minUniqueReactors: 4 }).confirmed).toBe(true);
  });
});

describe("categoryFromMix", () => {
  it("maps the dominant reaction to a category", () => {
    expect(categoryFromMix({ fire: 10, laugh: 2, wow: 1 })).toBe("Hype");
    expect(categoryFromMix({ fire: 1, laugh: 8, wow: 1 })).toBe("Funny");
    expect(categoryFromMix({ fire: 0, laugh: 0, wow: 3 })).toBe("Wow");
  });
});

describe("buildHistogram", () => {
  it("buckets reactions per second relative to clip start", () => {
    const h = buildHistogram(
      [
        { streamTimeMs: 0, type: "fire" },
        { streamTimeMs: 500, type: "fire" },
        { streamTimeMs: 1200, type: "laugh" },
        { streamTimeMs: 34_000, type: "wow" },
      ],
      0,
      35
    );
    expect(h).toHaveLength(35);
    expect(h[0]).toEqual({ second: 0, fire: 2, laugh: 0, wow: 0 });
    expect(h[1]).toEqual({ second: 1, fire: 0, laugh: 1, wow: 0 });
    expect(h[34]!.wow).toBe(1);
  });
});
