import { describe, it, expect } from "vitest";
import { distributeReward, formatUsd, DEFAULT_CONFIG, makeConfig } from "../src/index.js";

const reward = DEFAULT_CONFIG.reward;
const curator = DEFAULT_CONFIG.curator;

function sum(xs: bigint[]): bigint {
  return xs.reduce((a, b) => a + b, 0n);
}

describe("distributeReward", () => {
  it("conserves the total exactly (no unit created or lost)", () => {
    const total = 1_000_000_000_000_000_001n; // deliberately not divisible
    const d = distributeReward(total, 5, reward, curator);
    expect(d.creatorUnits + sum(d.curatorUnits)).toBe(total);
    expect(sum(d.curatorUnits)).toBe(d.curatorPoolUnits);
  });

  it("applies the 70/30 split", () => {
    const total = 1_000_000n;
    const d = distributeReward(total, 5, reward, curator);
    expect(d.creatorUnits).toBe(700_000n);
    expect(d.curatorPoolUnits).toBe(300_000n);
  });

  it("rank-weighted distribution favors earlier ranks (5/4/3/2/1)", () => {
    const total = 1_000_000n;
    const d = distributeReward(total, 5, reward, curator);
    // strictly non-increasing by rank
    for (let i = 1; i < d.curatorUnits.length; i++) {
      expect(d.curatorUnits[i - 1]! >= d.curatorUnits[i]!).toBe(true);
    }
    expect(d.curatorUnits[0]! > d.curatorUnits[4]!).toBe(true);
  });

  it("equal distribution splits the pool evenly with deterministic remainder", () => {
    const cfg = makeConfig({ curator: { distribution: "equal" } }).curator;
    const total = 1_000_000n;
    const d = distributeReward(total, 3, reward, cfg);
    expect(sum(d.curatorUnits)).toBe(300_000n);
    // 300000/3 = 100000 exactly
    expect(d.curatorUnits).toEqual([100_000n, 100_000n, 100_000n]);
  });

  it("folds the curator pool into the creator when there are no curators", () => {
    const total = 1_000_000n;
    const d = distributeReward(total, 0, reward, curator);
    expect(d.creatorUnits).toBe(total);
    expect(d.curatorUnits).toEqual([]);
  });

  it("handles a 1-unit pool without loss", () => {
    const d = distributeReward(1n, 5, reward, curator);
    expect(d.creatorUnits + sum(d.curatorUnits)).toBe(1n);
  });
});

describe("formatUsd", () => {
  it("formats units against a peg", () => {
    // peg: 1e18 units = $1 ; 0.84e18 => $0.84
    const perUsd = 1_000_000_000_000_000_000n;
    expect(formatUsd(840_000_000_000_000_000n, perUsd)).toBe("$0.84");
    expect(formatUsd(perUsd * 18n + perUsd / 2n, perUsd)).toBe("$18.50");
  });
});
