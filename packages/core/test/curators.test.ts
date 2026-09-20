import { describe, it, expect } from "vitest";
import {
  selectFoundingCurators,
  evaluateConfirmation,
  DEFAULT_CONFIG,
  type CuratorReaction,
} from "../src/index.js";

const curatorCfg = DEFAULT_CONFIG.curator;
const confCfg = DEFAULT_CONFIG.confirmation;

function r(userId: string, serverTimeMs: number, streamTimeMs = serverTimeMs): CuratorReaction {
  return { userId, walletAddress: `0x${userId}`, type: "fire", serverTimeMs, streamTimeMs };
}

describe("selectFoundingCurators", () => {
  it("ranks by earliest qualifying reaction, one slot per user", () => {
    const reactions = [
      r("bob", 300),
      r("alice", 100),
      r("alice", 90), // earlier alice reaction should represent her
      r("carol", 200),
      r("bob", 50), // earlier bob reaction wins
    ];
    const sel = selectFoundingCurators(reactions, 10_000, curatorCfg);
    expect(sel.map((c) => c.userId)).toEqual(["bob", "alice", "carol"]);
    expect(sel[0]!.rank).toBe(1);
    expect(sel[0]!.qualifyingServerTimeMs).toBe(50);
    expect(sel[1]!.qualifyingServerTimeMs).toBe(90);
  });

  it("excludes reactions after the confirmation timestamp", () => {
    const reactions = [r("alice", 100), r("late", 5_000)];
    const sel = selectFoundingCurators(reactions, 1_000, curatorCfg);
    expect(sel.map((c) => c.userId)).toEqual(["alice"]);
  });

  it("caps at maxFoundingCurators and is deterministic", () => {
    const reactions = Array.from({ length: 12 }, (_, i) => r(`u${i}`, i * 10));
    const a = selectFoundingCurators(reactions, 10_000, curatorCfg);
    const b = selectFoundingCurators([...reactions].reverse(), 10_000, curatorCfg);
    expect(a).toHaveLength(curatorCfg.maxFoundingCurators);
    expect(a).toEqual(b); // order of input must not matter
  });

  it("breaks ties deterministically by userId", () => {
    const reactions = [r("zeta", 100), r("alpha", 100)];
    const sel = selectFoundingCurators(reactions, 10_000, curatorCfg);
    expect(sel.map((c) => c.userId)).toEqual(["alpha", "zeta"]);
  });
});

describe("evaluateConfirmation", () => {
  it("confirms when totals and unique users are met", () => {
    const reactions = Array.from({ length: 12 }, (_, i) => r(`u${i % 4}`, i * 100));
    const res = evaluateConfirmation(reactions, confCfg);
    expect(res.confirmed).toBe(true);
  });

  it("fails when too few unique reactors", () => {
    const reactions = Array.from({ length: 20 }, (_, i) => r(`u${i % 2}`, i * 100));
    const res = evaluateConfirmation(reactions, confCfg);
    expect(res.confirmed).toBe(false);
    expect(res.reason).toBe("below-unique");
  });

  it("fails when too few total reactions", () => {
    const reactions = [r("a", 1), r("b", 2), r("c", 3), r("d", 4)];
    const res = evaluateConfirmation(reactions, confCfg);
    expect(res.confirmed).toBe(false);
    expect(res.reason).toBe("below-total");
  });
});
